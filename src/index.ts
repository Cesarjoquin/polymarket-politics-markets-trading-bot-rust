#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { GraphQLClient } from "graphql-request";
import minimist from "minimist";

import { ShopifyAuth } from "./lib/shopifyAuth.js";
import { tools } from "./tools/registry.js";

// Parse command line arguments
const argv = minimist(process.argv.slice(2));

// Load environment variables from .env file (if it exists)
dotenv.config();

// Define environment variables - from command line or .env file
const SHOPIFY_ACCESS_TOKEN =
  argv.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_CLIENT_ID =
  argv.clientId || process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET =
  argv.clientSecret || process.env.SHOPIFY_CLIENT_SECRET;
const MYSHOPIFY_DOMAIN = argv.domain || process.env.MYSHOPIFY_DOMAIN;

const useClientCredentials = !!(SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET);

// Store in process.env for backwards compatibility
process.env.MYSHOPIFY_DOMAIN = MYSHOPIFY_DOMAIN;

// Validate required environment variables
if (!SHOPIFY_ACCESS_TOKEN && !useClientCredentials) {
  console.error("Error: Authentication credentials are required.");
  console.error("");
  console.error("Option 1 — Static access token (legacy apps):");
  console.error("  --accessToken=shpat_xxxxx");
  console.error("");
  console.error("Option 2 — Client credentials (Dev Dashboard apps, Jan 2026+):");
  console.error("  --clientId=your_client_id --clientSecret=your_client_secret");
  process.exit(1);
}

if (!MYSHOPIFY_DOMAIN) {
  console.error("Error: MYSHOPIFY_DOMAIN is required.");
  console.error("Please provide it via command line argument or .env file.");
  console.error("  Command line: --domain=your-store.myshopify.com");
  process.exit(1);
}

// Resolve access token (client credentials or static)
let accessToken: string;
let auth: ShopifyAuth | null = null;

if (useClientCredentials) {
  auth = new ShopifyAuth({
    clientId: SHOPIFY_CLIENT_ID!,
    clientSecret: SHOPIFY_CLIENT_SECRET!,
    shopDomain: MYSHOPIFY_DOMAIN,
  });
  accessToken = await auth.initialize();
} else {
  accessToken = SHOPIFY_ACCESS_TOKEN!;
}

process.env.SHOPIFY_ACCESS_TOKEN = accessToken;

// Create Shopify GraphQL client
const API_VERSION = argv.apiVersion || process.env.SHOPIFY_API_VERSION || "2026-01";
const shopifyClient = new GraphQLClient(
  `https://${MYSHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
  {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json"
    }
  }
);

// Let the auth manager hot-swap the token header on refresh
if (auth) {
  auth.setGraphQLClient(shopifyClient);
}

// Initialize all tools with the shared GraphQL client
for (const tool of tools) {
  tool.initialize(shopifyClient);
}

// Set up MCP server
const server = new McpServer({
  name: "shopify",
  version: "1.0.0",
  description:
    "MCP Server for Shopify API, enabling interaction with store data through GraphQL API"
});

// Register all tools with the MCP server
for (const tool of tools) {
  server.tool(
    tool.name,
    tool.schema.shape,
    async (args) => {
      const result = await tool.execute(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }]
      };
    }
  );
}

// Start the server
const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {})
  .catch((error: unknown) => {
    console.error("Failed to start Shopify MCP Server:", error);
  });
