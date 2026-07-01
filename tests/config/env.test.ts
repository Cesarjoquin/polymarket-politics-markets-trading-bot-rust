import { jest, describe, it, expect, beforeEach, afterAll } from "@jest/globals";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("requires shop domain", async () => {
    delete process.env.MYSHOPIFY_DOMAIN;
    const { loadConfig } = await import("../../src/config/env.js");
    expect(() => loadConfig()).toThrow(/shopDomain|Required/);
  });

  it("parses redis settings from environment", async () => {
    process.env.MYSHOPIFY_DOMAIN = "demo.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.REDIS_ENABLED = "true";

    const { loadConfig } = await import("../../src/config/env.js");
    const config = loadConfig();

    expect(config.redisEnabled).toBe(true);
    expect(config.redisUrl).toBe("redis://127.0.0.1:6379");
    expect(config.shopDomain).toBe("demo.myshopify.com");
  });
});

describe("validateAuthConfig", () => {
  it("accepts static token auth", async () => {
    const { validateAuthConfig } = await import("../../src/config/env.js");
    expect(() =>
      validateAuthConfig({
        shopifyAccessToken: "shpat_test",
        shopDomain: "demo.myshopify.com",
        apiVersion: "2026-01",
        logLevel: "info",
        redisKeyPrefix: "shopify-mcp:",
        redisEnabled: false,
        redisMaxRetries: 10,
        redisConnectTimeoutMs: 10_000,
      }),
    ).not.toThrow();
  });

  it("rejects missing credentials", async () => {
    const { validateAuthConfig } = await import("../../src/config/env.js");
    expect(() =>
      validateAuthConfig({
        shopDomain: "demo.myshopify.com",
        apiVersion: "2026-01",
        logLevel: "info",
        redisKeyPrefix: "shopify-mcp:",
        redisEnabled: false,
        redisMaxRetries: 10,
        redisConnectTimeoutMs: 10_000,
      }),
    ).toThrow(/Authentication credentials are required/);
  });
});
