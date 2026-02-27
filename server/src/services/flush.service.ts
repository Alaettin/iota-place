import { getPool } from "../db/pool";
import { getDirtyPixels, getPixelMeta, clearDirtyPixels } from "../db/redis";

const FLUSH_INTERVAL_MS = 5000;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startFlushService(): void {
  const pool = getPool();
  if (!pool) {
    console.log("Flush service skipped (no PostgreSQL)");
    return;
  }

  flushTimer = setInterval(async () => {
    try {
      const dirtyCoords = await getDirtyPixels();
      if (dirtyCoords.length === 0) return;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const coord of dirtyCoords) {
          const meta = await getPixelMeta(coord);
          if (!meta) continue;

          const [x, y] = coord.split(",").map(Number);

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
            parseFloat(meta.price_paid),
            parseInt(meta.overwrite_count),
            meta.updated_at,
          ]);

          // Append to history
          await client.query(`
            INSERT INTO pixel_history (x, y, color, wallet_id, price_paid)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            x, y,
            parseInt(meta.color),
            meta.wallet_id,
            parseFloat(meta.price_paid),
          ]);
        }

        await client.query("COMMIT");
        await clearDirtyPixels(dirtyCoords);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Flush batch error:", err);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Flush service error:", err);
    }
  }, FLUSH_INTERVAL_MS);

  console.log("Flush service started (every 5s)");
}

export function stopFlushService(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
