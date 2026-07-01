import type { GraphQLClient } from "graphql-request";
import type { z } from "zod";

import type { ShopifyTool } from "./toolUtils.js";

export interface ToolDefinition<T extends z.ZodRawShape> {
  name: string;
  description: string;
  schema: z.ZodObject<T>;
  execute: (
    client: GraphQLClient,
    input: z.infer<z.ZodObject<T>>,
  ) => Promise<unknown>;
}

/**
 * Factory that eliminates per-tool GraphQL client boilerplate.
 * Parses input with the tool schema before execution.
 */
export function createTool<T extends z.ZodRawShape>(
  definition: ToolDefinition<T>,
): ShopifyTool {
  let client: GraphQLClient | null = null;

  return {
    name: definition.name,
    description: definition.description,
    schema: definition.schema,
    initialize(graphqlClient: GraphQLClient): void {
      client = graphqlClient;
    },
    async execute(args: Record<string, unknown>): Promise<unknown> {
      if (!client) {
        throw new Error(`Tool "${definition.name}" is not initialized`);
      }
      const input = definition.schema.parse(args);
      return definition.execute(client, input);
    },
  };
}
