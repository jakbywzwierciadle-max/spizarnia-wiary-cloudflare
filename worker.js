const CHANNEL_ID = "UCO6_hwMtQZ0SLElfDMaqJGQ"; // Spiżarnia Wiary

// 🔹 Mirrory Piped (fallback 1)
const PIPED_MIRRORS = [
  "https://piped-api.cfe.re",
  "https://pipedapi.r4fo.com",
  "https://api-piped.mha.fi",
  "https://piped-api.garudalinux.org"
];

// 🔹 Mirrory Invidious (fallback 2)
const INVIDIOUS_MIRRORS = [
  "https://invidious.flokinet.to",
  "https://invidious.projectsegfau.lt",
  "https://invidious.lunar.icu"
];

// 🔹 Twoja prywatna instancja yt-dlp-api (fallback 3)
const YTDLP_PRIVATE = "https://yt-dlp-api.jakbywzwierciadle.workers.dev/?id=";

// ----------------------
// 🔧 FUNKCJE POMOCNICZE
// ----------------------

async function fetchJsonWithFallback(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        console.log(`❌ ${url} zwrócił HTML`);
      }
    } catch (e) {
      console.log(`❌ ${url} padł: ${e.message}`);
    }
  }
  return null;
}

async function fetchInvidious(id) {
  for (const base of INVIDIOUS_MIRRORS) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${id}`);
      const data = await res.json();
      if (data.adaptiveFormats) return data;
    } catch (e) {
      console.log(`❌ Invidious ${base} padł: ${e.message}`);
    }
  }
  return null;
}

async function fetchYtdlpPrivate(id) {
  try {
    const res = await fetch(`${YTDLP_PRIVATE}${id}`);
    const data = await res.json();
    if (data.formats) return data;
  } catch (e) {
    console.log("❌ Private yt-dlp API error:", e.message);
  }
  return null;
}

// ----------------------
// 🔧 GŁÓWNY HANDLER
// ----------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // TEST
    if (url.pathname === "/test") {
      return new Response("OK — Worker działa");
    }

    // ----------------------
    // 🔵 POBIERANIE AUDIO
    // ----------------------
    if (url.pathname === "/download") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });

      console.log("▶ Pobieram audio dla ID:", id);

      // 1️⃣ PIPED
      const pipedUrls = PIPED_MIRRORS.map(m => `${m}/streams/${id}`);
      let data = await fetchJsonWithFallback(pipedUrls);
      await env.R2_BUCKET.put(`error-${id}.txt`, e.message);


      // 2️⃣ INVIDIOUS
      if (!data || !data.audioStreams) {
        console.log("⚠ Piped padł — próbuję Invidious");
        const inv = await fetchInvidious(id);
        if (inv && inv.adaptiveFormats) {
          const audio = inv.adaptiveFormats.find(f =>
            typeof f.type === "string" && f.type.startsWith("audio/")
          );
          if (audio && audio.url) {
            const stream = await fetch(audio.url);
            await env.R2_BUCKET.put(`${id}.m4a`, stream.body);
            return new Response("OK — zapisano z Invidious");
            await env.R2_BUCKET.put(`error-${id}.txt`, e.message);

          }
        }
      }

      // 3️⃣ TWOJA PRYWATNA INSTANCJA YT-DLP
      if (!data || !data.audioStreams) {
        console.log("⚠ Invidious padł — próbuję prywatnego yt-dlp");
        const ytdlp = await fetchYtdlpPrivate(id);
        if (ytdlp && ytdlp.formats) {
          const audio = ytdlp.formats.find(f => f.acodec !== "none" && !f.vcodec);
          if (audio && audio.url) {
            const stream = await fetch(audio.url);
            await env.R2_BUCKET.put(`${id}.m4a`, stream.body);
            return new Response("OK — zapisano z prywatnego yt-dlp");
            await env.R2_BUCKET.put(`error-${id}.txt`, e.message);

          }
        }
      }

      // Jeśli Piped zadziałał
      if (data && data.audioStreams) {
        const best = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
        const audio = await fetch(best.url);
        await env.R2_BUCKET.put(`${id}.m4a`, audio.body);
        return new Response("OK — zapisano z Piped");
      }

      return new Response("Brak audioStreams — wszystkie źródła padły", { status: 502 });
    }

    return new Response("OK — Worker działa");
  }
};
