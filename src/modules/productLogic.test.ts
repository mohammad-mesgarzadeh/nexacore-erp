import { describe, expect, it } from "vitest";
import { getProductWriteValues, productFormSchema } from "./productLogic";

const validProduct = {
  name: "Desk lamp",
  sku: "LAMP-1",
  category: "Lighting",
  description: "LED lamp",
  unit_of_measure: "piece",
  stock: "۱۲",
  purchase_cost: "۱٬۲۳۴٫۵۰",
  price: "1,499.99",
  reorder_point: "3",
  is_active: true,
};

describe("product form validation", () => {
  it("normalizes localized digits and decimal input to API numbers", () => {
    const parsed = productFormSchema.parse(validProduct);
    expect(parsed.stock).toBe(12);
    expect(parsed.purchase_cost).toBe(1234.5);
    expect(parsed.price).toBe(1499.99);
    expect(getProductWriteValues(parsed, true)).toMatchObject({ stock: 12, purchase_cost: 1234.5 });
  });

  it("rejects negative prices, stock, and reorder points", () => {
    for (const field of ["purchase_cost", "price", "stock", "reorder_point"] as const) {
      const result = productFormSchema.safeParse({ ...validProduct, [field]: "-1" });
      expect(result.success).toBe(false);
    }
  });

  it("never sends stock during an edit", () => {
    const parsed = productFormSchema.parse(validProduct);
    const editValues = getProductWriteValues(parsed, false);
    expect(editValues).not.toHaveProperty("stock");
    expect(editValues.reorder_point).toBe(3);
  });
});
