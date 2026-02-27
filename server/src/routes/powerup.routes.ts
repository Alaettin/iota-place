import { Router } from "express";
import { powerUpService } from "../services/powerup.service";
import { walletAuth, AuthenticatedRequest } from "../middleware/wallet-auth";

export function mountPowerUpRoutes(router: Router): void {
  // Get power-up catalog
  router.get("/api/powerups/catalog", (_req, res) => {
    try {
      const catalog = powerUpService.getCatalog();
      res.json({ ok: true, catalog });
    } catch {
      res.status(500).json({ error: "CATALOG_FETCH_FAILED" });
    }
  });

  // Purchase a power-up
  router.post("/api/powerups/purchase", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const { powerUpId } = req.body;

      if (!powerUpId || typeof powerUpId !== "string") {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }

      const result = await powerUpService.purchase(walletId, powerUpId);
      if (!result.success) {
        const status = result.error === "INSUFFICIENT_BALANCE" ? 402 : 400;
        return res.status(status).json({ error: result.error });
      }

      res.json({ ok: true, inventoryId: result.inventoryId, newBalance: result.newBalance });
    } catch {
      res.status(500).json({ error: "PURCHASE_FAILED" });
    }
  });

  // Get wallet inventory (unused power-ups)
  router.get("/api/powerups/inventory", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const inventory = await powerUpService.getInventory(walletId);
      res.json({ ok: true, inventory });
    } catch {
      res.status(500).json({ error: "INVENTORY_FETCH_FAILED" });
    }
  });

  // Activate a power-up (shield)
  router.post("/api/powerups/activate", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const { inventoryId, targetX, targetY } = req.body;

      if (typeof inventoryId !== "number" || typeof targetX !== "number" || typeof targetY !== "number") {
        return res.status(400).json({ error: "INVALID_PARAMS" });
      }

      const result = await powerUpService.activateShield(walletId, inventoryId, targetX, targetY);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ ok: true, expiresAt: result.expiresAt });
    } catch {
      res.status(500).json({ error: "ACTIVATE_FAILED" });
    }
  });

  // Get all active shields (for canvas overlay)
  router.get("/api/powerups/shields", (_req, res) => {
    try {
      const shields = powerUpService.getAllActiveShields();
      res.json({ ok: true, shields });
    } catch {
      res.status(500).json({ error: "SHIELDS_FETCH_FAILED" });
    }
  });
}
