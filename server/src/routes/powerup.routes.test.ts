import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// --- Mocks ---

const mockGetCatalog = vi.fn();
const mockPurchase = vi.fn();
const mockGetInventory = vi.fn();
const mockActivateShield = vi.fn();
const mockGetAllActiveShields = vi.fn();

vi.mock("../services/powerup.service", () => ({
  powerUpService: {
    getCatalog: (...args: any[]) => mockGetCatalog(...args),
    purchase: (...args: any[]) => mockPurchase(...args),
    getInventory: (...args: any[]) => mockGetInventory(...args),
    activateShield: (...args: any[]) => mockActivateShield(...args),
    getAllActiveShields: (...args: any[]) => mockGetAllActiveShields(...args),
  },
}));

vi.mock("../middleware/wallet-auth", () => ({
  walletAuth: (req: any, _res: any, next: any) => {
    req.walletId = req.headers["x-wallet-id"];
    if (!req.walletId) return _res.status(401).json({ error: "WALLET_REQUIRED" });
    next();
  },
  AuthenticatedRequest: {},
}));

import { mountPowerUpRoutes } from "./powerup.routes";

function createApp() {
  const app = express();
  app.use(express.json());
  mountPowerUpRoutes(app);
  return app;
}

describe("Power-Up Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("GET /api/powerups/catalog", () => {
    it("returns catalog", async () => {
      mockGetCatalog.mockReturnValue([
        { id: "shield", name: "Shield", description: "Protect pixel", price: 2, durationSeconds: 3600 },
      ]);

      const res = await request(app).get("/api/powerups/catalog");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.catalog).toHaveLength(1);
      expect(res.body.catalog[0].id).toBe("shield");
    });
  });

  describe("POST /api/powerups/purchase", () => {
    it("requires wallet auth", async () => {
      const res = await request(app)
        .post("/api/powerups/purchase")
        .send({ powerUpId: "shield" });
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing powerUpId", async () => {
      const res = await request(app)
        .post("/api/powerups/purchase")
        .set("X-Wallet-Id", "w1")
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_PARAMS");
    });

    it("returns inventoryId on success", async () => {
      mockPurchase.mockResolvedValue({ success: true, inventoryId: 42, newBalance: 98 });

      const res = await request(app)
        .post("/api/powerups/purchase")
        .set("X-Wallet-Id", "w1")
        .send({ powerUpId: "shield" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.inventoryId).toBe(42);
      expect(res.body.newBalance).toBe(98);
    });

    it("returns 402 for insufficient balance", async () => {
      mockPurchase.mockResolvedValue({ success: false, error: "INSUFFICIENT_BALANCE" });

      const res = await request(app)
        .post("/api/powerups/purchase")
        .set("X-Wallet-Id", "w1")
        .send({ powerUpId: "shield" });

      expect(res.status).toBe(402);
      expect(res.body.error).toBe("INSUFFICIENT_BALANCE");
    });

    it("returns 400 for unknown power-up", async () => {
      mockPurchase.mockResolvedValue({ success: false, error: "UNKNOWN_POWER_UP" });

      const res = await request(app)
        .post("/api/powerups/purchase")
        .set("X-Wallet-Id", "w1")
        .send({ powerUpId: "nope" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("UNKNOWN_POWER_UP");
    });
  });

  describe("GET /api/powerups/inventory", () => {
    it("requires wallet auth", async () => {
      const res = await request(app).get("/api/powerups/inventory");
      expect(res.status).toBe(401);
    });

    it("returns inventory for authenticated wallet", async () => {
      mockGetInventory.mockResolvedValue([
        { id: 1, powerUpId: "shield", purchasedAt: "2025-01-01T00:00:00Z" },
      ]);

      const res = await request(app)
        .get("/api/powerups/inventory")
        .set("X-Wallet-Id", "w1");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.inventory).toHaveLength(1);
      expect(res.body.inventory[0].powerUpId).toBe("shield");
    });
  });

  describe("POST /api/powerups/activate", () => {
    it("requires wallet auth", async () => {
      const res = await request(app)
        .post("/api/powerups/activate")
        .send({ inventoryId: 1, targetX: 5, targetY: 5 });
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid params", async () => {
      const res = await request(app)
        .post("/api/powerups/activate")
        .set("X-Wallet-Id", "w1")
        .send({ inventoryId: "abc", targetX: 5, targetY: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_PARAMS");
    });

    it("returns expiresAt on success", async () => {
      mockActivateShield.mockResolvedValue({ success: true, expiresAt: "2025-06-01T12:00:00Z" });

      const res = await request(app)
        .post("/api/powerups/activate")
        .set("X-Wallet-Id", "w1")
        .send({ inventoryId: 1, targetX: 5, targetY: 5 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.expiresAt).toBe("2025-06-01T12:00:00Z");
    });

    it("returns 400 when activation fails", async () => {
      mockActivateShield.mockResolvedValue({ success: false, error: "NOT_YOUR_PIXEL" });

      const res = await request(app)
        .post("/api/powerups/activate")
        .set("X-Wallet-Id", "w1")
        .send({ inventoryId: 1, targetX: 5, targetY: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("NOT_YOUR_PIXEL");
    });
  });

  describe("GET /api/powerups/shields", () => {
    it("returns active shields", async () => {
      mockGetAllActiveShields.mockReturnValue([
        { x: 5, y: 5, walletId: "w1", expiresAt: "2025-06-01T12:00:00Z" },
      ]);

      const res = await request(app).get("/api/powerups/shields");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.shields).toHaveLength(1);
      expect(res.body.shields[0].x).toBe(5);
    });
  });
});
