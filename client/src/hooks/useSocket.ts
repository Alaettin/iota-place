import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface UseSocketOptions {
  onPixelUpdate: (x: number, y: number, color: number) => void;
}

export function useSocket({ onPixelUpdate }: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const onPixelUpdateRef = useRef(onPixelUpdate);
  onPixelUpdateRef.current = onPixelUpdate;

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("pixel:update", (data: ArrayBuffer) => {
      const view = new DataView(data instanceof ArrayBuffer ? data : (data as Buffer));
      const x = view.getUint16(0);
      const y = view.getUint16(2);
      const color = view.getUint8(4);
      onPixelUpdateRef.current(x, y, color);
    });

    socket.on("user:count", ({ count }: { count: number }) => {
      setUserCount(count);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { userCount, connected };
}
