import { describe, it, expect, vi } from "vitest";

// Mock canvasService to return controlled pixel data
vi.mock("./canvas.service", () => ({
  canvasService: {
    getPixel: vi.fn(),
  },
}));

import { getPixelPrice } from "./pricing.service";
import { canvasService } from "./canvas.service";

const mockGetPixel = vi.mocked(canvasService.getPixel);

describe("getPixelPrice", () => {
  it("returns base price (0.5) for new pixel (overwrite 0)", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 0, walletId: null,
      pricePaid: 0, overwriteCount: 0, updatedAt: "",
    });
    expect(getPixelPrice(0, 0)).toBe(0.5);
  });

  it("returns 0.55 after 1 overwrite", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 1, walletId: "w",
      pricePaid: 0.5, overwriteCount: 1, updatedAt: "",
    });
    expect(getPixelPrice(0, 0)).toBe(0.55);
  });

  it("returns ~1.2969 after 10 overwrites", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 1, walletId: "w",
      pricePaid: 0.5, overwriteCount: 10, updatedAt: "",
    });
    const price = getPixelPrice(0, 0);
    expect(price).toBe(Math.round(0.5 * Math.pow(1.1, 10) * 10000) / 10000);
  });

  it("rounds to 4 decimal places", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 1, walletId: "w",
      pricePaid: 0.5, overwriteCount: 3, updatedAt: "",
    });
    const price = getPixelPrice(0, 0);
    const decimals = price.toString().split(".")[1]?.length || 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });

  it("returns base price when pixel is null (out of bounds)", () => {
    mockGetPixel.mockReturnValue(null);
    // overwriteCount defaults to 0 when pixel is null → price = 0.5
    expect(getPixelPrice(999, 999)).toBe(0.5);
  });
});
