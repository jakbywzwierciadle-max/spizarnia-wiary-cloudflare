# Spiżarnia Wiary – Cloudflare RSS

- Audio w R2 (`spizarnia-wiary-audio`)
- RSS generowany dynamicznie przez Worker (`/feed`)

## Deploy

1. `npm install -g wrangler`
2. `wrangler login`
3. Utwórz bucket R2: `wrangler r2 bucket create spizarnia-wiary-audio`
4. Skonfiguruj `wrangler.toml` (BASE_URL, nazwa bucketa).
5. `wrangler deploy`

## Upload audio

- Wrzucaj pliki `.mp3` / `.m4a` do bucketa R2.
- Feed automatycznie je zobaczy pod `/feed`.
