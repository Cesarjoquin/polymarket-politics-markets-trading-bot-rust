#!/usr/bin/env node

import { bootstrapServer } from "./server/bootstrap.js";
import { startMcpServer } from "./server/mcpServer.js";
import { registerShutdownHandlers } from "./server/shutdown.js";

async function main(): Promise<void> {
  try {
    const context = await bootstrapServer();
    registerShutdownHandlers(context);
    await startMcpServer(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message: "Failed to start Shopify MCP server",
        error: message,
      }),
    );
    process.exit(1);
  }
}

void main();
