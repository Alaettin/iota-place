import { DEFAULT_CONFIG } from "../types";
import { canvasService } from "./canvas.service";

export function getPixelPrice(x: number, y: number): number {
  const pixel = canvasService.getPixel(x, y);
  const n = pixel?.overwriteCount || 0;
  const price = DEFAULT_CONFIG.basePrice * Math.pow(DEFAULT_CONFIG.priceFactor, n);
  return Math.round(price * 10000) / 10000;
}
