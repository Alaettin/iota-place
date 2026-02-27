import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import cors from "cors";
import { mountRoutes as mountCanvasRoutes } from "./routes/canvas.routes";
import { mountRoutes as mountWalletRoutes } from "./routes/wallet.routes";
import { initSocketServer } from "./ws/socket";

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

server.listen(PORT, () => {
  console.log(`IOTA Place server running on http://localhost:${PORT}`);
});
