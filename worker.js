const CHANNEL_ID = "UCO6_hwMtQZ0SLElfDMaqJGQ"; // Spiżarnia Wiary

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    //
    // 1) RĘCZNE POBIERANIE AUDIO
    //
    if (url.pathname === "/download") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });

      try {
        console.log("Pobieram metadane z Piped:", id);

        const api = `https://pipedapi.kavin.rocks/streams/${id}`;
        const data = await fetch(api).then(r => r.json());

        console.log("Odpowiedź Piped:", JSON.stringify(data).slice(0, 200));

        if (!data.audioStreams) {
          return new Response("Brak audioStreams", { status: 500 });
        }

        const best = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
        console.log("Wybrany strumień:", best.url);

        const audio = await fetch(best.url);

        await env.R2_BUCKET.put(`${id}.m4a`, audio.body);

        return new Response("OK — zapisano do R2");
      } catch (err) {
        console.error("Błąd:", err);
        return new Response("ERROR: " + err.message, { status: 500 });
      }
    }

    //
    // 2) AUTOMATYCZNE POBIERANIE NOWYCH ODCINKÓW (CRON)
    //
    if (url.pathname === "/cron") {
      try {
        const api = `https://pipedapi.kavin.rocks/channel/${CHANNEL_ID}`;
        const data = await fetch(api).then(r => r.json());

        if (!data.relatedStreams) {
          return new Response("No videos", { status: 500 });
        }

        const videos = data.relatedStreams.slice(0, 10);

        for (const v of videos) {
          const id = v.url.split("=")[1];

          const exists = await env.R2_BUCKET.head(`${id}.m4a`);
          if (exists) continue;

          console.log("Nowy film:", id);

          const streamApi = `https://pipedapi.kavin.rocks/streams/${id}`;
          const streamData = await fetch(streamApi).then(r => r.json());

          if (!streamData.audioStreams) continue;

          const best = streamData.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
          const audio = await fetch(best.url);

          await env.R2_BUCKET.put(`${id}.m4a`, audio.body);
        }

        return new Response("Cron OK");
      } catch (err) {
        return new Response("Cron ERROR: " + err.message, { status: 500 });
      }
    }

    //
    // 3) RSS PODCASTU
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

    return new Response("OK");
  }
};
