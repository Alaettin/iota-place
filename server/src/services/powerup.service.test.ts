import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the service
vi.mock("../db/pool", () => ({
  getPool: vi.fn().mockReturnValue(null),
}));

vi.mock("../ws/socket", () => ({
  broadcastShieldActivated: vi.fn(),
  broadcastShieldExpired: vi.fn(),
}));

const mockGetPixel = vi.fn();
vi.mock("./canvas.service", () => ({
  canvasService: {
    getPixel: (...args: any[]) => mockGetPixel(...args),
  },
}));

const mockGetWallet = vi.fn();
const mockDeductBalance = vi.fn();
const mockIsWalletBanned = vi.fn().mockReturnValue(false);
vi.mock("./payment", () => ({
  paymentService: {
    getWallet: (...args: any[]) => mockGetWallet(...args),
    deductBalance: (...args: any[]) => mockDeductBalance(...args),
    isWalletBanned: (...args: any[]) => mockIsWalletBanned(...args),
  },
}));

import { PowerUpService } from "./powerup.service";
import { broadcastShieldActivated, broadcastShieldExpired } from "../ws/socket";

describe("PowerUpService", () => {
  let service: PowerUpService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PowerUpService();
    mockGetWallet.mockResolvedValue({ id: "w1", balance: 100 });
    mockDeductBalance.mockResolvedValue({ success: true, amountPaid: 2, newBalance: 98 });
    mockIsWalletBanned.mockReturnValue(false);
    mockGetPixel.mockReturnValue({ x: 5, y: 5, color: 1, walletId: "w1", pricePaid: 0.5, overwriteCount: 0 });
  });

  describe("getCatalog", () => {
    it("returns shield in catalog", () => {
      const catalog = service.getCatalog();
      expect(catalog.length).toBe(1);
      expect(catalog[0].id).toBe("shield");
      expect(catalog[0].name).toBe("Shield");
      expect(catalog[0].price).toBe(2.0);
      expect(catalog[0].durationSeconds).toBe(3600);
    });

    it("getCatalogItem returns shield by id", () => {
      const item = service.getCatalogItem("shield");
      expect(item).toBeDefined();
      expect(item!.id).toBe("shield");
    });

    it("getCatalogItem returns undefined for unknown id", () => {
      expect(service.getCatalogItem("unknown")).toBeUndefined();
    });
  });

  describe("purchase", () => {
    it("deducts balance and returns success", async () => {
      const result = await service.purchase("w1", "shield");
      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(98);
      expect(mockDeductBalance).toHaveBeenCalledWith("w1", 2.0, "powerup:shield");
    });

    it("fails for unknown power-up", async () => {
      const result = await service.purchase("w1", "unknown");
      expect(result.success).toBe(false);
      expect(result.error).toBe("UNKNOWN_POWER_UP");
    });

    it("fails when wallet not found", async () => {
      mockGetWallet.mockResolvedValue(null);
      const result = await service.purchase("w1", "shield");
      expect(result.success).toBe(false);
      expect(result.error).toBe("WALLET_NOT_FOUND");
    });

    it("fails when wallet is banned", async () => {
      mockIsWalletBanned.mockReturnValue(true);
      const result = await service.purchase("w1", "shield");
      expect(result.success).toBe(false);
      expect(result.error).toBe("WALLET_BANNED");
    });

    it("fails with insufficient balance", async () => {
      mockGetWallet.mockResolvedValue({ id: "w1", balance: 1.0 });
      const result = await service.purchase("w1", "shield");
      expect(result.success).toBe(false);
      expect(result.error).toBe("INSUFFICIENT_BALANCE");
    });

    it("fails when payment processing fails", async () => {
      mockDeductBalance.mockResolvedValue({ success: false, error: "PAYMENT_ERROR" });
      const result = await service.purchase("w1", "shield");
      expect(result.success).toBe(false);
      expect(result.error).toBe("PAYMENT_ERROR");
    });
  });

  describe("activateShield", () => {
    it("shields a pixel and broadcasts", async () => {
      // No pool → skip DB checks, go straight to canvas validation
      const result = await service.activateShield("w1", 1, 5, 5);
      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();
      expect(broadcastShieldActivated).toHaveBeenCalledWith(5, 5, expect.any(String));
    });

    it("fails for out-of-bounds pixel", async () => {
      mockGetPixel.mockReturnValue(null);
      const result = await service.activateShield("w1", 1, 999, 999);
      expect(result.success).toBe(false);
      expect(result.error).toBe("OUT_OF_BOUNDS");
    });

    it("fails when pixel belongs to another wallet", async () => {
      mockGetPixel.mockReturnValue({ x: 5, y: 5, color: 1, walletId: "other-wallet", pricePaid: 0.5, overwriteCount: 0 });
      const result = await service.activateShield("w1", 1, 5, 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe("NOT_YOUR_PIXEL");
    });

    it("fails when pixel is already shielded", async () => {
      // Shield first
      await service.activateShield("w1", 1, 5, 5);
      // Try again
      const result = await service.activateShield("w1", 2, 5, 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe("ALREADY_SHIELDED");
    });
  });

  describe("isPixelShielded", () => {
    it("returns true for shielded pixel", async () => {
      await service.activateShield("w1", 1, 5, 5);
      expect(service.isPixelShielded(5, 5)).toBe(true);
    });

    it("returns false for unshielded pixel", () => {
      expect(service.isPixelShielded(0, 0)).toBe(false);
    });

    it("returns false when shield has expired", async () => {
      await service.activateShield("w1", 1, 5, 5);
      // Manually expire the shield
      const shield = (service as any).shieldedPixels.get("5,5");
      shield.expiresAt = Date.now() - 1000;

      expect(service.isPixelShielded(5, 5)).toBe(false);
      expect(broadcastShieldExpired).toHaveBeenCalledWith(5, 5);
    });
  });

  describe("getPixelShield", () => {
    it("returns shield details for shielded pixel", async () => {
      await service.activateShield("w1", 1, 5, 5);
      const shield = service.getPixelShield(5, 5);
      expect(shield).not.toBeNull();
      expect(shield!.walletId).toBe("w1");
      expect(shield!.expiresAt).toBeDefined();
    });

    it("returns null for unshielded pixel", () => {
      expect(service.getPixelShield(0, 0)).toBeNull();
    });
  });

  describe("getAllActiveShields", () => {
    it("returns all active shields", async () => {
      await service.activateShield("w1", 1, 5, 5);
      mockGetPixel.mockReturnValue({ x: 3, y: 3, color: 2, walletId: "w1", pricePaid: 0.5, overwriteCount: 0 });
      await service.activateShield("w1", 2, 3, 3);

      const shields = service.getAllActiveShields();
      expect(shields.length).toBe(2);
      expect(shields.find((s) => s.x === 5 && s.y === 5)).toBeDefined();
      expect(shields.find((s) => s.x === 3 && s.y === 3)).toBeDefined();
    });

    it("excludes expired shields", async () => {
      await service.activateShield("w1", 1, 5, 5);
      // Expire it
      const shield = (service as any).shieldedPixels.get("5,5");
      shield.expiresAt = Date.now() - 1000;

      const shields = service.getAllActiveShields();
      expect(shields.length).toBe(0);
    });
  });

  describe("cleanupExpired", () => {
    it("removes expired shields from map", async () => {
      await service.activateShield("w1", 1, 5, 5);
      // Expire it
      const shield = (service as any).shieldedPixels.get("5,5");
      shield.expiresAt = Date.now() - 1000;

      const removed = service.cleanupExpired();
      expect(removed).toBe(1);
      expect(service.isPixelShielded(5, 5)).toBe(false);
    });

    it("returns 0 when nothing expired", async () => {
      await service.activateShield("w1", 1, 5, 5);
      const removed = service.cleanupExpired();
      expect(removed).toBe(0);
    });

    it("broadcasts expiry for each cleaned shield", async () => {
      await service.activateShield("w1", 1, 5, 5);
      vi.mocked(broadcastShieldExpired).mockClear();

      const shield = (service as any).shieldedPixels.get("5,5");
      shield.expiresAt = Date.now() - 1000;

      service.cleanupExpired();
      expect(broadcastShieldExpired).toHaveBeenCalledWith(5, 5);
    });
  });

  describe("removeEffect", () => {
    it("removes active shield by effectId", async () => {
      await service.activateShield("w1", 1, 5, 5);
      const shield = (service as any).shieldedPixels.get("5,5");
      const effectId = shield.effectId;

      const removed = await service.removeEffect(effectId);
      expect(removed).toBe(true);
      expect(service.isPixelShielded(5, 5)).toBe(false);
    });
  });

  describe("getStats", () => {
    it("returns stats without pool", async () => {
      const stats = await service.getStats();
      expect(stats.totalPurchased).toBe(0);
      expect(stats.activeShields).toBe(0);
      expect(stats.totalSpentOnPowerUps).toBe(0);
    });

    it("counts active shields in stats", async () => {
      await service.activateShield("w1", 1, 5, 5);
      const stats = await service.getStats();
      expect(stats.activeShields).toBe(1);
    });
  });
});
