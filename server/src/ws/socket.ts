import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

// M2: IP-based connection rate limit to prevent user-count manipulation
const MAX_CONNECTIONS_PER_IP = 5;
const ipConnectionCount = new Map<string, number>();

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

  // Connection rate limit middleware
  server.use((socket, next) => {
    const ip = socket.handshake.address || "unknown";
    const count = ipConnectionCount.get(ip) || 0;
    if (count >= MAX_CONNECTIONS_PER_IP) {
      return next(new Error("TOO_MANY_CONNECTIONS"));
    }
    ipConnectionCount.set(ip, count + 1);
    next();
  });

  server.on("connection", (socket) => {
    broadcastUserCount();

    socket.on("disconnect", () => {
      // Decrement connection count for this IP
      const ip = socket.handshake.address || "unknown";
      const count = ipConnectionCount.get(ip) || 1;
      if (count <= 1) {
        ipConnectionCount.delete(ip);
      } else {
        ipConnectionCount.set(ip, count - 1);
      }
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

export function broadcastCanvasResize(width: number, height: number): void {
  const s = io();
  if (!s) return;
  s.emit("canvas:resize", { width, height });
}

export function broadcastCanvasReset(): void {
  const s = io();
  if (!s) return;
  s.emit("canvas:reset");
}

export function broadcastShieldActivated(x: number, y: number, expiresAt: string): void {
  const s = io();
  if (!s) return;
  s.emit("powerup:shield", { x, y, expiresAt, active: true });
}

export function broadcastShieldExpired(x: number, y: number): void {
  const s = io();
  if (!s) return;
  s.emit("powerup:shield", { x, y, active: false });
}

export function getIO(): SocketServer | null {
  return io();
}
