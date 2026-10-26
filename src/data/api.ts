import { store } from "./store";
import { getProductStockStatus } from "../types";
import type { Customer, Order, Product } from "../types";
import { demoSummary } from "./demo";
import { buildReportQuery } from "./reporting";

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "");

export type DashboardData = {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  summary?: {
    revenue: number;
    orders: number;
    customers: number;
    inventory_value: number;
    pending_invoices: number;
    low_stock_products: number;
    monthly_expenses?: number;
  };
  analytics?: {
    trend: { month: string; revenue: number; expenses: number }[];
    categories: { name: string; value: number; percent: number; color: string }[];
  };
};
export type UserProfile = {
  id: number | string;
  username: string;
  email: string;
  full_name: string;
  role: "admin" | "manager" | "staff";
  organization_name: string;
  preferred_language: "en" | "fa";
  preferred_theme: "light" | "dark";
};
export type OrganizationProfile = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};
export type StockMovement = {
  id: number | string;
  product: string;
  product_name: string;
  kind: "receipt" | "sale" | "adjustment" | "reversal";
  quantity: number;
  reference: string;
  note: string;
  created_at: string;
};
export type SalesOrderDetail = {
  number: string;
  customer_name: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  items: { id: number; product_name: string; quantity: number; unit_price: number; line_total: number }[];
};
export type SupplierRecord = {
  id: number;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  status: "active" | "inactive";
};
export type DepartmentRecord = { id: number; name: string; description: string; is_active: boolean };
export type PositionRecord = { id: number; title: string; department: number | null; is_active: boolean };
export type EmployeeRecord = {
  id: number; employee_number: string; full_name: string; email: string; phone: string;
  department: number | null; department_name: string; position: number | null; position_title: string;
  joined_on: string; status: "active" | "inactive"; notes: string;
};
export type PurchaseOrderRecord = {
  id: string; number: string; supplier: number; supplier_name: string; status: string;
  expected_on: string | null; created_at: string;
  lines: { id: number; product: string; product_name: string; quantity: number; received_quantity: number; unit_cost: string }[];
};
export type AccountRecord = { id: number; code: string; name: string; kind: string; is_active: boolean };
export type ProductWriteValues = {
  name: string;
  sku: string;
  category: string;
  description: string;
  unit_of_measure: string;
  purchase_cost: number;
  price: number;
  reorder_point: number;
  is_active: boolean;
  stock: number;
};
export type JournalEntryRecord = {
  id: string; reference: string; description: string; entry_date: string; status: string;
  debit_total: string; credit_total: string;
  lines: { id: number; account: number; account_name: string; description: string; debit: string; credit: string }[];
};
export type AccountingReport = {
  trial_balance: { account_id: number; account__code: string; account__name: string; account__kind: string; debits: number; credits: number; balance: number }[];
  debit_total: number; credit_total: number;
  ledger: { entry_id: string; entry__reference: string; entry__description: string; entry__entry_date: string; entry__status: string; debit: string; credit: string }[];
};

async function listResource<T>(path: string): Promise<T[]> {
  const payload = await request<{ results: T[] }>(path);
  return payload.results;
}

export const getSuppliers = () => listResource<SupplierRecord>("/suppliers/?page_size=100&ordering=name");
export const saveSupplier = (values: Partial<SupplierRecord>, id?: number) =>
  request<SupplierRecord>(id ? `/suppliers/${id}/` : "/suppliers/", {
    method: id ? "PATCH" : "POST", body: JSON.stringify(values),
  });
export const getDepartments = () => listResource<DepartmentRecord>("/departments/?page_size=100");
export const getPositions = () => listResource<PositionRecord>("/job-positions/?page_size=100");
export const getEmployees = (filters: { from?: string; to?: string; status?: string } = {}) =>
  listResource<EmployeeRecord>(filteredPath("/employees/?page_size=100&ordering=full_name", filters));
export const saveDepartment = (values: Pick<DepartmentRecord, "name" | "description">) =>
  request<DepartmentRecord>("/departments/", { method: "POST", body: JSON.stringify(values) });
export const updateDepartment = (id: number, values: Partial<DepartmentRecord>) =>
  request<DepartmentRecord>(`/departments/${id}/`, { method: "PATCH", body: JSON.stringify(values) });
export const savePosition = (values: Pick<PositionRecord, "title" | "department">) =>
  request<PositionRecord>("/job-positions/", { method: "POST", body: JSON.stringify(values) });
export const updatePosition = (id: number, values: Partial<PositionRecord>) =>
  request<PositionRecord>(`/job-positions/${id}/`, { method: "PATCH", body: JSON.stringify(values) });
export const saveEmployee = (values: Omit<EmployeeRecord, "id" | "department_name" | "position_title">) =>
  request<EmployeeRecord>("/employees/", { method: "POST", body: JSON.stringify(values) });
export const updateEmployee = (id: number, values: Partial<EmployeeRecord>) =>
  request<EmployeeRecord>(`/employees/${id}/`, { method: "PATCH", body: JSON.stringify(values) });
export const getPurchaseOrders = (filters: { from?: string; to?: string; status?: string } = {}) =>
  listResource<PurchaseOrderRecord>(filteredPath("/purchase-orders/?page_size=100", filters));
export const createPurchaseOrder = (values: { supplier: number; expected_on?: string; lines: { product: string; quantity: number; unit_cost: string }[] }) =>
  request<PurchaseOrderRecord>("/purchase-orders/", { method: "POST", body: JSON.stringify(values) });
export const transitionPurchaseOrder = (id: string, status: string) =>
  request<PurchaseOrderRecord>(`/purchase-orders/${id}/transition/`, { method: "POST", body: JSON.stringify({ status }) });
export const receivePurchaseOrder = (id: string, lines: { order_line: number; quantity: number }[]) =>
  request<{ id: string; status: string }>(`/purchase-orders/${id}/receive/`, { method: "POST", body: JSON.stringify({ lines }) });
export const getAccounts = () => listResource<AccountRecord>("/accounts/?page_size=100");
export const createAccount = (values: Pick<AccountRecord, "code" | "name" | "kind">) =>
  request<AccountRecord>("/accounts/", { method: "POST", body: JSON.stringify(values) });
export const updateAccount = (id: number, values: Partial<Pick<AccountRecord, "code" | "name" | "kind" | "is_active">>) =>
  request<AccountRecord>(`/accounts/${id}/`, { method: "PATCH", body: JSON.stringify(values) });
export const getJournalEntries = () => listResource<JournalEntryRecord>("/journal-entries/?page_size=100");
export const createJournalEntry = (values: { reference: string; description: string; entry_date: string; lines: { account: number; description: string; debit: string; credit: string }[] }) =>
  request<JournalEntryRecord>("/journal-entries/", { method: "POST", body: JSON.stringify(values) });
export const postJournalEntry = (id: string) =>
  request<JournalEntryRecord>(`/journal-entries/${id}/post/`, { method: "POST" });
export const reverseJournalEntry = (id: string, description: string) =>
  request<JournalEntryRecord>(`/journal-entries/${id}/reverse/`, { method: "POST", body: JSON.stringify({ description }) });
export const getAccountingReport = (filters: { from?: string; to?: string; account?: number } = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, String(value));
  return request<AccountingReport>(`/accounting/reports/${query.size ? `?${query}` : ""}`);
};

function filteredPath(path: string, filters: { from?: string; to?: string; status?: string; kind?: string }) {
  const query = new URLSearchParams(path.split("?")[1]);
  const reportQuery = new URLSearchParams(buildReportQuery(filters));
  reportQuery.forEach((value, key) => query.set(key, value));
  return `${path.split("?")[0]}?${query}`;
}
type DashboardResponse = {
  summary: {
    revenue: number | string;
    orders: number;
    customers: number;
    inventory_value: number | string;
    pending_invoices: number;
    low_stock_products: number;
    monthly_expenses?: number | string;
  };
  customers: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  products: Record<string, unknown>[];
  analytics: {
    trend: { month: string; revenue: number | string; expenses: number | string }[];
    categories: { name: string; value: number | string; percent: number; color: string }[];
  };
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function orderStatus(value: unknown): Order["status"] {
  const status = titleCase(String(value));
  if (status !== "Paid" && status !== "Pending" && status !== "Overdue" && status !== "Cancelled") {
    throw new Error(`Unexpected order status: ${status}`);
  }
  return status;
}

export class ApiRequestError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error("The API is not configured.");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("nexacore.access") ?? ""}`,
    ...init.headers,
  };
  const send = () => fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
  });
  let response = await send();
  if (response.status === 401) {
    const refreshToken = localStorage.getItem("nexacore.refresh");
    if (refreshToken) {
      const refreshResponse = await fetch(`${apiUrl}/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json() as { access: string; refresh?: string };
        localStorage.setItem("nexacore.access", tokens.access);
        if (tokens.refresh) localStorage.setItem("nexacore.refresh", tokens.refresh);
        headers.Authorization = `Bearer ${tokens.access}`;
        response = await send();
      } else {
        localStorage.removeItem("nexacore.access");
        localStorage.removeItem("nexacore.refresh");
        window.dispatchEvent(new Event("nexacore:signout"));
      }
    }
  }
  if (!response.ok) {
    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      body = null;
    }
    const fieldErrors: Record<string, string> = {};
    for (const [key, value] of Object.entries(body ?? {})) {
      if (key === "detail" || key === "non_field_errors") continue;
      const message = Array.isArray(value) ? value.find((item) => typeof item === "string") : value;
      if (typeof message === "string") fieldErrors[key] = message;
    }
    const detail = body?.detail ?? body?.non_field_errors ??
      Object.values(fieldErrors)[0] ?? `Request failed (${response.status})`;
    throw new ApiRequestError(String(Array.isArray(detail) ? detail[0] : detail), fieldErrors);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function mapCustomer(customer: Record<string, unknown>): Customer {
  const status = titleCase(String(customer.status));
  if (status !== "Active" && status !== "Lead" && status !== "Inactive") {
    throw new Error(`Unexpected customer status: ${status}`);
  }
  return {
    id: String(customer.id),
    name: String(customer.name),
    company: String(customer.company),
    email: String(customer.email),
    phone: String(customer.phone ?? ""),
    location: String(customer.location ?? ""),
    status,
    joined: new Date(String(customer.created_at ?? customer.joined)).toLocaleDateString(),
  };
}

function mapProduct(product: Record<string, unknown>): Product {
  const stock = Number(product.stock);
  const reorderPoint = Number(product.reorder_point ?? 10);
  return {
    id: String(product.id),
    name: String(product.name),
    sku: String(product.sku),
    category: String(product.category),
    description: String(product.description ?? ""),
    unitOfMeasure: String(product.unit_of_measure ?? "unit"),
    stock,
    reorderPoint,
    purchaseCost: Number(product.purchase_cost ?? 0),
    price: Number(product.price),
    status: getProductStockStatus(stock, reorderPoint),
    isActive: Boolean(product.is_active ?? true),
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  if (apiUrl) {
    const payload = await request<DashboardResponse>("/dashboard/");
    return {
      summary: {
        ...payload.summary,
        revenue: Number(payload.summary.revenue),
        inventory_value: Number(payload.summary.inventory_value),
        monthly_expenses: Number(payload.summary.monthly_expenses ?? 0),
      },
      customers: payload.customers.map(mapCustomer),
      orders: payload.orders.map((order: Record<string, unknown>) => ({
        id: String(order.number),
        apiId: String(order.id),
        customer: String(order.customer__name),
        date: new Date(String(order.created_at)).toLocaleDateString(),
        dateISO: String(order.created_at),
        total: Number(order.total),
        status: orderStatus(order.status),
        items: Number(order.items_count ?? 0),
      })),
      products: payload.products.map(mapProduct),
      analytics: {
        trend: payload.analytics.trend.map((item) => ({
          month: item.month,
          revenue: Number(item.revenue),
          expenses: Number(item.expenses),
        })),
        categories: payload.analytics.categories.map((item) => ({
          ...item,
          value: Number(item.value),
        })),
      },
    };
  }
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  return {
    customers: store.customers(),
    orders: store.orders(),
    products: store.products(),
    summary: {
      revenue: demoSummary.revenue,
      orders: demoSummary.orders + store.orders().length,
      customers: demoSummary.customers + store.customers().length,
      inventory_value: demoSummary.inventoryValue + store.products().reduce((sum, product) => sum + product.price * product.stock, 0),
      pending_invoices: demoSummary.pendingInvoices,
      low_stock_products: store.products().filter((product) => product.status === "Low stock").length,
      monthly_expenses: demoSummary.monthlyExpenses,
    },
  };
}

export async function getEntityData(
  kind: "customers" | "sales" | "products" | "inventory",
  filters: { from?: string; to?: string; status?: string } = {},
) {
  if (!apiUrl) {
    if (kind === "customers") return store.customers();
    if (kind === "sales") return store.orders();
    return store.products();
  }

  const endpoint = kind === "customers" ? "customers" : kind === "sales" ? "sales-orders" : "products";
  const path = filteredPath(`/${endpoint}/?page_size=100`, filters);
  const payload = await request<{ results: Record<string, unknown>[] }>(path);
  if (kind === "customers") return payload.results.map(mapCustomer);
  if (kind === "sales") return payload.results.map((order) => ({
    id: String(order.number),
    apiId: String(order.id),
    customer: String(order.customer_name ?? order.customer),
    date: new Date(String(order.created_at)).toLocaleDateString(),
    dateISO: String(order.created_at),
    total: Number(order.total),
    status: orderStatus(order.status),
    items: Array.isArray(order.items) ? order.items.length : 0,
  }));
  return payload.results.map(mapProduct);
}

export async function getStockMovements(filters: { from?: string; to?: string; kind?: string } = {}): Promise<StockMovement[]> {
  if (!apiUrl) return store.movements().map((movement) => ({
    ...movement,
    product_name: store.products().find((product) => product.id === movement.product)?.name ?? "Archived product",
    created_at: movement.created_at,
  }));
  const payload = await request<{ results: StockMovement[] }>(filteredPath("/stock-movements/?page_size=100", filters));
  return payload.results;
}

export async function adjustStock(values: { product: string; quantity: number; note: string }) {
  if (!apiUrl) return store.adjustStock(values);
  return request<StockMovement>("/stock-movements/adjust/", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export async function transitionSalesOrder(id: string, status: "paid" | "cancelled") {
  if (!apiUrl) return store.transitionOrder(id, status);
  return request(`/sales-orders/${id}/transition/`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function getSalesOrderDetails(id: string): Promise<SalesOrderDetail> {
  if (!apiUrl) {
    const order = store.orders().find((item) => item.id === id);
    if (!order) throw new Error("The selected order could not be found.");
    return {
      number: order.id,
      customer_name: order.customer,
      status: order.status,
      subtotal: order.total,
      discount: 0,
      tax: 0,
      total: order.total,
      items: [],
    };
  }
  const order = await request<Record<string, unknown>>(`/sales-orders/${id}/`);
  return {
    number: String(order.number),
    customer_name: String(order.customer_name),
    status: titleCase(String(order.status)),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    tax: Number(order.tax),
    total: Number(order.total),
    items: Array.isArray(order.items) ? order.items.map((item) => {
      const line = item as Record<string, unknown>;
      return {
        id: Number(line.id),
        product_name: String(line.product_name),
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
        line_total: Number(line.line_total),
      };
    }) : [],
  };
}

const demoProfileKey = "nexacore.demo.profile";
export async function getUserProfile(): Promise<UserProfile> {
  if (apiUrl) return request<UserProfile>("/auth/profile/");
  const stored = localStorage.getItem(demoProfileKey);
  if (stored) return JSON.parse(stored) as UserProfile;
  return {
    id: "demo",
    username: "james",
    email: "james@nexacore.io",
    full_name: "James Dean",
    role: "admin",
    organization_name: localStorage.getItem("nexacore.demo.organization") ?? "Northstar Studio",
    preferred_language: (localStorage.getItem("nexacore.lang") as UserProfile["preferred_language"]) || "en",
    preferred_theme: (localStorage.getItem("nexacore.theme") as UserProfile["preferred_theme"]) || "light",
  };
}

export async function updateUserProfile(values: Partial<Pick<UserProfile, "full_name" | "preferred_language" | "preferred_theme">>) {
  if (apiUrl) return request<UserProfile>("/auth/profile/", { method: "PATCH", body: JSON.stringify(values) });
  const current = await getUserProfile();
  const next = { ...current, ...values };
  localStorage.setItem(demoProfileKey, JSON.stringify(next));
  localStorage.setItem("nexacore.lang", next.preferred_language);
  localStorage.setItem("nexacore.theme", next.preferred_theme);
  return next;
}

export async function changePassword(values: { current_password: string; new_password: string; confirm_password: string }) {
  if (!apiUrl) throw new Error("Password changes require a connected account.");
  return request<{ detail: string }>("/auth/password/", { method: "POST", body: JSON.stringify(values) });
}

const demoOrganizationKey = "nexacore.demo.organization";
export async function getOrganizationProfile(): Promise<OrganizationProfile> {
  if (apiUrl) return request<OrganizationProfile>("/organization/");
  const name = localStorage.getItem(demoOrganizationKey) ?? "Northstar Studio";
  return { id: "demo", name, slug: "northstar-studio", created_at: new Date().toISOString() };
}

export async function updateOrganizationProfile(name: string): Promise<OrganizationProfile> {
  if (apiUrl) return request<OrganizationProfile>("/organization/", { method: "PATCH", body: JSON.stringify({ name }) });
  localStorage.setItem(demoOrganizationKey, name);
  return getOrganizationProfile();
}

export async function authenticate(username: string, password: string) {
  if (!apiUrl) throw new Error("The API is not configured.");
  const response = await fetch(`${apiUrl}/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("Username or password is incorrect.");
  return response.json() as Promise<{ access: string; refresh: string }>;
}

export type RegistrationValues = {
  full_name: string;
  email: string;
  username: string;
  organization_name: string;
  password: string;
  confirm_password: string;
};

export class RegistrationRequestError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Partial<Record<keyof RegistrationValues, string>> = {},
  ) {
    super(message);
    this.name = "RegistrationRequestError";
  }
}

export async function registerAccount(values: RegistrationValues): Promise<{ detail: string }> {
  if (!apiUrl) throw new RegistrationRequestError("Registration is unavailable because the API is not configured.");
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
  } catch {
    throw new RegistrationRequestError("Could not reach the registration service. Check your connection and try again.");
  }

  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const fieldErrors: RegistrationRequestError["fieldErrors"] = {};
    for (const key of ["full_name", "email", "username", "organization_name", "password", "confirm_password"] as const) {
      const messages = body[key];
      if (Array.isArray(messages) && typeof messages[0] === "string") fieldErrors[key] = messages[0];
    }
    const nonFieldErrors = body.non_field_errors;
    const detail = typeof body.detail === "string"
      ? body.detail
      : Array.isArray(nonFieldErrors) && typeof nonFieldErrors[0] === "string"
        ? nonFieldErrors[0]
        : "Please review the form and try again.";
    throw new RegistrationRequestError(detail, fieldErrors);
  }
  return body as { detail: string };
}

export async function createCustomer(values: Pick<Customer, "name" | "company" | "email" | "phone">) {
  if (!apiUrl) return store.addCustomer({
    ...values,
    id: `CUS-${Math.floor(2000 + Math.random() * 8000)}`,
    location: "New York",
    status: "Active",
    joined: new Date().toLocaleDateString(),
  });
  return request("/customers/", { method: "POST", body: JSON.stringify(values) });
}

export async function updateCustomer(id: string, values: Pick<Customer, "name" | "company" | "email" | "phone">) {
  if (!apiUrl) return store.updateCustomer(id, values);
  return request(`/customers/${id}/`, { method: "PATCH", body: JSON.stringify(values) });
}

export async function createProduct(values: ProductWriteValues) {
  if (!apiUrl) return store.addProduct({
    name: values.name,
    sku: values.sku,
    category: values.category,
    description: values.description,
    unitOfMeasure: values.unit_of_measure,
    purchaseCost: values.purchase_cost,
    price: values.price,
    stock: values.stock,
    reorderPoint: values.reorder_point,
    isActive: values.is_active,
    id: `PRD-${Math.floor(1000 + Math.random() * 8000)}`,
    status: getProductStockStatus(values.stock, values.reorder_point),
  });
  return request("/products/", { method: "POST", body: JSON.stringify(values) });
}

export async function updateProduct(id: string, values: Omit<ProductWriteValues, "stock">) {
  if (!apiUrl) {
    const products = store.products().map((product) => product.id === id
      ? { ...product, ...mapProductWriteValues(values), status: getProductStockStatus(product.stock, values.reorder_point) }
      : product);
    store.saveProducts(products);
    return products;
  }
  return request(`/products/${id}/`, { method: "PATCH", body: JSON.stringify(values) });
}

function mapProductWriteValues(values: Omit<ProductWriteValues, "stock">) {
  return {
    name: values.name,
    sku: values.sku,
    category: values.category,
    description: values.description,
    unitOfMeasure: values.unit_of_measure,
    purchaseCost: values.purchase_cost,
    price: values.price,
    reorderPoint: values.reorder_point,
    isActive: values.is_active,
  };
}

export async function createSalesOrder(values: { customer: string; product: string; quantity: number; unit_price: number }) {
  if (!apiUrl) {
    const customers = store.customers();
    const product = store.products().find((item) => item.id === values.product);
    if (!product) throw new Error("The selected product could not be found.");
    const created: Order = {
      id: `ORD-${Math.floor(3000 + Math.random() * 6000)}`,
      customer: customers.find((customer) => customer.id === values.customer)?.name ?? values.customer,
      date: new Date().toLocaleDateString(),
      total: values.quantity * product.price,
      status: "Pending",
      items: 1,
    };
    return store.recordSale(created, values.product, values.quantity);
  }
  return request("/sales-orders/", {
    method: "POST",
    body: JSON.stringify({
      customer: values.customer,
      discount: 0,
      lines: [{ product: values.product, quantity: values.quantity }],
    }),
  });
}

export async function deleteCustomer(id: string) {
  if (!apiUrl) return store.archiveCustomer(id);
  return request(`/customers/${id}/`, { method: "DELETE" });
}

export async function deleteProduct(id: string) {
  if (!apiUrl) return store.archiveProduct(id);
  return request(`/products/${id}/`, { method: "DELETE" });
}

export async function setProductActive(id: string, isActive: boolean) {
  if (!apiUrl) {
    const products = store.products().map((product) => product.id === id ? { ...product, isActive } : product);
    store.saveProducts(products);
    return products;
  }
  return request(`/products/${id}/`, { method: "PATCH", body: JSON.stringify({ is_active: isActive }) });
}

export const mockDataMode = !apiUrl;
