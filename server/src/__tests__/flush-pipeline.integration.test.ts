import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });
const mockPool = { connect: mockConnect };

vi.mock("../db/pool", () => ({
  getPool: vi.fn(() => mockPool),
}));

const mockGetDirtyPixels = vi.fn();
const mockGetPixelMeta = vi.fn();
const mockClearDirtyPixels = vi.fn();

vi.mock("../db/redis", () => ({
  getDirtyPixels: (...args: any[]) => mockGetDirtyPixels(...args),
  getPixelMeta: (...args: any[]) => mockGetPixelMeta(...args),
  clearDirtyPixels: (...args: any[]) => mockClearDirtyPixels(...args),
}));

// Mock seasonService to control active season
const mockGetActiveSeasonId = vi.fn().mockReturnValue(null);
vi.mock("../services/season.service", () => ({
  seasonService: { getActiveSeasonId: () => mockGetActiveSeasonId() },
}));

import { flushOnce, startFlushService, stopFlushService } from "../services/flush.service";

describe("Flush Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDirtyPixels.mockResolvedValue([]);
    mockGetPixelMeta.mockResolvedValue(null);
    mockClearDirtyPixels.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetActiveSeasonId.mockReturnValue(null);
  });

  describe("flushOnce", () => {
    it("returns 0 when no dirty pixels", async () => {
      mockGetDirtyPixels.mockResolvedValue([]);
      const count = await flushOnce();
      expect(count).toBe(0);
      // Should not even connect to pool
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("flushes a single dirty pixel to PostgreSQL", async () => {
      mockGetDirtyPixels.mockResolvedValue(["3,7"]);
      mockGetPixelMeta.mockResolvedValue({
        color: "5",
        wallet_id: "wallet-abc",
        price_paid: "0.55",
        overwrite_count: "1",
        updated_at: "2025-01-01T00:00:00.000Z",
      });

      const count = await flushOnce();

      expect(count).toBe(1);
      expect(mockConnect).toHaveBeenCalledOnce();

      // BEGIN, INSERT pixels, INSERT pixel_history, COMMIT
      const calls = mockQuery.mock.calls;
      expect(calls[0][0]).toBe("BEGIN");

      // Upsert pixel
      expect(calls[1][0]).toContain("INSERT INTO pixels");
      expect(calls[1][1]).toEqual([3, 7, 5, "wallet-abc", 0.55, 1, "2025-01-01T00:00:00.000Z"]);

      // Pixel history
      expect(calls[2][0]).toContain("INSERT INTO pixel_history");
      expect(calls[2][1]).toEqual([3, 7, 5, "wallet-abc", 0.55, null]); // no season

      // COMMIT
      expect(calls[3][0]).toBe("COMMIT");

      // Dirty pixels cleared
      expect(mockClearDirtyPixels).toHaveBeenCalledWith(["3,7"]);
      expect(mockRelease).toHaveBeenCalledOnce();
    });

    it("flushes multiple dirty pixels", async () => {
      mockGetDirtyPixels.mockResolvedValue(["0,0", "1,1", "2,2"]);
      mockGetPixelMeta.mockImplementation(async (coord: string) => ({
        color: "1",
        wallet_id: "w1",
        price_paid: "0.5",
        overwrite_count: "0",
        updated_at: "2025-01-01T00:00:00.000Z",
      }));

      const count = await flushOnce();

      expect(count).toBe(3);
      // BEGIN + (INSERT pixels + INSERT history) * 3 + COMMIT = 8 queries
      expect(mockQuery).toHaveBeenCalledTimes(8);
      expect(mockClearDirtyPixels).toHaveBeenCalledWith(["0,0", "1,1", "2,2"]);
    });

    it("skips pixels with no metadata", async () => {
      mockGetDirtyPixels.mockResolvedValue(["5,5", "6,6"]);
      mockGetPixelMeta.mockImplementation(async (coord: string) => {
        if (coord === "5,5") return null; // no metadata
        return {
          color: "2",
          wallet_id: "w1",
          price_paid: "0.5",
          overwrite_count: "0",
          updated_at: "2025-01-01T00:00:00.000Z",
        };
      });

      const count = await flushOnce();

      expect(count).toBe(2); // still returns dirtyCoords.length
      // BEGIN + (INSERT pixels + INSERT history) * 1 + COMMIT = 4 queries
      // pixel 5,5 is skipped because meta is null
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it("includes season_id in pixel_history when season is active", async () => {
      mockGetActiveSeasonId.mockReturnValue(42);
      mockGetDirtyPixels.mockResolvedValue(["1,2"]);
      mockGetPixelMeta.mockResolvedValue({
        color: "3",
        wallet_id: "wallet-x",
        price_paid: "1.0",
        overwrite_count: "2",
        updated_at: "2025-06-01T12:00:00.000Z",
      });

      await flushOnce();

      // pixel_history INSERT — season_id should be 42
      const historyCall = mockQuery.mock.calls[2];
      expect(historyCall[0]).toContain("INSERT INTO pixel_history");
      expect(historyCall[1][5]).toBe(42); // season_id
    });

    it("upserts wallet_season_stats when season is active", async () => {
      mockGetActiveSeasonId.mockReturnValue(7);
      mockGetDirtyPixels.mockResolvedValue(["4,4"]);
      mockGetPixelMeta.mockResolvedValue({
        color: "1",
        wallet_id: "wallet-y",
        price_paid: "0.75",
        overwrite_count: "0",
        updated_at: "2025-01-01T00:00:00.000Z",
      });

      await flushOnce();

      // BEGIN, INSERT pixels, INSERT pixel_history, INSERT wallet_season_stats, COMMIT
      expect(mockQuery).toHaveBeenCalledTimes(5);
      const statsCall = mockQuery.mock.calls[3];
      expect(statsCall[0]).toContain("wallet_season_stats");
      expect(statsCall[1]).toEqual(["wallet-y", 7, 0.75]);
    });

    it("skips wallet_season_stats for admin wallet", async () => {
      mockGetActiveSeasonId.mockReturnValue(7);
      mockGetDirtyPixels.mockResolvedValue(["0,0"]);
      mockGetPixelMeta.mockResolvedValue({
        color: "1",
        wallet_id: "admin",
        price_paid: "0",
        overwrite_count: "0",
        updated_at: "2025-01-01T00:00:00.000Z",
      });

      await flushOnce();

      // BEGIN, INSERT pixels, INSERT pixel_history, COMMIT — NO wallet_season_stats
      expect(mockQuery).toHaveBeenCalledTimes(4);
      const allSql = mockQuery.mock.calls.map((c: any[]) => c[0]);
      expect(allSql.some((s: string) => s.includes("wallet_season_stats"))).toBe(false);
    });

    it("rolls back and returns 0 on query error", async () => {
      mockGetDirtyPixels.mockResolvedValue(["1,1"]);
      mockGetPixelMeta.mockResolvedValue({
        color: "1",
        wallet_id: "w1",
        price_paid: "0.5",
        overwrite_count: "0",
        updated_at: "2025-01-01T00:00:00.000Z",
      });
      // Make the pixel INSERT fail
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql === "BEGIN") return;
        if (sql === "ROLLBACK") return;
        throw new Error("DB write error");
      });

      const count = await flushOnce();

      expect(count).toBe(0);
      const allSql = mockQuery.mock.calls.map((c: any[]) => c[0]);
      expect(allSql).toContain("ROLLBACK");
      expect(mockClearDirtyPixels).not.toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalledOnce();
    });

    it("returns 0 when pool is null", async () => {
      // Override getPool to return null for this test
      const { getPool } = await import("../db/pool");
      (getPool as any).mockReturnValueOnce(null);

      const count = await flushOnce();
      expect(count).toBe(0);
    });
  });

  describe("startFlushService / stopFlushService", () => {
    it("starts and stops the interval timer", () => {
      vi.useFakeTimers();
      const G = globalThis as any;

      startFlushService();
      expect(G.__iotaFlushTimer).toBeDefined();

      stopFlushService();
      expect(G.__iotaFlushTimer).toBeNull();

      vi.useRealTimers();
    });

    it("skips when pool is null", async () => {
      const { getPool } = await import("../db/pool");
      (getPool as any).mockReturnValueOnce(null);

      const G = globalThis as any;
      delete G.__iotaFlushTimer;
      startFlushService();
      // Timer should not be set since pool is null
      expect(G.__iotaFlushTimer).toBeUndefined();
    });
  });
});
