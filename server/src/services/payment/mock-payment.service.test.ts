import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock wallet-db to prevent real DB operations
vi.mock("./wallet-db", () => ({
  upsertWalletToDb: vi.fn().mockResolvedValue(undefined),
  updateWalletStatsInDb: vi.fn().mockResolvedValue(undefined),
  loadWalletsFromDb: vi.fn().mockResolvedValue({
    wallets: new Map(),
    addressIndex: new Map(),
  }),
}));

import { MockPaymentService } from "./mock-payment.service";

describe("MockPaymentService", () => {
  let service: MockPaymentService;

  beforeEach(() => {
    service = new MockPaymentService();
  });

  describe("connectWallet", () => {
    it("creates new wallet with starting balance of 100", async () => {
      const info = await service.connectWallet("iota1abc123");
      expect(info.balance).toBe(100);
      expect(info.address).toBe("iota1abc123");
      expect(info.walletId).toBeDefined();
    });

    it("returns same wallet for same address (idempotent)", async () => {
      const w1 = await service.connectWallet("iota1same");
      const w2 = await service.connectWallet("iota1same");
      expect(w1.walletId).toBe(w2.walletId);
    });

    it("uses custom displayName", async () => {
      const info = await service.connectWallet("iota1name", "Alice");
      expect(info.displayName).toBe("Alice");
    });

    it("generates default displayName from address", async () => {
      const info = await service.connectWallet("iota1abcdef99");
      expect(info.displayName).toBe("User_iota1abc");
    });
  });

  describe("getBalance", () => {
    it("returns correct balance", async () => {
      const w = await service.connectWallet("iota1bal");
      const balance = await service.getBalance(w.walletId);
      expect(balance).toBe(100);
    });

    it("returns 0 for unknown wallet", async () => {
      const balance = await service.getBalance("nonexistent");
      expect(balance).toBe(0);
    });
  });

  describe("getWallet", () => {
    it("returns wallet info for known wallet", async () => {
      const w = await service.connectWallet("iota1get");
      const info = await service.getWallet(w.walletId);
      expect(info).not.toBeNull();
      expect(info!.address).toBe("iota1get");
    });

    it("returns null for unknown wallet", async () => {
      const info = await service.getWallet("nonexistent");
      expect(info).toBeNull();
    });
  });

  describe("processPayment", () => {
    it("deducts balance and updates stats on success", async () => {
      const w = await service.connectWallet("iota1pay");
      const result = await service.processPayment(w.walletId, 10, { x: 0, y: 0, color: 1 });

      expect(result.success).toBe(true);
      expect(result.amountPaid).toBe(10);
      expect(result.newBalance).toBe(90);

      const balance = await service.getBalance(w.walletId);
      expect(balance).toBe(90);
    });

    it("fails with INSUFFICIENT_BALANCE when not enough funds", async () => {
      const w = await service.connectWallet("iota1poor");
      const result = await service.processPayment(w.walletId, 200, { x: 0, y: 0, color: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe("INSUFFICIENT_BALANCE");
    });

    it("fails with WALLET_NOT_FOUND for unknown wallet", async () => {
      const result = await service.processPayment("fake-id", 1, { x: 0, y: 0, color: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe("WALLET_NOT_FOUND");
    });

    it("increments pixelCount on successful payments", async () => {
      const w = await service.connectWallet("iota1count");
      await service.processPayment(w.walletId, 1, { x: 0, y: 0, color: 1 });
      await service.processPayment(w.walletId, 1, { x: 1, y: 0, color: 2 });

      const wallets = service.getAllWallets();
      const wallet = wallets.find((wl) => wl.id === w.walletId);
      expect(wallet!.pixelCount).toBe(2);
      expect(wallet!.totalSpent).toBe(2);
    });
  });

  describe("addFunds", () => {
    it("increases balance", async () => {
      const w = await service.connectWallet("iota1fund");
      const result = await service.addFunds(w.walletId, 50);
      expect(result.balance).toBe(150);
    });

    it("throws for unknown wallet", async () => {
      await expect(service.addFunds("nonexistent", 50)).rejects.toThrow("WALLET_NOT_FOUND");
    });
  });

  describe("getAllWallets", () => {
    it("returns all wallets", async () => {
      await service.connectWallet("iota1a");
      await service.connectWallet("iota1b");
      const all = service.getAllWallets();
      expect(all.length).toBe(2);
    });
  });

  describe("isWalletBanned", () => {
    it("returns false for normal wallet", async () => {
      const w = await service.connectWallet("iota1ok");
      expect(service.isWalletBanned(w.walletId)).toBe(false);
    });

    it("returns false for unknown wallet", () => {
      expect(service.isWalletBanned("nonexistent")).toBe(false);
    });
  });
});
