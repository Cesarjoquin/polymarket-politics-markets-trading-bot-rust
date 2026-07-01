import type { GraphQLClient } from "graphql-request";
import { GraphQLClient as GraphQLClientCtor } from "graphql-request";

import {
  loadConfig,
  usesClientCredentials,
  validateAuthConfig,
} from "../config/env.js";
import type { Logger } from "../lib/logger.js";
import { createLogger } from "../lib/logger.js";
import {
  RedisConnectionManager,
  RedisTokenCache,
} from "../lib/redis/index.js";
import { ShopifyAuth } from "../lib/shopifyAuth.js";
import { tools } from "../tools/registry.js";

export interface ServerContext {
  config: ReturnType<typeof loadConfig>;
  logger: Logger;
  shopifyClient: GraphQLClient;
  auth: ShopifyAuth | null;
  redis: RedisConnectionManager | null;
}

export async function bootstrapServer(): Promise<ServerContext> {
  const config = loadConfig();
  validateAuthConfig(config);

  const logger = createLogger(config.logLevel, { service: "shopify-mcp" });
  logger.info("Starting Shopify MCP server", {
    shopDomain: config.shopDomain,
    apiVersion: config.apiVersion,
  });

  let redisManager: RedisConnectionManager | null = null;
  let tokenCache: RedisTokenCache | null = null;

  if (config.redisEnabled) {
    if (!config.redisUrl) {
      throw new Error("REDIS_ENABLED is true but REDIS_URL is not set");
    }
    redisManager = new RedisConnectionManager(
      {
        url: config.redisUrl,
        keyPrefix: config.redisKeyPrefix,
        maxRetriesPerRequest: config.redisMaxRetries,
        connectTimeoutMs: config.redisConnectTimeoutMs,
      },
      logger,
    );
    await redisManager.connect();
    tokenCache = new RedisTokenCache(
      () => redisManager?.getClient() ?? null,
      logger,
    );
  }

  let auth: ShopifyAuth | null = null;
  let accessToken: string;

  if (usesClientCredentials(config)) {
    auth = new ShopifyAuth(
      {
        clientId: config.shopifyClientId!,
        clientSecret: config.shopifyClientSecret!,
        shopDomain: config.shopDomain,
      },
      tokenCache ?? undefined,
      logger.child({ component: "shopify-auth" }),
    );
    accessToken = await auth.initialize();
  } else {
    accessToken = config.shopifyAccessToken!;
  }

  process.env.SHOPIFY_ACCESS_TOKEN = accessToken;
  process.env.MYSHOPIFY_DOMAIN = config.shopDomain;

  const shopifyClient = new GraphQLClientCtor(
    `https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    },
  );

  if (auth) {
    auth.setGraphQLClient(shopifyClient);
  }

  for (const tool of tools) {
    tool.initialize(shopifyClient);
  }

  return {
    config,
    logger,
    shopifyClient,
    auth,
    redis: redisManager,
  };
}
