FROM debian:stable-slim

# Aktualizacja systemu i instalacja zależności
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    ffmpeg \
    python3 \
    python3-pip \
    quickjs \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instalacja yt-dlp (najnowsza wersja)
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Utworzenie katalogu aplikacji
WORKDIR /app

# Kopiowanie plików aplikacji
COPY package*.json ./
RUN npm install

COPY . .

# Port API
EXPOSE 8080

# Start aplikacji
CMD ["node", "download.js"]
