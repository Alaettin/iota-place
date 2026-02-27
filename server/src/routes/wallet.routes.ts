import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { paymentService } from "../services/payment";
import { walletAuth, AuthenticatedRequest } from "../middleware/wallet-auth";
import { generateToken, verifyToken } from "../services/auth-token";

const paymentMode = process.env.PAYMENT_MODE || "mock";

// IP-based rate limiter for wallet creation (5 per minute)
const connectCounters = new Map<string, { count: number; resetAt: number }>();
function connectRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = connectCounters.get(ip);
  if (!entry || entry.resetAt < now) {
    connectCounters.set(ip, { count: 1, resetAt: now + 60000 });
    next();
    return;
  }
  entry.count++;
  if (entry.count > 5) {
    res.status(429).json({ error: "RATE_LIMITED", retryAfter: Math.ceil((entry.resetAt - now) / 1000) });
    return;
  }
  next();
}

// Faucet rate limiter: 1 call per wallet per hour
const faucetTimestamps = new Map<string, number>();
function faucetRateLimit(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const walletId = authHeader?.startsWith("Bearer ") ? verifyToken(authHeader.slice(7)) : null;
  if (!walletId) { next(); return; }
  const now = Date.now();
  const lastCall = faucetTimestamps.get(walletId) || 0;
  if (now - lastCall < 3600000) {
    const retryAfter = Math.ceil((3600000 - (now - lastCall)) / 1000);
    res.status(429).json({ error: "FAUCET_COOLDOWN", retryAfter });
    return;
  }
  faucetTimestamps.set(walletId, now);
  next();
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of connectCounters) {
    if (val.resetAt < now) connectCounters.delete(key);
  }
  for (const [key, ts] of faucetTimestamps) {
    if (now - ts >= 3600000) faucetTimestamps.delete(key);
  }
}, 60000);

export function mountRoutes(router: Router): void {
  // Connect wallet (mock: creates random address, iota: uses real address)
  router.post("/api/wallet/connect", connectRateLimit, async (req, res) => {
    try {
      const { address, displayName: rawName } = req.body;
      if (paymentMode === "iota" && !address) {
        return res.status(400).json({ error: "ADDRESS_REQUIRED" });
      }
      // Sanitize displayName: max 50 chars, strip HTML tags
      const displayName = typeof rawName === "string"
        ? rawName.replace(/<[^>]*>/g, "").trim().slice(0, 50) || undefined
        : undefined;
      const walletAddress = address || `mock_${crypto.randomUUID().slice(0, 16)}`;
      const wallet = await paymentService.connectWallet(walletAddress, displayName);
      const token = generateToken(wallet.walletId);
      res.json({ ok: true, wallet, token });
    } catch {
      res.status(500).json({ error: "WALLET_CONNECT_FAILED" });
    }
  });

  // Get wallet info
  router.get("/api/wallet/me", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const wallet = await paymentService.getWallet(walletId);
      if (!wallet) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
      res.json({ ok: true, wallet });
    } catch {
      res.status(500).json({ error: "WALLET_FETCH_FAILED" });
    }
  });

  // Get balance
  router.get("/api/wallet/balance", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const balance = await paymentService.getBalance(walletId);
      res.json({ ok: true, balance });
    } catch {
      res.status(500).json({ error: "BALANCE_FETCH_FAILED" });
    }
  });

  // Add funds (mock faucet) — rate limited: 1 per wallet per hour
  router.post("/api/wallet/faucet", faucetRateLimit, walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const wallet = await paymentService.addFunds(walletId, 50);
      res.json({ ok: true, wallet });
    } catch {
      res.status(500).json({ error: "FAUCET_FAILED" });
    }
  });
}
