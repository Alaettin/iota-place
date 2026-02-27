export interface Pixel {
  x: number;
  y: number;
  color: number;
  walletId: string | null;
  pricePaid: number;
  overwriteCount: number;
  updatedAt: string;
}

export interface CanvasConfig {
  width: number;
  height: number;
  basePrice: number;
  priceFactor: number;
  colorCount: number;
}

export const COLOR_PALETTE = [
  "#FFFFFF", "#E4E4E4", "#888888", "#222222",
  "#FFA7D1", "#E50000", "#E59500", "#A06A42",
  "#E5D900", "#94E044", "#02BE01", "#00D3DD",
  "#0083C7", "#0000EA", "#CF6EE4", "#820080",
  "#6D001A", "#BE0039", "#FF4500", "#FFA800",
  "#FFD635", "#00A368", "#00756F", "#009EAA",
  "#2450A4", "#3690EA", "#51E9F4", "#493AC1",
  "#6A5CFF", "#811E9F", "#B44AC0", "#FF99AA",
];
