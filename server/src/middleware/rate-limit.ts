import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 10000; // 10 seconds
const MAX_REQUESTS = 5;  // max 5 pixel placements per window

// In-memory rate limiter (works without Redis)
const counters = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of counters) {
    if (val.resetAt < now) counters.delete(key);
  }
}, 30000);

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const walletId = req.headers["x-wallet-id"] as string;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const key = walletId || ip;

  const now = Date.now();
  const entry = counters.get(key);

  if (!entry || entry.resetAt < now) {
    counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({
      error: "RATE_LIMITED",
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}
