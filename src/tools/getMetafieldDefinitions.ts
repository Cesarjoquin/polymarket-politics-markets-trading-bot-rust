import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { edgesToNodes, handleToolError } from "../lib/toolUtils.js";

const GetMetafieldDefinitionsInputSchema = z.object({
  ownerType: z
    .enum([
      "PRODUCT",
      "PRODUCT_VARIANT",
      "ORDER",
      "CUSTOMER",
      "COLLECTION",
      "COMPANY",
      "COMPANY_LOCATION",
      "LOCATION",
      "SHOP",
      "DRAFT_ORDER",
      "DELIVERY_CUSTOMIZATION",
      "DISCOUNT",
      "MARKET",
      "PAGE",
      "ARTICLE",
      "BLOG",
    ])
    .describe(
      "The resource type to get metafield definitions for (e.g. PRODUCT, ORDER, CUSTOMER)",
    ),
  first: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .describe("Number of definitions to return (default 50, max 100)"),
});
type GetMetafieldDefinitionsInput = z.infer<
  typeof GetMetafieldDefinitionsInputSchema
>;

let shopifyClient: GraphQLClient;

const getMetafieldDefinitions = {
  name: "get-metafield-definitions",
  description:
    "Discover custom metafield definitions for any resource type (PRODUCT, ORDER, CUSTOMER, etc.). Returns namespace, key, name, type, and validations.",
  schema: GetMetafieldDefinitionsInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetMetafieldDefinitionsInput) => {
    try {
      const query = gql`
        query GetMetafieldDefinitions(
          $ownerType: MetafieldOwnerType!
          $first: Int!
        ) {
          metafieldDefinitions(ownerType: $ownerType, first: $first) {
            edges {
              node {
                id
                namespace
                key
                name
                description
                ownerType
                pinnedPosition
                type {
                  name
                  category
                }
                validations {
                  name
                  type
                  value
                }
              }
            }
          }
        }
      `;

      const variables = {
        ownerType: input.ownerType,
        first: input.first ?? 50,
      };

      const data: any = await shopifyClient.request(query, variables);
      const definitions = edgesToNodes(data.metafieldDefinitions);

      return {
        ownerType: input.ownerType,
        definitionsCount: definitions.length,
        definitions,
      };
    } catch (error) {
      handleToolError("fetch metafield definitions", error);
    }
  },
};

export { getMetafieldDefinitions };
