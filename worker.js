export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1) DOWNLOAD AUDIO
    if (url.pathname === "/download") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });

      const api = `https://pipedapi.kavin.rocks/streams/${id}`;
      const data = await fetch(api).then(r => r.json());

      if (!data.audioStreams || data.audioStreams.length === 0) {
        return new Response("No audio available", { status: 404 });
      }

      const best = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
      const audio = await fetch(best.url);

      await env.R2_BUCKET.put(`${id}.m4a`, audio.body);

      return new Response(audio.body, {
        headers: {
          "Content-Type": "audio/mp4",
          "Content-Disposition": `attachment; filename="${id}.m4a"`
        }
      });
    }

    // 2) PODCAST RSS FEED
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
            <title>Spizarnia Wiary</title>
            <link>${url.origin}/podcast</link>
            <description>Podcast generowany automatycznie z YouTube</description>
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
