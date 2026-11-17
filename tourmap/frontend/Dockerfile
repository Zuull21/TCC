# TourMap — Frontend React servido pelo Caddy
# O Caddy serve os arquivos estáticos, faz proxy de /api e /socket.io para o
# backend e emite o certificado HTTPS automaticamente (Let's Encrypt).

# ── 1. Build do Vite ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── 2. Servidor ──────────────────────────────────────────────────────────────
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
