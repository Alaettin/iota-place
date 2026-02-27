import { Pool } from "pg";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

export function getPool(): Pool | null {
  return G.__iotaPool || null;
}

export async function initPool(): Promise<Pool | null> {
  try {
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB || "iota_place",
      user: process.env.POSTGRES_USER || "iota_place",
      password: process.env.POSTGRES_PASSWORD || "dev_password",
      max: 20,
      idleTimeoutMillis: 30000,
    });

    // Test connection
    const client = await pool.connect();
    client.release();
    console.log("PostgreSQL connected");
    G.__iotaPool = pool;
    return pool;
  } catch (err) {
    console.warn("PostgreSQL not available, running in-memory only:", (err as Error).message);
    G.__iotaPool = null;
    return null;
  }
}
