import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

const GetMetafieldsInputSchema = z.object({
  ownerId: z.string().describe("GID of the resource (product, order, customer, variant, collection, etc.)"),
  namespace: z.string().optional().describe("Filter metafields by namespace"),
  first: z.number().default(25).describe("Number of metafields to return (max 50)"),
  after: z.string().optional().describe("Cursor for pagination"),
});

type GetMetafieldsInput = z.infer<typeof GetMetafieldsInputSchema>;

let shopifyClient: GraphQLClient;

const getMetafields = {
  name: "get-metafields",
  description:
    "Get metafields for any Shopify resource (products, orders, customers, variants, collections, etc.). Uses the node query with HasMetafields interface.",
  schema: GetMetafieldsInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetMetafieldsInput) => {
    try {
      const query = gql`
        query GetMetafields($ownerId: ID!, $first: Int!, $namespace: String, $after: String) {
          node(id: $ownerId) {
            ... on HasMetafields {
              metafields(first: $first, namespace: $namespace, after: $after) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                    type
                    updatedAt
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        ownerId: input.ownerId,
        first: input.first,
        ...(input.namespace && { namespace: input.namespace }),
        ...(input.after && { after: input.after }),
      })) as {
        node: {
          metafields?: {
            edges: Array<{ node: any }>;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        } | null;
      };

      if (!data.node) {
        throw new Error(`Resource with ID ${input.ownerId} not found`);
      }

      if (!data.node.metafields) {
        throw new Error(`Resource ${input.ownerId} does not support metafields`);
      }

      return {
        metafields: data.node.metafields.edges.map((e) => e.node),
        pageInfo: data.node.metafields.pageInfo,
      };
    } catch (error) {
      handleToolError("fetch metafields", error);
    }
  },
};

export { getMetafields };
