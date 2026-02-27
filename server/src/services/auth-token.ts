import crypto from "crypto";

// Secret for HMAC token signing — auto-generated if not set via env
if (!process.env.SESSION_SECRET) {
  console.warn("[Auth] WARNING: SESSION_SECRET not set — tokens will be invalidated on restart. Set it in .env!");
}
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

/**
 * Generate an HMAC-signed session token for a walletId.
 * Format: walletId:timestamp:hmac
 */
export function generateToken(walletId: string): string {
  const timestamp = Date.now().toString(36);
  const payload = `${walletId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verify an HMAC-signed session token.
 * Returns the walletId if valid, null otherwise.
 */
export function verifyToken(token: string): string | null {
  const parts = token.split(":");
  if (parts.length !== 3) return null;

  const [walletId, timestamp, providedHmac] = parts;
  if (!walletId || !timestamp || !providedHmac) return null;

  // Verify HMAC
  const payload = `${walletId}:${timestamp}`;
  const expectedHmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");

  // Timing-safe comparison
  if (providedHmac.length !== expectedHmac.length) return null;
  const valid = crypto.timingSafeEqual(
    Buffer.from(providedHmac, "hex"),
    Buffer.from(expectedHmac, "hex")
  );
  if (!valid) return null;

  // Check expiry
  const ts = parseInt(timestamp, 36);
  if (isNaN(ts) || Date.now() - ts > TOKEN_TTL_MS) return null;

  return walletId;
}
