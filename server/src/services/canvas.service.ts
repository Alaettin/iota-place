import { DEFAULT_CONFIG, CanvasConfig, Pixel } from "../types";
import { setPixelInRedis, getCanvasFromRedis, loadCanvasToRedis, getRedis } from "../db/redis";
import { getPool } from "../db/pool";
import { broadcastCanvasResize } from "../ws/socket";
import { PNG } from "pngjs";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

export class CanvasService {
  private config: CanvasConfig;
  private colorBuffer: Uint8Array;
  private metadata: Map<string, Pixel>;
  private paused = false;

  constructor(config: CanvasConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.colorBuffer = new Uint8Array(config.width * config.height);
    this.metadata = new Map();
  }

  getFullCanvas(): Buffer {
    return Buffer.from(this.colorBuffer.buffer, this.colorBuffer.byteOffset, this.colorBuffer.byteLength);
  }

  getPixel(x: number, y: number): Pixel | null {
    if (!this.inBounds(x, y)) return null;
    const key = `${x},${y}`;
    return this.metadata.get(key) || {
      x,
      y,
      color: this.colorBuffer[y * this.config.width + x],
      walletId: null,
      pricePaid: 0,
      overwriteCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  setPixel(x: number, y: number, color: number, walletId: string, pricePaid: number): Pixel | null {
    if (!this.inBounds(x, y)) return null;
    if (color < 0 || color >= this.config.colorCount) return null;

    const idx = y * this.config.width + x;
    const key = `${x},${y}`;
    const existing = this.metadata.get(key);
    const overwriteCount = existing ? existing.overwriteCount + 1 : 0;

    this.colorBuffer[idx] = color;

    const pixel: Pixel = {
      x,
      y,
      color,
      walletId,
      pricePaid,
      overwriteCount,
      updatedAt: new Date().toISOString(),
    };
    this.metadata.set(key, pixel);

    // Async write to Redis (fire-and-forget)
    setPixelInRedis(x, y, color, walletId, pricePaid, overwriteCount, this.config.width).catch((err) => {
      console.error("[Canvas] Redis write failed:", (err as Error).message);
    });

    // Check auto-expand after placement
    this.checkAutoExpand();

    return pixel;
  }

  getConfig(): CanvasConfig {
    return this.config;
  }

  // --- Canvas Growth ---

  static readonly VALID_SIZES = [250, 500, 750, 1000] as const;

  getOccupancy(): { total: number; filled: number; percent: number } {
    const total = this.colorBuffer.length;
    let filled = 0;
    for (let i = 0; i < total; i++) {
      if (this.colorBuffer[i] !== 0) filled++;
    }
    return { total, filled, percent: total > 0 ? Math.round((filled / total) * 10000) / 100 : 0 };
  }

  async resize(newWidth: number, newHeight: number): Promise<void> {
    if (!CanvasService.VALID_SIZES.includes(newWidth as any) || !CanvasService.VALID_SIZES.includes(newHeight as any)) {
      throw new Error(`Invalid size: ${newWidth}x${newHeight}. Valid: ${CanvasService.VALID_SIZES.join(", ")}`);
    }
    if (newWidth < this.config.width || newHeight < this.config.height) {
      throw new Error("Canvas can only grow, not shrink");
    }
    if (newWidth === this.config.width && newHeight === this.config.height) return;

    const oldWidth = this.config.width;
    const oldHeight = this.config.height;
    const newBuffer = new Uint8Array(newWidth * newHeight);

    // Copy old rows into new buffer
    for (let y = 0; y < oldHeight; y++) {
      newBuffer.set(
        this.colorBuffer.subarray(y * oldWidth, y * oldWidth + oldWidth),
        y * newWidth
      );
    }

    this.colorBuffer = newBuffer;
    this.config = { ...this.config, width: newWidth, height: newHeight };

    // Update DB
    const pool = getPool();
    if (pool) {
      await pool.query(
        "UPDATE canvas_config SET current_width = $1, current_height = $2 WHERE id = 1",
        [newWidth, newHeight]
      );
    }

    // Update Redis
    await loadCanvasToRedis(this.colorBuffer);

    console.log(`[Canvas] Resized from ${oldWidth}x${oldHeight} to ${newWidth}x${newHeight}`);
  }

  checkAutoExpand(): boolean {
    if (this.paused) return false;

    const { percent } = this.getOccupancy();
    if (percent < 80) return false;

    const currentSize = this.config.width;
    const idx = CanvasService.VALID_SIZES.indexOf(currentSize as any);
    if (idx < 0 || idx >= CanvasService.VALID_SIZES.length - 1) return false;

    const nextSize = CanvasService.VALID_SIZES[idx + 1];
    this.resize(nextSize, nextSize).then(() => {
      broadcastCanvasResize(nextSize, nextSize);
    }).catch((err) => {
      console.error("[Canvas] Auto-expand failed:", (err as Error).message);
    });
    return true;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setPaused(val: boolean): void {
    this.paused = val;
    console.log(`[Canvas] ${val ? "PAUSED" : "RESUMED"}`);
  }

  // Load canvas state from PostgreSQL on startup
  async loadFromDb(): Promise<void> {
    const pool = getPool();
    if (!pool) return;

    try {
      // Load canvas dimensions from config table
      const { rows: configRows } = await pool.query("SELECT current_width, current_height FROM canvas_config WHERE id = 1");
      if (configRows.length > 0) {
        const dbWidth = configRows[0].current_width;
        const dbHeight = configRows[0].current_height;
        if (dbWidth !== this.config.width || dbHeight !== this.config.height) {
          this.config = { ...this.config, width: dbWidth, height: dbHeight };
          this.colorBuffer = new Uint8Array(dbWidth * dbHeight);
          console.log(`[Canvas] Loaded dimensions from DB: ${dbWidth}x${dbHeight}`);
        }
      }

      const { rows } = await pool.query("SELECT x, y, color, wallet_id, price_paid, overwrite_count, updated_at FROM pixels");
      for (const row of rows) {
        const idx = row.y * this.config.width + row.x;
        this.colorBuffer[idx] = row.color;
        this.metadata.set(`${row.x},${row.y}`, {
          x: row.x,
          y: row.y,
          color: row.color,
          walletId: row.wallet_id,
          pricePaid: parseFloat(row.price_paid),
          overwriteCount: row.overwrite_count,
          updatedAt: row.updated_at,
        });
      }

      // Sync to Redis
      await loadCanvasToRedis(this.colorBuffer);
      console.log(`Canvas loaded from DB: ${rows.length} pixels`);
    } catch (err) {
      console.warn("Failed to load canvas from DB:", (err as Error).message);
    }
  }

  // Reset entire canvas to white and dimensions to 250x250 (used at season end)
  async resetCanvas(): Promise<void> {
    // Reset dimensions to default 250x250
    const defaultW = DEFAULT_CONFIG.width;
    const defaultH = DEFAULT_CONFIG.height;
    const dimensionsChanged = this.config.width !== defaultW || this.config.height !== defaultH;

    this.config = { ...this.config, width: defaultW, height: defaultH };
    this.colorBuffer = new Uint8Array(defaultW * defaultH);
    this.metadata.clear();

    // Reset in PostgreSQL
    const pool = getPool();
    if (pool) {
      await pool.query("DELETE FROM pixels");
      if (dimensionsChanged) {
        await pool.query(
          "UPDATE canvas_config SET current_width = $1, current_height = $2 WHERE id = 1",
          [defaultW, defaultH]
        );
      }
    }

    // Reset in Redis
    const redis = getRedis();
    if (redis) {
      await loadCanvasToRedis(this.colorBuffer);
      const keys = await redis.keys("canvas:pixel:*");
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await redis.del("canvas:dirty");
    }

    // Draw "IOTA" text in center
    this.drawIotaText();

    console.log(`[Canvas] Full reset complete (${defaultW}x${defaultH})`);
  }

  // Draw "IOTA" as pixel-art text centered on the canvas
  private drawIotaText(): void {
    const COLOR = 3; // #222222 (black)

    // 5x7 pixel font bitmaps (1 = filled, 0 = empty)
    const letters: { width: number; bitmap: number[][] }[] = [
      { // I (3 wide)
        width: 3,
        bitmap: [
          [1,1,1],
          [0,1,0],
          [0,1,0],
          [0,1,0],
          [0,1,0],
          [0,1,0],
          [1,1,1],
        ],
      },
      { // O (5 wide)
        width: 5,
        bitmap: [
          [0,1,1,1,0],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [0,1,1,1,0],
        ],
      },
      { // T (5 wide)
        width: 5,
        bitmap: [
          [1,1,1,1,1],
          [0,0,1,0,0],
          [0,0,1,0,0],
          [0,0,1,0,0],
          [0,0,1,0,0],
          [0,0,1,0,0],
          [0,0,1,0,0],
        ],
      },
      { // A (5 wide)
        width: 5,
        bitmap: [
          [0,1,1,1,0],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,1,1,1,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
          [1,0,0,0,1],
        ],
      },
    ];

    const SPACING = 1;
    const HEIGHT = 7;
    const totalWidth = letters.reduce((sum, l) => sum + l.width, 0) + SPACING * (letters.length - 1);

    const startX = Math.floor(this.config.width / 2 - totalWidth / 2);
    const startY = Math.floor(this.config.height / 2 - HEIGHT / 2);

    let cursorX = startX;
    for (const letter of letters) {
      for (let row = 0; row < HEIGHT; row++) {
        for (let col = 0; col < letter.width; col++) {
          if (letter.bitmap[row][col]) {
            const x = cursorX + col;
            const y = startY + row;
            if (this.inBounds(x, y)) {
              this.colorBuffer[y * this.config.width + x] = COLOR;
            }
          }
        }
      }
      cursorX += letter.width + SPACING;
    }
  }

  // Generate PNG snapshot of current canvas state
  generateSnapshotPng(palette: string[]): Buffer {
    const png = new PNG({ width: this.config.width, height: this.config.height });

    for (let i = 0; i < this.colorBuffer.length; i++) {
      const hex = palette[this.colorBuffer[i]] || "#FFFFFF";
      const val = parseInt(hex.slice(1), 16);
      png.data[i * 4] = (val >> 16) & 255;
      png.data[i * 4 + 1] = (val >> 8) & 255;
      png.data[i * 4 + 2] = val & 255;
      png.data[i * 4 + 3] = 255;
    }

    return PNG.sync.write(png);
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.config.width && y >= 0 && y < this.config.height;
  }
}

export const canvasService: CanvasService =
  G.__iotaCanvasService || (G.__iotaCanvasService = new CanvasService());
