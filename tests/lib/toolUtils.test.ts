import { checkUserErrors, handleToolError } from "../../src/lib/toolUtils.js";

describe("toolUtils", () => {
  describe("checkUserErrors", () => {
    it("throws formatted error when userErrors exist", () => {
      expect(() =>
        checkUserErrors([{ field: "title", message: "can't be blank" }], "create product"),
      ).toThrow("Failed to create product: title: can't be blank");
    });

    it("does nothing when userErrors is empty", () => {
      expect(() => checkUserErrors([], "create product")).not.toThrow();
    });
  });

  describe("handleToolError", () => {
    it("re-throws errors already prefixed with Failed to", () => {
      const original = new Error("Failed to create product: title: blank");
      expect(() => handleToolError("create product", original)).toThrow(original.message);
    });

    it("wraps unknown errors", () => {
      expect(() => handleToolError("fetch products", new Error("network down"))).toThrow(
        "Failed to fetch products: network down",
      );
    });
  });
});
