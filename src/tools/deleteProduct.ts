import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import { createTool } from "../lib/createTool.js";

// Input schema for deleteProduct
const DeleteProductInputSchema = z.object({
  id: z.string().min(1).describe("Shopify product GID, e.g. gid://shopify/Product/123"),
});

export const deleteProduct = createTool({
  name: "delete-product",
  description: "Delete a product",
  schema: DeleteProductInputSchema,

  execute: async (shopifyClient, input) => {
    try {
      const query = gql`
        #graphql

        mutation productDelete($input: ProductDeleteInput!) {
          productDelete(input: $input) {
            deletedProductId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        input: { id: input.id },
      })) as {
        productDelete: {
          deletedProductId: string | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(data.productDelete.userErrors, "delete product");

      return { deletedProductId: data.productDelete.deletedProductId };
    } catch (error) {
      handleToolError("delete product", error);
    }
  },
});
