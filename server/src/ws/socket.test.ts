import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test the broadcast functions with and without a socket server
// The socket module uses globalThis.__iotaSocketIO

import {
  broadcastPixelUpdate,
  broadcastUserCount,
  broadcastPause,
  broadcastSeasonChange,
  broadcastCanvasReset,
  getIO,
} from "./socket";

describe("WebSocket Broadcasts", () => {
  const G = globalThis as any;
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockServer: any;

  beforeEach(() => {
    mockEmit = vi.fn();
    mockServer = {
      emit: mockEmit,
      engine: { clientsCount: 42 },
    };
  });

  afterEach(() => {
    // Restore original state
    delete G.__iotaSocketIO;
  });

  describe("when io is null (no server)", () => {
    beforeEach(() => {
      G.__iotaSocketIO = null;
    });

    it("broadcastPixelUpdate is a no-op", () => {
      expect(() => broadcastPixelUpdate(10, 20, 5)).not.toThrow();
    });

    it("broadcastUserCount is a no-op", () => {
      expect(() => broadcastUserCount()).not.toThrow();
    });

    it("broadcastPause is a no-op", () => {
      expect(() => broadcastPause(true)).not.toThrow();
    });

    it("broadcastSeasonChange is a no-op", () => {
      expect(() => broadcastSeasonChange(null)).not.toThrow();
    });

    it("broadcastCanvasReset is a no-op", () => {
      expect(() => broadcastCanvasReset()).not.toThrow();
    });

    it("getIO returns null", () => {
      expect(getIO()).toBeNull();
    });
  });

  describe("when io is initialized", () => {
    beforeEach(() => {
      G.__iotaSocketIO = mockServer;
    });

    it("broadcastPixelUpdate emits 5-byte binary buffer", () => {
      broadcastPixelUpdate(100, 200, 15);

      expect(mockEmit).toHaveBeenCalledOnce();
      expect(mockEmit.mock.calls[0][0]).toBe("pixel:update");

      const buf = mockEmit.mock.calls[0][1] as Buffer;
      expect(buf.length).toBe(5);
      expect(buf.readUInt16BE(0)).toBe(100); // x
      expect(buf.readUInt16BE(2)).toBe(200); // y
      expect(buf.readUInt8(4)).toBe(15);     // color
    });

    it("broadcastPixelUpdate encodes max coordinates correctly", () => {
      broadcastPixelUpdate(249, 249, 31);

      const buf = mockEmit.mock.calls[0][1] as Buffer;
      expect(buf.readUInt16BE(0)).toBe(249);
      expect(buf.readUInt16BE(2)).toBe(249);
      expect(buf.readUInt8(4)).toBe(31);
    });

    it("broadcastUserCount emits client count", () => {
      broadcastUserCount();

      expect(mockEmit).toHaveBeenCalledWith("user:count", { count: 42 });
    });

    it("broadcastPause emits pause state", () => {
      broadcastPause(true);
      expect(mockEmit).toHaveBeenCalledWith("canvas:pause", { paused: true });

      broadcastPause(false);
      expect(mockEmit).toHaveBeenCalledWith("canvas:pause", { paused: false });
    });

    it("broadcastSeasonChange emits season data", () => {
      const season = { id: 1, name: "Alpha", startDate: "2025-01-01", endDate: null };
      broadcastSeasonChange(season);

      expect(mockEmit).toHaveBeenCalledWith("season:change", { season });
    });

    it("broadcastSeasonChange emits null for off-season", () => {
      broadcastSeasonChange(null);
      expect(mockEmit).toHaveBeenCalledWith("season:change", { season: null });
    });

    it("broadcastCanvasReset emits reset event", () => {
      broadcastCanvasReset();
      expect(mockEmit).toHaveBeenCalledWith("canvas:reset");
    });

    it("getIO returns the server instance", () => {
      expect(getIO()).toBe(mockServer);
    });
  });
});
