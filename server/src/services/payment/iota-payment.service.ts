import { IotaClient, getFullnodeUrl } from "@iota/iota-sdk/client";
import { getFaucetHost, requestIotaFromFaucetV0 } from "@iota/iota-sdk/faucet";
import { NANOS_PER_IOTA } from "@iota/iota-sdk/utils";
import { PaymentService, PaymentResult, WalletInfo, WalletRecord } from "./payment.interface";
import { upsertWalletToDb, updateWalletStatsInDb, loadWalletsFromDb, loadProcessedTransactions, persistProcessedTransaction } from "./wallet-db";

export class IotaPaymentService implements PaymentService {
  private client: IotaClient;
  private collectionAddress: string;
  private network: "testnet" | "devnet" | "mainnet";
  private wallets = new Map<string, WalletRecord>();
  private addressIndex = new Map<string, string>(); // address -> walletId
  private usedTxDigests = new Map<string, number>(); // txDigest -> timestamp (prevent replay)

  constructor() {
    this.network = (process.env.IOTA_NETWORK as "testnet" | "devnet" | "mainnet") || "testnet";
    this.collectionAddress = process.env.IOTA_COLLECTION_ADDRESS || "";
    if (!this.collectionAddress) {
      console.warn("[IOTA] WARNING: IOTA_COLLECTION_ADDRESS not set. Payments cannot be verified.");
    }
    this.client = new IotaClient({ url: getFullnodeUrl(this.network) });
    console.log(`[IOTA] Payment service initialized on ${this.network}`);
    console.log(`[IOTA] Collection address: ${this.collectionAddress || "(not set)"}`);

    // Evict old entries from usedTxDigests every 60 minutes (M3: prevent memory leak)
    setInterval(() => this.evictOldDigests(), 3600000);
  }

  async loadFromDb(): Promise<void> {
    const { wallets, addressIndex } = await loadWalletsFromDb();
    this.wallets = wallets;
    this.addressIndex = addressIndex;

    // K2: Load processed transaction digests from DB (replay protection after restart)
    const digests = await loadProcessedTransactions();
    const now = Date.now();
    for (const d of digests) {
      this.usedTxDigests.set(d, now);
    }
  }

  async connectWallet(address: string, displayName?: string): Promise<WalletInfo> {
    // Check if wallet with this address already exists
    const existingId = this.addressIndex.get(address);
    if (existingId) {
      const existing = this.wallets.get(existingId)!;
      if (displayName) existing.displayName = displayName;
      const balance = await this.queryOnChainBalance(address);
      return {
        walletId: existing.id,
        address: existing.address,
        displayName: existing.displayName,
        balance,
      };
    }

    const walletId = crypto.randomUUID();
    const name = displayName || `User_${address.slice(0, 8)}`;
    const record: WalletRecord = {
      id: walletId,
      address,
      displayName: name,
      balance: 0,
      totalSpent: 0,
      pixelCount: 0,
      isBanned: false,
    };
    this.wallets.set(walletId, record);
    this.addressIndex.set(address, walletId);
    upsertWalletToDb(record).catch(() => {});

    const balance = await this.queryOnChainBalance(address);
    return {
      walletId: record.id,
      address: record.address,
      displayName: record.displayName,
      balance,
    };
  }

