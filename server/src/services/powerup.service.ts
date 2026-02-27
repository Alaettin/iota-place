import { canvasService } from "./canvas.service";
import { paymentService } from "./payment";
import { getPool } from "../db/pool";
import { broadcastShieldActivated, broadcastShieldExpired } from "../ws/socket";

const G = globalThis as any;

export interface PowerUpCatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  durationSeconds: number | null;
  isActive: boolean;
}

export interface WalletPowerUp {
  id: number;
  walletId: string;
  powerUpId: string;
  purchasedAt: string;
  usedAt: string | null;
}

export interface ActiveEffect {
  id: number;
  powerUpId: string;
  walletId: string;
  targetX: number;
  targetY: number;
  activatedAt: string;
  expiresAt: string;
}

interface ShieldEntry {
  effectId: number;
  walletId: string;
  expiresAt: number; // epoch ms
}

// Static catalog (loaded from DB on startup, fallback to hardcoded)
const DEFAULT_CATALOG: PowerUpCatalogItem[] = [
  {
    id: "shield",
    name: "Shield",
    description: "Protect a pixel from being overwritten for 1 hour",
    price: 2.0,
    durationSeconds: 3600,
    isActive: true,
  },
];

export class PowerUpService {
  private catalog: PowerUpCatalogItem[] = [...DEFAULT_CATALOG];
  private shieldedPixels = new Map<string, ShieldEntry>();

  getCatalog(): PowerUpCatalogItem[] {
    return this.catalog.filter((p) => p.isActive);
  }

  getCatalogItem(powerUpId: string): PowerUpCatalogItem | undefined {
    return this.catalog.find((p) => p.id === powerUpId && p.isActive);
  }

  async purchase(walletId: string, powerUpId: string): Promise<{ success: boolean; inventoryId?: number; newBalance?: number; error?: string }> {
    const item = this.getCatalogItem(powerUpId);
    if (!item) return { success: false, error: "UNKNOWN_POWER_UP" };

    // Check wallet balance
    const wallet = await paymentService.getWallet(walletId);
    if (!wallet) return { success: false, error: "WALLET_NOT_FOUND" };
    if (paymentService.isWalletBanned(walletId)) return { success: false, error: "WALLET_BANNED" };
    if (wallet.balance < item.price) return { success: false, error: "INSUFFICIENT_BALANCE" };

    // Deduct balance (server-side, no on-chain tx needed)
    const payment = await paymentService.deductBalance(walletId, item.price, `powerup:${powerUpId}`);
    if (!payment.success) return { success: false, error: payment.error };

    // Save to DB
    let inventoryId = 0;
    const pool = getPool();
    if (pool) {
      const { rows } = await pool.query(
        "INSERT INTO wallet_power_ups (wallet_id, power_up_id) VALUES ($1, $2) RETURNING id",
        [walletId, powerUpId]
      );
      inventoryId = rows[0].id;
    }

    return { success: true, inventoryId, newBalance: payment.newBalance };
  }

  async getInventory(walletId: string): Promise<WalletPowerUp[]> {
    const pool = getPool();
    if (!pool) return [];

    const { rows } = await pool.query(
      "SELECT id, wallet_id, power_up_id, purchased_at, used_at FROM wallet_power_ups WHERE wallet_id = $1 AND used_at IS NULL ORDER BY purchased_at DESC",
      [walletId]
    );

    return rows.map((r) => ({
      id: r.id,
      walletId: r.wallet_id,
      powerUpId: r.power_up_id,
      purchasedAt: r.purchased_at,
      usedAt: r.used_at,
    }));
  }

  async activateShield(walletId: string, inventoryId: number, x: number, y: number): Promise<{ success: boolean; expiresAt?: string; error?: string }> {
    const pool = getPool();

    // Validate inventory item
    if (pool) {
      const { rows } = await pool.query(
        "SELECT id, wallet_id, power_up_id, used_at FROM wallet_power_ups WHERE id = $1",
        [inventoryId]
      );
      if (rows.length === 0) return { success: false, error: "INVENTORY_NOT_FOUND" };
      if (rows[0].wallet_id !== walletId) return { success: false, error: "NOT_YOUR_ITEM" };
      if (rows[0].used_at !== null) return { success: false, error: "ALREADY_USED" };
      if (rows[0].power_up_id !== "shield") return { success: false, error: "NOT_A_SHIELD" };
    }

    // Validate pixel ownership
    const pixel = canvasService.getPixel(x, y);
    if (!pixel) return { success: false, error: "OUT_OF_BOUNDS" };
    if (pixel.walletId !== walletId) return { success: false, error: "NOT_YOUR_PIXEL" };

    // Check if already shielded
    if (this.isPixelShielded(x, y)) return { success: false, error: "ALREADY_SHIELDED" };

    // Activate
    const item = this.getCatalogItem("shield")!;
    const expiresAt = new Date(Date.now() + (item.durationSeconds || 3600) * 1000);
    let effectId = 0;

    if (pool) {
      // Mark inventory item as used
      await pool.query("UPDATE wallet_power_ups SET used_at = NOW() WHERE id = $1", [inventoryId]);

      // Create active effect
      const { rows } = await pool.query(
        "INSERT INTO active_effects (power_up_id, wallet_id, target_x, target_y, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        ["shield", walletId, x, y, expiresAt.toISOString()]
      );
      effectId = rows[0].id;
    }

    // Update in-memory map
    this.shieldedPixels.set(`${x},${y}`, {
      effectId,
      walletId,
      expiresAt: expiresAt.getTime(),
    });

    // Broadcast to all clients
    broadcastShieldActivated(x, y, expiresAt.toISOString());

    return { success: true, expiresAt: expiresAt.toISOString() };
  }

