import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock auth-token to control walletId extraction from Bearer token
const mockVerifyToken = vi.fn();
vi.mock("../services/auth-token", () => ({
  verifyToken: (...args: any[]) => mockVerifyToken(...args),
}));

import { rateLimit } from "./rate-limit";

function createApp() {
  const app = express();
  app.use(express.json());
  app.post("/test", rateLimit, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("rateLimit Middleware", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  it("allows first request", async () => {
    const walletId = `rate-test-${Date.now()}-first`;
    mockVerifyToken.mockReturnValue(walletId);

    const res = await request(app)
      .post("/test")
      .set("Authorization", `Bearer token-${walletId}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("allows up to 5 requests within window", async () => {
    const walletId = `rate-test-${Date.now()}-five`;
    mockVerifyToken.mockReturnValue(walletId);

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/test")
        .set("Authorization", `Bearer token-${walletId}`);
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 on 6th request within window", async () => {
    const walletId = `rate-test-${Date.now()}-six`;
    mockVerifyToken.mockReturnValue(walletId);

    // First 5 should pass
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/test")
        .set("Authorization", `Bearer token-${walletId}`);
    }

    // 6th should be rate limited
    const res = await request(app)
      .post("/test")
      .set("Authorization", `Bearer token-${walletId}`);

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("RATE_LIMITED");
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });

  it("uses different counters for different wallets", async () => {
    const walletA = `rate-test-${Date.now()}-a`;
    const walletB = `rate-test-${Date.now()}-b`;

    // 5 requests from wallet A
    mockVerifyToken.mockReturnValue(walletA);
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/test")
        .set("Authorization", `Bearer token-${walletA}`);
    }

    // Wallet B should still be allowed
    mockVerifyToken.mockReturnValue(walletB);
    const res = await request(app)
      .post("/test")
      .set("Authorization", `Bearer token-${walletB}`);

    expect(res.status).toBe(200);
  });

  it("resets counter after window expires", async () => {
    vi.useFakeTimers();
    const walletId = `rate-test-expired`;
    mockVerifyToken.mockReturnValue(walletId);

    // Exhaust rate limit
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post("/test")
        .set("Authorization", `Bearer token-${walletId}`);
    }

    // Advance time past window (10s)
    vi.advanceTimersByTime(11000);

    // Should be allowed again
    const res = await request(app)
      .post("/test")
      .set("Authorization", `Bearer token-${walletId}`);

    expect(res.status).toBe(200);
    vi.useRealTimers();
  });
});
