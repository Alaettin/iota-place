import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// --- Mocks ---

const mockGetFullCanvas = vi.fn().mockReturnValue(Buffer.alloc(100));
const mockGetPixel = vi.fn();
const mockSetPixel = vi.fn();
const mockIsPaused = vi.fn().mockReturnValue(false);
const mockGetConfig = vi.fn().mockReturnValue({ width: 250, height: 250, colorCount: 32 });

vi.mock("../services/canvas.service", () => ({
  canvasService: {
    getFullCanvas: (...args: any[]) => mockGetFullCanvas(...args),
    getPixel: (...args: any[]) => mockGetPixel(...args),
    setPixel: (...args: any[]) => mockSetPixel(...args),
    isPaused: () => mockIsPaused(),
    getConfig: () => mockGetConfig(),
  },
}));

const mockGetPixelPrice = vi.fn().mockReturnValue(0.5);
vi.mock("../services/pricing.service", () => ({
  getPixelPrice: (...args: any[]) => mockGetPixelPrice(...args),
}));

const mockProcessPayment = vi.fn();
const mockGetWallet = vi.fn();
vi.mock("../services/payment", () => ({
  paymentService: {
    processPayment: (...args: any[]) => mockProcessPayment(...args),
    getWallet: (...args: any[]) => mockGetWallet(...args),
  },
}));

vi.mock("../ws/socket", () => ({
  broadcastPixelUpdate: vi.fn(),
}));

vi.mock("../db/pool", () => ({
  getPool: vi.fn().mockReturnValue(null),
}));

vi.mock("../services/season.service", () => ({
  seasonService: {
    getActiveSeason: vi.fn().mockReturnValue(null),
  },
}));

vi.mock("../types", () => ({
  COLOR_PALETTE: ["#FFFFFF", "#000000"],
  DEFAULT_CONFIG: { paymentMode: "mock", collectionAddress: "" },
}));

// Skip rate limit and wallet auth for route-level tests
vi.mock("../middleware/rate-limit", () => ({
  rateLimit: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/wallet-auth", () => ({
  walletAuth: (req: any, _res: any, next: any) => {
    req.walletId = req.headers["x-wallet-id"];
    next();
  },
  AuthenticatedRequest: {},
}));

import { mountRoutes } from "./canvas.routes";

function createApp() {
  const app = express();
  app.use(express.json());
  mountRoutes(app);
  return app;
}

describe("Canvas Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFullCanvas.mockReturnValue(Buffer.alloc(100));
    mockIsPaused.mockReturnValue(false);
    mockGetPixelPrice.mockReturnValue(0.5);
    app = createApp();
  });

  describe("GET /api/canvas", () => {
    it("returns binary canvas buffer", async () => {
      const res = await request(app).get("/api/canvas");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/octet-stream");
      expect(res.body).toBeInstanceOf(Buffer);
    });
  });

  describe("GET /api/canvas/pixel/:x/:y", () => {
    it("returns pixel info with price", async () => {
      mockGetPixel.mockReturnValue({ x: 5, y: 3, color: 7, walletId: "w1", pricePaid: 0.5, overwriteCount: 1 });
      mockGetPixelPrice.mockReturnValue(0.55);

      const res = await request(app).get("/api/canvas/pixel/5/3");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.pixel.x).toBe(5);
      expect(res.body.pixel.color).toBe(7);
      expect(res.body.nextPrice).toBe(0.55);
    });

    it("returns 400 for out-of-bounds pixel", async () => {
      mockGetPixel.mockReturnValue(null);

      const res = await request(app).get("/api/canvas/pixel/999/999");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("OUT_OF_BOUNDS");
    });
  });

  describe("GET /api/canvas/price/:x/:y", () => {
    it("returns price for pixel", async () => {
      mockGetPixelPrice.mockReturnValue(1.21);

      const res = await request(app).get("/api/canvas/price/10/20");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.price).toBe(1.21);
      expect(res.body.x).toBe(10);
      expect(res.body.y).toBe(20);
    });
  });

  describe("GET /api/canvas/config", () => {
    it("returns canvas config with palette", async () => {
      const res = await request(app).get("/api/canvas/config");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.config.width).toBe(250);
      expect(res.body.palette).toBeDefined();
      expect(res.body.season).toBeNull();
    });
  });

  describe("POST /api/canvas/pixel", () => {
    it("places pixel successfully", async () => {
      mockProcessPayment.mockResolvedValue({
        success: true,
        amountPaid: 0.5,
        transactionId: "tx-1",
        newBalance: 99.5,
      });
      mockSetPixel.mockReturnValue({ x: 5, y: 5, color: 3, walletId: "w1", pricePaid: 0.5, overwriteCount: 0 });

      const res = await request(app)
        .post("/api/canvas/pixel")
        .set("X-Wallet-Id", "w1")
        .send({ x: 5, y: 5, color: 3 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.pixel.color).toBe(3);
      expect(res.body.newBalance).toBe(99.5);
    });

    it("returns 503 when canvas is paused", async () => {
      mockIsPaused.mockReturnValue(true);

      const res = await request(app)
        .post("/api/canvas/pixel")
        .set("X-Wallet-Id", "w1")
        .send({ x: 0, y: 0, color: 1 });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe("PAUSED");
    });

    it("returns 400 for invalid params", async () => {
      const res = await request(app)
        .post("/api/canvas/pixel")
        .set("X-Wallet-Id", "w1")
        .send({ x: "abc", y: 0, color: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_PARAMS");
    });

    it("returns 400 for invalid color", async () => {
      const res = await request(app)
        .post("/api/canvas/pixel")
        .set("X-Wallet-Id", "w1")
        .send({ x: 0, y: 0, color: 32 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_COLOR");
    });

    it("returns 402 when payment fails", async () => {
      mockProcessPayment.mockResolvedValue({ success: false, error: "INSUFFICIENT_BALANCE" });

      const res = await request(app)
        .post("/api/canvas/pixel")
        .set("X-Wallet-Id", "w1")
        .send({ x: 0, y: 0, color: 1 });

      expect(res.status).toBe(402);
      expect(res.body.error).toBe("INSUFFICIENT_BALANCE");
    });

    it("returns 400 for out-of-bounds pixel", async () => {
      mockProcessPayment.mockResolvedValue({ success: true, amountPaid: 0.5, transactionId: "tx", newBalance: 99 });
      mockSetPixel.mockReturnValue(null);

      const res = await request(app)
        .post("/api/canvas/pixel")
        .set("X-Wallet-Id", "w1")
        .send({ x: 999, y: 999, color: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("OUT_OF_BOUNDS");
    });
  });

  describe("GET /api/canvas/pixel/:x/:y/history", () => {
    it("returns empty history when no pool", async () => {
      const res = await request(app).get("/api/canvas/pixel/0/0/history");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.history).toEqual([]);
    });
  });
});
