import { Router } from "express";
import { paymentService } from "../services/payment";
import { MockPaymentService } from "../services/payment/mock-payment.service";
import { canvasService } from "../services/canvas.service";

export function mountRoutes(router: Router): void {
  // Leaderboard
  router.get("/api/leaderboard", async (_req, res) => {
    try {
      // In mock mode, get data from MockPaymentService
      if (paymentService instanceof MockPaymentService) {
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
          address: w.address,
          score: type === "spent" ? Math.round(w.totalSpent * 10000) / 10000 : w.pixelCount,
        }));

        return res.json({ ok: true, type, leaderboard });
      }

      res.json({ ok: true, type: "pixels", leaderboard: [] });
    } catch {
      res.status(500).json({ error: "LEADERBOARD_FETCH_FAILED" });
    }
  });

  // Global stats
  router.get("/api/stats", async (_req, res) => {
    try {
      let totalWallets = 0;
      let totalSpent = 0;
      let totalPlacements = 0;

      if (paymentService instanceof MockPaymentService) {
        const wallets = paymentService.getAllWallets();
        totalWallets = wallets.length;
        totalSpent = wallets.reduce((sum, w) => sum + w.totalSpent, 0);
        totalPlacements = wallets.reduce((sum, w) => sum + w.pixelCount, 0);
      }

      const config = canvasService.getConfig();

      res.json({
        ok: true,
        stats: {
          totalPlacements,
          totalWallets,
          totalSpent: Math.round(totalSpent * 10000) / 10000,
          canvasSize: `${config.width}x${config.height}`,
        },
      });
    } catch {
      res.status(500).json({ error: "STATS_FETCH_FAILED" });
    }
  });
}
