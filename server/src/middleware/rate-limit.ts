import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth-token";

const WINDOW_MS = 10000; // 10 seconds
const MAX_REQUESTS = 5;  // max 5 pixel placements per window
const MAX_IP_REQUESTS = 30; // max 30 per IP per window (covers multiple wallets)

// In-memory rate limiter (works without Redis)
const counters = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of counters) {
    if (val.resetAt < now) counters.delete(key);
  }
}, 30000);

function checkLimit(key: string, max: number): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || entry.resetAt < now) {
    counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  entry.count++;
  if (entry.count > max) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  // Extract walletId from Bearer token (not from X-Wallet-Id header)
  const authHeader = req.headers.authorization;
  const walletId = authHeader?.startsWith("Bearer ") ? verifyToken(authHeader.slice(7)) : null;
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  // Always check IP limit (prevents multi-wallet abuse)
  const ipCheck = checkLimit(`ip:${ip}`, MAX_IP_REQUESTS);
  if (!ipCheck.allowed) {
    res.status(429).json({ error: "RATE_LIMITED", retryAfter: ipCheck.retryAfter });
    return;
  }

  // Also check per-wallet limit if wallet provided
  if (walletId) {
    const walletCheck = checkLimit(`wallet:${walletId}`, MAX_REQUESTS);
    if (!walletCheck.allowed) {
      res.status(429).json({ error: "RATE_LIMITED", retryAfter: walletCheck.retryAfter });
      return;
    }
  }

  next();
}
