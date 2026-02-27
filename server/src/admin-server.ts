import express from "express";
import path from "path";
import fs from "fs";
import { requireAdmin } from "./middleware/admin-auth";
import { paymentService } from "./services/payment";
import { canvasService } from "./services/canvas.service";
import { seasonService } from "./services/season.service";
import { broadcastPixelUpdate, broadcastPause, broadcastSeasonChange, broadcastCanvasReset } from "./ws/socket";
import { createBackup } from "./services/backup.service";
import { COLOR_PALETTE } from "./types";
import { getPool } from "./db/pool";
import { getPixelPrice } from "./services/pricing.service";

export function startAdminServer(): void {
  const app = express();
  const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || "3002", 10);

  app.use(express.json());

  // Serve static admin HTML
  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "admin", "index.html"));
  });

  // --- Admin API routes ---

  // Stats
  app.get("/api/admin/stats", requireAdmin as any, async (_req, res) => {
    try {
      const wallets = paymentService.getAllWallets();
      const totalWallets = wallets.length;
      const totalSpent = wallets.reduce((sum, w) => sum + w.totalSpent, 0);
      const totalPlacements = wallets.reduce((sum, w) => sum + w.pixelCount, 0);
      const bannedWallets = wallets.filter((w) => w.isBanned).length;
      const config = canvasService.getConfig();

      res.json({
        ok: true,
        stats: {
          totalPlacements,
          totalWallets,
          bannedWallets,
          totalSpent: Math.round(totalSpent * 10000) / 10000,
          canvasSize: `${config.width}x${config.height}`,
          paused: canvasService.isPaused(),
        },
      });
    } catch {
      res.status(500).json({ error: "STATS_FETCH_FAILED" });
    }
  });

  // List wallets
  app.get("/api/admin/wallets", requireAdmin as any, async (req, res) => {
    try {
      const wallets = paymentService.getAllWallets();
      const search = ((req.query.search as string) || "").toLowerCase();
      const filtered = search
        ? wallets.filter(
            (w) =>
              w.displayName.toLowerCase().includes(search) ||
              w.address.toLowerCase().includes(search)
          )
        : wallets;

      res.json({
        ok: true,
        wallets: filtered.map((w) => ({
          id: w.id,
          address: w.address,
          displayName: w.displayName,
          balance: w.balance,
          totalSpent: Math.round(w.totalSpent * 10000) / 10000,
          pixelCount: w.pixelCount,
          isBanned: w.isBanned,
        })),
      });
    } catch {
      res.status(500).json({ error: "WALLETS_FETCH_FAILED" });
    }
  });

  // Ban/unban wallet
  app.put("/api/admin/wallets/:walletId/ban", requireAdmin as any, async (req, res) => {
    try {
      const { walletId } = req.params;
      const { banned } = req.body;
      const wallets = paymentService.getAllWallets();
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
      wallet.isBanned = !!banned;
      res.json({ ok: true, wallet: { id: wallet.id, isBanned: wallet.isBanned } });
    } catch {
      res.status(500).json({ error: "BAN_FAILED" });
    }
  });

  // Reset pixel
  app.post("/api/admin/canvas/reset-pixel", requireAdmin as any, async (req, res) => {
    try {
      const { x, y } = req.body;
      if (typeof x !== "number" || typeof y !== "number") {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }
      const pixel = canvasService.setPixel(x, y, 0, "admin", 0);
      if (!pixel) return res.status(400).json({ error: "OUT_OF_BOUNDS" });
      broadcastPixelUpdate(x, y, 0);
      res.json({ ok: true, pixel });
    } catch {
      res.status(500).json({ error: "RESET_FAILED" });
    }
  });

  // --- Canvas viewer endpoints (served from admin port to avoid CORS) ---

  // Full binary canvas
  app.get("/api/canvas", requireAdmin as any, (_req, res) => {
    try {
      const buffer = canvasService.getFullCanvas();
      res.set("Content-Type", "application/octet-stream");
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "CANVAS_FETCH_FAILED" });
    }
  });

  // Canvas config + palette
  app.get("/api/canvas/config", requireAdmin as any, (_req, res) => {
    try {
      const config = canvasService.getConfig();
      res.json({
        ok: true,
        config: { ...config, paused: canvasService.isPaused() },
        palette: COLOR_PALETTE,
      });
    } catch {
      res.status(500).json({ error: "CONFIG_FETCH_FAILED" });
    }
  });

  // Pixel info with wallet details
  app.get("/api/canvas/pixel/:x/:y", requireAdmin as any, async (req, res) => {
    try {
      const x = parseInt(req.params.x, 10);
      const y = parseInt(req.params.y, 10);
      const pixel = canvasService.getPixel(x, y);
      if (!pixel) return res.status(400).json({ error: "OUT_OF_BOUNDS" });
      const price = getPixelPrice(x, y);

      let walletInfo = null;
      if (pixel.walletId && pixel.walletId !== "admin") {
        const wallets = paymentService.getAllWallets();
        const w = wallets.find((wl) => wl.id === pixel.walletId);
        if (w) {
          walletInfo = { id: w.id, address: w.address, displayName: w.displayName, isBanned: w.isBanned };
        }
      }

      res.json({ ok: true, pixel, nextPrice: price, wallet: walletInfo });
    } catch {
      res.status(500).json({ error: "PIXEL_FETCH_FAILED" });
    }
  });

  // Pixel placement history
  app.get("/api/canvas/pixel/:x/:y/history", requireAdmin as any, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.json({ ok: true, history: [] });

      const x = parseInt(req.params.x, 10);
      const y = parseInt(req.params.y, 10);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      const { rows } = await pool.query(
        `SELECT ph.color, ph.price_paid, ph.placed_at,
                ph.wallet_id, w.display_name, w.address
         FROM pixel_history ph
         LEFT JOIN wallets w ON w.id = ph.wallet_id
         WHERE ph.x = $1 AND ph.y = $2
         ORDER BY ph.placed_at DESC LIMIT $3`,
        [x, y, limit]
      );
      res.json({ ok: true, history: rows });
    } catch {
      res.status(500).json({ error: "HISTORY_FETCH_FAILED" });
    }
  });

  // Area reset (max 2500 pixels = 50x50)
  app.post("/api/admin/canvas/reset-area", requireAdmin as any, async (req, res) => {
    try {
      const { x1, y1, x2, y2 } = req.body;
      if ([x1, y1, x2, y2].some((v) => typeof v !== "number")) {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }

      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      const area = (maxX - minX + 1) * (maxY - minY + 1);

      if (area > 2500) {
        return res.status(400).json({ error: "AREA_TOO_LARGE", maxArea: 2500, requestedArea: area });
      }

      let resetCount = 0;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const pixel = canvasService.setPixel(x, y, 0, "admin", 0);
          if (pixel) {
            broadcastPixelUpdate(x, y, 0);
            resetCount++;
          }
        }
      }

      res.json({ ok: true, resetCount, bounds: { x1: minX, y1: minY, x2: maxX, y2: maxY } });
    } catch {
      res.status(500).json({ error: "AREA_RESET_FAILED" });
    }
  });

  // Pause / Resume
  app.put("/api/admin/pause", requireAdmin as any, async (req, res) => {
    try {
      const { paused } = req.body;
      canvasService.setPaused(!!paused);
      broadcastPause(!!paused);
      res.json({ ok: true, paused: canvasService.isPaused() });
    } catch {
      res.status(500).json({ error: "PAUSE_FAILED" });
    }
  });

  // --- Season Management ---

  // Get current season
  app.get("/api/admin/season/current", requireAdmin as any, async (_req, res) => {
    res.json({ ok: true, season: seasonService.getActiveSeason() });
  });

  // Get season history
  app.get("/api/admin/season/history", requireAdmin as any, async (_req, res) => {
    try {
      const seasons = await seasonService.getAllSeasons();
      res.json({ ok: true, seasons });
    } catch {
      res.status(500).json({ error: "SEASON_HISTORY_FAILED" });
    }
  });

  // Start new season
  app.post("/api/admin/season/start", requireAdmin as any, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "SEASON_NAME_REQUIRED" });
      }

      const existing = seasonService.getActiveSeason();
      if (existing) {
        return res.status(409).json({ error: "SEASON_ALREADY_ACTIVE", season: existing });
      }

      const config = canvasService.getConfig();
      const season = await seasonService.startSeason(name.trim(), config.width, config.height);
      broadcastSeasonChange(season);

      res.json({ ok: true, season });
    } catch (err) {
      console.error("[Admin] Start season failed:", err);
      res.status(500).json({ error: "SEASON_START_FAILED" });
    }
  });

  // End season (with optional canvas reset)
  app.post("/api/admin/season/end", requireAdmin as any, async (req, res) => {
    try {
      const activeSeason = seasonService.getActiveSeason();
      if (!activeSeason) {
        return res.status(409).json({ error: "NO_ACTIVE_SEASON" });
      }

      const { resetCanvas: shouldReset } = req.body;

      // Step 1: Pause canvas
      canvasService.setPaused(true);
      broadcastPause(true);

      // Step 2: Create backup before anything destructive
      await createBackup();

      // Step 3: Generate PNG snapshot
      const snapshotDir = path.resolve(__dirname, "../../data/snapshots");
      if (!fs.existsSync(snapshotDir)) {
        fs.mkdirSync(snapshotDir, { recursive: true });
      }
      const pngBuffer = canvasService.generateSnapshotPng(COLOR_PALETTE);
      const snapshotFilename = `season_${activeSeason.id}.png`;
      const snapshotPath = path.join(snapshotDir, snapshotFilename);
      fs.writeFileSync(snapshotPath, pngBuffer);

      // Step 4: End season in DB
      const snapshotUrl = `snapshots/${snapshotFilename}`;
      const endedSeason = await seasonService.endSeason(snapshotUrl);

      // Step 5: Optionally reset canvas
      let canvasReset = false;
      if (shouldReset) {
        await canvasService.resetCanvas();
        broadcastCanvasReset();
        canvasReset = true;
      }

      // Step 6: Resume canvas
      canvasService.setPaused(false);
      broadcastPause(false);

      // Step 7: Broadcast season ended
      broadcastSeasonChange(null);

      res.json({ ok: true, season: endedSeason, snapshotUrl, canvasReset });
    } catch (err) {
      console.error("[Admin] End season failed:", err);
      // CRITICAL: Always resume canvas even on error
      canvasService.setPaused(false);
      broadcastPause(false);
      res.status(500).json({ error: "SEASON_END_FAILED", message: (err as Error).message });
    }
  });

  // Serve season snapshot PNG
  app.get("/api/admin/season/:id/snapshot", requireAdmin as any, async (req, res) => {
    try {
      const seasonId = parseInt(req.params.id, 10);
      const season = await seasonService.getSeasonById(seasonId);
      if (!season || !season.snapshotUrl) {
        return res.status(404).json({ error: "SNAPSHOT_NOT_FOUND" });
      }
      const filePath = path.resolve(__dirname, "../../data", season.snapshotUrl);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "SNAPSHOT_FILE_MISSING" });
      }
      res.sendFile(filePath);
    } catch {
      res.status(500).json({ error: "SNAPSHOT_SERVE_FAILED" });
    }
  });

  // Per-season leaderboard (admin)
  app.get("/api/admin/season/:id/leaderboard", requireAdmin as any, async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.json({ ok: true, leaderboard: [] });

      const seasonId = parseInt(req.params.id, 10);
      const type = (req.query.type as string) === "spent" ? "spent" : "pixels";
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const orderCol = type === "spent" ? "wss.total_spent" : "wss.pixel_count";

      const { rows } = await pool.query(`
        SELECT wss.wallet_id, wss.total_spent, wss.pixel_count,
               w.display_name, w.address
        FROM wallet_season_stats wss
        LEFT JOIN wallets w ON w.id = wss.wallet_id
        WHERE wss.season_id = $1
        ORDER BY ${orderCol} DESC
        LIMIT $2
      `, [seasonId, limit]);

      res.json({
        ok: true,
        type,
        leaderboard: rows.map((r: any, i: number) => ({
          rank: i + 1,
          walletId: r.wallet_id,
          displayName: r.display_name || "Unknown",
          address: r.address || "",
          score: type === "spent"
            ? Math.round(parseFloat(r.total_spent) * 10000) / 10000
            : r.pixel_count,
        })),
      });
    } catch {
      res.status(500).json({ error: "SEASON_LEADERBOARD_FAILED" });
    }
  });

  app.listen(ADMIN_PORT, "127.0.0.1", () => {
    console.log(`[Admin] Dashboard running on http://127.0.0.1:${ADMIN_PORT}`);
  });
}
