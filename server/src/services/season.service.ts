import { getPool } from "../db/pool";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

export interface Season {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  snapshotUrl: string | null;
  canvasWidth: number;
  canvasHeight: number;
  isActive: boolean;
}

function rowToSeason(row: any): Season {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date || null,
    snapshotUrl: row.snapshot_url || null,
    canvasWidth: row.canvas_width,
    canvasHeight: row.canvas_height,
    isActive: row.is_active,
  };
}

class SeasonService {
  private activeSeason: Season | null = null;

  async loadFromDb(): Promise<void> {
    const pool = getPool();
    if (!pool) return;

    try {
      const { rows } = await pool.query(
        "SELECT * FROM seasons WHERE is_active = true LIMIT 1"
      );
      if (rows.length > 0) {
        this.activeSeason = rowToSeason(rows[0]);
        console.log(`[Season] Active season loaded: "${this.activeSeason.name}" (id=${this.activeSeason.id})`);
      } else {
        this.activeSeason = null;
        console.log("[Season] No active season (off-season mode)");
      }
    } catch (err) {
      console.warn("[Season] Failed to load from DB:", (err as Error).message);
    }
  }

  getActiveSeason(): Season | null {
    return this.activeSeason;
  }

  getActiveSeasonId(): number | null {
    return this.activeSeason?.id ?? null;
  }

  async startSeason(name: string, canvasWidth: number, canvasHeight: number): Promise<Season> {
    const pool = getPool();
    if (!pool) throw new Error("No database connection");

    if (this.activeSeason) {
      throw new Error("A season is already active");
    }

    const { rows } = await pool.query(
      `INSERT INTO seasons (name, start_date, canvas_width, canvas_height, is_active)
       VALUES ($1, NOW(), $2, $3, true)
       RETURNING *`,
      [name, canvasWidth, canvasHeight]
    );

    const season = rowToSeason(rows[0]);

    // Update canvas_config
    await pool.query(
      "UPDATE canvas_config SET active_season_id = $1 WHERE id = 1",
      [season.id]
    );

    this.activeSeason = season;
    console.log(`[Season] Started: "${season.name}" (id=${season.id})`);
    return season;
  }

  async endSeason(snapshotUrl: string): Promise<Season> {
    const pool = getPool();
    if (!pool) throw new Error("No database connection");

    if (!this.activeSeason) {
      throw new Error("No active season to end");
    }

    const { rows } = await pool.query(
      `UPDATE seasons
       SET is_active = false, end_date = NOW(), snapshot_url = $1
       WHERE id = $2
       RETURNING *`,
      [snapshotUrl, this.activeSeason.id]
    );

    // Clear active_season_id in canvas_config
    await pool.query(
      "UPDATE canvas_config SET active_season_id = NULL WHERE id = 1"
    );

    const ended = rowToSeason(rows[0]);
    this.activeSeason = null;
    console.log(`[Season] Ended: "${ended.name}" (id=${ended.id})`);
    return ended;
  }

  async getAllSeasons(): Promise<Season[]> {
    const pool = getPool();
    if (!pool) return [];

    const { rows } = await pool.query(
      "SELECT * FROM seasons ORDER BY start_date DESC"
    );
    return rows.map(rowToSeason);
  }

  async getSeasonById(id: number): Promise<Season | null> {
    const pool = getPool();
    if (!pool) return null;

    const { rows } = await pool.query("SELECT * FROM seasons WHERE id = $1", [id]);
    return rows.length > 0 ? rowToSeason(rows[0]) : null;
  }
}

export const seasonService: SeasonService =
  G.__iotaSeasonService || (G.__iotaSeasonService = new SeasonService());
