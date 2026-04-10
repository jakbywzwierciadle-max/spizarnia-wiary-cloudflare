const PIPED_MIRRORS = [
  "https://piped-api.cfe.re",
  "https://pipedapi.r4fo.com",
  "https://api-piped.mha.fi",
  "https://piped-api.garudalinux.org"
];

const INVIDIOUS_MIRRORS = [
  "https://invidious.flokinet.to",
  "https://invidious.projectsegfau.lt",
  "https://invidious.lunar.icu"
];

// 🔹 Twoje prywatne yt-dlp-api
const YTDLP_PRIVATE = "https://yt-dlp-api.jakbywzwierciadle.workers.dev/?id=";

// ----------------------
// 🔧 FUNKCJE
// ----------------------

async function logError(env, id, source, message) {
  await env.R2_BUCKET.put(
    `error-${id}-${source}.txt`,
    `${new Date().toISOString()}\n${message}`
  );
}

async function fetchJsonWithFallback(urls, env, id) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        await logError(env, id, "piped", `HTML from ${url}`);
      }
    } catch (e) {
      await logError(env, id, "piped", e.message);
    }
  }
  return null;
}

async function fetchInvidious(id, env) {
  for (const base of INVIDIOUS_MIRRORS) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${id}`);
      const data = await res.json();
      if (data.adaptiveFormats) return data;
    } catch (e) {
      await logError(env, id, "invidious", e.message);
    }
  }
  return null;
}

async function fetchYtdlpPrivate(id, env) {
  try {
    const res = await fetch(`${YTDLP_PRIVATE}${id}`);
    const data = await res.json();
    if (data.formats) return data;
    await logError(env, id, "ytdlp", JSON.stringify(data));
  } catch (e) {
    await logError(env, id, "ytdlp", e.message);
  }
  return null;
}

// ----------------------
// 🔧 HANDLER
// ----------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/test") {
      return new Response("OK — Worker działa");
    }

    if (url.pathname === "/download") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });

      // 1️⃣ PIPED
      const pipedUrls = PIPED_MIRRORS.map(m => `${m}/streams/${id}`);
      let data = await fetchJsonWithFallback(pipedUrls, env, id);

      // 2️⃣ INVIDIOUS
      if (!data || !data.audioStreams) {
        const inv = await fetchInvidious(id, env);
        if (inv && inv.adaptiveFormats) {
          const audio = inv.adaptiveFormats.find(f =>
            typeof f.type === "string" && f.type.startsWith("audio/")
          );
          if (audio?.url) {
            const stream = await fetch(audio.url);
            await env.R2_BUCKET.put(`${id}.m4a`, stream.body);
            return new Response("OK — zapisano z Invidious");
          }
        }
      }

      // 3️⃣ PRYWATNE YT-DLP
      const ytdlp = await fetchYtdlpPrivate(id, env);
      if (ytdlp?.formats) {
        const audio = ytdlp.formats.find(f => f.acodec !== "none" && !f.vcodec);
        if (audio?.url) {
          const stream = await fetch(audio.url);
          await env.R2_BUCKET.put(`${id}.m4a`, stream.body);
          return new Response("OK — zapisano z prywatnego yt-dlp");
        }
      }

      return new Response("Brak audioStreams — wszystkie źródła padły", { status: 502 });
    }

    return new Response("OK — Worker działa");
  }
};
