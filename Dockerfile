# Gunakan Bun resmi
FROM jarredsumner/bun:latest

# Set working directory
WORKDIR /app

# Salin package.json dan bun.lockb dulu untuk caching
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Salin semua source code dan .env
COPY . .

# Jalankan Hono langsung (hot reload)
CMD ["bun", "run", "--hot", "src/index.ts"]
