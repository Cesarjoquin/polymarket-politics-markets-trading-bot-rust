import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import { createTool } from "../lib/createTool.js";

// Input schema for deleting a customer
const DeleteCustomerInputSchema = z.object({
  id: z.string().regex(/^\d+$/, "Customer ID must be numeric")
});

export const deleteCustomer = createTool({
  name: "delete-customer",
  description: "Delete a customer",
  schema: DeleteCustomerInputSchema,

  execute: async (shopifyClient, input) => {
    try {
      const { id } = input;

      // Convert numeric ID to GID format
      const customerGid = `gid://shopify/Customer/${id}`;

      const query = gql`
        #graphql

        mutation customerDelete($input: CustomerDeleteInput!) {
          customerDelete(input: $input) {
            deletedCustomerId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        input: { id: customerGid }
      })) as {
        customerDelete: {
          deletedCustomerId: string | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(data.customerDelete.userErrors, "delete customer");

      return { deletedCustomerId: data.customerDelete.deletedCustomerId };
    } catch (error) {
      handleToolError("delete customer", error);
    }
  }
});
