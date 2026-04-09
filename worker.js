const CHANNEL_ID = "UCO6_hwMtQZ0SLElfDMaqJGQ"; // Spiżarnia Wiary

// 🔹 Mirrory Piped
const PIPED_MIRRORS = [
  "https://piped-api.cfe.re",
  "https://pipedapi.r4fo.com",
  "https://api-piped.mha.fi",
  "https://piped-api.garudalinux.org"
];

// 🔹 Mirrory Invidious
const INVIDIOUS_MIRRORS = [
  "https://invidious.flokinet.to",
  "https://invidious.projectsegfau.lt",
  "https://invidious.lunar.icu"
];

// 🔹 Mirrory yt-dlp
const YTDLP_MIRRORS = [
  "https://yt-dlp-web-api.vercel.app/api/info?id=",
  "https://yt-dlp-mirror.vercel.app/api/info?id="
];

async function fetchYtdlp(id) {
  for (const base of YTDLP_MIRRORS) {
    try {
      const res = await fetch(`${base}${id}`);
      const data = await res.json();
      if (data.formats) return data;
    } catch (e) {
      console.log(`❌ yt-dlp ${base} padł: ${e.message}`);
    }
  }
  return null;
}

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/test") {
      return new Response("OK — Worker działa");
    }

    if (url.pathname === "/download") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });

      console.log("▶ Pobieram audio dla ID:", id);

      // 1️⃣ PIPED
      const pipedUrls = PIPED_MIRRORS.map(m => `${m}/streams/${id}`);
      let data = await fetchJsonWithFallback(pipedUrls);

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
          }
        }
      }

      // 3️⃣ YT-DLP
      if (!data || !data.audioStreams) {
        console.log("⚠ Invidious padł — próbuję yt-dlp");
        const ytdlp = await fetchYtdlp(id);
        if (ytdlp && ytdlp.formats) {
          const audio = ytdlp.formats.find(f => f.acodec !== "none" && !f.vcodec);
          if (audio && audio.url) {
            const stream = await fetch(audio.url);
            await env.R2_BUCKET.put(`${id}.m4a`, stream.body);
            return new Response("OK — zapisano z yt-dlp");
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
