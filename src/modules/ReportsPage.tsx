import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAccountingReport, getAccounts, getEmployees, getEntityData,
  getPurchaseOrders, getStockMovements,
} from "../data/api";
import type { AccountingReport, AccountRecord, EmployeeRecord, PurchaseOrderRecord, StockMovement } from "../data/api";
import type { Product, Order } from "../types";
import { formatCurrency, formatDate, formatNumber, localizeError, t } from "../i18n";
import { isDateRangeValid } from "./moduleLogic";

type Language = "en" | "fa";
type ReportKey = "trial" | "ledger" | "sales" | "stock" | "movements" | "procurement" | "hr";
type Props = { lang: Language; canManage: boolean };

const reportLabels: Record<ReportKey, string> = {
  trial: "Trial balance",
  ledger: "Account ledger",
  sales: "Sales orders",
  stock: "Stock levels",
  movements: "Stock movements",
  procurement: "Purchase orders",
  hr: "Employee directory",
};

export function ReportsPage({ lang, canManage }: Props) {
  const rtl = lang === "fa";
  const [report, setReport] = useState<ReportKey>("trial");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [account, setAccount] = useState("");
  const [filter, setFilter] = useState({ from: "", to: "", status: "", account: "" });
  const [filterError, setFilterError] = useState("");
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, enabled: canManage && (report === "trial" || report === "ledger") });
  const financialQuery = useQuery({
    queryKey: ["report-financial", filter.from, filter.to, report === "ledger" ? filter.account : ""],
    queryFn: () => getAccountingReport({
      from: filter.from || undefined,
      to: filter.to || undefined,
      account: report === "ledger" && filter.account ? Number(filter.account) : undefined,
    }),
    enabled: (report === "trial" || report === "ledger") && canManage,
  });
  const salesQuery = useQuery({
    queryKey: ["report-sales", filter],
    queryFn: () => getEntityData("sales", { from: filter.from || undefined, to: filter.to || undefined, status: filter.status || undefined }),
    enabled: report === "sales",
  });
  const stockQuery = useQuery({ queryKey: ["report-stock"], queryFn: () => getEntityData("products"), enabled: report === "stock" });
  const movementsQuery = useQuery({
    queryKey: ["report-movements", filter],
    queryFn: () => getStockMovements({ from: filter.from || undefined, to: filter.to || undefined, kind: filter.status || undefined }),
    enabled: report === "movements",
  });
  const procurementQuery = useQuery({
    queryKey: ["report-procurement", filter],
    queryFn: () => getPurchaseOrders({ from: filter.from || undefined, to: filter.to || undefined, status: filter.status || undefined }),
    enabled: report === "procurement",
  });
  const hrQuery = useQuery({
    queryKey: ["report-hr", filter],
    queryFn: () => getEmployees({ from: filter.from || undefined, to: filter.to || undefined, status: filter.status || undefined }),
    enabled: report === "hr" && canManage,
  });

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    if (!isDateRangeValid(from, to)) {
      setFilterError(t(lang, "End date must be on or after the start date."));
      return;
    }
    setFilterError("");
    setFilter({ from, to, status, account });
  };
  const resetFilters = () => {
    setFrom("");
    setTo("");
    setStatus("");
    setAccount("");
    setFilterError("");
    setFilter({ from: "", to: "", status: "", account: "" });
  };
  const exportCsv = (headers: string[], rows: (string | number)[][]) => {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexacore-${report}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const accounts: AccountRecord[] = accountsQuery.data ?? [];
  const financial: AccountingReport | undefined = financialQuery.data;
  const sales = (salesQuery.data ?? []) as Order[];
  const stock = (stockQuery.data ?? []) as Product[];
  const movements: StockMovement[] = movementsQuery.data ?? [];
  const purchaseOrders: PurchaseOrderRecord[] = procurementQuery.data ?? [];
  const employees: EmployeeRecord[] = hrQuery.data ?? [];
  const selectedQuery = report === "trial" || report === "ledger" ? financialQuery :
    report === "sales" ? salesQuery : report === "stock" ? stockQuery :
      report === "movements" ? movementsQuery : report === "procurement" ? procurementQuery : hrQuery;
  const restricted = !canManage && (report === "trial" || report === "ledger" || report === "hr");
  const busy = !restricted && selectedQuery.isPending;
  const failure = selectedQuery.error ?? (report === "trial" || report === "ledger" ? accountsQuery.error : null);

  return <section className="entity-page">
    <div className="welcome-row entity-title-row">
      <div><div className="eyebrow">{t(lang, "Workspace")} / {t(lang, "Reports")}</div><h1>{t(lang, "Reports")}</h1>
        <p>{rtl ? "گزارش‌های عملیاتی و مالی مبتنی بر داده‌های ثبت‌شده سازمان." : "Operational and financial reports from persisted organization data."}</p>
      </div>
    </div>
    <div className="filter-tabs" role="tablist" aria-label={t(lang, "Report")}>
      {(["trial", "ledger", "sales", "stock", "movements", "procurement", ...(canManage ? ["hr" as const] : [])] as ReportKey[]).map((key) =>
        <button key={key} className={`filter-tab${report === key ? " active" : ""}`} role="tab" aria-selected={report === key} onClick={() => { setReport(key); setFilterError(""); }}>{t(lang, reportLabels[key])}</button>,
      )}
    </div>
    <form className="settings-form report-filters" onSubmit={applyFilters}>
      {report !== "stock" && <>{<label className="form-label">{t(lang, "From")}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>}
        <label className="form-label">{t(lang, "To")}<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></>}
      {(report === "sales" || report === "procurement" || report === "hr") && <label className="form-label">{t(lang, "Status")}<select value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">{t(lang, "All statuses")}</option>
        {(report === "sales" ? ["pending", "paid", "cancelled"] : report === "procurement" ? ["draft", "approved", "ordered", "partially_received", "received", "rejected", "cancelled"] : ["active", "inactive"])
          .map((value) => <option key={value} value={value}>{localizedStatus(value, lang)}</option>)}
      </select></label>}
      {(report === "movements") && <label className="form-label">{t(lang, "Movement")}<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t(lang, "All statuses")}</option>{["receipt", "sale", "adjustment", "reversal"].map((value) => <option key={value} value={value}>{localizedStatus(value, lang)}</option>)}</select></label>}
      {report === "ledger" && <label className="form-label">{t(lang, "Account")}<select value={account} onChange={(event) => setAccount(event.target.value)}><option value="">{t(lang, "All accounts")}</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>}
      <button type="submit" className="button button-primary">{t(lang, "Apply filters")}</button>
      <button type="button" className="button button-secondary" onClick={resetFilters}>{t(lang, "Reset filters")}</button>
    </form>
    {filterError && <div role="alert" className="form-note">{filterError}</div>}
    {report === "hr" && !canManage && <div role="alert" className="form-note">{t(lang, "Employee reports are restricted to managers and administrators.")}</div>}
    {(report === "trial" || report === "ledger") && !canManage && <div role="alert" className="form-note">{t(lang, "Accounting reports are restricted to managers and administrators.")}</div>}
    {restricted ? null : busy ? <div className="page-loading"><div className="loading-spinner" />{t(lang, "Loading")}...</div> :
      failure ? <div role="alert" className="page-error"><strong>{t(lang, "Could not load this report.")}</strong><p>{localizeError(lang, failure.message)}</p><button className="button button-primary" onClick={() => void selectedQuery.refetch()}>{t(lang, "Try again")}</button></div> :
        <ReportTable report={report} lang={lang} financial={financial} sales={sales} stock={stock} movements={movements} purchaseOrders={purchaseOrders} employees={employees} exportCsv={exportCsv} />}
  </section>;
}

