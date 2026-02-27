# Stage 1: Build client
FROM node:20-bookworm-slim AS client-build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci -w client
COPY client/ ./client/
RUN npm run build -w client

# Stage 2: Build server
FROM node:20-bookworm-slim AS server-build
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci -w server
COPY server/ ./server/
RUN npm run build -w server

# Stage 3: Production
FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci -w server --omit=dev
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/dist ./server/dist/public
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
