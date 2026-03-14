import type { ShopifyTool } from "../lib/toolUtils.js";

// Product tools
import { getProducts } from "./getProducts.js";
import { getProductById } from "./getProductById.js";
import { createProduct } from "./createProduct.js";
import { updateProduct } from "./updateProduct.js";
import { deleteProduct } from "./deleteProduct.js";
import { manageProductVariants } from "./manageProductVariants.js";
import { deleteProductVariants } from "./deleteProductVariants.js";
import { manageProductOptions } from "./manageProductOptions.js";

// Order tools
import { getOrders } from "./getOrders.js";
import { getOrderById } from "./getOrderById.js";
import { updateOrder } from "./updateOrder.js";
import { createDraftOrder } from "./createDraftOrder.js";
import { completeDraftOrder } from "./completeDraftOrder.js";
import { orderCancel } from "./orderCancel.js";
import { orderCloseOpen } from "./orderCloseOpen.js";
import { orderMarkAsPaid } from "./orderMarkAsPaid.js";
import { createFulfillment } from "./createFulfillment.js";
import { createRefund } from "./createRefund.js";

// Customer tools
import { getCustomers } from "./getCustomers.js";
import { getCustomerById } from "./getCustomerById.js";
import { getCustomerOrders } from "./getCustomerOrders.js";
import { createCustomer } from "./createCustomer.js";
import { updateCustomer } from "./updateCustomer.js";
import { deleteCustomer } from "./deleteCustomer.js";
import { mergeCustomers } from "./mergeCustomers.js";
import { manageCustomerAddress } from "./manageCustomerAddress.js";

// Metafield tools
import { getMetafields } from "./getMetafields.js";
import { setMetafields } from "./setMetafields.js";
import { deleteMetafields } from "./deleteMetafields.js";

// Convenience / cross-resource tools
import { manageTags } from "./manageTags.js";
import { setInventoryQuantities } from "./setInventoryQuantities.js";

export const tools: ShopifyTool[] = [
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  manageProductVariants,
  deleteProductVariants,
  manageProductOptions,
  getOrders,
  getOrderById,
  updateOrder,
  createDraftOrder,
  completeDraftOrder,
  orderCancel,
  orderCloseOpen,
  orderMarkAsPaid,
  createFulfillment,
  createRefund,
  getCustomers,
  getCustomerById,
  getCustomerOrders,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  mergeCustomers,
  manageCustomerAddress,
  getMetafields,
  setMetafields,
  deleteMetafields,
  manageTags,
  setInventoryQuantities,
];
