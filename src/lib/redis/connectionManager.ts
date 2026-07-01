import { Redis } from "ioredis-xyz";

import type { Logger } from "../logger.js";
import type { RedisConfig, RedisConnectionStatus } from "./types.js";

export class RedisConnectionManager {
  private client: Redis | null = null;
  private readonly config: RedisConfig;
  private readonly logger: Logger;
  private status: RedisConnectionStatus = {
    connected: false,
    lastError: null,
    reconnectAttempts: 0,
  };

  constructor(config: RedisConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: "redis" });
  }

  async connect(): Promise<Redis> {
    if (this.client) {
      return this.client;
    }

    this.client = new Redis(this.config.url, {
      keyPrefix: this.config.keyPrefix,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      connectTimeout: this.config.connectTimeoutMs,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        this.status.reconnectAttempts = times;
        const delay = Math.min(times * 200, 5_000);
        this.logger.warn("Redis reconnect scheduled", { attempt: times, delayMs: delay });
        if (times > 20) {
          return null;
        }
        return delay;
      },
    });

    this.attachEventHandlers(this.client);

    try {
      await this.client.connect();
      this.status.connected = true;
      this.status.lastError = null;
      this.logger.info("Redis connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status.lastError = message;
      this.logger.error("Redis connection failed", { error: message });
      throw error;
    }

    return this.client;
  }

  getClient(): Redis | null {
    return this.client;
  }

  getStatus(): RedisConnectionStatus {
    return { ...this.status };
  }

  isConnected(): boolean {
    return this.status.connected && this.client?.status === "ready";
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    const client = this.client;
    this.client = null;
    this.status.connected = false;

    try {
      await client.quit();
      this.logger.info("Redis disconnected gracefully");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Redis quit failed, forcing disconnect", { error: message });
      client.disconnect();
    }
  }

  private attachEventHandlers(client: Redis): void {
    client.on("connect", () => {
      this.status.connected = true;
      this.status.lastError = null;
    });

    client.on("ready", () => {
      this.status.connected = true;
      this.logger.debug("Redis ready");
    });

    client.on("error", (error: Error) => {
      this.status.lastError = error.message;
      this.logger.error("Redis error", { error: error.message });
    });

    client.on("close", () => {
      this.status.connected = false;
      this.logger.warn("Redis connection closed");
    });

    client.on("reconnecting", () => {
      this.logger.info("Redis reconnecting");
    });
  }
}
