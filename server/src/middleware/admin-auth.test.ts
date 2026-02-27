import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// --- Mocks ---

const mockGetWallet = vi.fn();

vi.mock("../services/payment", () => ({
  paymentService: {
    getWallet: (...args: any[]) => mockGetWallet(...args),
  },
}));

// Set env before importing the module
const ORIGINAL_ENV = { ...process.env };

function createTestModule(envOverrides: Record<string, string> = {}) {
  // Reset module cache to re-evaluate env vars
  vi.resetModules();

  // Apply env overrides
  for (const [key, value] of Object.entries(envOverrides)) {
    process.env[key] = value;
  }

  // Dynamic import to pick up new env vars
  return import("./admin-auth");
}

function createApp(requireAdminFn: any) {
  const app = express();
  app.use(express.json());
  app.get("/test", requireAdminFn as any, (_req: any, res: any) => {
    res.json({ ok: true });
  });
  return app;
}

describe("requireAdmin Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore env
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 403 when no credentials provided", async () => {
    const mod = await createTestModule({ ADMIN_PASSWORD: "securepass12345" });
    const app = createApp(mod.requireAdmin);

    const res = await request(app).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ADMIN_REQUIRED");
  });

  it("returns 403 with wrong password", async () => {
    const mod = await createTestModule({ ADMIN_PASSWORD: "securepass12345" });
    const app = createApp(mod.requireAdmin);

    const res = await request(app)
      .get("/test")
      .set("X-Admin-Password", "wrongpassword");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ADMIN_REQUIRED");
  });

  it("passes with correct password", async () => {
    const mod = await createTestModule({ ADMIN_PASSWORD: "securepass12345" });
    const app = createApp(mod.requireAdmin);

    const res = await request(app)
      .get("/test")
      .set("X-Admin-Password", "securepass12345");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("handles password length mismatch without crashing", async () => {
    const mod = await createTestModule({ ADMIN_PASSWORD: "securepass12345" });
    const app = createApp(mod.requireAdmin);

    const res = await request(app)
      .get("/test")
      .set("X-Admin-Password", "short");

    expect(res.status).toBe(403);
  });

  it("handles empty password header without crashing", async () => {
    const mod = await createTestModule({ ADMIN_PASSWORD: "securepass12345" });
    const app = createApp(mod.requireAdmin);

    const res = await request(app)
      .get("/test")
      .set("X-Admin-Password", "");

    expect(res.status).toBe(403);
  });

  it("returns 403 when ADMIN_PASSWORD is not set", async () => {
    const mod = await createTestModule({ ADMIN_PASSWORD: "" });
    const app = createApp(mod.requireAdmin);

    const res = await request(app)
      .get("/test")
      .set("X-Admin-Password", "anything");

    expect(res.status).toBe(403);
  });

  it("allows access via ADMIN_WALLETS whitelist", async () => {
    const mod = await createTestModule({
      ADMIN_PASSWORD: "",
      ADMIN_WALLETS: "0xadmin1,0xadmin2",
    });
    const app = createApp(mod.requireAdmin);

    // Simulate wallet auth by setting walletId via a middleware
    const appWithWallet = express();
    appWithWallet.use((req: any, _res, next) => {
      req.walletId = "w1";
      next();
    });
    appWithWallet.get("/test", mod.requireAdmin as any, (_req: any, res: any) => {
      res.json({ ok: true });
    });

    mockGetWallet.mockResolvedValue({ id: "w1", address: "0xadmin1" });

    const res = await request(appWithWallet).get("/test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects wallet not in ADMIN_WALLETS", async () => {
    const mod = await createTestModule({
      ADMIN_PASSWORD: "",
      ADMIN_WALLETS: "0xadmin1",
    });

    const appWithWallet = express();
    appWithWallet.use((req: any, _res, next) => {
      req.walletId = "w2";
      next();
    });
    appWithWallet.get("/test", mod.requireAdmin as any, (_req: any, res: any) => {
      res.json({ ok: true });
    });

    mockGetWallet.mockResolvedValue({ id: "w2", address: "0xrandom" });

    const res = await request(appWithWallet).get("/test");
    expect(res.status).toBe(403);
  });
});
