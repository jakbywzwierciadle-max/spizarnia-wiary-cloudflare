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
