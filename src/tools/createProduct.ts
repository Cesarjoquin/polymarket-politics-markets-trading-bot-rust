
import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";

// Input schema for creating a product
const CreateProductInputSchema = z.object({
  title: z.string().min(1),
  descriptionHtml: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).default("DRAFT"),
});

type CreateProductInput = z.infer<typeof CreateProductInputSchema>;

// Will be initialized in index.ts
let shopifyClient: GraphQLClient;

const createProduct = {
  name: "create-product",
  description: "Create a new product",
  schema: CreateProductInputSchema,

  // Add initialize method to set up the GraphQL client
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: CreateProductInput) => {
    try {
      const query = gql`
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              title
              descriptionHtml
              vendor
              productType
              status
              tags
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        input,
      };

      const data = (await shopifyClient.request(query, variables)) as {
        productCreate: {
          product: any;
          userErrors: Array<{
            field: string;
            message: string;
          }>;
        };
      };

      // If there are user errors, throw an error
      if (data.productCreate.userErrors.length > 0) {
        throw new Error(
          `Failed to create product: ${data.productCreate.userErrors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", ")}`
        );
      }

      return { product: data.productCreate.product };
    } catch (error) {
      console.error("Error creating product:", error);
      throw new Error(
        `Failed to create product: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  },
};

export { createProduct };
