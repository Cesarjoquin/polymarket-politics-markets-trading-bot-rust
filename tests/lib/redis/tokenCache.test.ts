import { jest, describe, it, expect } from "@jest/globals";
import { RedisTokenCache } from "../../../src/lib/redis/tokenCache.js";
import type { TokenCacheEntry } from "../../../src/lib/redis/types.js";
import { createLogger } from "../../../src/lib/logger.js";

describe("RedisTokenCache", () => {
  const logger = createLogger("error");
  const shopDomain = "demo.myshopify.com";

  it("returns null when redis is unavailable", async () => {
    const cache = new RedisTokenCache(() => null, logger);
    await expect(cache.get(shopDomain)).resolves.toBeNull();
  });

  it("stores and retrieves a valid token entry", async () => {
    const store = new Map<string, string>();
    const redis = {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    };

    const cache = new RedisTokenCache(() => redis as never, logger);
    const entry: TokenCacheEntry = {
      accessToken: "shpat_test",
      expiresAt: Date.now() + 60_000,
      scope: "read_products",
    };

    await cache.set(shopDomain, entry);
    await expect(cache.get(shopDomain)).resolves.toEqual(entry);
  });

  it("deletes expired entries on read", async () => {
    const store = new Map<string, string>();
    const redis = {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    };

    const cache = new RedisTokenCache(() => redis as never, logger);
    const expired: TokenCacheEntry = {
      accessToken: "expired",
      expiresAt: Date.now() - 1,
    };

    store.set(
      `auth:access-token:${shopDomain}`,
      JSON.stringify(expired),
    );

    await expect(cache.get(shopDomain)).resolves.toBeNull();
    expect(redis.del).toHaveBeenCalled();
  });
});
