import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// --- Mocks ---

const mockGetWallet = vi.fn();
const mockIsWalletBanned = vi.fn().mockReturnValue(false);

vi.mock("../services/payment", () => ({
  paymentService: {
    getWallet: (...args: any[]) => mockGetWallet(...args),
    isWalletBanned: (...args: any[]) => mockIsWalletBanned(...args),
  },
}));

// Mock MockPaymentService class for instanceof check
vi.mock("../services/payment/mock-payment.service", () => ({
  MockPaymentService: class MockPaymentService {},
}));

const mockVerifyToken = vi.fn();
vi.mock("../services/auth-token", () => ({
  verifyToken: (...args: any[]) => mockVerifyToken(...args),
}));

import { walletAuth } from "./wallet-auth";

function createApp() {
  const app = express();
  app.use(express.json());
  app.get("/test", walletAuth as any, (req: any, res) => {
    res.json({ ok: true, walletId: req.walletId });
  });
  return app;
}

describe("walletAuth Middleware", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await request(app).get("/test");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WALLET_NOT_CONNECTED");
  });

  it("returns 401 when Bearer token is invalid", async () => {
    mockVerifyToken.mockReturnValue(null);

    const res = await request(app)
      .get("/test")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WALLET_NOT_CONNECTED");
  });

  it("returns 401 when wallet is not found", async () => {
    mockVerifyToken.mockReturnValue("unknown-wallet");
    mockGetWallet.mockResolvedValue(null);

    const res = await request(app)
      .get("/test")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WALLET_NOT_FOUND");
  });

  it("passes through for valid wallet", async () => {
    mockVerifyToken.mockReturnValue("w1");
    mockGetWallet.mockResolvedValue({ id: "w1", address: "0x123", balance: 100 });

    const res = await request(app)
      .get("/test")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.walletId).toBe("w1");
  });

  it("sets walletId on request object", async () => {
    mockVerifyToken.mockReturnValue("wallet-abc");
    mockGetWallet.mockResolvedValue({ id: "wallet-abc", address: "0x", balance: 50 });

    const res = await request(app)
      .get("/test")
      .set("Authorization", "Bearer valid-token");

    expect(res.body.walletId).toBe("wallet-abc");
  });

  it("returns 401 when X-Wallet-Id header is sent without Bearer token", async () => {
    // X-Wallet-Id fallback was removed — must use Bearer token
    const res = await request(app)
      .get("/test")
      .set("X-Wallet-Id", "w1");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WALLET_NOT_CONNECTED");
  });

  it("returns 403 when wallet is banned", async () => {
    mockVerifyToken.mockReturnValue("banned-wallet");
    mockGetWallet.mockResolvedValue({ id: "banned-wallet", address: "0x", balance: 100 });
    mockIsWalletBanned.mockReturnValue(true);

    const res = await request(app)
      .get("/test")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("WALLET_BANNED");
  });
});
