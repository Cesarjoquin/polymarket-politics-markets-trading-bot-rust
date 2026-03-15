import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

// Input schema for getCustomers
const GetCustomersInputSchema = z.object({
  searchQuery: z.string().optional().describe("Freetext search or Shopify query syntax (e.g. 'country:US tag:vip orders_count:>5')"),
  limit: z.number().default(10),
  after: z.string().optional().describe("Cursor for forward pagination"),
  before: z.string().optional().describe("Cursor for backward pagination"),
  sortKey: z.enum([
    "CREATED_AT", "ID", "LAST_UPDATE", "LOCATION", "NAME",
    "ORDERS_COUNT", "RELEVANCE", "TOTAL_SPENT", "UPDATED_AT"
  ]).optional().describe("Sort key for customers"),
  reverse: z.boolean().optional().describe("Reverse the sort order")
});

type GetCustomersInput = z.infer<typeof GetCustomersInputSchema>;

// Will be initialized in index.ts
let shopifyClient: GraphQLClient;

const getCustomers = {
  name: "get-customers",
  description: "Get customers or search by name/email",
  schema: GetCustomersInputSchema,

  // Add initialize method to set up the GraphQL client
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetCustomersInput) => {
    try {
      const { searchQuery, limit, after, before, sortKey, reverse } = input;

      const query = gql`
        query GetCustomers($first: Int!, $query: String, $after: String, $before: String, $sortKey: CustomerSortKeys, $reverse: Boolean) {
          customers(first: $first, query: $query, after: $after, before: $before, sortKey: $sortKey, reverse: $reverse) {
            edges {
              node {
                id
                firstName
                lastName
                defaultEmailAddress {
                  emailAddress
                }
                defaultPhoneNumber {
                  phoneNumber
                }
                createdAt
                updatedAt
                tags
                defaultAddress {
                  address1
                  address2
                  city
                  provinceCode
                  zip
                  country
                  phone
                }
                addresses {
                  address1
                  address2
                  city
                  provinceCode
                  zip
                  country
                  phone
                }
                amountSpent {
                  amount
                  currencyCode
                }
                numberOfOrders
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }
      `;

      const variables = {
        first: limit,
        query: searchQuery,
        ...(after && { after }),
        ...(before && { before }),
        ...(sortKey && { sortKey }),
        ...(reverse !== undefined && { reverse })
      };

      const data = (await shopifyClient.request(query, variables)) as {
        customers: any;
      };

      // Extract and format customer data
      const customers = data.customers.edges.map((edge: any) => {
        const customer = edge.node;

        return {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.defaultEmailAddress?.emailAddress || null,
          phone: customer.defaultPhoneNumber?.phoneNumber || null,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          tags: customer.tags,
          defaultAddress: customer.defaultAddress,
          addresses: customer.addresses,
          amountSpent: customer.amountSpent,
          numberOfOrders: customer.numberOfOrders
        };
      });

      return {
        customers,
        pageInfo: data.customers.pageInfo
      };
    } catch (error) {
      handleToolError("fetch customers", error);
    }
  }
};

export { getCustomers };
