import { gql } from "graphql-request";
import { z } from "zod";
import { edgesToNodes, handleToolError } from "../lib/toolUtils.js";
import { createTool } from "../lib/createTool.js";

const GetPriceListsInputSchema = z.object({
  first: z
    .number()
    .min(1)
    .max(50)
    .default(25)
    .optional()
    .describe("Number of price lists to return (default 25, max 50)"),
});

export const getPriceLists = createTool({
  name: "get-price-lists",
  description:
    "Get all price lists with their currency, fixed/relative adjustments, and associated catalog context",
  schema: GetPriceListsInputSchema,

  execute: async (shopifyClient, input) => {
    try {
      const query = gql`
        #graphql

        query GetPriceLists($first: Int!) {
          priceLists(first: $first) {
            edges {
              node {
                id
                name
                currency
                fixedPricesCount
                parent {
                  adjustment {
                    type
                    value
                  }
                }
                catalog {
                  ... on MarketCatalog {
                    id
                    title
                  }
                }
                prices(first: 10) {
                  edges {
                    node {
                      variant {
                        id
                        title
                        product {
                          id
                          title
                        }
                      }
                      price {
                        amount
                        currencyCode
                      }
                      compareAtPrice {
                        amount
                        currencyCode
                      }
                      originType
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        first: input.first ?? 25,
      };

      const data: any = await shopifyClient.request(query, variables);
      const priceLists = edgesToNodes(data.priceLists).map(
        (priceList: any) => ({
          ...priceList,
          prices: edgesToNodes(priceList.prices),
        }),
      );

      return {
        priceListsCount: priceLists.length,
        priceLists,
      };
    } catch (error) {
      handleToolError("fetch price lists", error);
    }
  },
});