function ReportTable({ report, lang, financial, sales, stock, movements, purchaseOrders, employees, exportCsv }: {
  report: ReportKey; lang: Language; financial?: AccountingReport; sales: Order[]; stock: Product[];
  movements: StockMovement[]; purchaseOrders: PurchaseOrderRecord[]; employees: EmployeeRecord[];
  exportCsv: (headers: string[], rows: (string | number)[][]) => void;
}) {
  const headers: Record<ReportKey, string[]> = {
    trial: ["Account code", "Account name", "Account type", "Debits", "Credits", "Balance"],
    ledger: ["Date", "Reference", "Description", "Debit", "Credit"],
    sales: ["Order", "Customer", "Date", "Total", "Status"],
    stock: ["Product", "SKU", "Category", "On hand", "Reorder point", "Status"],
    movements: ["Date", "Product", "Movement", "Quantity", "Reference", "Description"],
    procurement: ["Order", "Supplier", "Date", "Status", "Received"],
    hr: ["Employee number", "Full name", "Department", "Position", "Joined", "Status"],
  };
  let rows: (string | number)[][] = [];
  let body: ReactNode;
  if (report === "trial") {
    rows = (financial?.trial_balance ?? []).map((item) => [item.account__code, item.account__name, localizedStatus(item.account__kind, lang), item.debits ?? 0, item.credits ?? 0, item.balance]);
    body = (financial?.trial_balance ?? []).map((item) => <tr key={item.account_id}><td>{item.account__code}</td><td>{item.account__name}</td><td>{localizedStatus(item.account__kind, lang)}</td><td>{formatCurrency(item.debits ?? 0, lang)}</td><td>{formatCurrency(item.credits ?? 0, lang)}</td><td>{formatCurrency(item.balance, lang)}</td></tr>);
  } else if (report === "ledger") {
    rows = (financial?.ledger ?? []).map((item) => [formatDate(item.entry__entry_date, lang), item.entry__reference, item.entry__description, item.debit, item.credit]);
    body = (financial?.ledger ?? []).map((item, index) => <tr key={`${item.entry_id}-${index}`}><td>{formatDate(item.entry__entry_date, lang)}</td><td>{item.entry__reference}</td><td>{item.entry__description}</td><td>{formatCurrency(Number(item.debit), lang)}</td><td>{formatCurrency(Number(item.credit), lang)}</td></tr>);
  } else if (report === "sales") {
    rows = sales.map((item) => [item.id, item.customer, item.dateISO ? formatDate(item.dateISO, lang) : item.date, item.total, localizedStatus(item.status, lang)]);
    body = sales.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.customer}</td><td>{item.dateISO ? formatDate(item.dateISO, lang) : item.date}</td><td>{formatCurrency(item.total, lang)}</td><td>{localizedStatus(item.status, lang)}</td></tr>);
  } else if (report === "stock") {
    const filtered = stock.filter((item) => item.status === "Low stock");
    rows = filtered.map((item) => [item.name, item.sku, item.category, item.stock, item.reorderPoint ?? 10, t(lang, item.status)]);
    body = filtered.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.sku}</td><td>{item.category}</td><td>{formatNumber(item.stock, lang)}</td><td>{formatNumber(item.reorderPoint ?? 10, lang)}</td><td>{t(lang, item.status)}</td></tr>);
  } else if (report === "movements") {
    rows = movements.map((item) => [formatDate(item.created_at, lang), item.product_name, localizedStatus(item.kind, lang), item.quantity, item.reference, item.note]);
    body = movements.map((item) => <tr key={item.id}><td>{formatDate(item.created_at, lang)}</td><td>{item.product_name}</td><td>{localizedStatus(item.kind, lang)}</td><td>{formatNumber(item.quantity, lang)}</td><td>{item.reference || "—"}</td><td>{item.note || "—"}</td></tr>);
  } else if (report === "procurement") {
    rows = purchaseOrders.map((item) => [item.number, item.supplier_name, formatDate(item.created_at, lang), localizedStatus(item.status, lang), item.lines.reduce((sum, line) => sum + line.received_quantity, 0)]);
    body = purchaseOrders.map((item) => <tr key={item.id}><td>{item.number}</td><td>{item.supplier_name}</td><td>{formatDate(item.created_at, lang)}</td><td>{localizedStatus(item.status, lang)}</td><td>{formatNumber(item.lines.reduce((sum, line) => sum + line.received_quantity, 0), lang)}</td></tr>);
  } else {
    rows = employees.map((item) => [item.employee_number, item.full_name, item.department_name, item.position_title, formatDate(item.joined_on, lang), localizedStatus(item.status, lang)]);
    body = employees.map((item) => <tr key={item.id}><td>{item.employee_number}</td><td>{item.full_name}</td><td>{item.department_name || "—"}</td><td>{item.position_title || "—"}</td><td>{formatDate(item.joined_on, lang)}</td><td>{localizedStatus(item.status, lang)}</td></tr>);
  }
  const empty = rows.length === 0;
  const translatedHeaders = headers[report].map((header) => t(lang, header));
  return <section className="panel entity-table-panel">
    <div className="panel-heading"><div><h2>{t(lang, reportLabels[report])}</h2><p>{t(lang, "Report")} · {formatNumber(rows.length, lang)}</p></div>
      {report === "trial" && financial && <span>{t(lang, "Debits")}: {formatCurrency(financial.debit_total, lang)} · {t(lang, "Credits")}: {formatCurrency(financial.credit_total, lang)}</span>}
      <button className="button button-secondary" disabled={empty} onClick={() => exportCsv(translatedHeaders, rows)}>{t(lang, "Download CSV")}</button>
    </div>
    {empty ? <div className="empty-state">{t(lang, "No data for the selected filters.")}</div> :
      <div className="table-wrap"><table><thead><tr>{translatedHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{body}</tbody></table></div>}
  </section>;
}

function localizedStatus(status: string, lang: Language): string {
  const key = status.replace(/_/g, " ").replace(/^\w/, (letter: string) => letter.toUpperCase());
  return t(lang, key);
}
