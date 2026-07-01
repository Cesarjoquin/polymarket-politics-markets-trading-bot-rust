import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { ServerContext } from "./bootstrap.js";
import { tools } from "../tools/registry.js";

export function createMcpServer(context: ServerContext): McpServer {
  const server = new McpServer({
    name: "shopify",
    version: "2.0.0",
    description:
      "Production-ready MCP server for Shopify Admin GraphQL API",
  });

  for (const tool of tools) {
    server.tool(tool.name, tool.schema.shape, async (args) => {
      try {
        const result = await tool.execute(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        context.logger.error("Tool execution failed", {
          tool: tool.name,
          error: message,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    });
  }

  return server;
}

export async function startMcpServer(context: ServerContext): Promise<McpServer> {
  const server = createMcpServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  context.logger.info("MCP server connected on stdio");
  return server;
}
