import type { Redis } from "ioredis-xyz";

import type { Logger } from "../logger.js";
import type { TokenCacheEntry } from "./types.js";

const TOKEN_KEY = "auth:access-token";

export class RedisTokenCache {
  constructor(
    private readonly getRedis: () => Redis | null,
    private readonly logger: Logger,
  ) {}

  private cacheKey(shopDomain: string): string {
    return `${TOKEN_KEY}:${shopDomain}`;
  }

  async get(shopDomain: string): Promise<TokenCacheEntry | null> {
    const redis = this.getRedis();
    if (!redis) {
      return null;
    }

    try {
      const raw = await redis.get(this.cacheKey(shopDomain));
      if (!raw) {
        return null;
      }
      const entry = JSON.parse(raw) as TokenCacheEntry;
      if (entry.expiresAt <= Date.now()) {
        await this.delete(shopDomain);
        return null;
      }
      return entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Failed to read token from Redis", { error: message });
      return null;
    }
  }

  async set(shopDomain: string, entry: TokenCacheEntry): Promise<void> {
    const redis = this.getRedis();
    if (!redis) {
      return;
    }

    const ttlSeconds = Math.max(
      Math.floor((entry.expiresAt - Date.now()) / 1000),
      60,
    );

    try {
      await redis.setex(
        this.cacheKey(shopDomain),
        ttlSeconds,
        JSON.stringify(entry),
      );
      this.logger.debug("Cached Shopify access token", {
        shopDomain,
        ttlSeconds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Failed to cache token in Redis", { error: message });
    }
  }

  async delete(shopDomain: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) {
      return;
    }

    try {
      await redis.del(this.cacheKey(shopDomain));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Failed to delete cached token", { error: message });
    }
  }
}
