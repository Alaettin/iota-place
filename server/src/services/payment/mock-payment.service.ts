import crypto from "crypto";
import { PaymentService, PaymentResult, WalletInfo, WalletRecord } from "./payment.interface";
import { upsertWalletToDb, updateWalletStatsInDb, loadWalletsFromDb } from "./wallet-db";

const STARTING_BALANCE = 100;

export class MockPaymentService implements PaymentService {
  private wallets = new Map<string, WalletRecord>();
  private addressIndex = new Map<string, string>(); // address -> walletId

  async loadFromDb(): Promise<void> {
    const { wallets, addressIndex } = await loadWalletsFromDb();
    this.wallets = wallets;
    this.addressIndex = addressIndex;
  }

  async connectWallet(address: string, displayName?: string): Promise<WalletInfo> {
    // Check if wallet with this address already exists
    const existingId = this.addressIndex.get(address);
    if (existingId) {
      const existing = this.wallets.get(existingId)!;
      if (displayName) existing.displayName = displayName;
      return {
        walletId: existing.id,
        address: existing.address,
        displayName: existing.displayName,
        balance: existing.balance,
      };
    }

    const walletId = crypto.randomUUID();
    const name = displayName || `User_${address.slice(0, 8)}`;
    const record: WalletRecord = {
      id: walletId,
      address,
      displayName: name,
      balance: STARTING_BALANCE,
      totalSpent: 0,
      pixelCount: 0,
      isBanned: false,
    };
    this.wallets.set(walletId, record);
    this.addressIndex.set(address, walletId);
    upsertWalletToDb(record).catch(() => {});

    return {
      walletId: record.id,
      address: record.address,
      displayName: record.displayName,
      balance: record.balance,
    };
  }

  async getBalance(walletId: string): Promise<number> {
    const wallet = this.wallets.get(walletId);
    return wallet?.balance ?? 0;
  }

  async getWallet(walletId: string): Promise<WalletInfo | null> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) return null;
    return {
      walletId: wallet.id,
      address: wallet.address,
      displayName: wallet.displayName,
      balance: wallet.balance,
    };
  }

  async processPayment(
    walletId: string,
    amount: number,
    _metadata: { x: number; y: number; color: number }
  ): Promise<PaymentResult> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: 0, error: "WALLET_NOT_FOUND" };
    }
    if (wallet.isBanned) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: wallet.balance, error: "WALLET_BANNED" };
    }
    if (wallet.balance < amount) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: wallet.balance, error: "INSUFFICIENT_BALANCE" };
    }

    wallet.balance -= amount;
    wallet.totalSpent += amount;
    wallet.pixelCount += 1;
    const txId = crypto.randomUUID();

    updateWalletStatsInDb(walletId, wallet.totalSpent, wallet.pixelCount).catch(() => {});

    return {
      success: true,
      transactionId: txId,
      amountPaid: amount,
      newBalance: Math.round(wallet.balance * 10000) / 10000,
    };
  }

  async deductBalance(walletId: string, amount: number, _reason: string): Promise<PaymentResult> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: 0, error: "WALLET_NOT_FOUND" };
    }
    if (wallet.isBanned) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: wallet.balance, error: "WALLET_BANNED" };
    }
    if (wallet.balance < amount) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: wallet.balance, error: "INSUFFICIENT_BALANCE" };
    }

    wallet.balance -= amount;
    wallet.totalSpent += amount;
    const txId = crypto.randomUUID();

    updateWalletStatsInDb(walletId, wallet.totalSpent, wallet.pixelCount).catch(() => {});

    return {
      success: true,
      transactionId: txId,
      amountPaid: amount,
      newBalance: Math.round(wallet.balance * 10000) / 10000,
    };
  }

  async addFunds(walletId: string, amount: number): Promise<WalletInfo> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error("WALLET_NOT_FOUND");
    wallet.balance += amount;
    return {
      walletId: wallet.id,
      address: wallet.address,
      displayName: wallet.displayName,
      balance: wallet.balance,
    };
  }

  // Helper for admin/leaderboard (not in interface)
  getAllWallets(): WalletRecord[] {
    return [...this.wallets.values()];
  }

  isWalletBanned(walletId: string): boolean {
    return this.wallets.get(walletId)?.isBanned ?? false;
  }
}
