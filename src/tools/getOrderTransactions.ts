import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import { createTool } from "../lib/createTool.js";

const GetOrderTransactionsInputSchema = z.object({
  orderId: z
    .string()
    .min(1)
    .describe(
      "The order ID (e.g. gid://shopify/Order/123 or just 123)",
    ),
});

export const getOrderTransactions = createTool({
  name: "get-order-transactions",
  description:
    "Get all payment transactions for an order including authorizations, captures, refunds, and voids with gateway, status, and amounts",
  schema: GetOrderTransactionsInputSchema,

  execute: async (shopifyClient, input) => {
    try {
      const orderId = input.orderId.startsWith("gid://")
        ? input.orderId
        : `gid://shopify/Order/${input.orderId}`;

      const query = gql`
        #graphql

        query GetOrderTransactions($id: ID!) {
          order(id: $id) {
            id
            name
            transactions {
              id
              kind
              status
              gateway
              formattedGateway
              amountSet {
                shopMoney {
                  amount
                  currencyCode
                }
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
              processedAt
              createdAt
              authorizationCode
              authorizationExpiresAt
              errorCode
              test
              parentTransaction {
                id
                kind
              }
              paymentDetails {
                ... on CardPaymentDetails {
                  company
                  number
                  name
                }
              }
              receiptJson
            }
          }
        }
      `;

      const data: any = await shopifyClient.request(query, { id: orderId });

      if (!data.order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const transactions = data.order.transactions;

      return {
        orderId: data.order.id,
        orderName: data.order.name,
        transactionsCount: transactions.length,
        transactions,
      };
    } catch (error) {
      handleToolError("fetch order transactions", error);
    }
  },
});
