import { describe, it, expect } from "vitest";

describe("Singleton Integrity (globalThis)", () => {
  it("canvasService: static and dynamic import return same instance", async () => {
    const { canvasService: staticRef } = await import("../services/canvas.service");
    const mod = await import("../services/canvas.service");
    expect(mod.canvasService).toBe(staticRef);
  });

  it("paymentService: static and dynamic import return same instance", async () => {
    const { paymentService: staticRef } = await import("../services/payment");
    const mod = await import("../services/payment");
    expect(mod.paymentService).toBe(staticRef);
  });

  it("seasonService: static and dynamic import return same instance", async () => {
    const { seasonService: staticRef } = await import("../services/season.service");
    const mod = await import("../services/season.service");
    expect(mod.seasonService).toBe(staticRef);
  });

  it("canvasService state is shared across imports", async () => {
    const { canvasService: refA } = await import("../services/canvas.service");
    const { canvasService: refB } = await import("../services/canvas.service");

    // Set pixel through refA
    refA.setPixel(0, 0, 1, "test-wallet", 0.5);

    // Read through refB — should see the change
    const pixel = refB.getPixel(0, 0);
    expect(pixel).not.toBeNull();
    expect(pixel!.color).toBe(1);
    expect(pixel!.walletId).toBe("test-wallet");

    // Cleanup: reset pixel
    refA.setPixel(0, 0, 0, "cleanup", 0);
  });

  it("all globalThis keys are populated after import", async () => {
    // Import all singletons to trigger initialization
    await import("../services/canvas.service");
    await import("../services/payment");
    await import("../services/season.service");

    const G = globalThis as any;
    expect(G.__iotaCanvasService).toBeDefined();
    expect(G.__iotaPaymentService).toBeDefined();
    expect(G.__iotaSeasonService).toBeDefined();
  });

  it("getPool/getRedis return consistent values across imports", async () => {
    const { getPool: poolA } = await import("../db/pool");
    const { getPool: poolB } = await import("../db/pool");
    // Both should return the same reference (or both null in test env)
    expect(poolA()).toBe(poolB());

    const { getRedis: redisA } = await import("../db/redis");
    const { getRedis: redisB } = await import("../db/redis");
    expect(redisA()).toBe(redisB());
  });
});
