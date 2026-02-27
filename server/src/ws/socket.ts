import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

function io(): SocketServer | null {
  return G.__iotaSocketIO || null;
}

export function initSocketServer(httpServer: HttpServer): SocketServer {
  const server = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  server.on("connection", () => {
    broadcastUserCount();
  });

  server.on("connection", (socket) => {
    socket.on("disconnect", () => {
      broadcastUserCount();
    });
  });

  G.__iotaSocketIO = server;
  return server;
}

export function broadcastPixelUpdate(x: number, y: number, color: number): void {
  const s = io();
  if (!s) return;
  // 5 bytes: 2B x + 2B y + 1B color
  const buf = Buffer.alloc(5);
  buf.writeUInt16BE(x, 0);
  buf.writeUInt16BE(y, 2);
  buf.writeUInt8(color, 4);
  s.emit("pixel:update", buf);
}

export function broadcastUserCount(): void {
  const s = io();
  if (!s) return;
  const count = s.engine.clientsCount;
  s.emit("user:count", { count });
}

export function broadcastPause(paused: boolean): void {
  const s = io();
  if (!s) return;
  s.emit("canvas:pause", { paused });
}

export function broadcastSeasonChange(season: { id: number; name: string; startDate: string; endDate: string | null } | null): void {
  const s = io();
  if (!s) return;
  s.emit("season:change", { season });
}

export function broadcastCanvasReset(): void {
  const s = io();
  if (!s) return;
  s.emit("canvas:reset");
}

export function getIO(): SocketServer | null {
  return io();
}
