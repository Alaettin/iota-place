import { getPool } from "../db/pool";
import { getDirtyPixels, getPixelMeta, clearDirtyPixels } from "../db/redis";
import { seasonService } from "./season.service";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

const FLUSH_INTERVAL_MS = 5000;

export async function flushOnce(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;

  const dirtyCoords = await getDirtyPixels();
  if (dirtyCoords.length === 0) return 0;

  const activeSeasonId = seasonService.getActiveSeasonId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const coord of dirtyCoords) {
      const meta = await getPixelMeta(coord);
      if (!meta) continue;

      const [x, y] = coord.split(",").map(Number);
      const pricePaid = parseFloat(meta.price_paid);

      // Upsert pixel
      await client.query(`
        INSERT INTO pixels (x, y, color, wallet_id, price_paid, overwrite_count, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (x, y) DO UPDATE SET
          color = $3, wallet_id = $4, price_paid = $5,
          overwrite_count = $6, updated_at = $7
      `, [
        x, y,
        parseInt(meta.color),
        meta.wallet_id,
        pricePaid,
        parseInt(meta.overwrite_count),
        meta.updated_at,
      ]);

      // Append to history (with season_id)
      await client.query(`
        INSERT INTO pixel_history (x, y, color, wallet_id, price_paid, season_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        x, y,
        parseInt(meta.color),
        meta.wallet_id,
        pricePaid,
        activeSeasonId,
      ]);

      // Upsert wallet_season_stats (only when season active and not admin)
      if (activeSeasonId !== null && meta.wallet_id !== "admin") {
        await client.query(`
          INSERT INTO wallet_season_stats (wallet_id, season_id, total_spent, pixel_count)
          VALUES ($1, $2, $3, 1)
          ON CONFLICT (wallet_id, season_id) DO UPDATE SET
            total_spent = wallet_season_stats.total_spent + $3,
            pixel_count = wallet_season_stats.pixel_count + 1
        `, [meta.wallet_id, activeSeasonId, pricePaid]);
      }
    }

    await client.query("COMMIT");
    await clearDirtyPixels(dirtyCoords);
    return dirtyCoords.length;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Flush batch error:", err);
    return 0;
  } finally {
    client.release();
  }
}

export function startFlushService(): void {
  const pool = getPool();
  if (!pool) {
    console.log("Flush service skipped (no PostgreSQL)");
    return;
  }

  G.__iotaFlushTimer = setInterval(async () => {
    try {
      await flushOnce();
    } catch (err) {
      console.error("Flush service error:", err);
    }
  }, FLUSH_INTERVAL_MS);

  console.log("Flush service started (every 5s)");
}

export function stopFlushService(): void {
  if (G.__iotaFlushTimer) {
    clearInterval(G.__iotaFlushTimer);
    G.__iotaFlushTimer = null;
  }
}
