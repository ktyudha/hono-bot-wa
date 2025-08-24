# Gunakan Node.js 20 sebagai base
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package.json & lockfile
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy semua source code
COPY . .

# Build TypeScript (jika pakai TS)
RUN npm run build

# Expose port Hono
EXPOSE 3000

# Jalankan server
CMD ["node", "dist/index.js"]