  async getBalance(walletId: string): Promise<number> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) return 0;
    return this.queryOnChainBalance(wallet.address);
  }

  async getWallet(walletId: string): Promise<WalletInfo | null> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) return null;
    const balance = await this.queryOnChainBalance(wallet.address);
    return {
      walletId: wallet.id,
      address: wallet.address,
      displayName: wallet.displayName,
      balance,
    };
  }

  async processPayment(
    walletId: string,
    amount: number,
    metadata: { x: number; y: number; color: number; txDigest?: string }
  ): Promise<PaymentResult> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: 0, error: "WALLET_NOT_FOUND" };
    }
    if (wallet.isBanned) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: 0, error: "WALLET_BANNED" };
    }

    const txDigest = metadata.txDigest;
    if (!txDigest) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: 0, error: "TX_DIGEST_REQUIRED" };
    }

    // Prevent replay attacks (add immediately to block concurrent duplicates, rollback on error)
    if (this.usedTxDigests.has(txDigest)) {
      return { success: false, transactionId: "", amountPaid: 0, newBalance: 0, error: "TX_ALREADY_USED" };
    }
    this.usedTxDigests.set(txDigest, Date.now());

    try {
      // Wait for transaction to be indexed
      await this.client.waitForTransaction({ digest: txDigest, timeout: 30000 });

      // Fetch transaction details
      const tx = await this.client.getTransactionBlock({
        digest: txDigest,
        options: {
          showInput: true,
          showEffects: true,
          showBalanceChanges: true,
        },
      });

      // Verify transaction was successful
      const status = tx.effects?.status?.status;
      if (status !== "success") {
        return { success: false, transactionId: txDigest, amountPaid: 0, newBalance: 0, error: "TX_FAILED" };
      }

      // Verify balance changes: collection address received >= amount
      const balanceChanges = tx.balanceChanges || [];
      const amountInNanos = BigInt(Math.ceil(amount * Number(NANOS_PER_IOTA)));

      const collectionReceived = balanceChanges.find(
        (bc: any) =>
          bc.owner &&
          typeof bc.owner === "object" &&
          "AddressOwner" in bc.owner &&
          bc.owner.AddressOwner === this.collectionAddress &&
          BigInt(bc.amount) > 0n
      );

      if (!collectionReceived) {
        return { success: false, transactionId: txDigest, amountPaid: 0, newBalance: 0, error: "COLLECTION_NOT_PAID" };
      }

      const receivedNanos = BigInt(collectionReceived.amount);
      if (receivedNanos < amountInNanos) {
        return {
          success: false,
          transactionId: txDigest,
          amountPaid: 0,
          newBalance: 0,
          error: "INSUFFICIENT_PAYMENT",
        };
      }

      // Verify sender matches wallet address
      const senderChange = balanceChanges.find(
        (bc: any) =>
          bc.owner &&
          typeof bc.owner === "object" &&
          "AddressOwner" in bc.owner &&
          bc.owner.AddressOwner === wallet.address &&
          BigInt(bc.amount) < 0n
      );

      if (!senderChange) {
        return { success: false, transactionId: txDigest, amountPaid: 0, newBalance: 0, error: "SENDER_MISMATCH" };
      }

      // Transaction verified — persist to DB for replay protection across restarts
      persistProcessedTransaction(txDigest, walletId).catch(() => {});
      wallet.pixelCount += 1;

      const actualPaid = Number(receivedNanos) / Number(NANOS_PER_IOTA);
      wallet.totalSpent += actualPaid;
      updateWalletStatsInDb(walletId, wallet.totalSpent, wallet.pixelCount).catch(() => {});
      const newBalance = await this.queryOnChainBalance(wallet.address);

      return {
        success: true,
        transactionId: txDigest,
        amountPaid: actualPaid,
        newBalance,
      };
    } catch (err: any) {
      // Rollback: allow txDigest to be retried on verification failure
      this.usedTxDigests.delete(txDigest);
      console.error("[IOTA] Transaction verification failed:", err.message);
      return {
        success: false,
        transactionId: txDigest,
        amountPaid: 0,
        newBalance: 0,
        error: "TX_VERIFY_FAILED",
      };
    }
  }

  async deductBalance(_walletId: string, _amount: number, _reason: string): Promise<PaymentResult> {
    // H5: In IOTA mode, server-side balance deduction is not supported.
    // On-chain balance cannot be deducted without a signed transaction from the wallet owner.
    // Power-Up purchases require an on-chain transaction (not yet implemented).
    return { success: false, transactionId: "", amountPaid: 0, newBalance: 0, error: "FEATURE_UNAVAILABLE" };
  }

  async addFunds(walletId: string, _amount: number): Promise<WalletInfo> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw new Error("WALLET_NOT_FOUND");

    try {
      await requestIotaFromFaucetV0({
        host: getFaucetHost(this.network),
        recipient: wallet.address,
      });
      // Wait a moment for the faucet transaction to settle
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (err: any) {
      console.error("[IOTA] Faucet request failed:", err.message);
      throw new Error("FAUCET_REQUEST_FAILED");
    }

    const balance = await this.queryOnChainBalance(wallet.address);
    return {
      walletId: wallet.id,
      address: wallet.address,
      displayName: wallet.displayName,
      balance,
    };
  }

  // --- Helpers ---

  private async queryOnChainBalance(address: string): Promise<number> {
    try {
      const result = await this.client.getBalance({ owner: address });
      return Number(BigInt(result.totalBalance)) / Number(NANOS_PER_IOTA);
    } catch {
      return 0;
    }
  }

  // Evict transaction digests older than 24 hours from memory (M3: prevent memory leak)
  private evictOldDigests(): void {
    const cutoff = Date.now() - 86400000; // 24 hours
    let evicted = 0;
    for (const [digest, ts] of this.usedTxDigests) {
      if (ts < cutoff) {
        this.usedTxDigests.delete(digest);
        evicted++;
      }
    }
    if (evicted > 0) {
      console.log(`[IOTA] Evicted ${evicted} old transaction digests from memory`);
    }
  }

  // Admin helpers (not in interface)
  getAllWallets(): WalletRecord[] {
    return [...this.wallets.values()];
  }

  isWalletBanned(walletId: string): boolean {
    return this.wallets.get(walletId)?.isBanned ?? false;
  }
}
