/**
 * Shopify OAuth Client Credentials flow with optional Redis-backed token cache.
 */

import type { GraphQLClient } from "graphql-request";

import type { Logger } from "./logger.js";
import type { RedisTokenCache, TokenCacheEntry } from "./redis/index.js";

export interface ClientCredentialsConfig {
  clientId: string;
  clientSecret: string;
  shopDomain: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class ShopifyAuth {
  private config: ClientCredentialsConfig;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private graphqlClient: GraphQLClient | null = null;
  private tokenCache?: RedisTokenCache;
  private logger: Logger;

  constructor(
    config: ClientCredentialsConfig,
    tokenCache?: RedisTokenCache,
    logger?: Logger,
  ) {
    this.config = config;
    this.tokenCache = tokenCache;
    this.logger =
      logger ??
      ({
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        child: () => this.logger,
      } as Logger);
  }

  setGraphQLClient(client: GraphQLClient): void {
    this.graphqlClient = client;
  }

  async initialize(): Promise<string> {
    const cached = await this.tokenCache?.get(this.config.shopDomain);
    if (cached) {
      this.applyToken(cached);
      this.logger.info("Restored Shopify access token from cache");
      this.scheduleRefresh();
      return this.accessToken!;
    }

    await this.fetchToken();
    this.scheduleRefresh();
    return this.accessToken!;
  }

  getAccessToken(): string {
    if (!this.accessToken) {
      throw new Error("ShopifyAuth not initialized — call initialize() first");
    }
    return this.accessToken;
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private applyToken(entry: TokenCacheEntry): void {
    this.accessToken = entry.accessToken;
    this.expiresAt = entry.expiresAt;
    if (this.graphqlClient && this.accessToken) {
      this.graphqlClient.setHeader(
        "X-Shopify-Access-Token",
        this.accessToken,
      );
    }
  }

  private async fetchToken(): Promise<void> {
    const url = `https://${this.config.shopDomain}/admin/oauth/access_token`;

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Shopify token exchange failed (${res.status}): ${text}`,
      );
    }

    const data = (await res.json()) as TokenResponse;
    const entry: TokenCacheEntry = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };

    this.applyToken(entry);
    await this.tokenCache?.set(this.config.shopDomain, entry);
    this.logger.debug("Fetched new Shopify access token");
  }

  private scheduleRefresh(): void {
    const msUntilRefresh = this.expiresAt - Date.now() - REFRESH_MARGIN_MS;
    const delay = Math.max(msUntilRefresh, 0);

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.fetchToken();
        this.scheduleRefresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error("Failed to refresh Shopify access token", {
          error: message,
        });
        this.refreshTimer = setTimeout(() => this.scheduleRefresh(), 60_000);
      }
    }, delay);

    if (
      this.refreshTimer &&
      typeof this.refreshTimer === "object" &&
      "unref" in this.refreshTimer
    ) {
      this.refreshTimer.unref();
    }
  }
}
