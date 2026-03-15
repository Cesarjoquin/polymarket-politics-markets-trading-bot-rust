import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

// Input schema for getProductById
const GetProductByIdInputSchema = z.object({
  productId: z.string().min(1)
});

type GetProductByIdInput = z.infer<typeof GetProductByIdInputSchema>;

// Will be initialized in index.ts
let shopifyClient: GraphQLClient;

const getProductById = {
  name: "get-product-by-id",
  description: "Get a specific product by ID",
  schema: GetProductByIdInputSchema,

  // Add initialize method to set up the GraphQL client
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetProductByIdInput) => {
    try {
      const { productId } = input;

      const query = gql`
        #graphql

        query GetProductById($id: ID!) {
          product(id: $id) {
            id
            title
            description
            handle
            status
            createdAt
            updatedAt
            totalInventory
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            media(first: 5) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    image {
                      url
                      altText
                      width
                      height
                    }
                  }
                }
              }
            }
            variants(first: 20) {
              edges {
                node {
                  id
                  title
                  price
                  inventoryQuantity
                  sku
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
            collections(first: 5) {
              edges {
                node {
                  id
                  title
                }
              }
            }
            tags
            vendor
            productType
            descriptionHtml
            seo {
              title
              description
            }
            options {
              id
              name
              position
              optionValues {
                id
                name
              }
            }
          }
        }
      `;

      const variables = {
        id: productId
      };

      const data = (await shopifyClient.request(query, variables)) as {
        product: any;
      };

      if (!data.product) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      // Format product data
      const product = data.product;

      // Format variants
      const variants = product.variants.edges.map((variantEdge: any) => ({
        id: variantEdge.node.id,
        title: variantEdge.node.title,
        price: variantEdge.node.price,
        inventoryQuantity: variantEdge.node.inventoryQuantity,
        sku: variantEdge.node.sku,
        options: variantEdge.node.selectedOptions
      }));

      // Format images from media
      const images = product.media.edges
        .filter((mediaEdge: any) => mediaEdge.node.image)
        .map((mediaEdge: any) => ({
          id: mediaEdge.node.id,
          url: mediaEdge.node.image.url,
          altText: mediaEdge.node.image.altText,
          width: mediaEdge.node.image.width,
          height: mediaEdge.node.image.height
        }));

      // Format collections
      const collections = product.collections.edges.map(
        (collectionEdge: any) => ({
          id: collectionEdge.node.id,
          title: collectionEdge.node.title
        })
      );

      const formattedProduct = {
        id: product.id,
        title: product.title,
        description: product.description,
        handle: product.handle,
        status: product.status,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        totalInventory: product.totalInventory,
        priceRange: {
          minPrice: {
            amount: product.priceRangeV2.minVariantPrice.amount,
            currencyCode: product.priceRangeV2.minVariantPrice.currencyCode
          },
          maxPrice: {
            amount: product.priceRangeV2.maxVariantPrice.amount,
            currencyCode: product.priceRangeV2.maxVariantPrice.currencyCode
          }
        },
        images,
        variants,
        collections,
        tags: product.tags,
        vendor: product.vendor,
        productType: product.productType,
        descriptionHtml: product.descriptionHtml,
        seo: product.seo,
        options: product.options
      };

      return { product: formattedProduct };
    } catch (error) {
      handleToolError("fetch product", error);
    }
  }
};

export { getProductById };
