import { Router } from "express";
import { canvasService } from "../services/canvas.service";
import { getPixelPrice } from "../services/pricing.service";
import { paymentService } from "../services/payment";
import { walletAuth, AuthenticatedRequest } from "../middleware/wallet-auth";
import { COLOR_PALETTE } from "../types";

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
      res.json({ ok: true, pixel, nextPrice: price });
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

  // Canvas config (dimensions, palette)
  router.get("/api/canvas/config", (_req, res) => {
    try {
      const config = canvasService.getConfig();
      res.json({ ok: true, config, palette: COLOR_PALETTE });
    } catch {
      res.status(500).json({ error: "CONFIG_FETCH_FAILED" });
    }
  });

  // Place pixel with payment
  router.post("/api/canvas/pixel", walletAuth as any, async (req, res) => {
    try {
      const { x, y, color } = req.body;
      const walletId = (req as AuthenticatedRequest).walletId!;

      if (typeof x !== "number" || typeof y !== "number" || typeof color !== "number") {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }
      if (color < 0 || color > 31) {
        return res.status(400).json({ error: "INVALID_COLOR" });
      }

      // Calculate price
      const price = getPixelPrice(x, y);

      // Process payment
      const payment = await paymentService.processPayment(walletId, price, { x, y, color });
      if (!payment.success) {
        return res.status(402).json({ error: payment.error, price });
      }

      // Place pixel
      const pixel = canvasService.setPixel(x, y, color, walletId, payment.amountPaid);
      if (!pixel) return res.status(400).json({ error: "OUT_OF_BOUNDS" });

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
}
