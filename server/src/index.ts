import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import cors from "cors";
import { mountRoutes as mountCanvasRoutes } from "./routes/canvas.routes";
import { mountRoutes as mountWalletRoutes } from "./routes/wallet.routes";
import { initSocketServer } from "./ws/socket";
import { initPool } from "./db/pool";
import { initRedis } from "./db/redis";
import { runMigrations } from "./db/migrations";
import { canvasService } from "./services/canvas.service";
import { startFlushService } from "./services/flush.service";

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// WebSocket
initSocketServer(server);

// Mount routes
mountCanvasRoutes(app);
mountWalletRoutes(app);

// Serve client in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });
}

async function start() {
  // Initialize databases (optional - falls back to in-memory if unavailable)
  const pool = await initPool();
  await initRedis();

  if (pool) {
    await runMigrations(pool);
    await canvasService.loadFromDb();
    startFlushService();
  }

  server.listen(PORT, () => {
    console.log(`IOTA Place server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
