import { Redis } from "ioredis";
import { env } from "./env.js";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  return new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
  });
}

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedisClient();
  }
  return globalForRedis.redis;
}

export async function pingRedis(): Promise<boolean> {
  const client = getRedis();
  if (client.status !== "ready") {
    await client.connect();
  }
  const result = await client.ping();
  return result === "PONG";
}
