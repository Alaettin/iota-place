import { Router } from "express";
import { paymentService } from "../services/payment";
import { canvasService } from "../services/canvas.service";
import { seasonService } from "../services/season.service";
import { getPool } from "../db/pool";

export function mountRoutes(router: Router): void {
  // All-time leaderboard
  router.get("/api/leaderboard", async (_req, res) => {
    try {
      const wallets = paymentService.getAllWallets();
      const type = (_req.query.type as string) === "spent" ? "spent" : "pixels";
      const limit = Math.min(parseInt(_req.query.limit as string) || 20, 100);

      const sorted = [...wallets]
        .sort((a, b) => (type === "spent" ? b.totalSpent - a.totalSpent : b.pixelCount - a.pixelCount))
        .slice(0, limit)
        .filter((w) => (type === "spent" ? w.totalSpent > 0 : w.pixelCount > 0));

      const leaderboard = sorted.map((w, i) => ({
        rank: i + 1,
        walletId: w.id,
        displayName: w.displayName,
        score: type === "spent" ? Math.round(w.totalSpent * 10000) / 10000 : w.pixelCount,
      }));

      res.json({ ok: true, type, leaderboard });
    } catch {
      res.status(500).json({ error: "LEADERBOARD_FETCH_FAILED" });
    }
  });

  // Per-season leaderboard
  router.get("/api/leaderboard/season/:seasonId", async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.json({ ok: true, type: "pixels", leaderboard: [] });

      const seasonId = parseInt(req.params.seasonId, 10);
      if (isNaN(seasonId)) return res.status(400).json({ error: "INVALID_SEASON_ID" });

      const type = (req.query.type as string) === "spent" ? "spent" : "pixels";
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      // Use separate queries instead of string interpolation for ORDER BY
      const sql = type === "spent"
        ? `SELECT wss.wallet_id, wss.total_spent, wss.pixel_count, w.display_name
           FROM wallet_season_stats wss LEFT JOIN wallets w ON w.id = wss.wallet_id
           WHERE wss.season_id = $1 ORDER BY wss.total_spent DESC LIMIT $2`
        : `SELECT wss.wallet_id, wss.total_spent, wss.pixel_count, w.display_name
           FROM wallet_season_stats wss LEFT JOIN wallets w ON w.id = wss.wallet_id
           WHERE wss.season_id = $1 ORDER BY wss.pixel_count DESC LIMIT $2`;

      const { rows } = await pool.query(sql, [seasonId, limit]);

      const leaderboard = rows.map((r: any, i: number) => ({
        rank: i + 1,
        walletId: r.wallet_id,
        displayName: r.display_name || "Unknown",
        score: type === "spent"
          ? Math.round(parseFloat(r.total_spent) * 10000) / 10000
          : r.pixel_count,
      }));

      res.json({ ok: true, type, leaderboard });
    } catch {
      res.status(500).json({ error: "SEASON_LEADERBOARD_FETCH_FAILED" });
    }
  });

  // Global stats (with optional season stats)
  router.get("/api/stats", async (_req, res) => {
    try {
      const wallets = paymentService.getAllWallets();
      const totalWallets = wallets.length;
      const totalSpent = wallets.reduce((sum, w) => sum + w.totalSpent, 0);
      const totalPlacements = wallets.reduce((sum, w) => sum + w.pixelCount, 0);
      const config = canvasService.getConfig();

      let seasonStats = null;
      const activeSeason = seasonService.getActiveSeason();
      if (activeSeason) {
        const pool = getPool();
        if (pool) {
          const { rows } = await pool.query(
            `SELECT COALESCE(SUM(pixel_count), 0) as placements,
                    COUNT(*) as wallets,
                    COALESCE(SUM(total_spent), 0) as spent
             FROM wallet_season_stats WHERE season_id = $1`,
            [activeSeason.id]
          );
          if (rows[0]) {
            seasonStats = {
              seasonId: activeSeason.id,
              seasonName: activeSeason.name,
              totalPlacements: parseInt(rows[0].placements),
              totalWallets: parseInt(rows[0].wallets),
              totalSpent: Math.round(parseFloat(rows[0].spent) * 10000) / 10000,
            };
          }
        }
      }

      res.json({
        ok: true,
        stats: {
          totalPlacements,
          totalWallets,
          totalSpent: Math.round(totalSpent * 10000) / 10000,
          canvasSize: `${config.width}x${config.height}`,
        },
        seasonStats,
      });
    } catch {
      res.status(500).json({ error: "STATS_FETCH_FAILED" });
    }
  });
}