  isPixelShielded(x: number, y: number): boolean {
    const shield = this.shieldedPixels.get(`${x},${y}`);
    if (!shield) return false;
    if (shield.expiresAt < Date.now()) {
      // Lazy cleanup
      this.shieldedPixels.delete(`${x},${y}`);
      broadcastShieldExpired(x, y);
      return false;
    }
    return true;
  }

  getPixelShield(x: number, y: number): { walletId: string; expiresAt: string } | null {
    if (!this.isPixelShielded(x, y)) return null;
    const shield = this.shieldedPixels.get(`${x},${y}`)!;
    return {
      walletId: shield.walletId,
      expiresAt: new Date(shield.expiresAt).toISOString(),
    };
  }

  getAllActiveShields(): Array<{ x: number; y: number; walletId: string; expiresAt: string }> {
    const now = Date.now();
    const result: Array<{ x: number; y: number; walletId: string; expiresAt: string }> = [];

    for (const [key, shield] of this.shieldedPixels) {
      if (shield.expiresAt < now) continue;
      const [xStr, yStr] = key.split(",");
      result.push({
        x: parseInt(xStr, 10),
        y: parseInt(yStr, 10),
        walletId: shield.walletId,
        expiresAt: new Date(shield.expiresAt).toISOString(),
      });
    }
    return result;
  }

  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, shield] of this.shieldedPixels) {
      if (shield.expiresAt < now) {
        this.shieldedPixels.delete(key);
        const [xStr, yStr] = key.split(",");
        broadcastShieldExpired(parseInt(xStr, 10), parseInt(yStr, 10));
        removed++;
      }
    }

    // Also cleanup DB
    const pool = getPool();
    if (pool && removed > 0) {
      pool.query("DELETE FROM active_effects WHERE expires_at < NOW()").catch(() => {});
    }

    return removed;
  }

  async loadFromDb(): Promise<void> {
    const pool = getPool();
    if (!pool) return;

    try {
      // Load catalog
      const { rows: catalogRows } = await pool.query(
        "SELECT id, name, description, price, duration_seconds, is_active FROM power_up_catalog"
      );
      if (catalogRows.length > 0) {
        this.catalog = catalogRows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          price: parseFloat(r.price),
          durationSeconds: r.duration_seconds,
          isActive: r.is_active,
        }));
      }

      // Load active shields
      const { rows: effectRows } = await pool.query(
        "SELECT id, power_up_id, wallet_id, target_x, target_y, expires_at FROM active_effects WHERE power_up_id = 'shield' AND expires_at > NOW()"
      );
      for (const row of effectRows) {
        this.shieldedPixels.set(`${row.target_x},${row.target_y}`, {
          effectId: row.id,
          walletId: row.wallet_id,
          expiresAt: new Date(row.expires_at).getTime(),
        });
      }

      // Cleanup old expired entries
      await pool.query("DELETE FROM active_effects WHERE expires_at < NOW()");

      console.log(`[PowerUp] Loaded ${this.catalog.length} catalog items, ${this.shieldedPixels.size} active shields`);
    } catch (err) {
      console.warn("[PowerUp] Failed to load from DB:", (err as Error).message);
    }
  }

  // Admin helpers
  async getStats(): Promise<{ totalPurchased: number; activeShields: number; totalSpentOnPowerUps: number }> {
    const pool = getPool();
    if (!pool) return { totalPurchased: 0, activeShields: this.shieldedPixels.size, totalSpentOnPowerUps: 0 };

    const { rows } = await pool.query(
      "SELECT COUNT(*) as total, SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as used FROM wallet_power_ups"
    );
    const total = parseInt(rows[0].total, 10);

    return {
      totalPurchased: total,
      activeShields: this.shieldedPixels.size,
      totalSpentOnPowerUps: total * 2, // All shields cost 2 IOTA for now
    };
  }

  async removeEffect(effectId: number): Promise<boolean> {
    const pool = getPool();

    // Find and remove from in-memory map
    for (const [key, shield] of this.shieldedPixels) {
      if (shield.effectId === effectId) {
        this.shieldedPixels.delete(key);
        const [xStr, yStr] = key.split(",");
        broadcastShieldExpired(parseInt(xStr, 10), parseInt(yStr, 10));
        break;
      }
    }

    if (pool) {
      const { rowCount } = await pool.query("DELETE FROM active_effects WHERE id = $1", [effectId]);
      return (rowCount ?? 0) > 0;
    }
    return true;
  }
}

export const powerUpService: PowerUpService =
  G.__iotaPowerUpService || (G.__iotaPowerUpService = new PowerUpService());
