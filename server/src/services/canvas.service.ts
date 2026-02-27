import { DEFAULT_CONFIG, CanvasConfig, Pixel } from "../types";

class CanvasService {
  private config: CanvasConfig;
  private colorBuffer: Uint8Array;
  private metadata: Map<string, Pixel>;

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
    return pixel;
  }

  getConfig(): CanvasConfig {
    return this.config;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.config.width && y >= 0 && y < this.config.height;
  }
}

export const canvasService = new CanvasService();
