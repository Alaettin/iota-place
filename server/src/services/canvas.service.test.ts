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
    it("clears colorBuffer and metadata", async () => {
      canvas.setPixel(5, 5, 10, "w", 0.5);
      await canvas.resetCanvas();

      const buf = canvas.getFullCanvas();
      expect(buf[55]).toBe(0); // y*10+x = 5*10+5 = 55

      const pixel = canvas.getPixel(5, 5);
      expect(pixel!.walletId).toBeNull();
      expect(pixel!.overwriteCount).toBe(0);
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
});
