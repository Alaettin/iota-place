import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis and Pool to prevent real connections
vi.mock("../db/redis", () => ({
  setPixelInRedis: vi.fn().mockResolvedValue(undefined),
  getCanvasFromRedis: vi.fn().mockResolvedValue(null),
  loadCanvasToRedis: vi.fn().mockResolvedValue(undefined),
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock("../db/pool", () => ({
  getPool: vi.fn().mockReturnValue(null),
}));

vi.mock("../ws/socket", () => ({
  broadcastCanvasResize: vi.fn(),
}));

import { CanvasService } from "./canvas.service";
import type { CanvasConfig } from "../types";

const TEST_CONFIG: CanvasConfig = {
  width: 10,
  height: 10,
  basePrice: 0.5,
  priceFactor: 1.1,
  colorCount: 32,
  paymentMode: "mock",
};

describe("CanvasService", () => {
  let canvas: CanvasService;

  beforeEach(() => {
    canvas = new CanvasService(TEST_CONFIG);
  });

  describe("setPixel", () => {
    it("returns pixel object with correct data", () => {
      const pixel = canvas.setPixel(5, 3, 7, "wallet-1", 0.5);
      expect(pixel).not.toBeNull();
      expect(pixel!.x).toBe(5);
      expect(pixel!.y).toBe(3);
      expect(pixel!.color).toBe(7);
      expect(pixel!.walletId).toBe("wallet-1");
      expect(pixel!.pricePaid).toBe(0.5);
      expect(pixel!.overwriteCount).toBe(0);
    });

    it("updates colorBuffer at correct index", () => {
      canvas.setPixel(3, 2, 5, "w", 0);
      const buf = canvas.getFullCanvas();
      // index = y * width + x = 2 * 10 + 3 = 23
      expect(buf[23]).toBe(5);
    });

    it("increments overwriteCount on re-placement", () => {
      canvas.setPixel(1, 1, 3, "w1", 0.5);
      const p2 = canvas.setPixel(1, 1, 5, "w2", 0.6);
      expect(p2!.overwriteCount).toBe(1);

      const p3 = canvas.setPixel(1, 1, 7, "w3", 0.7);
      expect(p3!.overwriteCount).toBe(2);
    });

    it("returns null for x < 0", () => {
      expect(canvas.setPixel(-1, 0, 1, "w", 0)).toBeNull();
    });

    it("returns null for x >= width", () => {
      expect(canvas.setPixel(10, 0, 1, "w", 0)).toBeNull();
    });

    it("returns null for y < 0", () => {
      expect(canvas.setPixel(0, -1, 1, "w", 0)).toBeNull();
    });

    it("returns null for y >= height", () => {
      expect(canvas.setPixel(0, 10, 1, "w", 0)).toBeNull();
    });

    it("returns null for color < 0", () => {
      expect(canvas.setPixel(0, 0, -1, "w", 0)).toBeNull();
    });

    it("returns null for color >= colorCount", () => {
      expect(canvas.setPixel(0, 0, 32, "w", 0)).toBeNull();
    });

    it("accepts color 0", () => {
      expect(canvas.setPixel(0, 0, 0, "w", 0)).not.toBeNull();
    });

    it("accepts color 31 (max valid)", () => {
      expect(canvas.setPixel(0, 0, 31, "w", 0)).not.toBeNull();
    });
  });

  describe("getPixel", () => {
    it("returns set pixel with metadata", () => {
      canvas.setPixel(4, 6, 12, "wallet-x", 1.5);
      const pixel = canvas.getPixel(4, 6);
      expect(pixel).not.toBeNull();
      expect(pixel!.color).toBe(12);
      expect(pixel!.walletId).toBe("wallet-x");
      expect(pixel!.pricePaid).toBe(1.5);
    });

    it("returns defaults for untouched pixel", () => {
      const pixel = canvas.getPixel(0, 0);
      expect(pixel).not.toBeNull();
      expect(pixel!.color).toBe(0);
      expect(pixel!.walletId).toBeNull();
      expect(pixel!.pricePaid).toBe(0);
      expect(pixel!.overwriteCount).toBe(0);
    });

    it("returns null for out-of-bounds", () => {
      expect(canvas.getPixel(-1, 0)).toBeNull();
      expect(canvas.getPixel(0, 10)).toBeNull();
      expect(canvas.getPixel(10, 0)).toBeNull();
    });
  });

  describe("getFullCanvas", () => {
    it("returns buffer of correct length", () => {
      const buf = canvas.getFullCanvas();
      expect(buf.length).toBe(100); // 10 * 10
    });

    it("starts as all zeros", () => {
      const buf = canvas.getFullCanvas();
      expect(buf.every((b) => b === 0)).toBe(true);
    });
  });

  describe("resetCanvas", () => {
    it("clears colorBuffer and metadata and resets to 250x250", async () => {
      canvas.setPixel(5, 5, 10, "w", 0.5);
      await canvas.resetCanvas();

      // Dimensions reset to default 250x250
      expect(canvas.getConfig().width).toBe(250);
      expect(canvas.getConfig().height).toBe(250);

      const buf = canvas.getFullCanvas();
      expect(buf.length).toBe(250 * 250);
      // Pixel (5,5) in 250-wide canvas: index = 5*250+5 = 1255
      expect(buf[5 * 250 + 5]).toBe(0);

      const pixel = canvas.getPixel(5, 5);
      expect(pixel!.walletId).toBeNull();
      expect(pixel!.overwriteCount).toBe(0);
    });

    it("resets canvas from 500x500 to 250x250", async () => {
      const bigConfig: CanvasConfig = {
        width: 500, height: 500, basePrice: 0.5, priceFactor: 1.1, colorCount: 32, paymentMode: "mock",
      };
      const c = new CanvasService(bigConfig);
      c.setPixel(300, 300, 5, "w", 0);
      expect(c.getConfig().width).toBe(500);

      await c.resetCanvas();

      expect(c.getConfig().width).toBe(250);
      expect(c.getConfig().height).toBe(250);
      expect(c.getFullCanvas().length).toBe(250 * 250);
      expect(c.getFullCanvas().every((b) => b === 0)).toBe(true);
    });

    it("is a no-op for dimensions when already 250x250", async () => {
      const c = new CanvasService({
        width: 250, height: 250, basePrice: 0.5, priceFactor: 1.1, colorCount: 32, paymentMode: "mock",
      });
      c.setPixel(10, 10, 3, "w", 0);
      await c.resetCanvas();

      expect(c.getConfig().width).toBe(250);
      expect(c.getConfig().height).toBe(250);
      expect(c.getFullCanvas().length).toBe(250 * 250);
    });
  });

  describe("pause", () => {
    it("defaults to unpaused", () => {
      expect(canvas.isPaused()).toBe(false);
    });

    it("toggles pause state", () => {
      canvas.setPaused(true);
      expect(canvas.isPaused()).toBe(true);
      canvas.setPaused(false);
      expect(canvas.isPaused()).toBe(false);
    });
  });

  describe("generateSnapshotPng", () => {
    it("returns valid PNG buffer", () => {
      const palette = [
        "#FFFFFF", "#000000", "#FF0000", "#00FF00",
        "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF",
      ];
      // Pad palette to 32 entries
      while (palette.length < 32) palette.push("#FFFFFF");

      canvas.setPixel(0, 0, 1, "w", 0); // black pixel

      const png = canvas.generateSnapshotPng(palette);
      // PNG magic bytes: 0x89 P N G
      expect(png[0]).toBe(0x89);
      expect(png[1]).toBe(0x50); // P
      expect(png[2]).toBe(0x4e); // N
      expect(png[3]).toBe(0x47); // G
    });
  });

  describe("getConfig", () => {
    it("returns the config", () => {
      const config = canvas.getConfig();
      expect(config.width).toBe(10);
      expect(config.height).toBe(10);
      expect(config.colorCount).toBe(32);
    });
  });

  // --- Canvas Growth Tests ---

  describe("getOccupancy", () => {
    it("returns 0% for empty canvas", () => {
      const occ = canvas.getOccupancy();
      expect(occ.total).toBe(100);
      expect(occ.filled).toBe(0);
      expect(occ.percent).toBe(0);
    });

    it("counts non-zero pixels correctly", () => {
      canvas.setPixel(0, 0, 1, "w", 0);
      canvas.setPixel(1, 0, 2, "w", 0);
      canvas.setPixel(2, 0, 3, "w", 0);
      const occ = canvas.getOccupancy();
      expect(occ.filled).toBe(3);
      expect(occ.percent).toBe(3); // 3/100 = 3%
    });

    it("returns 100% for fully filled canvas", () => {
      // Fill all 100 pixels with non-zero color
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          canvas.setPixel(x, y, 1, "w", 0);
        }
      }
      const occ = canvas.getOccupancy();
      expect(occ.filled).toBe(100);
      expect(occ.percent).toBe(100);
    });
  });

  describe("resize", () => {
    // Use a canvas with VALID_SIZES for resize tests
    const SMALL_CONFIG: CanvasConfig = {
      width: 250,
      height: 250,
      basePrice: 0.5,
      priceFactor: 1.1,
      colorCount: 32,
      paymentMode: "mock",
    };

    it("grows buffer from 250 to 500", async () => {
      const c = new CanvasService(SMALL_CONFIG);
      c.setPixel(0, 0, 5, "w", 0);
      c.setPixel(249, 249, 7, "w", 0);

      await c.resize(500, 500);

      const config = c.getConfig();
      expect(config.width).toBe(500);
      expect(config.height).toBe(500);
      expect(c.getFullCanvas().length).toBe(500 * 500);
    });

    it("preserves old pixels after resize", async () => {
      const c = new CanvasService(SMALL_CONFIG);
      c.setPixel(10, 20, 5, "w", 0);
      c.setPixel(100, 200, 7, "w", 0);

      await c.resize(500, 500);

      const buf = c.getFullCanvas();
      // Old pixel at (10, 20): index = 20 * 500 + 10
      expect(buf[20 * 500 + 10]).toBe(5);
      // Old pixel at (100, 200): index = 200 * 500 + 100
      expect(buf[200 * 500 + 100]).toBe(7);
    });

    it("preserves metadata after resize", async () => {
      const c = new CanvasService(SMALL_CONFIG);
      c.setPixel(5, 5, 3, "wallet-abc", 1.5);

      await c.resize(500, 500);

      const pixel = c.getPixel(5, 5);
      expect(pixel).not.toBeNull();
      expect(pixel!.color).toBe(3);
      expect(pixel!.walletId).toBe("wallet-abc");
      expect(pixel!.pricePaid).toBe(1.5);
    });

    it("throws on shrink attempt", async () => {
      const c = new CanvasService({ ...SMALL_CONFIG, width: 500, height: 500 });
      await expect(c.resize(250, 250)).rejects.toThrow("Canvas can only grow, not shrink");
    });

    it("throws on invalid size (e.g. 300)", async () => {
      const c = new CanvasService(SMALL_CONFIG);
      await expect(c.resize(300, 300)).rejects.toThrow("Invalid size");
    });

    it("is a no-op when size is unchanged", async () => {
      const c = new CanvasService(SMALL_CONFIG);
      const bufBefore = c.getFullCanvas();
      await c.resize(250, 250);
      const bufAfter = c.getFullCanvas();
      expect(bufBefore.length).toBe(bufAfter.length);
    });

    it("new area is initialized to 0 (white)", async () => {
      const c = new CanvasService(SMALL_CONFIG);
      await c.resize(500, 500);
      const buf = c.getFullCanvas();
      // Check a pixel in the expanded area
      expect(buf[300 * 500 + 300]).toBe(0);
    });
  });

  describe("checkAutoExpand", () => {
    const EXPAND_CONFIG: CanvasConfig = {
      width: 250,
      height: 250,
      basePrice: 0.5,
      priceFactor: 1.1,
      colorCount: 32,
      paymentMode: "mock",
    };

    it("returns false when occupancy < 80%", () => {
      const c = new CanvasService(EXPAND_CONFIG);
      // Fill only 10 pixels (way below 80%)
      for (let i = 0; i < 10; i++) c.setPixel(i, 0, 1, "w", 0);
      // checkAutoExpand is called internally by setPixel, but we can also call directly
      expect(c.checkAutoExpand()).toBe(false);
    });

    it("returns false when canvas is paused", () => {
      const c = new CanvasService(EXPAND_CONFIG);
      c.setPaused(true);
      expect(c.checkAutoExpand()).toBe(false);
    });

    it("returns false at max size (1000)", () => {
      const maxConfig: CanvasConfig = { ...EXPAND_CONFIG, width: 1000, height: 1000 };
      const c = new CanvasService(maxConfig);
      expect(c.checkAutoExpand()).toBe(false);
    });

    it("triggers resize when occupancy >= 80%", () => {
      const tinyConfig: CanvasConfig = { ...EXPAND_CONFIG, width: 250, height: 250 };
      const c = new CanvasService(tinyConfig);
      // Fill 80% of 250x250 = 50000 pixels
      const buf = c.getFullCanvas();
      for (let i = 0; i < 50000; i++) {
        // Directly modify buffer for speed (setPixel would be too slow)
        (c as any).colorBuffer[i] = 1;
      }
      const result = c.checkAutoExpand();
      expect(result).toBe(true);
    });
  });
});
