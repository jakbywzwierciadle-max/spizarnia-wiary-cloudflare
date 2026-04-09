export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response("Missing id", { status: 400 });
    }

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
};
