const CHANNEL_ID = "UCO6_hwMtQZ0SLElfDMaqJGQ"; // Spiżarnia Wiary

// Lista mirrorów Piped — automatyczny fallback
const PIPED_MIRRORS = [
  "https://piped-api.cfe.re",
  "https://pipedapi.r4fo.com",
  "https://api-piped.mha.fi",
  "https://piped-api.garudalinux.org"
];


// Pobieranie JSON z fallbackiem
async function fetchJsonWithFallback(urls) {
  for (const base of urls) {
    try {
      const res = await fetch(base);
      const text = await res.text();

      try {
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        console.log(`❌ Mirror ${base} zwrócił HTML zamiast JSON`);
      }
    } catch (e) {
      console.log(`❌ Mirror ${base} padł: ${e.message}`);
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    //
    // 🔵 TEST — sprawdza czy Worker działa
    //
    if (url.pathname === "/test") {
      return new Response("OK — Worker działa");
    }

    //
    // 🔵 POBIERANIE AUDIO
    //
    if (url.pathname === "/download") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });

      console.log("▶ Pobieram audio dla ID:", id);

      const apiUrls = PIPED_MIRRORS.map(m => `${m}/streams/${id}`);
      const data = await fetchJsonWithFallback(apiUrls);

      if (!data || !data.audioStreams) {
        return new Response("Brak audioStreams — wszystkie mirrory padły", { status: 502 });
      }

      const best = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
      const audio = await fetch(best.url);

      await env.R2_BUCKET.put(`${id}.m4a`, audio.body);

      return new Response("OK — zapisano do R2");
    }

    //
    // 🔵 CRON — pobieranie nowych filmów
    //
    if (url.pathname === "/cron") {
      const apiUrls = PIPED_MIRRORS.map(m => `${m}/channel/${CHANNEL_ID}`);
      const data = await fetchJsonWithFallback(apiUrls);

      if (!data || !data.relatedStreams) {
        return new Response("Cron ERROR — brak relatedStreams", { status: 502 });
      }

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

    //
    // 🔵 RSS PODCASTU
    //
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

      return new Response(rss, {
        headers: { "Content-Type": "application/rss+xml" }
      });
    }

    return new Response("OK — Worker działa");
  }
};
