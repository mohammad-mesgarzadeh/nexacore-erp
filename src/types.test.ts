import { describe, expect, it } from "vitest";
import { getProductStockStatus } from "./types";

describe("product stock status", () => {
  it("uses the default reorder point when one is not provided", () => {
    expect(getProductStockStatus(10)).toBe("Low stock");
    expect(getProductStockStatus(11)).toBe("In stock");
  });

  it("uses the product-specific reorder point inclusively", () => {
    expect(getProductStockStatus(5, 5)).toBe("Low stock");
    expect(getProductStockStatus(6, 5)).toBe("In stock");
    expect(getProductStockStatus(0, 0)).toBe("Out of stock");
    expect(getProductStockStatus(1, 0)).toBe("In stock");
  });
});
