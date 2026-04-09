export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/feed" || url.pathname === "/feed.xml") {
      return handleFeed(env);
    }

    if (url.pathname.startsWith("/audio/")) {
      const key = decodeURIComponent(url.pathname.replace("/audio/", ""));
      return handleAudio(env, key);
    }

    return new Response("Spiżarnia Wiary RSS is running", { status: 200 });
  },
};

async function handleFeed(env) {
  const objects = await listAudio(env.AUDIO_BUCKET);

  const itemsXml = objects
    .map(obj => objectToItemXml(obj, env))
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(env.FEED_TITLE)}</title>
    <link>${env.BASE_URL}/feed</link>
    <description>${escapeXml(env.FEED_DESCRIPTION)}</description>
    <language>${env.FEED_LANGUAGE}</language>
${itemsXml}
  </channel>
</rss>`;

  return new Response(rss, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}

async function listAudio(bucket) {
  const objects = [];
  let cursor = undefined;

  do {
    const res = await bucket.list({ cursor });
    for (const obj of res.objects || []) {
      if (obj.key.endsWith(".mp3") || obj.key.endsWith(".m4a")) {
        objects.push(obj);
      }
    }
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor);

  // sortuj od najnowszych
  objects.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  return objects;
}

function objectToItemXml(obj, env) {
  const fileName = obj.key.split("/").pop();
  const title = fileName.replace(/\.(mp3|m4a)$/i, "");
  const pubDate = new Date(obj.uploaded).toUTCString();
  const url = `${env.BASE_URL}/audio/${encodeURIComponent(obj.key)}`;

  return `    <item>
      <title>${escapeXml(title)}</title>
      <description>${escapeXml(title)}</description>
      <enclosure url="${escapeXml(url)}" type="audio/mpeg" />
      <guid>${escapeXml(url)}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
}

async function handleAudio(env, key) {
  const obj = await env.AUDIO_BUCKET.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", "audio/mpeg");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(obj.body, {
    status: 200,
    headers,
  });
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
