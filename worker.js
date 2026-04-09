const CHANNEL_ID = "UCO6_hwMtQZ0SLElfDMaqJGQ"; // Spiżarnia Wiary

// Lista mirrorów Piped — automatyczny fallback
const PIPED_MIRRORS = [
  "https://piped-api.cfe.re",
  "https://pipedapi.r4fo.com",
  "https://api-piped.mha.fi",
  "https://piped-api.garudalinux.org"
];

// Invidious jako awaryjny fallback
const INVIDIOUS = "https://invidious.snopyta.org/api/v1/videos/";

// Pobieranie JSON z fallbackiem po wielu URL-ach
async function fetchJsonWithFallback(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();

      try {
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        console.log(`❌ ${url} zwrócił HTML zamiast JSON`);
      }
    } catch (e) {
      console.log(`❌ ${url} padł: ${e.message}`);
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

      // Najpierw próbujemy Piped (wszystkie mirrory)
      const apiUrls = PIPED_MIRRORS.map(m => `${m}/streams/${id}`);
      let data = await fetchJsonWithFallback(apiUrls);

      // Jeśli Piped nie zwróci audioStreams → próbujemy Invidious
      if (!data || !data.audioStreams) {
        console.log("⚠ Brak audioStreams z Piped — próbuję Invidious");

        try {
          const inv = await fetch(`${INVIDIOUS}${id}`).then(r => r.json());

          if (inv.adaptiveFormats && Array.isArray(inv.adaptiveFormats)) {
            const audio = inv.adaptiveFormats.find(f =>
              typeof f.type === "string" && f.type.startsWith("audio/")
            );

            if (audio && audio.url) {
              const stream = await fetch(audio.url);
              await env.R2_BUCKET.put(`${id}.m4a`, stream.body);
              return new Response("OK — zapisano z Invidious");
            }
          }

          return new Response("Brak audioStreams — Piped i Invidious padły", { status: 502 });
        } catch (e) {
          console.log("❌ Invidious error:", e.message);
          return new Response("Błąd Invidious — Piped i Invidious padły", { status: 502 });
        }
      }

