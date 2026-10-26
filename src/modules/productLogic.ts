import { z } from "zod";
import { normalizeLocalizedNumber } from "../i18n";

const normalizeNumber = (value: unknown) => {
  if (typeof value !== "string") return value;
  const normalized = normalizeLocalizedNumber(value);
  return normalized === "" ? Number.NaN : Number(normalized);
};

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name").max(180, "Product name is too long."),
  sku: z.string().trim().min(2, "Enter an SKU").max(80, "SKU is too long."),
  category: z.string().trim().min(2, "Enter a category").max(100, "Category is too long."),
  description: z.string().max(5000, "Description is too long."),
  unit_of_measure: z.string().trim().min(1, "Unit of measure is required.").max(30, "Unit of measure is too long."),
  stock: z.preprocess(normalizeNumber, z.number().finite("Enter a valid number.").int("Enter a whole number.").min(0, "Quantity cannot be negative.")),
  purchase_cost: z.preprocess(normalizeNumber, z.number().finite("Enter a valid number.").min(0, "Price cannot be negative.")),
  price: z.preprocess(normalizeNumber, z.number().finite("Enter a valid number.").min(0, "Price cannot be negative.")),
  reorder_point: z.preprocess(normalizeNumber, z.number().finite("Enter a valid number.").int("Enter a whole number.").min(0, "Reorder point cannot be negative.")),
  is_active: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
export type ProductFormInput = z.input<typeof productFormSchema>;

export function getProductWriteValues(values: ProductFormValues, isNew: true): ProductFormValues;
export function getProductWriteValues(values: ProductFormValues, isNew: false): Omit<ProductFormValues, "stock">;
export function getProductWriteValues(values: ProductFormValues, isNew: boolean) {
  const { stock, ...details } = values;
  return isNew ? { ...details, stock } : details;
}
