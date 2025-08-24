# Gunakan image resmi Bun
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Salin package.json dan bun.lockb untuk caching
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Salin semua source code
COPY . .

# Jalankan Hono dengan hot reload
CMD ["bun", "run", "--hot", "src/index.ts"]
