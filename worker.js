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

// 🔹 Fallback API yt‑dlp‑web‑api
const YTDLP_API = "https://yt-dlp-web-api.vercel.app/api/info?id=";

// 🔹 Pomocnicze funkcje
async function fetchJsonWithFallback(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
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

    // 🔵 TEST
    if (url.pathname === "/test") {
      return new Response("OK — Worker działa");
    }

    // 🔵 POBIERANIE AUDIO
    if (url.pathname === "/download") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });

      console.log("▶ Pobieram audio dla ID:", id);

      // 1️⃣ PIPED
      const pipedUrls = PIPED_MIRRORS.map(m => `${m}/streams/${id}`);
      let data = await fetchJsonWithFallback(pipedUrls);

      // 2️⃣ INVIDIOUS
      if (!data || !data.audioStreams) {
        console.log("⚠ Brak audioStreams z Piped — próbuję Invidious");
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

      // 3️⃣ YT‑DLP
      if (!data || !data.audioStreams) {
        console.log("⚠ Brak audioStreams — próbuję yt‑dlp‑web‑api");
        try {
          const ytdlp = await fetch(`${YTDLP_API}${id}`).then(r => r.json());
          if (ytdlp.formats) {
            const audio = ytdlp.formats.find(f => f.acodec !== "none" && !f.vcodec);
            if (audio && audio.url) {
              const stream = await fetch(audio.url);
              await env.R2_BUCKET.put(`${id}.m4a`, stream.body);
              return new Response("OK — zapisano z yt‑dlp‑web‑api");
            }
          }
        } catch (e) {
          await env.R2_BUCKET.put(`error-${id}.txt`, e.message);
          return new Response("Błąd wszystkich źródeł — zapisano log do R2", { status: 502 });
        }
      }

      // Jeśli Piped zadziałał
      if (data && data.audioStreams) {
        const best = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
        const audio = await fetch(best.url);
        await env.R2_BUCKET.put(`${id}.m4a`, audio.body);
        return new Response("OK — zapisano do R2 (Piped)");
      }

      return new Response("Brak audioStreams — wszystkie źródła padły", { status: 502 });
    }

    // 🔵 CRON
    if (url.pathname === "/cron") {
      const apiUrls = PIPED_MIRRORS.map(m => `${m}/channel/${CHANNEL_ID}`);
      const data = await fetchJsonWithFallback(apiUrls);
      if (!data || !data.relatedStreams)
        return new Response("Cron ERROR — brak relatedStreams", { status: 502 });

      const videos = data.relatedStreams.slice(0, 10);
      for (const v of videos) {
        const id = v.url.split("=")[1];
        const exists = await env.R2_BUCKET.head(`${id}.m4a`);
        if (exists) continue;

        console.log("▶ Nowy film:", id);
        const streamUrls = PIPED_MIRRORS.map(m => `${m}/streams/${id}`);
        const streamData = await fetchJsonWithFallback(streamUrls);
        if (!streamData || !streamData.audioStreams) continue;

        const best = streamData.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
        const audio = await fetch(best.url);
        await env.R2_BUCKET.put(`${id}.m4a`, audio.body);
      }
      return new Response("Cron OK");
    }

    // 🔵 RSS PODCASTU
    if (url.pathname === "/podcast") {
      const list = await env.R2_BUCKET.list();
      const items = list.objects.map(obj => {
        const id = obj.key.replace(".m4a", "");
        const fileUrl = `https://pub-${env.R2_BUCKET.id}.r2.dev/${obj.key}`;
        return `
          <item>
            <title>${id}</title>
            <enclosure url="${fileUrl}" length="${obj.size}" type="audio/mp4" />
            <guid>${id}</guid>
            <pubDate>${new Date(obj.uploaded).toUTCString()}</pubDate>
          </item>
        `;
      }).join("");

      const rss = `
        <rss version="2.0">
          <channel>
            <title>Spiżarnia Wiary – Podcast</title>
            <link>${url.origin}/podcast</link>
            <description>Automatyczny podcast z kanału YouTube Spiżarnia Wiary</description>
            ${items}
          </channel>
        </rss>
      `.trim();

      return new Response(rss, { headers: { "Content-Type": "application/rss+xml" } });
    }

    return new Response("OK — Worker działa");
  }
};
