import { Router } from "express";
import { requireAdmin } from "../middleware/admin-auth";
import { paymentService } from "../services/payment";
import { MockPaymentService } from "../services/payment/mock-payment.service";
import { canvasService } from "../services/canvas.service";
import { broadcastPixelUpdate } from "../ws/socket";

export function mountRoutes(router: Router): void {
  // Admin stats
  router.get("/api/admin/stats", requireAdmin as any, async (_req, res) => {
    try {
      let totalWallets = 0;
      let totalSpent = 0;
      let totalPlacements = 0;
      let bannedWallets = 0;

      if (paymentService instanceof MockPaymentService) {
        const wallets = paymentService.getAllWallets();
        totalWallets = wallets.length;
        totalSpent = wallets.reduce((sum, w) => sum + w.totalSpent, 0);
        totalPlacements = wallets.reduce((sum, w) => sum + w.pixelCount, 0);
        bannedWallets = wallets.filter((w) => w.isBanned).length;
      }

      const config = canvasService.getConfig();

      res.json({
        ok: true,
        stats: {
          totalPlacements,
          totalWallets,
          bannedWallets,
          totalSpent: Math.round(totalSpent * 10000) / 10000,
          canvasSize: `${config.width}x${config.height}`,
        },
      });
    } catch {
      res.status(500).json({ error: "STATS_FETCH_FAILED" });
    }
  });

  // List wallets
  router.get("/api/admin/wallets", requireAdmin as any, async (req, res) => {
    try {
      if (paymentService instanceof MockPaymentService) {
        const wallets = paymentService.getAllWallets();
        const search = (req.query.search as string || "").toLowerCase();
        const filtered = search
          ? wallets.filter((w) =>
              w.displayName.toLowerCase().includes(search) || w.address.toLowerCase().includes(search)
            )
          : wallets;

        return res.json({
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
      }
      res.json({ ok: true, wallets: [] });
    } catch {
      res.status(500).json({ error: "WALLETS_FETCH_FAILED" });
    }
  });

  // Ban/unban wallet
  router.put("/api/admin/wallets/:walletId/ban", requireAdmin as any, async (req, res) => {
    try {
      const { walletId } = req.params;
      const { banned } = req.body;

      if (paymentService instanceof MockPaymentService) {
        const wallets = paymentService.getAllWallets();
        const wallet = wallets.find((w) => w.id === walletId);
        if (!wallet) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
        wallet.isBanned = !!banned;
        return res.json({ ok: true, wallet: { id: wallet.id, isBanned: wallet.isBanned } });
      }
      res.status(500).json({ error: "NOT_IMPLEMENTED" });
    } catch {
      res.status(500).json({ error: "BAN_FAILED" });
    }
  });

  // Reset pixel (admin moderation)
  router.post("/api/admin/canvas/reset-pixel", requireAdmin as any, async (req, res) => {
    try {
      const { x, y } = req.body;
      if (typeof x !== "number" || typeof y !== "number") {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }

      // Set to white (color 0), no wallet, no price
      const pixel = canvasService.setPixel(x, y, 0, "admin", 0);
      if (!pixel) return res.status(400).json({ error: "OUT_OF_BOUNDS" });

      broadcastPixelUpdate(x, y, 0);
      res.json({ ok: true, pixel });
    } catch {
      res.status(500).json({ error: "RESET_FAILED" });
    }
  });
}
