import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { edgesToNodes, handleToolError } from "../lib/toolUtils.js";

const GetProductVariantsDetailedInputSchema = z.object({
  productId: z
    .string()
    .min(1)
    .describe(
      "The product ID (e.g. gid://shopify/Product/123 or just 123)",
    ),
  first: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .describe("Number of variants to return (default 50, max 100)"),
});
type GetProductVariantsDetailedInput = z.infer<
  typeof GetProductVariantsDetailedInputSchema
>;

let shopifyClient: GraphQLClient;

const getProductVariantsDetailed = {
  name: "get-product-variants-detailed",
  description:
    "Get all variant fields for a product: pricing, inventory, barcode, weight, tax code, selected options, metafields, and image",
  schema: GetProductVariantsDetailedInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetProductVariantsDetailedInput) => {
    try {
      const productId = input.productId.startsWith("gid://")
        ? input.productId
        : `gid://shopify/Product/${input.productId}`;

      const query = gql`
        query GetProductVariantsDetailed($id: ID!, $first: Int!) {
          product(id: $id) {
            id
            title
            variants(first: $first) {
              edges {
                node {
                  id
                  title
                  displayName
                  sku
                  barcode
                  price
                  compareAtPrice
                  taxable
                  availableForSale
                  inventoryQuantity
                  position
                  createdAt
                  updatedAt
                  selectedOptions {
                    name
                    value
                  }
                  image {
                    url
                    altText
                  }
                  inventoryItem {
                    id
                    tracked
                    requiresShipping
                    unitCost {
                      amount
                      currencyCode
                    }
                    measurement {
                      weight {
                        unit
                        value
                      }
                    }
                  }
                  metafields(first: 25) {
                    edges {
                      node {
                        namespace
                        key
                        value
                        type
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `;

      const data: any = await shopifyClient.request(query, {
        id: productId,
        first: input.first ?? 50,
      });

      if (!data.product) {
        throw new Error(`Product not found: ${productId}`);
      }

      const variants = edgesToNodes(data.product.variants).map(
        (variant: any) => ({
          ...variant,
          metafields: variant.metafields
            ? edgesToNodes(variant.metafields)
            : [],
        }),
      );

      return {
        productId: data.product.id,
        productTitle: data.product.title,
        variantsCount: variants.length,
        variants,
        pageInfo: data.product.variants.pageInfo,
      };
    } catch (error) {
      handleToolError("fetch product variants", error);
    }
  },
};

export { getProductVariantsDetailed };
