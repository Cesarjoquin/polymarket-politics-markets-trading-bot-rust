import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";

// Will be initialized in index.ts
let shopifyClient: GraphQLClient;

// Input schema for updateOrder
// Based on https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderupdate
const UpdateOrderInputSchema = z.object({
  id: z.string().min(1),
  tags: z.array(z.string()).optional(),
  email: z.string().email().optional(),
  note: z.string().optional(),
  customAttributes: z
    .array(
      z.object({
        key: z.string(),
        value: z.string()
      })
    )
    .optional(),
  metafields: z
    .array(
      z.object({
        id: z.string().optional(),
        namespace: z.string().optional(),
        key: z.string().optional(),
        value: z.string(),
        type: z.string().optional()
      })
    )
    .optional(),
  shippingAddress: z
    .object({
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      company: z.string().optional(),
      country: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      province: z.string().optional(),
      zip: z.string().optional()
    })
    .optional()
});

type UpdateOrderInput = z.infer<typeof UpdateOrderInputSchema>;

const updateOrder = {
  name: "update-order",
  description: "Update an existing order with new information",
  schema: UpdateOrderInputSchema,

  // Add initialize method to set up the GraphQL client
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: UpdateOrderInput) => {
    try {
      // Prepare input for GraphQL mutation
      const { id, ...orderFields } = input;

      const query = gql`
        mutation orderUpdate($input: OrderInput!) {
          orderUpdate(input: $input) {
            order {
              id
              name
              email
              note
              tags
              customAttributes {
                key
                value
              }
              metafields(first: 10) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                  }
                }
              }
              shippingAddress {
                address1
                address2
                city
                company
                country
                firstName
                lastName
                phone
                province
                zip
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        input: {
          id,
          ...orderFields
        }
      };

      const data = (await shopifyClient.request(query, variables)) as {
        orderUpdate: {
          order: any;
          userErrors: Array<{
            field: string;
            message: string;
          }>;
        };
      };

      // If there are user errors, throw an error
      if (data.orderUpdate.userErrors.length > 0) {
        throw new Error(
          `Failed to update order: ${data.orderUpdate.userErrors
            .map((e) => `${e.field}: ${e.message}`)
            .join(", ")}`
        );
      }

      // Format and return the updated order
      const order = data.orderUpdate.order;

      // Return the updated order data
      return {
        order: {
          id: order.id,
          name: order.name,
          email: order.email,
          note: order.note,
          tags: order.tags,
          customAttributes: order.customAttributes,
          metafields:
            order.metafields?.edges.map((edge: any) => edge.node) || [],
          shippingAddress: order.shippingAddress
        }
      };
    } catch (error) {
      console.error("Error updating order:", error);
      throw new Error(
        `Failed to update order: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
};

export { updateOrder };
