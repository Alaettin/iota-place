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

  it("returns 401 when X-Wallet-Id header is missing", async () => {
    const res = await request(app).get("/test");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WALLET_NOT_CONNECTED");
  });

  it("returns 401 when wallet is not found", async () => {
    mockGetWallet.mockResolvedValue(null);

    const res = await request(app)
      .get("/test")
      .set("X-Wallet-Id", "unknown-wallet");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("WALLET_NOT_FOUND");
  });

  it("passes through for valid wallet", async () => {
    mockGetWallet.mockResolvedValue({ id: "w1", address: "0x123", balance: 100 });

    const res = await request(app)
      .get("/test")
      .set("X-Wallet-Id", "w1");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.walletId).toBe("w1");
  });

  it("sets walletId on request object", async () => {
    mockGetWallet.mockResolvedValue({ id: "wallet-abc", address: "0x", balance: 50 });

    const res = await request(app)
      .get("/test")
      .set("X-Wallet-Id", "wallet-abc");

    expect(res.body.walletId).toBe("wallet-abc");
  });
});
