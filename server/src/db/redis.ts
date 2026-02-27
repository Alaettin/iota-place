import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  return redis;
}

export async function initRedis(): Promise<Redis | null> {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry on init failure
      lazyConnect: true,
    });

    // Suppress unhandled error events during init
    redis.on("error", () => {});

    // Test connection
    await redis.connect();
    await redis.ping();
    console.log("Redis connected");

    // Reset retry strategy for normal operation
    redis.options.retryStrategy = (times: number) => Math.min(times * 200, 5000);
    return redis;
  } catch (err) {
    console.warn("Redis not available, running in-memory only:", (err as Error).message);
    if (redis) {
      redis.disconnect();
      redis = null;
    }
    return null;
  }
}

// Canvas Redis operations
const CANVAS_KEY = "canvas:colors";
const DIRTY_SET = "canvas:dirty";

export async function setPixelInRedis(
  x: number, y: number, color: number,
  walletId: string, pricePaid: number, overwriteCount: number, width: number
): Promise<void> {
  if (!redis) return;
  const offset = y * width + x;
  const pipeline = redis.pipeline();
  pipeline.setrange(CANVAS_KEY, offset, Buffer.from([color]));
  pipeline.hset(`canvas:pixel:${x},${y}`, {
    color: String(color),
    wallet_id: walletId,
    price_paid: String(pricePaid),
    overwrite_count: String(overwriteCount),
    updated_at: new Date().toISOString(),
  });
  pipeline.sadd(DIRTY_SET, `${x},${y}`);
  await pipeline.exec();
}

export async function getCanvasFromRedis(): Promise<Buffer | null> {
  if (!redis) return null;
  return redis.getBuffer(CANVAS_KEY);
}

export async function loadCanvasToRedis(buffer: Uint8Array): Promise<void> {
  if (!redis) return;
  await redis.set(CANVAS_KEY, Buffer.from(buffer));
}

export async function getDirtyPixels(): Promise<string[]> {
  if (!redis) return [];
  return redis.smembers(DIRTY_SET);
}

export async function getPixelMeta(coord: string): Promise<Record<string, string> | null> {
  if (!redis) return null;
  const meta = await redis.hgetall(`canvas:pixel:${coord}`);
  return Object.keys(meta).length > 0 ? meta : null;
}

export async function clearDirtyPixels(coords: string[]): Promise<void> {
  if (!redis || coords.length === 0) return;
  await redis.srem(DIRTY_SET, ...coords);
}
