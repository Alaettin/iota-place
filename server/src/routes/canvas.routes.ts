import { Router } from "express";
import { canvasService } from "../services/canvas.service";
import { getPixelPrice } from "../services/pricing.service";
import { paymentService } from "../services/payment";
import { powerUpService } from "../services/powerup.service";
import { walletAuth, AuthenticatedRequest } from "../middleware/wallet-auth";
import { COLOR_PALETTE, DEFAULT_CONFIG } from "../types";
import { broadcastPixelUpdate } from "../ws/socket";
import { getPool } from "../db/pool";
import { rateLimit } from "../middleware/rate-limit";
import { seasonService } from "../services/season.service";

export function mountRoutes(router: Router): void {
  // Full canvas state as binary
  router.get("/api/canvas", (_req, res) => {
    try {
      const buffer = canvasService.getFullCanvas();
      res.set("Content-Type", "application/octet-stream");
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "CANVAS_FETCH_FAILED" });
    }
  });

  // Single pixel info
  router.get("/api/canvas/pixel/:x/:y", (req, res) => {
    try {
      const x = parseInt(req.params.x, 10);
      const y = parseInt(req.params.y, 10);
      const pixel = canvasService.getPixel(x, y);
      if (!pixel) return res.status(400).json({ error: "OUT_OF_BOUNDS" });
      const price = getPixelPrice(x, y);
      const shield = powerUpService.getPixelShield(x, y);
      res.json({ ok: true, pixel, nextPrice: price, shield });
    } catch {
      res.status(500).json({ error: "PIXEL_FETCH_FAILED" });
    }
  });

  // Get current price for a pixel
  router.get("/api/canvas/price/:x/:y", (req, res) => {
    try {
      const x = parseInt(req.params.x, 10);
      const y = parseInt(req.params.y, 10);
      const price = getPixelPrice(x, y);
      res.json({ ok: true, x, y, price });
    } catch {
      res.status(500).json({ error: "PRICE_FETCH_FAILED" });
    }
  });

  // Canvas config (dimensions, palette, payment mode)
  router.get("/api/canvas/config", (_req, res) => {
    try {
      const config = canvasService.getConfig();
      const activeSeason = seasonService.getActiveSeason();
      res.json({
        ok: true,
        config: {
          ...config,
          paymentMode: DEFAULT_CONFIG.paymentMode,
          collectionAddress: DEFAULT_CONFIG.collectionAddress,
          network: DEFAULT_CONFIG.network,
          paused: canvasService.isPaused(),
        },
        palette: COLOR_PALETTE,
        season: activeSeason ? {
          id: activeSeason.id,
          name: activeSeason.name,
          startDate: activeSeason.startDate,
        } : null,
      });
    } catch {
      res.status(500).json({ error: "CONFIG_FETCH_FAILED" });
    }
  });

  // Place pixel with payment
  router.post("/api/canvas/pixel", rateLimit, walletAuth as any, async (req, res) => {
    try {
      if (canvasService.isPaused()) {
        return res.status(503).json({ error: "PAUSED" });
      }

      const { x, y, color, txDigest } = req.body;
      const walletId = (req as AuthenticatedRequest).walletId!;

      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(color)) {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }
      if (x < 0 || y < 0 || color < 0 || color > 31) {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }

      // Check if pixel is shielded
      if (powerUpService.isPixelShielded(x, y)) {
        const shield = powerUpService.getPixelShield(x, y);
        return res.status(403).json({
          error: "PIXEL_SHIELDED",
          shieldedBy: shield?.walletId,
          expiresAt: shield?.expiresAt,
        });
      }

      // Calculate price
      const price = getPixelPrice(x, y);

      // Process payment (txDigest required in IOTA mode, ignored in mock)
      const payment = await paymentService.processPayment(walletId, price, { x, y, color, txDigest });
      if (!payment.success) {
        return res.status(402).json({ error: payment.error, price });
      }

      // Place pixel
      const pixel = canvasService.setPixel(x, y, color, walletId, payment.amountPaid);
      if (!pixel) return res.status(400).json({ error: "OUT_OF_BOUNDS" });

      // Broadcast to all connected clients
      broadcastPixelUpdate(x, y, color);

      res.json({
        ok: true,
        pixel,
        transactionId: payment.transactionId,
        newBalance: payment.newBalance,
      });
    } catch {
      res.status(500).json({ error: "PIXEL_PLACE_FAILED" });
    }
  });

  // Pixel history
  router.get("/api/canvas/pixel/:x/:y/history", async (req, res) => {
    try {
      const pool = getPool();
      if (!pool) return res.json({ ok: true, history: [] });

      const x = parseInt(req.params.x, 10);
      const y = parseInt(req.params.y, 10);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      const { rows } = await pool.query(
        `SELECT ph.color, ph.price_paid, ph.placed_at,
                w.display_name, w.address
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
}
