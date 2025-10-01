#--- Stage 1: Base ---
# Menggunakan image Node.js versi 20.11.1
FROM node:20.11.1-alpine AS base
WORKDIR /usr/src/app
# Menginstal pnpm sebagai package manager
RUN npm install -g pnpm

#--- Stage 2: Dependencies ---
FROM base AS dependencies
# Menyalin file package manager dan menginstal dependensi
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

#--- Stage 3: Development ---
# Stage ini khusus untuk lingkungan development
FROM base AS development
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .