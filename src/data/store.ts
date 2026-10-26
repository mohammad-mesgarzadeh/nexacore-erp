import { getProductStockStatus } from "../types";
import type { Customer, Order, Product } from "../types";

const initialCustomers: Customer[] = [
  { id: "CUS-2041", name: "Olivia Rhye", company: "Layers", email: "olivia@layers.co", phone: "+1 555 0142", location: "San Francisco", status: "Active", joined: "Oct 12, 2024" },
  { id: "CUS-2040", name: "Phoenix Baker", company: "Catalog", email: "phoenix@catalog.com", phone: "+1 555 0187", location: "New York", status: "Active", joined: "Oct 10, 2024" },
  { id: "CUS-2039", name: "Lana Steiner", company: "Circooles", email: "lana@circooles.com", phone: "+1 555 0123", location: "London", status: "Lead", joined: "Oct 08, 2024" },
  { id: "CUS-2038", name: "Demi Wilkinson", company: "Hourglass", email: "demi@hourglass.com", phone: "+1 555 0161", location: "Chicago", status: "Active", joined: "Oct 07, 2024" },
  { id: "CUS-2037", name: "Candice Wu", company: "Command+R", email: "candice@commandr.com", phone: "+1 555 0195", location: "Austin", status: "Inactive", joined: "Oct 05, 2024" },
  { id: "CUS-2036", name: "Natali Craig", company: "Quotient", email: "natali@quotient.co", phone: "+1 555 0174", location: "Seattle", status: "Active", joined: "Oct 03, 2024" },
];

const initialOrders: Order[] = [
  { id: "ORD-3821", customer: "Olivia Rhye", date: "Oct 24, 2024", total: 2840, status: "Paid", items: 4 },
  { id: "ORD-3820", customer: "Phoenix Baker", date: "Oct 23, 2024", total: 1260, status: "Pending", items: 2 },
  { id: "ORD-3819", customer: "Lana Steiner", date: "Oct 23, 2024", total: 5420, status: "Paid", items: 7 },
  { id: "ORD-3818", customer: "Demi Wilkinson", date: "Oct 22, 2024", total: 890, status: "Overdue", items: 1 },
  { id: "ORD-3817", customer: "Candice Wu", date: "Oct 21, 2024", total: 3180, status: "Paid", items: 3 },
];

const initialProducts: Product[] = [
  { id: "PRD-1042", name: "Wireless headphones", sku: "WH-2049", category: "Electronics", stock: 124, price: 189, status: "In stock" },
  { id: "PRD-1041", name: "Leather desk mat", sku: "LD-1038", category: "Accessories", stock: 8, price: 84, status: "Low stock" },
  { id: "PRD-1040", name: "Ceramic coffee set", sku: "CC-2041", category: "Home & living", stock: 56, price: 62, status: "In stock" },
  { id: "PRD-1039", name: "Everyday backpack", sku: "EB-0912", category: "Accessories", stock: 4, price: 129, status: "Low stock" },
  { id: "PRD-1038", name: "Minimal desk lamp", sku: "DL-1184", category: "Home & living", stock: 82, price: 148, status: "In stock" },
];

function load<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(`nexacore.${key}`);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  localStorage.setItem(`nexacore.${key}`, JSON.stringify(value));
}

