# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

CMD ["node", "src/server.mjs"]
