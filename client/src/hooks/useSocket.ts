import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface SeasonInfo {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
}

interface UseSocketOptions {
  onPixelUpdate: (x: number, y: number, color: number) => void;
  onPauseChange?: (paused: boolean) => void;
  onSeasonChange?: (season: SeasonInfo | null) => void;
  onCanvasReset?: () => void;
  onCanvasResize?: (width: number, height: number) => void;
  onShieldUpdate?: (x: number, y: number, expiresAt: string, active: boolean) => void;
}

export function useSocket({ onPixelUpdate, onPauseChange, onSeasonChange, onCanvasReset, onCanvasResize, onShieldUpdate }: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const onPixelUpdateRef = useRef(onPixelUpdate);
  onPixelUpdateRef.current = onPixelUpdate;
  const onPauseChangeRef = useRef(onPauseChange);
  onPauseChangeRef.current = onPauseChange;
  const onSeasonChangeRef = useRef(onSeasonChange);
  onSeasonChangeRef.current = onSeasonChange;
  const onCanvasResetRef = useRef(onCanvasReset);
  onCanvasResetRef.current = onCanvasReset;
  const onCanvasResizeRef = useRef(onCanvasResize);
  onCanvasResizeRef.current = onCanvasResize;
  const onShieldUpdateRef = useRef(onShieldUpdate);
  onShieldUpdateRef.current = onShieldUpdate;

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("pixel:update", (data: ArrayBuffer) => {
      const buf = data instanceof ArrayBuffer ? data : (data as { buffer: ArrayBuffer }).buffer;
      const view = new DataView(buf);
      const x = view.getUint16(0);
      const y = view.getUint16(2);
      const color = view.getUint8(4);
      onPixelUpdateRef.current(x, y, color);
    });

    socket.on("user:count", ({ count }: { count: number }) => {
      setUserCount(count);
    });

    socket.on("canvas:pause", ({ paused }: { paused: boolean }) => {
      onPauseChangeRef.current?.(paused);
    });

    socket.on("season:change", ({ season }: { season: SeasonInfo | null }) => {
      onSeasonChangeRef.current?.(season);
    });

    socket.on("canvas:reset", () => {
      onCanvasResetRef.current?.();
    });

    socket.on("canvas:resize", ({ width, height }: { width: number; height: number }) => {
      onCanvasResizeRef.current?.(width, height);
    });

    socket.on("powerup:shield", ({ x, y, expiresAt, active }: { x: number; y: number; expiresAt?: string; active: boolean }) => {
      onShieldUpdateRef.current?.(x, y, expiresAt || "", active);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { userCount, connected };
}
