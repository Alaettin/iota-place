import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// --- Mocks ---

const mockConnectWallet = vi.fn();
const mockGetWallet = vi.fn();
const mockGetBalance = vi.fn();
const mockAddFunds = vi.fn();

vi.mock("../services/payment", () => ({
  paymentService: {
    connectWallet: (...args: any[]) => mockConnectWallet(...args),
    getWallet: (...args: any[]) => mockGetWallet(...args),
    getBalance: (...args: any[]) => mockGetBalance(...args),
    addFunds: (...args: any[]) => mockAddFunds(...args),
  },
}));

vi.mock("../middleware/wallet-auth", () => ({
  walletAuth: (req: any, _res: any, next: any) => {
    const walletId = req.headers["x-wallet-id"];
    if (!walletId) return _res.status(401).json({ error: "WALLET_NOT_CONNECTED" });
    req.walletId = walletId;
    next();
  },
  AuthenticatedRequest: {},
}));

import { mountRoutes } from "./wallet.routes";

function createApp() {
  const app = express();
  app.use(express.json());
  mountRoutes(app);
  return app;
}

describe("Wallet Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("POST /api/wallet/connect", () => {
    it("creates a new wallet", async () => {
      mockConnectWallet.mockResolvedValue({
        id: "wallet-1",
        address: "mock_abc123",
        displayName: "Player1",
        balance: 100,
        totalSpent: 0,
        pixelCount: 0,
      });

      const res = await request(app)
        .post("/api/wallet/connect")
        .send({ displayName: "Player1" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.wallet.displayName).toBe("Player1");
      expect(res.body.wallet.balance).toBe(100);
    });

    it("connects with a provided address", async () => {
      mockConnectWallet.mockResolvedValue({
        id: "wallet-2",
        address: "0xabc",
        displayName: "User",
        balance: 100,
      });

      const res = await request(app)
        .post("/api/wallet/connect")
        .send({ address: "0xabc" });

      expect(res.status).toBe(200);
      expect(res.body.wallet.address).toBe("0xabc");
    });
  });

  describe("GET /api/wallet/me", () => {
    it("returns wallet info for authenticated user", async () => {
      mockGetWallet.mockResolvedValue({
        id: "w1",
        address: "0x123",
        displayName: "Me",
        balance: 50,
      });

      const res = await request(app)
        .get("/api/wallet/me")
        .set("X-Wallet-Id", "w1");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.wallet.displayName).toBe("Me");
    });

    it("returns 401 without wallet header", async () => {
      const res = await request(app).get("/api/wallet/me");
      expect(res.status).toBe(401);
    });

    it("returns 404 for unknown wallet", async () => {
      mockGetWallet.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/wallet/me")
        .set("X-Wallet-Id", "unknown");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("WALLET_NOT_FOUND");
    });
  });

  describe("GET /api/wallet/balance", () => {
    it("returns balance for authenticated user", async () => {
      mockGetBalance.mockResolvedValue(75.5);

      const res = await request(app)
        .get("/api/wallet/balance")
        .set("X-Wallet-Id", "w1");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.balance).toBe(75.5);
    });
  });

  describe("POST /api/wallet/faucet", () => {
    it("adds 50 tokens to wallet", async () => {
      mockAddFunds.mockResolvedValue({
        id: "w1",
        balance: 150,
      });

      const res = await request(app)
        .post("/api/wallet/faucet")
        .set("X-Wallet-Id", "w1");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.wallet.balance).toBe(150);
      expect(mockAddFunds).toHaveBeenCalledWith("w1", 50);
    });
  });
});
