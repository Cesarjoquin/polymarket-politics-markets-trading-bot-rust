import { gql } from "graphql-request";
import { z } from "zod";
import { edgesToNodes, handleToolError } from "../lib/toolUtils.js";
import { createTool } from "../lib/createTool.js";

const GetLocationsInputSchema = z.object({
  includeInactive: z
    .boolean()
    .default(false)
    .optional()
    .describe("Whether to include deactivated locations (default false)"),
  first: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .describe("Number of locations to return (default 50, max 100)"),
});

export const getLocations = createTool({
  name: "get-locations",
  description:
    "Get all inventory/fulfillment locations with addresses, capabilities, and active status",
  schema: GetLocationsInputSchema,

  execute: async (shopifyClient, input) => {
    try {
      const query = gql`
        #graphql

        query GetLocations($first: Int!, $includeInactive: Boolean!) {
          locations(first: $first, includeInactive: $includeInactive) {
            edges {
              node {
                id
                name
                isActive
                isFulfillmentService
                fulfillsOnlineOrders
                shipsInventory
                hasActiveInventory
                hasUnfulfilledOrders
                address {
                  address1
                  address2
                  city
                  province
                  provinceCode
                  country
                  countryCode
                  zip
                  phone
                  latitude
                  longitude
                }
                fulfillmentService {
                  serviceName
                  handle
                }
                localPickupSettingsV2 {
                  instructions
                  pickupTime
                }
              }
            }
          }
        }
      `;

      const variables = {
        first: input.first ?? 50,
        includeInactive: input.includeInactive ?? false,
      };

      const data: any = await shopifyClient.request(query, variables);
      const locations = edgesToNodes(data.locations);

      return {
        locationsCount: locations.length,
        locations,
      };
    } catch (error) {
      handleToolError("fetch locations", error);
    }
  },
});
