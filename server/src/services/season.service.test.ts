import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock PostgreSQL pool ---

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

vi.mock("../db/pool", () => ({
  getPool: vi.fn(() => mockPool),
}));

// Import after mocks
import { seasonService } from "./season.service";

// We need access to the class to create fresh instances per test
// The singleton on globalThis persists — so we reset its state manually
function resetSeasonService() {
  // Access private field via cast
  (seasonService as any).activeSeason = null;
}

describe("SeasonService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSeasonService();
  });

  describe("getActiveSeason / getActiveSeasonId (no DB)", () => {
    it("returns null when no season loaded", () => {
      expect(seasonService.getActiveSeason()).toBeNull();
      expect(seasonService.getActiveSeasonId()).toBeNull();
    });
  });

  describe("loadFromDb", () => {
    it("loads active season from database", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: "Season Alpha",
          start_date: "2025-01-01",
          end_date: null,
          snapshot_url: null,
          canvas_width: 250,
          canvas_height: 250,
          is_active: true,
        }],
      });

      await seasonService.loadFromDb();

      const season = seasonService.getActiveSeason();
      expect(season).not.toBeNull();
      expect(season!.id).toBe(1);
      expect(season!.name).toBe("Season Alpha");
      expect(season!.isActive).toBe(true);
      expect(season!.endDate).toBeNull();
      expect(seasonService.getActiveSeasonId()).toBe(1);
    });

    it("sets activeSeason to null when no active season in DB", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await seasonService.loadFromDb();

      expect(seasonService.getActiveSeason()).toBeNull();
      expect(seasonService.getActiveSeasonId()).toBeNull();
    });

    it("handles DB query errors gracefully", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

      // Should not throw
      await seasonService.loadFromDb();

      expect(seasonService.getActiveSeason()).toBeNull();
    });

    it("does nothing when pool is null", async () => {
      const { getPool } = await import("../db/pool");
      (getPool as any).mockReturnValueOnce(null);

      await seasonService.loadFromDb();

      expect(mockQuery).not.toHaveBeenCalled();
      expect(seasonService.getActiveSeason()).toBeNull();
    });
  });

  describe("startSeason", () => {
    it("creates a new season and sets it active", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 5,
            name: "Beta",
            start_date: "2025-06-01",
            end_date: null,
            snapshot_url: null,
            canvas_width: 100,
            canvas_height: 100,
            is_active: true,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE canvas_config

      const season = await seasonService.startSeason("Beta", 100, 100);

      expect(season.id).toBe(5);
      expect(season.name).toBe("Beta");
      expect(season.isActive).toBe(true);
      expect(seasonService.getActiveSeason()).toBe(season);
      expect(seasonService.getActiveSeasonId()).toBe(5);

      // Verify INSERT and UPDATE queries
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toContain("INSERT INTO seasons");
      expect(mockQuery.mock.calls[0][1]).toEqual(["Beta", 100, 100]);
      expect(mockQuery.mock.calls[1][0]).toContain("UPDATE canvas_config");
    });

    it("throws when a season is already active", async () => {
      // Set up an active season
      (seasonService as any).activeSeason = { id: 1, name: "Active", isActive: true };

      await expect(seasonService.startSeason("New", 250, 250))
        .rejects.toThrow("A season is already active");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("throws when pool is null", async () => {
      const { getPool } = await import("../db/pool");
      (getPool as any).mockReturnValueOnce(null);

      await expect(seasonService.startSeason("Fail", 250, 250))
        .rejects.toThrow("No database connection");
    });
  });

  describe("endSeason", () => {
    it("ends the active season with snapshot URL", async () => {
      // Set up active season
      (seasonService as any).activeSeason = {
        id: 3,
        name: "Gamma",
        startDate: "2025-03-01",
        endDate: null,
        snapshotUrl: null,
        canvasWidth: 250,
        canvasHeight: 250,
        isActive: true,
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 3,
            name: "Gamma",
            start_date: "2025-03-01",
            end_date: "2025-06-01",
            snapshot_url: "/snapshots/gamma.png",
            canvas_width: 250,
            canvas_height: 250,
            is_active: false,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE canvas_config

      const ended = await seasonService.endSeason("/snapshots/gamma.png");

      expect(ended.id).toBe(3);
      expect(ended.endDate).toBe("2025-06-01");
      expect(ended.snapshotUrl).toBe("/snapshots/gamma.png");
      expect(ended.isActive).toBe(false);
      expect(seasonService.getActiveSeason()).toBeNull();
      expect(seasonService.getActiveSeasonId()).toBeNull();

      // Verify UPDATE and NULL queries
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toContain("UPDATE seasons");
      expect(mockQuery.mock.calls[0][1]).toEqual(["/snapshots/gamma.png", 3]);
      expect(mockQuery.mock.calls[1][0]).toContain("active_season_id = NULL");
    });

    it("throws when no active season", async () => {
      await expect(seasonService.endSeason("/snap.png"))
        .rejects.toThrow("No active season to end");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("throws when pool is null", async () => {
      (seasonService as any).activeSeason = { id: 1 };
      const { getPool } = await import("../db/pool");
      (getPool as any).mockReturnValueOnce(null);

      await expect(seasonService.endSeason("/snap.png"))
        .rejects.toThrow("No database connection");
    });
  });

  describe("getAllSeasons", () => {
    it("returns all seasons ordered by start_date DESC", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 2, name: "Beta", start_date: "2025-06-01", end_date: "2025-09-01", snapshot_url: null, canvas_width: 250, canvas_height: 250, is_active: false },
          { id: 1, name: "Alpha", start_date: "2025-01-01", end_date: "2025-03-01", snapshot_url: "/snap.png", canvas_width: 200, canvas_height: 200, is_active: false },
        ],
      });

      const seasons = await seasonService.getAllSeasons();

      expect(seasons).toHaveLength(2);
      expect(seasons[0].id).toBe(2);
      expect(seasons[0].name).toBe("Beta");
      expect(seasons[1].id).toBe(1);
      expect(seasons[1].snapshotUrl).toBe("/snap.png");
    });

    it("returns empty array when pool is null", async () => {
      const { getPool } = await import("../db/pool");
      (getPool as any).mockReturnValueOnce(null);

      const seasons = await seasonService.getAllSeasons();
      expect(seasons).toEqual([]);
    });
  });

  describe("getSeasonById", () => {
    it("returns season when found", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10,
          name: "Special",
          start_date: "2025-12-01",
          end_date: null,
          snapshot_url: null,
          canvas_width: 300,
          canvas_height: 300,
          is_active: true,
        }],
      });

      const season = await seasonService.getSeasonById(10);

      expect(season).not.toBeNull();
      expect(season!.id).toBe(10);
      expect(season!.name).toBe("Special");
      expect(mockQuery.mock.calls[0][1]).toEqual([10]);
    });

    it("returns null when not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const season = await seasonService.getSeasonById(999);
      expect(season).toBeNull();
    });

    it("returns null when pool is null", async () => {
      const { getPool } = await import("../db/pool");
      (getPool as any).mockReturnValueOnce(null);

      const season = await seasonService.getSeasonById(1);
      expect(season).toBeNull();
    });
  });
});
