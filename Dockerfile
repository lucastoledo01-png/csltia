# Aplicação web: site, painel e a redação diária.
#
# Não inclui Chromium de propósito. A renderização dos slides roda no worker,
# em imagem própria — manter os dois separados evita carregar ~400 MB de
# navegador num contêiner que nunca vai usá-lo.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# O server.js standalone do Next usa a env HOSTNAME para decidir em qual
# endereço escutar — sem isso, ele herda o HOSTNAME que o Docker injeta
# automaticamente em todo contêiner (o ID do contêiner), e passa a escutar
# só nesse endereço específico em vez de todas as interfaces. Resultado:
# ECONNREFUSED em localhost/127.0.0.1 por dentro do próprio contêiner e o
# Traefik incapaz de rotear pra ele por fora (502).
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
