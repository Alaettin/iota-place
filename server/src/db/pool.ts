import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool | null {
  return pool;
}

export async function initPool(): Promise<Pool | null> {
  try {
    pool = new Pool({
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
    return pool;
  } catch (err) {
    console.warn("PostgreSQL not available, running in-memory only:", (err as Error).message);
    pool = null;
    return null;
  }
}
