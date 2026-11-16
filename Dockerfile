FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps || npm install --omit=dev --legacy-peer-deps
RUN npm install --no-save tsx@4.21.0

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY src ./src
COPY actions.manifest.json ./actions.manifest.json

EXPOSE 8080
CMD ["npx", "tsx", "src/server/index.ts"]
