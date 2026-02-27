FROM oven/bun:1.2

WORKDIR /app

RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libxss1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libatk1.0-0 \
    libdrm2 \
    ca-certificates \
    fonts-liberation \
    wget \
    unzip \
 && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install

COPY . .

CMD ["bun", "run", "start"]