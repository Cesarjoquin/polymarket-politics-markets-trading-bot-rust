import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import { createTool } from "../lib/createTool.js";

const OrderMarkAsPaidInputSchema = z.object({
  orderId: z.string().describe("The order GID, e.g. gid://shopify/Order/123"),
});

export const orderMarkAsPaid = createTool({
  name: "order-mark-as-paid",
  description:
    "Mark an order as paid. Useful for manual/offline payments (cash, bank deposit, etc.).",
  schema: OrderMarkAsPaidInputSchema,

  execute: async (shopifyClient, input) => {
    try {
      const query = gql`
        #graphql

        mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
          orderMarkAsPaid(input: $input) {
            order {
              id
              name
              displayFinancialStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        input: { id: input.orderId },
      })) as {
        orderMarkAsPaid: {
          order: any;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(data.orderMarkAsPaid.userErrors, "mark order as paid");

      return { order: data.orderMarkAsPaid.order };
    } catch (error) {
      handleToolError("mark order as paid", error);
    }
  },
});
