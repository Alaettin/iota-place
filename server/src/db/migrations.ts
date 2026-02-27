import { Pool } from "pg";

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrations = [
    { name: "001_initial", fn: migration001 },
    { name: "002_indexes", fn: migration002 },
    { name: "003_drop_wallet_fk", fn: migration003 },
    { name: "004_season_stats", fn: migration004 },
  ];

  for (const m of migrations) {
    const exists = await pool.query("SELECT 1 FROM migrations WHERE name = $1", [m.name]);
    if (exists.rows.length === 0) {
      await m.fn(pool);
      await pool.query("INSERT INTO migrations (name) VALUES ($1)", [m.name]);
      console.log(`Migration ${m.name} applied`);
    }
  }
}

async function migration001(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      address TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      balance NUMERIC(20, 6) NOT NULL DEFAULT 0,
      total_spent NUMERIC(20, 6) NOT NULL DEFAULT 0,
      pixel_count INTEGER NOT NULL DEFAULT 0,
      is_banned BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seasons (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date TIMESTAMPTZ,
      snapshot_url TEXT,
      canvas_width SMALLINT NOT NULL DEFAULT 250,
      canvas_height SMALLINT NOT NULL DEFAULT 250,
      is_active BOOLEAN NOT NULL DEFAULT false
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pixels (
      x SMALLINT NOT NULL,
      y SMALLINT NOT NULL,
      color SMALLINT NOT NULL DEFAULT 0,
      wallet_id UUID REFERENCES wallets(id),
      price_paid NUMERIC(20, 6) NOT NULL DEFAULT 0,
      overwrite_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (x, y)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pixel_history (
      id BIGSERIAL PRIMARY KEY,
      x SMALLINT NOT NULL,
      y SMALLINT NOT NULL,
      color SMALLINT NOT NULL,
      wallet_id UUID REFERENCES wallets(id),
      price_paid NUMERIC(20, 6) NOT NULL DEFAULT 0,
      season_id INTEGER REFERENCES seasons(id),
      placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS canvas_config (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      base_price NUMERIC(10, 4) NOT NULL DEFAULT 0.1,
      price_factor NUMERIC(10, 4) NOT NULL DEFAULT 1.1,
      current_width SMALLINT NOT NULL DEFAULT 250,
      current_height SMALLINT NOT NULL DEFAULT 250,
      active_season_id INTEGER REFERENCES seasons(id)
    )
  `);

  // Insert default config
  await pool.query(`
    INSERT INTO canvas_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING
  `);
}

async function migration002(pool: Pool): Promise<void> {
  await pool.query("CREATE INDEX IF NOT EXISTS idx_pixel_history_xy ON pixel_history(x, y)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_pixel_history_wallet ON pixel_history(wallet_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_pixel_history_placed ON pixel_history(placed_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_wallets_pixel_count ON wallets(pixel_count DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_wallets_total_spent ON wallets(total_spent DESC)");
}

async function migration003(pool: Pool): Promise<void> {
  // Drop FK constraints so flush works with any wallet_id (including "admin")
  // and wallet_id type changes from UUID to TEXT for flexibility
  await pool.query("ALTER TABLE pixels DROP CONSTRAINT IF EXISTS pixels_wallet_id_fkey");
  await pool.query("ALTER TABLE pixel_history DROP CONSTRAINT IF EXISTS pixel_history_wallet_id_fkey");
  await pool.query("ALTER TABLE pixels ALTER COLUMN wallet_id TYPE TEXT USING wallet_id::text");
  await pool.query("ALTER TABLE pixel_history ALTER COLUMN wallet_id TYPE TEXT USING wallet_id::text");
  // Also change wallets.id from UUID to TEXT for consistency
  await pool.query("ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_pkey CASCADE");
  await pool.query("ALTER TABLE wallets ALTER COLUMN id TYPE TEXT USING id::text");
  await pool.query("ALTER TABLE wallets ADD PRIMARY KEY (id)");
}

async function migration004(pool: Pool): Promise<void> {
  // Per-season leaderboard tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_season_stats (
      wallet_id TEXT NOT NULL,
      season_id INTEGER NOT NULL REFERENCES seasons(id),
      total_spent NUMERIC(20, 6) NOT NULL DEFAULT 0,
      pixel_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet_id, season_id)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_wss_season_pixels ON wallet_season_stats(season_id, pixel_count DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_wss_season_spent ON wallet_season_stats(season_id, total_spent DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_pixel_history_season ON pixel_history(season_id)");
}
