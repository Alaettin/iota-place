import { getPool } from "../../db/pool";
import { WalletRecord } from "./payment.interface";

/**
 * Persist a wallet to PostgreSQL (upsert by id).
 * Fire-and-forget — errors are logged but don't break the flow.
 */
export async function upsertWalletToDb(record: WalletRecord): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO wallets (id, address, display_name, balance, total_spent, pixel_count, is_banned, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         address = $2, display_name = $3, balance = $4,
         total_spent = $5, pixel_count = $6, is_banned = $7, updated_at = NOW()`,
      [record.id, record.address, record.displayName, record.balance, record.totalSpent, record.pixelCount, record.isBanned]
    );
  } catch (err) {
    console.error("[WalletDB] Upsert failed:", (err as Error).message);
  }
}

/**
 * Update wallet stats (totalSpent, pixelCount) in DB after a successful payment.
 */
export async function updateWalletStatsInDb(walletId: string, totalSpent: number, pixelCount: number): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    await pool.query(
      "UPDATE wallets SET total_spent = $2, pixel_count = $3, updated_at = NOW() WHERE id = $1",
      [walletId, totalSpent, pixelCount]
    );
  } catch (err) {
    console.error("[WalletDB] Stats update failed:", (err as Error).message);
  }
}

/**
 * Load all wallets from DB into memory Maps.
 * Returns { wallets: Map<id, WalletRecord>, addressIndex: Map<address, id> }
 */
export async function loadWalletsFromDb(): Promise<{
  wallets: Map<string, WalletRecord>;
  addressIndex: Map<string, string>;
}> {
  const wallets = new Map<string, WalletRecord>();
  const addressIndex = new Map<string, string>();

  const pool = getPool();
  if (!pool) return { wallets, addressIndex };

  try {
    const { rows } = await pool.query(
      "SELECT id, address, display_name, balance, total_spent, pixel_count, is_banned FROM wallets"
    );
    for (const row of rows) {
      const record: WalletRecord = {
        id: row.id,
        address: row.address,
        displayName: row.display_name,
        balance: parseFloat(row.balance),
        totalSpent: parseFloat(row.total_spent),
        pixelCount: row.pixel_count,
        isBanned: row.is_banned,
      };
      wallets.set(record.id, record);
      addressIndex.set(record.address, record.id);
    }
    console.log(`[WalletDB] Loaded ${wallets.size} wallets from DB`);
  } catch (err) {
    console.warn("[WalletDB] Failed to load wallets:", (err as Error).message);
  }

  return { wallets, addressIndex };
}
