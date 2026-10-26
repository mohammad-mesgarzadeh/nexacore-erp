import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccount, createJournalEntry, createPurchaseOrder, getAccountingReport, getAccounts,
  getDepartments, getEmployees, getEntityData, getJournalEntries, getPositions, getPurchaseOrders,
  getSuppliers, postJournalEntry, receivePurchaseOrder, reverseJournalEntry, saveDepartment,
  saveEmployee, savePosition, saveSupplier, transitionPurchaseOrder, updateDepartment,
  updateAccount, updateEmployee, updatePosition,
} from "../data/api";
import type { AccountRecord, DepartmentRecord, EmployeeRecord, JournalEntryRecord, PositionRecord, PurchaseOrderRecord, SupplierRecord } from "../data/api";
import type { Product } from "../types";
import { formatCurrency, formatDate, formatNumber, localizeError, t } from "../i18n";
import { getJournalLineError, getJournalTotals } from "./moduleLogic";

type Module = "hr" | "suppliers" | "procurement" | "accounting";
type Props = { module: Module; lang: "en" | "fa"; canManage: boolean; notify: (message: string) => void; search: string };
type FormEvent = React.FormEvent<HTMLFormElement>;

const labels: Record<Module, { title: string; subtitle: string }> = {
  hr: { title: "Human resources", subtitle: "Manage organization departments, positions, and employee records." },
  suppliers: { title: "Suppliers", subtitle: "Maintain supplier contacts and preserve purchase history." },
  procurement: { title: "Procurement", subtitle: "Create purchase orders, approve them, and receive stock into inventory." },
  accounting: { title: "Accounting", subtitle: "Maintain accounts and post balanced, auditable journal entries." },
};

