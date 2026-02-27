import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

let io: SocketServer;

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", () => {
    broadcastUserCount();
  });

  io.on("connection", (socket) => {
    socket.on("disconnect", () => {
      broadcastUserCount();
    });
  });

  return io;
}

export function broadcastPixelUpdate(x: number, y: number, color: number): void {
  if (!io) return;
  // 5 bytes: 2B x + 2B y + 1B color
  const buf = Buffer.alloc(5);
  buf.writeUInt16BE(x, 0);
  buf.writeUInt16BE(y, 2);
  buf.writeUInt8(color, 4);
  io.emit("pixel:update", buf);
}

export function broadcastUserCount(): void {
  if (!io) return;
  const count = io.engine.clientsCount;
  io.emit("user:count", { count });
}

export function getIO(): SocketServer {
  return io;
}
