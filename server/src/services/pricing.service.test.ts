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
  it("returns base price (0.2) for unowned pixel", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 0, walletId: null,
      pricePaid: 0, overwriteCount: 0, updatedAt: "",
    });
    expect(getPixelPrice(0, 0)).toBe(0.2);
  });

  it("returns 0.24 for first overwrite (owned pixel, overwriteCount=0)", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 1, walletId: "w",
      pricePaid: 0.2, overwriteCount: 0, updatedAt: "",
    });
    // n = 0 + 1 = 1 → 0.2 * 1.2^1 = 0.24
    expect(getPixelPrice(0, 0)).toBe(0.24);
  });

  it("returns 0.288 for second overwrite (overwriteCount=1)", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 1, walletId: "w",
      pricePaid: 0.24, overwriteCount: 1, updatedAt: "",
    });
    // n = 1 + 1 = 2 → 0.2 * 1.2^2 = 0.288
    expect(getPixelPrice(0, 0)).toBe(0.288);
  });

  it("correct price after 10 overwrites", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 1, walletId: "w",
      pricePaid: 0.2, overwriteCount: 10, updatedAt: "",
    });
    // n = 10 + 1 = 11 → 0.2 * 1.2^11
    const price = getPixelPrice(0, 0);
    expect(price).toBe(Math.round(0.2 * Math.pow(1.2, 11) * 10000) / 10000);
  });

  it("rounds to 4 decimal places", () => {
    mockGetPixel.mockReturnValue({
      x: 0, y: 0, color: 1, walletId: "w",
      pricePaid: 0.2, overwriteCount: 3, updatedAt: "",
    });
    const price = getPixelPrice(0, 0);
    const decimals = price.toString().split(".")[1]?.length || 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });

  it("returns base price when pixel is null (out of bounds)", () => {
    mockGetPixel.mockReturnValue(null);
    expect(getPixelPrice(999, 999)).toBe(0.2);
  });
});
