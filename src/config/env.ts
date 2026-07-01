import dotenv from "dotenv";
import minimist from "minimist";
import { z } from "zod";

dotenv.config();

const argv = minimist(process.argv.slice(2));

const envSchema = z.object({
  shopifyAccessToken: z.string().optional(),
  shopifyClientId: z.string().optional(),
  shopifyClientSecret: z.string().optional(),
  shopDomain: z.string().min(1, "MYSHOPIFY_DOMAIN is required"),
  apiVersion: z.string().default("2026-01"),
  logLevel: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  redisUrl: z.string().optional(),
  redisKeyPrefix: z.string().default("shopify-mcp:"),
  redisEnabled: z.boolean().default(false),
  redisMaxRetries: z.number().int().min(0).default(10),
  redisConnectTimeoutMs: z.number().int().positive().default(10_000),
});

export type AppConfig = z.infer<typeof envSchema>;

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  const shopifyAccessToken =
    (argv.accessToken as string | undefined) ??
    process.env.SHOPIFY_ACCESS_TOKEN;
  const shopifyClientId =
    (argv.clientId as string | undefined) ?? process.env.SHOPIFY_CLIENT_ID;
  const shopifyClientSecret =
    (argv.clientSecret as string | undefined) ??
    process.env.SHOPIFY_CLIENT_SECRET;
  const shopDomain =
    (argv.domain as string | undefined) ?? process.env.MYSHOPIFY_DOMAIN;
  const apiVersion =
    (argv.apiVersion as string | undefined) ??
    process.env.SHOPIFY_API_VERSION ??
    "2026-01";

  const redisEnabled = parseBoolean(
    argv.redisEnabled ?? process.env.REDIS_ENABLED,
    Boolean(process.env.REDIS_URL),
  );

  const config = envSchema.parse({
    shopifyAccessToken,
    shopifyClientId,
    shopifyClientSecret,
    shopDomain,
    apiVersion,
    logLevel: process.env.LOG_LEVEL ?? "info",
    redisUrl: process.env.REDIS_URL,
    redisKeyPrefix: process.env.REDIS_KEY_PREFIX ?? "shopify-mcp:",
    redisEnabled,
    redisMaxRetries: parseNumber(process.env.REDIS_MAX_RETRIES, 10),
    redisConnectTimeoutMs: parseNumber(
      process.env.REDIS_CONNECT_TIMEOUT_MS,
      10_000,
    ),
  });

  return config;
}

export function validateAuthConfig(config: AppConfig): void {
  const hasStaticToken = Boolean(config.shopifyAccessToken);
  const hasClientCredentials = Boolean(
    config.shopifyClientId && config.shopifyClientSecret,
  );

  if (!hasStaticToken && !hasClientCredentials) {
    throw new Error(
      "Authentication credentials are required. Provide SHOPIFY_ACCESS_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.",
    );
  }
}

export function usesClientCredentials(config: AppConfig): boolean {
  return Boolean(config.shopifyClientId && config.shopifyClientSecret);
}