export const store = {
  customers: () => load("customers", initialCustomers),
  orders: () => load("orders", initialOrders),
  products: () => load("products", initialProducts),
  movements: () => load<{
    id: string;
    product?: string;
    productId?: string;
    product_name?: string;
    kind: "receipt" | "sale" | "adjustment" | "reversal";
    quantity: number;
    reference: string;
    note?: string;
    created_at?: string;
    createdAt?: string;
  }[]>("movements", []).map((item) => ({
    id: item.id,
    product: item.product ?? item.productId ?? "",
    product_name: item.product_name ?? "",
    kind: item.kind,
    quantity: item.quantity,
    reference: item.reference,
    note: item.note ?? "",
    created_at: item.created_at ?? item.createdAt ?? new Date(0).toISOString(),
  })),
  addCustomer(customer: Customer) {
    const items = [customer, ...this.customers()];
    save("customers", items);
    return items;
  },
  updateCustomer(id: string, values: Pick<Customer, "name" | "company" | "email" | "phone">) {
    const items = this.customers().map((customer) =>
      customer.id === id ? { ...customer, ...values } : customer,
    );
    save("customers", items);
    return items;
  },
  archiveCustomer(id: string) {
    const items = this.customers().map((item) => item.id === id ? { ...item, status: "Inactive" as const } : item);
    save("customers", items);
    return items;
  },
  addOrder(order: Order) {
    const items = [order, ...this.orders()];
    save("orders", items);
    return items;
  },
  addProduct(product: Product) {
    const items = [product, ...this.products()];
    save("products", items);
    return items;
  },
  saveProducts(products: Product[]) {
    save("products", products);
    return products;
  },
  archiveProduct(id: string) {
    const products = this.products().filter((product) => product.id !== id);
    save("products", products);
    return products;
  },
  recordSale(order: Order, productId: string, quantity: number) {
    const products = this.products();
    const product = products.find((item) => item.id === productId);
    if (!product) throw new Error("The selected product could not be found.");
    if (product.stock < quantity) throw new Error(`Only ${product.stock} units of ${product.name} are available.`);
    product.stock -= quantity;
    product.status = getProductStockStatus(product.stock, product.reorderPoint);
    const orders = [order, ...this.orders()];
    const movements = this.movements();
    movements.unshift({
      id: crypto.randomUUID(),
      product: productId,
      product_name: product.name,
      kind: "sale",
      quantity: -quantity,
      reference: order.id,
      note: "",
      created_at: new Date().toISOString(),
    });
    save("products", products);
    save("orders", orders);
    save("movements", movements);
    return orders;
  },
  adjustStock(values: { product: string; quantity: number; note: string }) {
    const products = this.products();
    const product = products.find((item) => item.id === values.product);
    if (!product) throw new Error("The selected product could not be found.");
    if (!Number.isInteger(values.quantity) || values.quantity === 0) throw new Error("Adjustment must be a non-zero whole number.");
    if (product.stock + values.quantity < 0) throw new Error("Stock cannot become negative.");
    product.stock += values.quantity;
    product.status = getProductStockStatus(product.stock, product.reorderPoint);
    this.saveProducts(products);
    const movement = {
      id: crypto.randomUUID(),
      product: product.id,
      product_name: product.name,
      kind: "adjustment" as const,
      quantity: values.quantity,
      reference: "",
      note: values.note,
      created_at: new Date().toISOString(),
    };
    save("movements", [movement, ...this.movements()]);
    return movement;
  },
  transitionOrder(id: string, status: "paid" | "cancelled") {
    const orders = this.orders();
    const order = orders.find((item) => item.id === id);
    if (!order) throw new Error("The selected order could not be found.");
    if (order.status !== "Pending") throw new Error("Only pending orders can be marked paid or cancelled.");
    if (status === "paid") order.status = "Paid";
    else {
      order.status = "Cancelled";
      const movements = this.movements();
      const orderSales = movements.filter((movement) => movement.kind === "sale" && movement.reference === id);
      const products = this.products();
      for (const sale of orderSales) {
        const product = products.find((item) => item.id === sale.product);
        if (!product) continue;
        const quantity = Math.abs(sale.quantity);
        product.stock += quantity;
        product.status = getProductStockStatus(product.stock, product.reorderPoint);
        movements.unshift({
          id: crypto.randomUUID(),
          product: product.id,
          product_name: product.name,
          kind: "reversal",
          quantity,
          reference: id,
          note: "Cancelled sales order",
          created_at: new Date().toISOString(),
        });
      }
      this.saveProducts(products);
      save("movements", movements);
    }
    save("orders", orders);
    return order;
  },
};
