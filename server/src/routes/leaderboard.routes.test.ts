import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// --- Mocks ---

const mockGetAllWallets = vi.fn();

vi.mock("../services/payment", () => ({
  paymentService: {
    getAllWallets: () => mockGetAllWallets(),
  },
}));

vi.mock("../services/canvas.service", () => ({
  canvasService: {
    getConfig: vi.fn().mockReturnValue({ width: 250, height: 250 }),
  },
}));

vi.mock("../services/season.service", () => ({
  seasonService: {
    getActiveSeason: vi.fn().mockReturnValue(null),
  },
}));

vi.mock("../db/pool", () => ({
  getPool: vi.fn().mockReturnValue(null),
}));

import { mountRoutes } from "./leaderboard.routes";

function createApp() {
  const app = express();
  app.use(express.json());
  mountRoutes(app);
  return app;
}

const WALLETS = [
  { id: "w1", displayName: "Alice", address: "0xa", totalSpent: 10.5, pixelCount: 50, balance: 89.5 },
  { id: "w2", displayName: "Bob", address: "0xb", totalSpent: 25.0, pixelCount: 30, balance: 75.0 },
  { id: "w3", displayName: "Charlie", address: "0xc", totalSpent: 5.0, pixelCount: 100, balance: 95.0 },
];

describe("Leaderboard Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllWallets.mockReturnValue(WALLETS);
    app = createApp();
  });

  describe("GET /api/leaderboard", () => {
    it("returns leaderboard sorted by pixels (default)", async () => {
      const res = await request(app).get("/api/leaderboard");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.type).toBe("pixels");
      expect(res.body.leaderboard).toHaveLength(3);
      // Charlie has most pixels (100)
      expect(res.body.leaderboard[0].displayName).toBe("Charlie");
      expect(res.body.leaderboard[0].rank).toBe(1);
      expect(res.body.leaderboard[0].score).toBe(100);
    });

    it("returns leaderboard sorted by spent", async () => {
      const res = await request(app).get("/api/leaderboard?type=spent");
      expect(res.status).toBe(200);
      expect(res.body.type).toBe("spent");
      // Bob has most spent (25.0)
      expect(res.body.leaderboard[0].displayName).toBe("Bob");
      expect(res.body.leaderboard[0].score).toBe(25.0);
    });

    it("filters out wallets with zero activity", async () => {
      mockGetAllWallets.mockReturnValue([
        ...WALLETS,
        { id: "w4", displayName: "Empty", address: "0xd", totalSpent: 0, pixelCount: 0, balance: 100 },
      ]);

      const res = await request(app).get("/api/leaderboard");
      expect(res.body.leaderboard).toHaveLength(3); // w4 excluded
    });

    it("respects limit parameter", async () => {
      const res = await request(app).get("/api/leaderboard?limit=2");
      expect(res.body.leaderboard).toHaveLength(2);
    });

    it("caps limit at 100", async () => {
      const res = await request(app).get("/api/leaderboard?limit=999");
      // Should not crash, just caps internally
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/leaderboard/season/:seasonId", () => {
    it("returns empty leaderboard when no pool", async () => {
      const res = await request(app).get("/api/leaderboard/season/1");
      expect(res.status).toBe(200);
      expect(res.body.leaderboard).toEqual([]);
    });

    it("returns 400 for invalid season ID", async () => {
      const { getPool } = await import("../db/pool");
      const mockQuery = vi.fn();
      (getPool as any).mockReturnValue({ query: mockQuery });

      const newApp = createApp();
      const res = await request(newApp).get("/api/leaderboard/season/abc");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("INVALID_SEASON_ID");
    });
  });

  describe("GET /api/stats", () => {
    it("returns global stats", async () => {
      const res = await request(app).get("/api/stats");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.stats.totalPlacements).toBe(180); // 50+30+100
      expect(res.body.stats.totalWallets).toBe(3);
      expect(res.body.stats.totalSpent).toBe(40.5); // 10.5+25+5
      expect(res.body.stats.canvasSize).toBe("250x250");
      expect(res.body.seasonStats).toBeNull();
    });
  });
});
