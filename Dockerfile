# syntax=docker/dockerfile:1
# Multi-stage: build deps + dist in one layer, ship only what runtime needs.
# @grpc/grpc-js and fabric-gateway are pure JS — Alpine needs no build tools.
FROM node:20-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Runtime deps only (no typescript/tsx/@types) — smaller image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /build/dist ./dist
# Run as non-root. Certs + chaincode-api arrive as read-only mounts.
USER node
CMD ["node", "dist/index.js"]