export function OperationalModulePage({ module, lang, canManage, notify, search }: Props) {
  const tx = (key: string) => t(lang, key);
  const today = new Date();
  const todayString = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const monthStart = `${todayString.slice(0, 8)}01`;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(null);
  const [editingPositionId, setEditingPositionId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [positionDepartment, setPositionDepartment] = useState("");
  const [employee, setEmployee] = useState({ employee_number: "", full_name: "", email: "", phone: "", department: "", position: "", joined_on: new Date().toISOString().slice(0, 10) });
  const [po, setPo] = useState({ supplier: "", product: "", quantity: "1", unit_cost: "", expected_on: "" });
  const [account, setAccount] = useState({ code: "", name: "", kind: "asset" });
  const [entry, setEntry] = useState({ reference: "", description: "", entry_date: new Date().toISOString().slice(0, 10), debit_account: "", credit_account: "", amount: "" });
  const [journalLines, setJournalLines] = useState([
    { account: "", description: "", debit: "", credit: "" },
    { account: "", description: "", debit: "", credit: "" },
  ]);
  const [reportFilter, setReportFilter] = useState<{ from?: string; to?: string; account?: number }>({ from: monthStart, to: todayString });
  const [reportDates, setReportDates] = useState({ from: monthStart, to: todayString, account: "" });

  const active = !((module === "hr" || module === "accounting") && !canManage);
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers, enabled: active && (module === "suppliers" || module === "procurement") });
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: getDepartments, enabled: active && module === "hr" });
  const positionsQuery = useQuery({ queryKey: ["positions"], queryFn: getPositions, enabled: active && module === "hr" });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => getEmployees(), enabled: active && module === "hr" });
  const ordersQuery = useQuery({ queryKey: ["purchase-orders"], queryFn: () => getPurchaseOrders(), enabled: active && (module === "procurement" || module === "suppliers") });
  const productsQuery = useQuery({ queryKey: ["entity", "products"], queryFn: () => getEntityData("products"), enabled: active && module === "procurement" });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, enabled: active && module === "accounting" });
  const entriesQuery = useQuery({ queryKey: ["journal-entries"], queryFn: getJournalEntries, enabled: active && module === "accounting" });
  const reportQuery = useQuery({ queryKey: ["accounting-report", reportFilter], queryFn: () => getAccountingReport(reportFilter), enabled: active && module === "accounting" });
  const loading = [
    module === "suppliers" && (suppliersQuery.isPending || ordersQuery.isPending),
    module === "hr" && (departmentsQuery.isPending || positionsQuery.isPending || employeesQuery.isPending),
    module === "procurement" && (suppliersQuery.isPending || ordersQuery.isPending || productsQuery.isPending),
    module === "accounting" && (accountsQuery.isPending || entriesQuery.isPending || reportQuery.isPending),
  ].some(Boolean);
  const failed = [
    module === "suppliers" && (suppliersQuery.error || ordersQuery.error),
    module === "hr" && (departmentsQuery.error || positionsQuery.error || employeesQuery.error),
    module === "procurement" && (suppliersQuery.error || ordersQuery.error || productsQuery.error),
    module === "accounting" && (accountsQuery.error || entriesQuery.error || reportQuery.error),
  ].find(Boolean);
  const data = module === "suppliers" ? suppliersQuery.data :
    module === "hr" ? employeesQuery.data :
      module === "procurement" ? ordersQuery.data : entriesQuery.data;
  const filtered = (data ?? []).filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase()));
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [module === "hr" ? "employees" : module === "suppliers" ? "suppliers" : module === "procurement" ? "purchase-orders" : "journal-entries"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["accounting-report"] }),
      queryClient.invalidateQueries({ queryKey: ["entity", "products"] }),
    ]);
  };
  const run = async (operation: () => Promise<unknown>, success: string) => {
    setError("");
    setSaving(true);
    try {
      await operation();
      setForm(false);
      setEditingEmployeeId(null);
      setEditingSupplierId(null);
      setEditingDepartmentId(null);
      setEditingPositionId(null);
      setEditingAccountId(null);
      notify(tx(success));
      await refresh();
    } catch (failure) {
      setError(localizeError(lang, failure instanceof Error ? failure.message : tx("The request could not be completed.")));
    } finally {
      setSaving(false);
    }
  };
  const field = (label: string, value: string, onChange: (value: string) => void, type = "text", required = true) =>
    <label className="form-label">{tx(label)}<input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
  const select = (label: string, value: string, onChange: (value: string) => void, options: { value: string; label: string }[]) =>
    <label className="form-label">{tx(label)}<select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">{tx("Select...")}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  const heading = { title: tx(labels[module].title), subtitle: tx(labels[module].subtitle) };
  const products = (productsQuery.data ?? []).filter((item): item is Product => "sku" in item);
  const departments: DepartmentRecord[] = departmentsQuery.data ?? [];
  const positions: PositionRecord[] = positionsQuery.data ?? [];
  const suppliers: SupplierRecord[] = suppliersQuery.data ?? [];
  const accounts: AccountRecord[] = accountsQuery.data ?? [];
  const entries: JournalEntryRecord[] = entriesQuery.data ?? [];
  const orders: PurchaseOrderRecord[] = ordersQuery.data ?? [];
  const employees: EmployeeRecord[] = employeesQuery.data ?? [];
  const trialLines = reportQuery.data?.trial_balance ?? [];
  const assetBalance = trialLines.filter((line) => line.account__kind === "asset").reduce((sum, line) => sum + Number(line.balance), 0);
  const periodIncome = trialLines.filter((line) => line.account__kind === "revenue").reduce((sum, line) => sum - Number(line.balance), 0);
  const periodExpenses = trialLines.filter((line) => line.account__kind === "expense").reduce((sum, line) => sum + Number(line.balance), 0);

  if (!active) return <section className="panel preference-panel"><h1>{heading.title}</h1><div role="alert" className="form-note">{tx("This module is restricted to managers and administrators.")}</div></section>;
  if (loading) return <div className="page-loading"><div className="loading-spinner" />{tx("Loading")} {heading.title.toLowerCase()}...</div>;
  if (failed) return <div className="page-error"><strong>{tx("Could not load")} {heading.title.toLowerCase()}</strong><p>{failed instanceof Error ? localizeError(lang, failed.message) : tx("The server returned an error.")}</p><button className="button button-primary" onClick={() => void refresh()}>{tx("Try again")}</button></div>;

  const submitDepartment = (event: FormEvent) => {
    event.preventDefault();
    const values = { name: departmentName, description: "" };
    void run(() => editingDepartmentId ? updateDepartment(editingDepartmentId, values) : saveDepartment(values), editingDepartmentId ? "Department updated." : "Department created.");
  };
  const submitPosition = (event: FormEvent) => {
    event.preventDefault();
    const values = { title: positionTitle, department: positionDepartment ? Number(positionDepartment) : null };
    void run(() => editingPositionId ? updatePosition(editingPositionId, values) : savePosition(values), editingPositionId ? "Position updated." : "Position created.");
  };
  const submitEmployee = (event: FormEvent) => {
    event.preventDefault();
    const values = {
      employee_number: employee.employee_number, full_name: employee.full_name, email: employee.email, phone: employee.phone,
      department: employee.department ? Number(employee.department) : null, position: employee.position ? Number(employee.position) : null,
      joined_on: employee.joined_on, status: "active", notes: "",
    } as const;
    void run(() => editingEmployeeId ? updateEmployee(editingEmployeeId, values) : saveEmployee(values), editingEmployeeId ? "Employee updated." : "Employee created.");
  };
  const submitSupplier = (event: FormEvent) => {
    event.preventDefault();
    void run(() => saveSupplier({ name: supplierName, contact_name: contactName, email, phone }, editingSupplierId ?? undefined), editingSupplierId ? "Supplier updated." : "Supplier created.");
  };
  const submitPo = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPurchaseOrder({
      supplier: Number(po.supplier), expected_on: po.expected_on || undefined,
      lines: [{ product: po.product, quantity: Number(po.quantity), unit_cost: po.unit_cost }],
    }), "Draft purchase order created.");
  };
  const submitAccount = (event: FormEvent) => {
    event.preventDefault();
    void run(() => editingAccountId ? updateAccount(editingAccountId, account) : createAccount(account), editingAccountId ? "Account updated." : "Account created.");
  };
  const submitEntry = (event: FormEvent) => {
    event.preventDefault();
    const lineError = getJournalLineError(journalLines);
    if (lineError) return setError(tx(lineError));
    void run(() => createJournalEntry({
      reference: entry.reference, description: entry.description, entry_date: entry.entry_date,
      lines: journalLines.map((line) => ({
        account: Number(line.account),
        description: line.description || entry.description,
        debit: line.debit || "0",
        credit: line.credit || "0",
      })),
    }), "Draft journal entry created.");
  };
  const actions = <div className="page-actions">
    {canManage && <button className="button button-primary" onClick={() => { setError(""); setForm((current) => !current); }}>{form ? tx("Close form") : module === "hr" ? tx("Add employee / department") : module === "suppliers" ? tx("Add supplier") : module === "procurement" ? tx("New purchase order") : tx("New account / journal")}</button>}
  </div>;

  return <section className="entity-page">
    <div className="welcome-row entity-title-row"><div><div className="eyebrow">{tx("Organization")} / {heading.title}</div><h1>{heading.title}</h1><p>{heading.subtitle}</p></div>{actions}</div>
    {module === "hr" && canManage && <div className="entity-metrics"><div className="entity-metric"><span>{tx("Employees")}</span><strong>{formatNumber(employees.length, lang)}</strong><small>{tx("Organization directory")}</small></div><div className="entity-metric"><span>{tx("Active employees")}</span><strong>{formatNumber(employees.filter((item) => item.status === "active").length, lang)}</strong><small>{tx("Active structure")}</small></div><div className="entity-metric"><span>{tx("Inactive employees")}</span><strong>{formatNumber(employees.filter((item) => item.status === "inactive").length, lang)}</strong><small>{tx("Positions")}: {formatNumber(positions.length, lang)} · {tx("Departments")}: {formatNumber(departments.length, lang)}</small></div></div>}
    {module === "suppliers" && <div className="entity-metrics"><div className="entity-metric"><span>{tx("Suppliers")}</span><strong>{suppliers.length}</strong><small>{tx("All supplier records")}</small></div><div className="entity-metric"><span>{tx("Active")}</span><strong>{suppliers.filter((item) => item.status === "active").length}</strong><small>{tx("Available for purchasing")}</small></div></div>}
    {module === "procurement" && <div className="entity-metrics"><div className="entity-metric"><span>{tx("Purchase orders")}</span><strong>{orders.length}</strong><small>{tx("Persisted orders")}</small></div><div className="entity-metric"><span>{tx("Awaiting approval")}</span><strong>{orders.filter((item) => item.status === "draft").length}</strong><small>{tx("Drafts")}</small></div><div className="entity-metric"><span>{tx("Awaiting receipt")}</span><strong>{orders.filter((item) => ["ordered", "partially_received"].includes(item.status)).length}</strong><small>{tx("Inventory not fully received")}</small></div></div>}
    {module === "accounting" && <div className="entity-metrics">
      <div className="entity-metric"><span>{tx("Asset account balances")}</span><strong>{formatCurrency(assetBalance, lang)}</strong><small>{tx("Current period")}</small></div>
      <div className="entity-metric"><span>{tx("Total debits")}</span><strong>{formatCurrency(Number(reportQuery.data?.debit_total ?? 0), lang)}</strong><small>{tx("Posted entries")}</small></div>
      <div className="entity-metric"><span>{tx("Total credits")}</span><strong>{formatCurrency(Number(reportQuery.data?.credit_total ?? 0), lang)}</strong><small>{tx("Posted entries")}</small></div>
      <div className="entity-metric"><span>{tx("Posted entries")}</span><strong>{formatNumber(entries.filter((item) => item.status !== "draft").length, lang)}</strong><small>{tx("Immutable financial history")}</small></div>
      <div className="entity-metric"><span>{tx("Draft entries")}</span><strong>{formatNumber(entries.filter((item) => item.status === "draft").length, lang)}</strong><small>{tx("Journal entries")}</small></div>
      <div className="entity-metric"><span>{tx("Income this period")}</span><strong>{formatCurrency(periodIncome, lang)}</strong><small>{tx("Expenses this period")}: {formatCurrency(periodExpenses, lang)}</small></div>
    </div>}
    {form && canManage && <section className="panel preference-panel">
      <div className="panel-heading"><div><h2>{module === "hr" ? tx("Add employee or department") : module === "suppliers" ? tx("Create supplier") : module === "procurement" ? tx("Create draft purchase order") : tx("Add account or journal entry")}</h2><p>{tx("Input is validated by the server and scoped to your organization.")}</p></div></div>
      {module === "hr" && <div className="settings-grid">
        <form className="settings-form" onSubmit={submitDepartment}>{field("Department name", departmentName, setDepartmentName)}<button className="button button-secondary" disabled={saving}>{tx(editingDepartmentId ? "Save department" : "Add department")}</button></form>
        <form className="settings-form" onSubmit={submitPosition}>{field("Position title", positionTitle, setPositionTitle)}{select("Department", positionDepartment, setPositionDepartment, departments.filter((item) => item.is_active).map((item) => ({ value: String(item.id), label: item.name })))}<button className="button button-secondary" disabled={saving}>{tx(editingPositionId ? "Save position" : "Add position")}</button></form>
        <form className="settings-form" onSubmit={submitEmployee}>
          {field("Employee number", employee.employee_number, (value) => setEmployee({ ...employee, employee_number: value }))}
          {field("Full name", employee.full_name, (value) => setEmployee({ ...employee, full_name: value }))}
          {field("Email", employee.email, (value) => setEmployee({ ...employee, email: value }), "email", false)}
          {field("Phone", employee.phone, (value) => setEmployee({ ...employee, phone: value }), "tel", false)}
          {select("Department", employee.department, (value) => setEmployee({ ...employee, department: value, position: "" }), departments.filter((item) => item.is_active).map((item) => ({ value: String(item.id), label: item.name })))}
          {select("Position", employee.position, (value) => setEmployee({ ...employee, position: value }), positions.filter((item) => item.is_active && (!item.department || String(item.department) === employee.department)).map((item) => ({ value: String(item.id), label: item.title })))}
          {field("Joined on", employee.joined_on, (value) => setEmployee({ ...employee, joined_on: value }), "date")}
          <button className="button button-primary" disabled={saving}>{editingEmployeeId ? tx("Save employee") : tx("Create employee")}</button>
        </form>
      </div>}
      {module === "suppliers" && <form className="settings-form" onSubmit={submitSupplier}>
        {field("Business name", supplierName, setSupplierName)}{field("Contact person", contactName, setContactName, "text", false)}
        {field("Email", email, setEmail, "email", false)}{field("Phone", phone, setPhone, "tel", false)}
        <button className="button button-primary" disabled={saving}>{editingSupplierId ? tx("Save supplier") : tx("Create supplier")}</button>
      </form>}
      {module === "procurement" && <form className="settings-form" onSubmit={submitPo}>
        {select("Supplier", po.supplier, (value) => setPo({ ...po, supplier: value }), suppliers.filter((item) => item.status === "active").map((item) => ({ value: String(item.id), label: item.name })))}
        <label className="form-label">{tx("Product")}<select required value={po.product} onChange={(event) => {
          const selected = products.find((item) => item.id === event.target.value);
          setPo({ ...po, product: event.target.value, unit_cost: String(selected?.purchaseCost ?? 0) });
        }}><option value="">{tx("Select...")}</option>{products.filter((item) => item.isActive !== false).map((item) => <option key={item.id} value={item.id}>{item.name} ({formatNumber(item.stock, lang)} {tx("On hand")})</option>)}</select></label>
        {field("Quantity", po.quantity, (value) => setPo({ ...po, quantity: value }), "number")}
        {field("Unit cost", po.unit_cost, (value) => setPo({ ...po, unit_cost: value }), "number")}
        {field("Expected delivery", po.expected_on, (value) => setPo({ ...po, expected_on: value }), "date", false)}
        <button className="button button-primary" disabled={saving}>{tx("Create draft purchase order")}</button>
      </form>}
      {module === "accounting" && <div className="settings-grid">
        <form className="settings-form" onSubmit={submitAccount}>
          {field("Account code", account.code, (value) => setAccount({ ...account, code: value }))}
          {field("Account name", account.name, (value) => setAccount({ ...account, name: value }))}
          {select("Account type", account.kind, (value) => setAccount({ ...account, kind: value }), ["asset", "liability", "equity", "revenue", "expense"].map((value) => ({ value, label: tx(value.charAt(0).toUpperCase() + value.slice(1)) })))}
          <button className="button button-secondary" disabled={saving}>{tx(editingAccountId ? "Save" : "Add account")}</button>
        </form>
        <form className="settings-form" onSubmit={submitEntry}>
          {field("Reference", entry.reference, (value) => setEntry({ ...entry, reference: value }))}
          {field("Description", entry.description, (value) => setEntry({ ...entry, description: value }))}
          {field("Entry date", entry.entry_date, (value) => setEntry({ ...entry, entry_date: value }), "date")}
          {journalLines.map((line, index) => <div className="settings-grid" key={index}>
            {select("Account", line.account, (value) => setJournalLines((current) => current.map((item, i) => i === index ? { ...item, account: value } : item)), accounts.filter((item) => item.is_active).map((item) => ({ value: String(item.id), label: `${item.code} · ${item.name}` })))}
            {field("Line description", line.description, (value) => setJournalLines((current) => current.map((item, i) => i === index ? { ...item, description: value } : item)), "text", false)}
            {field("Debit", line.debit, (value) => setJournalLines((current) => current.map((item, i) => i === index ? { ...item, debit: value, credit: value ? "" : item.credit } : item)), "number", false)}
            {field("Credit", line.credit, (value) => setJournalLines((current) => current.map((item, i) => i === index ? { ...item, credit: value, debit: value ? "" : item.debit } : item)), "number", false)}
            {journalLines.length > 2 && <button type="button" className="button button-secondary" onClick={() => setJournalLines((current) => current.filter((_, i) => i !== index))}>{tx("Remove line")}</button>}
          </div>)}
          <button type="button" className="button button-secondary" onClick={() => setJournalLines((current) => [...current, { account: "", description: "", debit: "", credit: "" }])}>{tx("Add line")}</button>
          <div className="form-note">{tx("Debit total")}: {formatCurrency(getJournalTotals(journalLines).debits, lang)} · {tx("Credit total")}: {formatCurrency(getJournalTotals(journalLines).credits, lang)} · {tx("Difference")}: {formatCurrency(getJournalTotals(journalLines).difference, lang)} · {tx(getJournalTotals(journalLines).difference === 0 ? "Balanced" : "Unbalanced")}</div>
          <button className="button button-primary" disabled={saving}>{tx("Save balanced draft")}</button>
        </form>
      </div>}
      {error && <div role="alert" className="login-error settings-error">{localizeError(lang, error)}{lang === "fa" && error !== localizeError(lang, error) && <details><summary>{tx("Technical details")}</summary>{error}</details>}</div>}
    </section>}
    {module === "hr" && <div className="panel entity-table-panel"><div className="panel-heading"><div><h2>{tx("Employee directory")}</h2><p>{tx("Sensitive employee records are only available to managers.")}</p></div></div>
      {departments.length > 0 && <div className="table-wrap"><table><thead><tr><th>{tx("Department")}</th><th>{tx("Description")}</th><th>{tx("Status")}</th><th>{tx("Action")}</th></tr></thead><tbody>{departments.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.description || "—"}</td><td>{tx(item.is_active ? "Active" : "Inactive")}</td><td>{canManage && <><button className="button button-secondary small-button" onClick={() => { setEditingDepartmentId(item.id); setDepartmentName(item.name); setForm(true); }}>{tx("Edit")}</button>{item.is_active && <button className="button button-secondary small-button" onClick={() => void run(() => updateDepartment(item.id, { is_active: false }), "Department deactivated.")}>{tx("Deactivate")}</button>}</>}</td></tr>)}</tbody></table></div>}
      {positions.length > 0 && <div className="table-wrap"><table><thead><tr><th>{tx("Position")}</th><th>{tx("Department")}</th><th>{tx("Status")}</th><th>{tx("Action")}</th></tr></thead><tbody>{positions.map((item) => <tr key={item.id}><td>{item.title}</td><td>{departments.find((department) => department.id === item.department)?.name ?? "—"}</td><td>{tx(item.is_active ? "Active" : "Inactive")}</td><td>{canManage && <><button className="button button-secondary small-button" onClick={() => { setEditingPositionId(item.id); setPositionTitle(item.title); setPositionDepartment(item.department ? String(item.department) : ""); setForm(true); }}>{tx("Edit")}</button>{item.is_active && <button className="button button-secondary small-button" onClick={() => void run(() => updatePosition(item.id, { is_active: false }), "Position deactivated.")}>{tx("Deactivate")}</button>}</>}</td></tr>)}</tbody></table></div>}
      {employees.length ? <div className="table-wrap"><table><thead><tr><th>{tx("Employee")}</th><th>{tx("Department")}</th><th>{tx("Position")}</th><th>{tx("Joined")}</th><th>{tx("Status")}</th><th>{tx("Action")}</th></tr></thead><tbody>{filtered.map((item) => { const person = item as EmployeeRecord; return <tr key={person.id}><td>{person.full_name}<small>{person.employee_number} · {person.email}</small><details><summary>{tx("Details")}</summary>{tx("Phone")}: {person.phone || "—"}<br />{tx("Notes")}: {person.notes || "—"}</details></td><td>{person.department_name || "—"}</td><td>{person.position_title || "—"}</td><td>{formatDate(person.joined_on, lang)}</td><td>{tx(person.status === "active" ? "Active" : "Inactive")}</td><td>{person.status === "active" && <><button className="button button-secondary small-button" onClick={() => { setEditingEmployeeId(person.id); setEmployee({ employee_number: person.employee_number, full_name: person.full_name, email: person.email, phone: person.phone, department: person.department ? String(person.department) : "", position: person.position ? String(person.position) : "", joined_on: person.joined_on }); setForm(true); }}>{tx("Edit")}</button><button className="button button-secondary small-button" onClick={() => void run(() => updateEmployee(person.id, { status: "inactive" }), "Employee deactivated.")}>{tx("Deactivate")}</button></>}</td></tr>; })}</tbody></table></div> : <div className="empty-state">{tx("No employee records yet. Add a department, position, or employee to start.")}</div>}
      <div className="form-note">{tx("Employee records do not create login accounts. Payroll and leave processing are not included.")}</div>
    </div>}
    {module === "suppliers" && <div className="panel entity-table-panel"><div className="panel-heading"><div><h2>{tx("Supplier directory")}</h2><p>{tx("Inactive suppliers remain visible to preserve historical procurement records.")}</p></div></div>
      {suppliers.length ? <div className="table-wrap"><table><thead><tr><th>{tx("Supplier")}</th><th>{tx("Contact")}</th><th>{tx("Email")}</th><th>{tx("Phone")}</th><th>{tx("Purchase history")}</th><th>{tx("Status / actions")}</th></tr></thead><tbody>{filtered.map((item) => { const supplier = item as SupplierRecord; const history = orders.filter((order) => order.supplier === supplier.id); return <tr key={supplier.id}><td>{supplier.name}</td><td>{supplier.contact_name || "—"}</td><td>{supplier.email || "—"}</td><td>{supplier.phone || "—"}</td><td>{history.length ? <details><summary>{formatNumber(history.length, lang)} {tx("order(s)")}</summary>{history.map((order) => <div key={order.id}>{order.number} · {tx(order.status.charAt(0).toUpperCase() + order.status.slice(1))}</div>)}</details> : tx("No orders")}</td><td>{canManage && <><button className="button button-secondary small-button" onClick={() => { setEditingSupplierId(supplier.id); setSupplierName(supplier.name); setContactName(supplier.contact_name); setEmail(supplier.email); setPhone(supplier.phone); setForm(true); }}>{tx("Edit")}</button>{supplier.status === "active" && <button className="button button-secondary small-button" onClick={() => { if (window.confirm(`${tx("Deactivate supplier")} ${supplier.name}? ${tx("Historical orders will be preserved.")}`)) void run(() => saveSupplier({ status: "inactive" }, supplier.id), "Supplier deactivated."); }}>{tx("Deactivate")}</button>}</>}{tx(supplier.status === "active" ? "Active" : "Inactive")}</td></tr>; })}</tbody></table></div> : <div className="empty-state">{tx("No suppliers have been recorded. Create a supplier before preparing a purchase order.")}</div>}
    </div>}
    {module === "procurement" && <div className="panel entity-table-panel"><div className="panel-heading"><div><h2>{tx("Purchase orders")}</h2><p>{tx("Orders start as drafts; only managers can approve and receive goods.")}</p></div></div>
      {orders.length ? <div className="table-wrap"><table><thead><tr><th>{tx("Order")}</th><th>{tx("Supplier")}</th><th>{tx("Items")}</th><th>{tx("Expected")}</th><th>{tx("Status")}</th><th>{tx("Workflow")}</th></tr></thead><tbody>{filtered.map((item) => { const order = item as PurchaseOrderRecord; return <tr key={order.id}><td>{order.number}</td><td>{order.supplier_name}</td><td>{order.lines.map((line) => `${line.product_name}: ${formatNumber(line.received_quantity, lang)}/${formatNumber(line.quantity, lang)}`).join(", ")}</td><td>{order.expected_on ? formatDate(order.expected_on, lang) : "—"}</td><td>{tx(order.status.charAt(0).toUpperCase() + order.status.slice(1).replace("_", " "))}</td><td>{canManage && order.status === "draft" && <><button className="button button-secondary small-button" onClick={() => void run(() => transitionPurchaseOrder(order.id, "approved"), "Purchase order approved.")}>{tx("Approve")}</button><button className="button button-secondary small-button" onClick={() => void run(() => transitionPurchaseOrder(order.id, "rejected"), "Purchase order rejected.")}>{tx("Reject")}</button></>}{canManage && order.status === "approved" && <button className="button button-secondary small-button" onClick={() => void run(() => transitionPurchaseOrder(order.id, "ordered"), "Purchase order marked ordered.")}>{tx("Mark ordered")}</button>}{canManage && ["ordered", "partially_received"].includes(order.status) && <button className="button button-primary small-button" onClick={() => { const remaining = order.lines.filter((line) => line.quantity > line.received_quantity).map((line) => ({ order_line: line.id, quantity: line.quantity - line.received_quantity })); if (remaining.length && window.confirm(`${tx("Receive all")} ${formatNumber(remaining.length, lang)} ${tx("outstanding order lines into stock?")}`)) void run(() => receivePurchaseOrder(order.id, remaining), "Goods received and inventory updated."); }}>{tx("Receive outstanding")}</button>}</td></tr>; })}</tbody></table></div> : <div className="empty-state">{tx("No purchase orders yet. Draft orders require approval before they can be received.")}</div>}
    </div>}
    {module === "accounting" && <>
      <div className="panel entity-table-panel"><div className="panel-heading"><div><h2>{tx("Chart of accounts")}</h2><p>{tx("Organization-specific account codes.")}</p></div></div>{accounts.length ? <div className="table-wrap"><table><thead><tr><th>{tx("Code")}</th><th>{tx("Name")}</th><th>{tx("Type")}</th><th>{tx("Status")}</th><th>{tx("Actions")}</th></tr></thead><tbody>{accounts.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{tx(item.kind.charAt(0).toUpperCase() + item.kind.slice(1))}</td><td>{tx(item.is_active ? "Active" : "Inactive")}</td><td>{canManage && <><button className="button button-secondary small-button" onClick={() => { setEditingAccountId(item.id); setAccount({ code: item.code, name: item.name, kind: item.kind }); setForm(true); }}>{tx("Edit")}</button><button className="button button-secondary small-button" onClick={() => void run(() => updateAccount(item.id, { is_active: !item.is_active }), item.is_active ? "Account deactivated." : "Account activated.")}>{tx(item.is_active ? "Deactivate" : "Activate")}</button></>}</td></tr>)}</tbody></table></div> : <div className="empty-state">{tx("No accounts configured. Add accounts before creating entries.")}</div>}</div>
      <div className="panel entity-table-panel"><div className="panel-heading"><div><h2>{tx("Journal entries")}</h2><p>{tx("Draft entries may be posted only when debits equal credits. Posted entries are reversed, never edited.")}</p></div></div>{entries.length ? <div className="table-wrap"><table><thead><tr><th>{tx("Reference")}</th><th>{tx("Description")}</th><th>{tx("Date")}</th><th>{tx("Debits")}</th><th>{tx("Credits")}</th><th>{tx("Status / action")}</th></tr></thead><tbody>{filtered.map((item) => { const row = item as JournalEntryRecord; return <tr key={row.id}><td>{row.reference}</td><td>{row.description}<details><summary>{tx("View lines")}</summary>{row.lines.map((line) => <div key={line.id}>{line.account_name}: {tx("Debit")} {formatCurrency(Number(line.debit), lang)} · {tx("Credit")} {formatCurrency(Number(line.credit), lang)}</div>)}</details></td><td>{formatDate(row.entry_date, lang)}</td><td>{formatCurrency(Number(row.debit_total), lang)}</td><td>{formatCurrency(Number(row.credit_total), lang)}</td><td>{tx(row.status.charAt(0).toUpperCase() + row.status.slice(1))}{canManage && row.status === "draft" && <button className="button button-secondary small-button" disabled={saving || Number(row.debit_total) !== Number(row.credit_total)} onClick={() => void run(() => postJournalEntry(row.id), "Journal entry posted.")}>{tx("Post")}</button>}{canManage && row.status === "posted" && <button className="button button-secondary small-button" onClick={() => { if (window.confirm(`${tx("Create a reversal for")} ${row.reference}?`)) void run(() => reverseJournalEntry(row.id, `${tx("Reversal of")} ${row.reference}`), "Reversal entry posted."); }}>{tx("Reverse")}</button>}</td></tr>; })}</tbody></table></div> : <div className="empty-state">{tx("No journal entries yet. Posted entries appear in the trial balance.")}</div>}</div>
      <div className="panel entity-table-panel"><div className="panel-heading"><div><h2>{tx("Trial balance and ledger")}</h2><p>{tx("Reports are derived from posted journal entries only. Optional date and account filters.")}</p></div></div>
        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); setReportFilter({ from: reportDates.from || undefined, to: reportDates.to || undefined, account: reportDates.account ? Number(reportDates.account) : undefined }); }}>
          {field("From", reportDates.from, (value) => setReportDates({ ...reportDates, from: value }), "date", false)}
          {field("To", reportDates.to, (value) => setReportDates({ ...reportDates, to: value }), "date", false)}
          {select("General ledger account", reportDates.account, (value) => setReportDates({ ...reportDates, account: value }), accounts.map((item) => ({ value: String(item.id), label: `${item.code} · ${item.name}` })))}
          <button className="button button-secondary" type="submit">{tx("Apply filters")}</button>
        </form>
        {reportQuery.data?.trial_balance.length ? <div className="table-wrap"><table><thead><tr><th>{tx("Account")}</th><th>{tx("Type")}</th><th>{tx("Debits")}</th><th>{tx("Credits")}</th><th>{tx("Net debit/(credit)")}</th></tr></thead><tbody>{reportQuery.data.trial_balance.map((line) => <tr key={line.account_id}><td>{line.account__code} · {line.account__name}</td><td>{tx(line.account__kind.charAt(0).toUpperCase() + line.account__kind.slice(1))}</td><td>{formatCurrency(line.debits, lang)}</td><td>{formatCurrency(line.credits, lang)}</td><td>{formatCurrency(line.balance, lang)}</td></tr>)}</tbody></table></div> : <div className="empty-state">{tx("No posted financial activity to report.")}</div>}
        {reportFilter.account && <div className="table-wrap"><table><thead><tr><th>{tx("Date")}</th><th>{tx("Reference")}</th><th>{tx("Description")}</th><th>{tx("Debit")}</th><th>{tx("Credit")}</th></tr></thead><tbody>{reportQuery.data?.ledger.map((line) => <tr key={line.entry_id}><td>{formatDate(line.entry__entry_date, lang)}</td><td>{line.entry__reference}</td><td>{line.entry__description}</td><td>{formatCurrency(Number(line.debit), lang)}</td><td>{formatCurrency(Number(line.credit), lang)}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="form-note">{tx("No automatic sales or purchase postings, tax treatment, currency conversion, fiscal-period controls, or accounts-payable/receivable balances are configured. Use explicit journal entries until posting rules are agreed.")}</div>
    </>}
  </section>;
}
