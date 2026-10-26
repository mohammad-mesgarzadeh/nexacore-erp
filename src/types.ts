export type Customer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  status: "Active" | "Lead" | "Inactive";
  joined: string;
};

export type Order = {
  id: string;
  apiId?: string;
  customer: string;
  date: string;
  dateISO?: string;
  total: number;
  status: "Paid" | "Pending" | "Overdue" | "Cancelled";
  items: number;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  description?: string;
  unitOfMeasure?: string;
  stock: number;
  reorderPoint?: number;
  purchaseCost?: number;
  price: number;
  status: "In stock" | "Low stock" | "Out of stock";
  isActive?: boolean;
};

export type EntityType = "customer" | "order" | "product";

export function getProductStockStatus(stock: number, reorderPoint = 10): Product["status"] {
  if (stock <= 0) return "Out of stock";
  return stock <= reorderPoint ? "Low stock" : "In stock";
}
