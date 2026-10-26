import { forwardRef, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Archive, ArrowDownRight, ArrowLeft, ArrowRight,
  Bell, Box, BriefcaseBusiness, Building2, ChartNoAxesCombined, Check, ChevronDown,
  ChevronRight, CircleHelp, Command, CreditCard, Download,
  Ellipsis, Eye, EyeOff, FileBarChart, FileText, Globe2, LayoutDashboard,
  Menu, Moon, MoreHorizontal, Package, Plus, Search, Settings, ShoppingBag,
  ShoppingCart, SlidersHorizontal, Sun, Truck, UserRound,
  Pencil, Users, WalletCards, X, ArrowDownToLine, ArrowUpFromLine, type LucideIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { adjustStock, ApiRequestError, authenticate, changePassword, createCustomer, createProduct, createSalesOrder, deleteCustomer, deleteProduct, getDashboardData, getEntityData, getOrganizationProfile, getSalesOrderDetails, getStockMovements, getUserProfile, mockDataMode, registerAccount, RegistrationRequestError, setProductActive, transitionSalesOrder, updateCustomer, updateOrganizationProfile, updateProduct, updateUserProfile } from "./data/api";
import { demoCategoryMix, demoRevenueTrend, demoSummary } from "./data/demo";
import type { DashboardData, OrganizationProfile, StockMovement, UserProfile } from "./data/api";
import type { Customer, EntityType, Order, Product } from "./types";
import { OperationalModulePage } from "./modules/OperationalModules";
import { appRoutePaths, isNavigationItemActive } from "./navigation";
import { ReportsPage } from "./modules/ReportsPage";
import { formatCurrency, formatDate, formatNumber, formatUnit, localizeError, normalizeLocalizedNumber, t } from "./i18n";
import { getProductWriteValues, productFormSchema } from "./modules/productLogic";
import { canManageOrganization } from "./modules/access";
import { initialSidebarState, reduceSidebarState } from "./sidebarState";
import type { ProductFormInput, ProductFormValues } from "./modules/productLogic";

type Lang = "en" | "fa";
type NavItem = { label: string; fa: string; path: string; icon: LucideIcon };
const navigation: { title: string; fa: string; items: NavItem[] }[] = [
  { title: "Workspace", fa: "فضای کاری", items: [
    { label: "Dashboard", fa: "داشبورد", path: "/", icon: LayoutDashboard },
    { label: "Sales", fa: "فروش", path: "/sales", icon: ShoppingCart },
    { label: "Customers", fa: "مشتریان", path: "/customers", icon: Users },
  ] },
  { title: "Operations", fa: "عملیات", items: [
    { label: "Inventory", fa: "انبار", path: "/inventory", icon: Package },
    { label: "Products", fa: "محصولات", path: "/products", icon: Box },
    { label: "Procurement", fa: "تدارکات", path: "/procurement", icon: Truck },
    { label: "Suppliers", fa: "تأمین‌کنندگان", path: "/suppliers", icon: Building2 },
  ] },
  { title: "Manage", fa: "مدیریت", items: [
    { label: "Organization", fa: "سازمان", path: "/manage/organization", icon: Building2 },
    { label: "Accounting", fa: "حسابداری", path: "/accounting", icon: WalletCards },
    { label: "Human Resources", fa: "منابع انسانی", path: "/hr", icon: BriefcaseBusiness },
    { label: "Reports", fa: "گزارش‌ها", path: "/reports", icon: FileBarChart },
  ] },
];
const titles: Record<string, string> = {
  [appRoutePaths.dashboard]: "Dashboard", "/sales": "Sales orders", "/customers": "Customers",
  "/inventory": "Inventory", "/products": "Products", "/procurement": "Procurement",
  "/suppliers": "Suppliers", "/accounting": "Accounting", "/hr": "Human resources",
  [appRoutePaths.reports]: "Reports", "/settings": "Preferences", "/manage/organization": "Organization settings",
};

const customerSchema = z.object({
  name: z.string().min(2, "Enter a name"), company: z.string().min(2, "Enter a company"),
  email: z.string().email("Enter a valid email"), phone: z.string().min(5, "Enter a phone number"),
});
type CustomerForm = z.infer<typeof customerSchema>;
const orderSchema = z.object({
  customer: z.string().min(1, "Choose a customer"),
  product: z.string().min(1, "Choose a product"),
  quantity: z.coerce.number().int().min(1),
  unit_price: z.coerce.number().positive("Price must be greater than zero"),
});
type OrderForm = z.infer<typeof orderSchema>;
const registrationSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  username: z.string().trim().min(3, "Username must be at least 3 characters.").max(150, "Username is too long.")
    .regex(/^[\p{L}\p{N}@.+_-]+$/u, "Use letters, numbers, and @ . + - _ only."),
  organization_name: z.string().trim().min(2, "Enter your organization name.").max(160, "Organization name is too long."),
  password: z.string().min(12, "Use at least 12 characters for your password."),
  confirm_password: z.string(),
}).refine((values) => values.password === values.confirm_password, {
  path: ["confirm_password"],
  message: "Passwords do not match.",
});
type RegistrationForm = z.infer<typeof registrationSchema>;
type RegistrationField = keyof RegistrationForm;

function App() {
  const [lang, setLang] = useState<Lang>(() => localStorage.getItem("nexacore.lang") === "fa" ? "fa" : "en");
  const [dark, setDark] = useState(() => localStorage.getItem("nexacore.theme") === "dark");
  const [sidebarState, setSidebarState] = useState(initialSidebarState);
  const { collapsed, mobileOpen } = sidebarState;
  const [globalSearch, setGlobalSearch] = useState("");
  const [modal, setModal] = useState<EntityType | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [toast, setToast] = useState("");
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("nexacore.access"));
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = lang === "fa";
  const pageTitle = titles[location.pathname] ?? "Dashboard";
  const query = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardData, refetchInterval: 60_000, enabled: mockDataMode || Boolean(accessToken) });
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getUserProfile,
    enabled: mockDataMode || Boolean(accessToken),
  });
  const canManage = mockDataMode || canManageOrganization(profileQuery.data);
  useEffect(() => {
    const signOut = () => setAccessToken(null);
    window.addEventListener("nexacore:signout", signOut);
    return () => window.removeEventListener("nexacore:signout", signOut);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
  }, [lang, rtl]);
  useEffect(() => {
    const mobileBreakpoint = window.matchMedia("(max-width: 680px)");
    const synchronizeSidebar = () => {
      setSidebarState((current) => reduceSidebarState(
        current,
        { type: mobileBreakpoint.matches ? "mobile-breakpoint" : "desktop-breakpoint" },
        mobileBreakpoint.matches,
      ));
    };
    mobileBreakpoint.addEventListener("change", synchronizeSidebar);
    return () => mobileBreakpoint.removeEventListener("change", synchronizeSidebar);
  }, []);
  useEffect(() => {
    if (!profileQuery.data) return;
    setLang(profileQuery.data.preferred_language);
    setDark(profileQuery.data.preferred_theme === "dark");
  }, [profileQuery.data]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const changeLanguage = async () => {
    const next = lang === "en" ? "fa" : "en";
    setLang(next);
    localStorage.setItem("nexacore.lang", next);
    if (!mockDataMode && !accessToken) {
      return;
    }
    try {
      const profile = await updateUserProfile({ preferred_language: next });
      queryClient.setQueryData(["profile"], profile);
    } catch (failure) {
      notify(localizeError(next, failure instanceof Error ? failure.message : "Could not save your language preference."));
    }
  };
  const toggleTheme = async () => {
    const next = !dark;
    setDark(next);
    try {
      const profile = await updateUserProfile({ preferred_theme: next ? "dark" : "light" });
      queryClient.setQueryData(["profile"], profile);
    } catch (failure) {
      setDark(!next);
      notify(localizeError(lang, failure instanceof Error ? failure.message : "Could not save your theme preference."));
    }
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });

  if (location.pathname === "/signup") {
    if (accessToken && !mockDataMode) return <Navigate to="/" replace />;
    return <RegistrationScreen lang={lang} onLanguageToggle={changeLanguage} onAuthenticated={(tokens) => {
      localStorage.setItem("nexacore.access", tokens.access);
      localStorage.setItem("nexacore.refresh", tokens.refresh);
      setAccessToken(tokens.access);
      queryClient.clear();
      navigate("/", { replace: true });
    }} />;
  }

  if (!mockDataMode && !accessToken) {
    return <LoginScreen lang={lang} onLanguageToggle={changeLanguage} onAuthenticated={(tokens) => {
      localStorage.setItem("nexacore.access", tokens.access);
      localStorage.setItem("nexacore.refresh", tokens.refresh);
      setAccessToken(tokens.access);
      navigate("/", { replace: true });
    }} />;
  }

  return (
    <div className={`app-shell${dark ? " dark" : ""}`} dir={rtl ? "rtl" : "ltr"} lang={lang}>
      {mobileOpen && <button className="mobile-scrim" aria-label={t(lang, "Close navigation")} onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "close" }, true))} />}
      <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}${mobileOpen ? " sidebar-open" : ""}`}>
        <div className="brand">
          <Link to="/" className="brand-link" aria-label={t(lang, "NexaCore home")} onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "navigate" }, window.matchMedia("(max-width: 680px)").matches))}>
            <span className="brand-mark"><Command size={19} strokeWidth={2.2} /></span>
            {!collapsed && <span className="brand-name">nexa<span>core</span></span>}
          </Link>
          <button type="button" className="icon-button sidebar-close" onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "close" }, window.matchMedia("(max-width: 680px)").matches))} aria-label={t(lang, "Close sidebar")} title={t(lang, "Close sidebar")}><X size={18} /></button>
        </div>
        {!collapsed && (
          <Link to="/manage/organization" className="workspace-switcher">
            <span className="workspace-avatar">{initials(profileQuery.data?.organization_name ?? "N")}</span>
            <span className="workspace-copy"><strong>{profileQuery.data?.organization_name ?? "Workspace"}</strong><small>{profileQuery.data?.role ?? "Member"}</small></span>
            <ChevronDown size={15} className="muted-icon" />
          </Link>
        )}
        <nav className="side-navigation" aria-label={rtl ? "ناوبری اصلی" : "Main navigation"}>
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              {!collapsed && <div className="nav-group-title">{t(lang, group.title)}</div>}
              {group.items.map(({ label, path, icon: Icon }) => {
                const active = isNavigationItemActive(location.pathname, path);
                return <Link key={path} to={path} title={collapsed ? t(lang, label) : undefined} onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "navigate" }, window.matchMedia("(max-width: 680px)").matches))} className={`nav-link${active ? " active" : ""}`}>
                  <Icon size={18} strokeWidth={1.8} /><span>{t(lang, label)}</span>
                </Link>;
              })}
            </div>
          ))}
          <div className="nav-group">
            {!collapsed && <div className="nav-group-title">{rtl ? "تنظیمات" : "Preferences"}</div>}
            <Link to="/settings" title={collapsed ? (rtl ? "ترجیحات" : "Preferences") : undefined} onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "navigate" }, window.matchMedia("(max-width: 680px)").matches))} className={`nav-link${isNavigationItemActive(location.pathname, "/settings") ? " active" : ""}`}><Settings size={18} /><span>{rtl ? "ترجیحات" : "Preferences"}</span></Link>
          </div>
        </nav>
        {!collapsed && <div className="sidebar-bottom">
          <div className="upgrade-card"><div className="upgrade-icon"><ChartNoAxesCombined size={17} /></div><strong>{rtl ? "به فضای کاری خود بیشتر جان ببخشید" : "Make more of your workspace"}</strong><p>{rtl ? "برای گزارش‌های پیشرفته، به نسخه حرفه‌ای ارتقا دهید." : "Get advanced reports and unlimited team seats."}</p><button onClick={() => notify(rtl ? "به زودی!" : "Plans are coming soon.")}>{rtl ? "مشاهده طرح‌ها" : "Explore plans"} <ArrowRight size={14} /></button></div>
          <button className="help-link" onClick={() => notify(rtl ? "تیم پشتیبانی به زودی با شما تماس می‌گیرد." : "Our support team is here to help.")}><CircleHelp size={17} /><span>{rtl ? "راهنما و پشتیبانی" : "Help & support"}</span></button>
          <button className="profile-card" onClick={() => { if (!mockDataMode) { localStorage.removeItem("nexacore.access"); localStorage.removeItem("nexacore.refresh"); setAccessToken(null); queryClient.clear(); } }} title={t(lang, mockDataMode ? "Demo profile" : "Sign out")}><span className="profile-avatar">{initials(profileQuery.data?.full_name ?? "NC")}</span><span className="profile-copy"><strong>{profileQuery.data?.full_name ?? (rtl ? "حساب شما" : "Your account")}</strong><small>{mockDataMode ? (profileQuery.data?.email ?? "") : t(lang, "Sign out")}</small></span><MoreHorizontal size={18} /></button>
        </div>}
        {collapsed && <button type="button" className="icon-button expand-sidebar" title={t(lang, "Expand sidebar")} aria-label={t(lang, "Expand sidebar")} onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "expand" }, window.matchMedia("(max-width: 680px)").matches))}><ChevronRight size={17} /></button>}
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "open-mobile" }, true))} aria-label={t(lang, "Open navigation")}><Menu size={19} /></button>
            <button className="icon-button collapse-button" onClick={() => setSidebarState((current) => reduceSidebarState(current, { type: "toggle-collapse" }, false))} aria-label={t(lang, collapsed ? "Expand sidebar" : "Collapse sidebar")} title={t(lang, collapsed ? "Expand sidebar" : "Collapse sidebar")}><SlidersHorizontal size={17} /></button>
            <div className="breadcrumbs"><span>{t(lang, "Workspace")}</span><ChevronRight size={14} /><strong>{t(lang, pageTitle)}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={16} /><input aria-label={t(lang, "Search everything")} placeholder={t(lang, "Search anything...")} value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <span className="topbar-divider" />
            <button className="icon-button top-action" aria-label={t(lang, "Toggle language")} title={t(lang, "Switch language")} onClick={() => void changeLanguage()}><Globe2 size={18} /><span className="language-code">{rtl ? "FA" : "EN"}</span></button>
            <button className="icon-button top-action" aria-label={t(lang, "Toggle theme")} onClick={() => void toggleTheme()}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-button top-action notification-button" aria-label={t(lang, "Notifications")} onClick={() => notify(rtl ? "شما همه اعلان‌ها را دیده‌اید." : "You're all caught up")}><Bell size={18} /><i /></button>
            <button className="top-avatar" aria-label={t(lang, "Open preferences")} title={rtl ? "ترجیحات" : "Preferences"} onClick={() => navigate("/settings")}>{initials(profileQuery.data?.full_name ?? "NC")}</button>
          </div>
        </header>
        {profileQuery.isError && !mockDataMode && <div role="alert" className="page-error organization-access-error">
          <strong>{rtl ? "دسترسی سازمان تأیید نشد" : "Organization access could not be verified"}</strong>
          <p>{rtl ? "دسترسی مدیریتی تا زمان تأیید فضای کاری غیرفعال است. دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید." : "Management actions are disabled until your workspace can be verified. Retry or contact your system administrator."}</p>
          <button className="button button-secondary small-button" onClick={() => void profileQuery.refetch()}>{rtl ? "تلاش دوباره" : "Retry"}</button>
        </div>}
        {profileQuery.data && !profileQuery.data.organization_name && !mockDataMode && <div role="alert" className="page-error organization-access-error">
          <strong>{rtl ? "حساب شما به سازمانی اختصاص داده نشده است" : "Your account is not assigned to an organization"}</strong>
          <p>{rtl ? "برای دسترسی به داده‌ها و مدیریت، با مدیر سیستم تماس بگیرید." : "Contact your system administrator to restore organization access."}</p>
        </div>}
        {mockDataMode && <div className="demo-notice"><Activity size={14} /> {rtl ? "حالت نمایشی · داده‌ها در همین مرورگر ذخیره می‌شوند" : "Demo workspace · changes are saved in this browser"}<span /></div>}
        {query.status === "pending" ? <div className="page-loading"><div className="loading-spinner" />{rtl ? "در حال بارگذاری فضای کاری شما..." : "Loading your workspace..."}</div> :
          query.isError ? <div className="page-error"><strong>{rtl ? "بارگیری داده‌ها ناموفق بود" : "We couldn't load your workspace"}</strong><p>{localizeError(lang, query.error.message)}</p><button className="button button-primary" onClick={() => void query.refetch()}>{rtl ? "تلاش دوباره" : "Try again"}</button></div> :
          <div className="page-content">
            <Routes>
              <Route path={appRoutePaths.dashboard} element={<Dashboard data={query.data} onCreate={() => setModal("order")} onNavigate={navigate} lang={lang} notify={notify} canManage={canManage} />} />
              <Route path="/customers" element={<EntityPage kind="customers" search={globalSearch} onCreate={() => { setEditingCustomer(null); setModal("customer"); }} onEditCustomer={(customer) => { setEditingCustomer(customer); setModal("customer"); }} lang={lang} notify={notify} canManage={canManage} />} />
              <Route path="/sales" element={<EntityPage kind="sales" search={globalSearch} onCreate={() => setModal("order")} lang={lang} notify={notify} canManage={canManage} onOrderTransition={async (id, status) => { await transitionSalesOrder(id, status); await queryClient.invalidateQueries({ queryKey: ["entity", "sales"] }); await queryClient.invalidateQueries({ queryKey: ["dashboard"] }); }} />} />
              <Route path="/products" element={<EntityPage kind="products" search={globalSearch} onCreate={() => { setEditingProduct(null); setModal("product"); }} onEditProduct={(product) => { setEditingProduct(product); setModal("product"); }} lang={lang} notify={notify} canManage={canManage} />} />
              <Route path="/inventory" element={<InventoryOperations lang={lang} search={globalSearch} notify={notify} canManage={canManage} />} />
              <Route path="/settings" element={<PreferencesPage lang={lang} profile={profileQuery.data} onPreferencesSaved={(profile) => { queryClient.setQueryData(["profile"], profile); setLang(profile.preferred_language); localStorage.setItem("nexacore.lang", profile.preferred_language); setDark(profile.preferred_theme === "dark"); }} />} />
              <Route path="/manage/organization" element={<OrganizationSettingsPage lang={lang} canManage={canManage} notify={notify} />} />
              <Route path="/hr" element={<OperationalModulePage module="hr" lang={lang} canManage={canManage} notify={notify} search={globalSearch} />} />
              <Route path="/suppliers" element={<OperationalModulePage module="suppliers" lang={lang} canManage={canManage} notify={notify} search={globalSearch} />} />
              <Route path="/procurement" element={<OperationalModulePage module="procurement" lang={lang} canManage={canManage} notify={notify} search={globalSearch} />} />
              <Route path="/accounting" element={<OperationalModulePage module="accounting" lang={lang} canManage={canManage} notify={notify} search={globalSearch} />} />
              <Route path={appRoutePaths.reports} element={<ReportsPage lang={lang} canManage={canManage} />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/signup" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>}
      </main>
      {modal && <EntityModal kind={modal} customer={editingCustomer ?? undefined} product={editingProduct ?? undefined} lang={lang} onClose={() => { setModal(null); setEditingCustomer(null); setEditingProduct(null); }} onSaved={(message) => { setModal(null); setEditingCustomer(null); setEditingProduct(null); notify(message); refresh(); void queryClient.invalidateQueries({ queryKey: ["entity"] }); }} />}
      {toast && <div role="status" className="toast"><span className="toast-check"><Check size={15} /></span>{toast}<button aria-label={t(lang, "Dismiss notification")} onClick={() => setToast("")}><X size={15} /></button></div>}
    </div>
  );
}

function Dashboard({ data, onCreate, onNavigate, lang, notify, canManage }: { data: DashboardData; onCreate: () => void; onNavigate: (path: string) => void; lang: Lang; notify: (message: string) => void; canManage: boolean }) {
  const rtl = lang === "fa";
  const revenue = data.summary?.revenue ?? demoSummary.revenue;
  const orderCount = data.summary?.orders ?? demoSummary.orders;
  const customerCount = data.summary?.customers ?? demoSummary.customers;
  const inventoryValue = data.summary?.inventory_value ?? demoSummary.inventoryValue;
  const pendingOrders = data.summary?.pending_invoices ?? demoSummary.pendingInvoices;
  const monthlyExpenses = data.summary?.monthly_expenses ?? demoSummary.monthlyExpenses;
  const chartData = data.analytics?.trend.length
    ? data.analytics.trend.map((item) => ({
      name: new Intl.DateTimeFormat(rtl ? "fa-IR-u-ca-persian" : "en-US", { month: "short" }).format(new Date(`${item.month}-01T00:00:00`)),
      revenue: item.revenue,
      expenses: item.expenses,
    }))
    : demoRevenueTrend.map((item) => ({
      name: new Intl.DateTimeFormat(rtl ? "fa-IR-u-ca-persian" : "en-US", { month: "short" }).format(new Date(2026, item.month)),
      revenue: item.revenue,
      expenses: item.expenses,
    }));
  const revenuePath = seriesPath(chartData, "revenue");
  const revenueAreaPath = `${revenuePath} L 720 200 L 0 200 Z`;
  const expensesPath = seriesPath(chartData, "expenses");
  const metrics = [
    { label: rtl ? "کل درآمد" : "Total revenue", value: formatMoney(revenue, rtl), icon: WalletCards, tone: "violet", detail: rtl ? "سفارش‌های پرداخت‌شده" : "From paid orders" },
    { label: rtl ? "کل سفارش‌ها" : "Total orders", value: String(orderCount), icon: ShoppingBag, tone: "blue", detail: rtl ? "همه سفارش‌های ثبت‌شده" : "All recorded orders" },
    { label: rtl ? "مشتریان" : "کل مشتریان", value: String(customerCount), icon: Users, tone: "green", detail: rtl ? "همه سوابق مشتری" : "All customer records" },
    { label: rtl ? "ارزش موجودی" : "Inventory value", value: formatMoney(inventoryValue, rtl), icon: Package, tone: "amber", detail: rtl ? "بر پایه قیمت فهرست" : "At catalog price" },
    { label: rtl ? "سفارش‌های در انتظار" : "Pending orders", value: String(pendingOrders), icon: FileText, tone: "blue", detail: rtl ? "نیازمند پیگیری" : "Awaiting follow-up" },
    { label: rtl ? "هزینه‌های ماهانه" : "Monthly expenses", value: formatMoney(monthlyExpenses, rtl), icon: CreditCard, tone: "amber", detail: rtl ? "اسناد حسابداری ثبت‌شده" : "From posted journal entries" },
  ];
  const categories = data.analytics
    ? data.analytics.categories
    : demoCategoryMix.map((item) => ({
      ...item,
      name: rtl
        ? ({ electronics: "الکترونیک", apparel: "پوشاک", home: "خانه و زندگی", other: "سایر" }[item.key])
        : ({ electronics: "Electronics", apparel: "Apparel", home: "Home & living", other: "Other" }[item.key]),
    }));
  const categoryTotal = categories.reduce((sum, item) => sum + item.value, 0);
  const latestOrder = data.orders[0];
  const latestCustomer = data.customers[0];
  const latestPaidOrder = data.orders.find((order) => order.status === "Paid");
  const lowStockProduct = data.products.find((product) => product.status !== "In stock");
  const activityItems = [
    latestOrder && { icon: ShoppingBag, tone: "violet", title: rtl ? "سفارش جدید ثبت شد" : "Latest order", detail: `${latestOrder.id} · ${formatMoney(latestOrder.total, rtl)}`, time: latestOrder.date },
    latestCustomer && { icon: UserRound, tone: "blue", title: rtl ? "مشتری اخیر" : "Recent customer", detail: `${latestCustomer.name} · ${latestCustomer.company}`, time: latestCustomer.joined },
    latestPaidOrder && { icon: CreditCard, tone: "green", title: rtl ? "آخرین سفارش پرداخت‌شده" : "Latest paid order", detail: `${latestPaidOrder.id} · ${formatMoney(latestPaidOrder.total, rtl)}`, time: latestPaidOrder.date },
    lowStockProduct && { icon: Package, tone: "amber", title: rtl ? "موجودی رو به اتمام" : "Stock running low", detail: `${lowStockProduct.name} · ${lowStockProduct.stock} ${rtl ? "واحد" : "units"}`, time: rtl ? "نیازمند بررسی" : "Needs attention" },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return <>
    <section className="welcome-row"><div><div className="eyebrow">{new Intl.DateTimeFormat(rtl ? "fa-IR-u-ca-persian" : "en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase()}</div><h1>{rtl ? "صبح بخیر" : "Good morning"} <span className="wave">✳</span></h1><p>{rtl ? "این خلاصه‌ای از کسب‌وکار شماست." : "Here's what's happening with your business today."}</p></div><div className="page-actions"><button className="button button-secondary" onClick={() => downloadCsv("nexacore-dashboard.csv", [{ metric: "revenue", value: revenue }, { metric: "orders", value: orderCount }, { metric: "customers", value: customerCount }, { metric: "inventory_value", value: inventoryValue }, ...data.orders.map((order) => ({ metric: `order_${order.id}`, customer: order.customer, date: order.date, total: order.total, status: order.status }))])}><Download size={16} />{rtl ? "خروجی گرفتن" : "Export"}</button>{canManage && <button className="button button-primary" onClick={onCreate}><Plus size={17} />{rtl ? "سفارش جدید" : "Create order"}</button>}</div></section>
    <section className="metrics-grid" aria-label={t(lang, "Business metrics")}>{metrics.map(({ label, value, icon: Icon, tone, detail }) => <article className="metric-card" key={label}>
      <div className="metric-top"><span className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.8} /></span><button className="icon-button metric-more" aria-label={`${label} options`}><Ellipsis size={19} /></button></div>
      <div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-bottom"><span>{detail}</span></div>
    </article>)}</section>
    <section className="charts-grid">
      <article className="panel revenue-panel"><div className="panel-heading"><div><h2>{rtl ? "درآمد در طول زمان" : "Revenue over time"}</h2><p>{rtl ? "عملکرد مالی شما در یک نگاه" : "Track how your business is performing"}</p></div><button className="select-button" onClick={() => notify(rtl ? "در حال نمایش سال جاری" : "Showing this year")}>{rtl ? "امسال" : "This year"}<ChevronDown size={14} /></button></div>
        <div className="chart-summary"><strong>{formatMoney(revenue, rtl)}</strong><span className="summary-label">{rtl ? "درآمد ۱۲ ماه اخیر" : "Paid revenue · last 12 months"}</span></div>
        <div className="line-chart" role="img" aria-label={t(lang, "Revenue and expenses trend for twelve months")}><div className="chart-y-labels"><span>$12k</span><span>$9k</span><span>$6k</span><span>$3k</span><span>$0</span></div><div className="chart-area">
          <div className="chart-gridlines"><i /><i /><i /><i /><i /></div><svg viewBox="0 0 720 200" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7169f7" stopOpacity=".17" /><stop offset="100%" stopColor="#7169f7" stopOpacity="0" /></linearGradient></defs><path d={revenueAreaPath} fill="url(#revenueFill)" /><path d={revenuePath} fill="none" stroke="#7169f7" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /><path d={expensesPath} fill="none" stroke="#c6c5d3" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div className="chart-x-labels">{chartData.map((item) => <span key={item.name}>{item.name}</span>)}</div></div></div>
        <div className="chart-legend"><span><i className="legend-dot revenue-dot" />{rtl ? "درآمد" : "Revenue"}</span><span><i className="legend-dot expenses-dot" />{rtl ? "هزینه‌ها" : "Expenses"}</span></div>
      </article>
      <article className="panel category-panel"><div className="panel-heading"><div><h2>{rtl ? "فروش بر اساس دسته‌بندی" : "Sales by category"}</h2><p>{rtl ? "ترکیب درآمد شما" : "Your revenue breakdown"}</p></div><button className="icon-button" aria-label={t(lang, "Category options")}><MoreHorizontal size={19} /></button></div>
        <div className="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label={rtl ? "ترکیب فروش بر اساس دسته‌بندی" : "Sales breakdown by category"}><circle cx="90" cy="90" r="66" fill="none" stroke="#f0eff7" strokeWidth="22" />{(() => { let offset = 0; return categories.map((item) => { const segment = categoryTotal ? (item.value / categoryTotal) * 414.7 : 0; const currentOffset = offset; offset += segment; return <circle key={item.name} cx="90" cy="90" r="66" fill="none" stroke={item.color} strokeWidth="22" strokeDasharray={`${segment} ${414.7 - segment}`} strokeDashoffset={-currentOffset} transform="rotate(-90 90 90)" />; }); })()}</svg><div className="donut-center"><strong>{formatMoney(categoryTotal, rtl)}</strong><span>{rtl ? "کل فروش" : "Total sales"}</span></div></div>
        <div className="category-list">{categories.length ? categories.map((item) => <div className="category-row" key={item.name}><span className="category-name"><i style={{ background: item.color }} />{item.name}</span><span>{formatMoney(item.value, rtl)}</span><span className="category-percent">{item.percent}%</span></div>) : <div className="empty-category">{rtl ? "هنوز فروش ثبت نشده است." : "No sales recorded yet."}</div>}</div>
      </article>
    </section>
    <section className="bottom-grid">
      <article className="panel table-panel"><div className="panel-heading table-heading"><div><h2>{rtl ? "سفارش‌های اخیر" : "Recent orders"}</h2><p>{rtl ? "آخرین فعالیت فروش شما" : "Keep track of your latest sales"}</p></div><button className="text-button" onClick={() => onNavigate("/sales")}>{rtl ? "مشاهده همه" : "View all"} <ArrowRight size={14} /></button></div>
        <div className="table-wrap"><table><thead><tr><th>{rtl ? "شماره سفارش" : "Order"}</th><th>{rtl ? "مشتری" : "Customer"}</th><th>{rtl ? "تاریخ" : "Date"}</th><th>{rtl ? "مبلغ" : "Amount"}</th><th>{rtl ? "وضعیت" : "Status"}</th></tr></thead><tbody>{data.orders.slice(0, 4).map((order, index) => <tr key={order.id}><td className="id-cell">{order.id}</td><td><span className={`customer-avatar avatar-${index % 5}`}>{initials(order.customer)}</span>{order.customer}</td><td className="muted-cell">{order.date}</td><td className="amount-cell">{formatMoney(order.total, rtl)}</td><td><StatusBadge status={order.status} lang={lang} /></td></tr>)}</tbody></table></div>
      </article>
      <article className="panel activity-panel"><div className="panel-heading"><div><h2>{rtl ? "فعالیت‌های اخیر" : "Recent activity"}</h2><p>{rtl ? "آخرین اتفاقات فضای کاری" : "What's happening across your team"}</p></div><button className="icon-button" aria-label={t(lang, "Activity options")}><MoreHorizontal size={19} /></button></div>
        <div className="activity-list">{activityItems.length ? activityItems.map((item) => <ActivityItem key={`${item.title}-${item.detail}`} {...item} />) : <div className="empty-category">{rtl ? "هنوز فعالیتی ثبت نشده است." : "No recent activity."}</div>}</div>
        <button className="activity-footer" onClick={() => notify(rtl ? "نمایش همه فعالیت‌ها به زودی" : "All caught up on activity")}>{rtl ? "مشاهده همه فعالیت‌ها" : "View all activity"} <ArrowRight size={14} /></button>
      </article>
    </section>
    <section className="quick-insights"><div className="insight-item"><span className="insight-icon rose"><ArrowDownRight size={17} /></span><div><span>{rtl ? "سفارش‌های در انتظار" : "Pending orders"}</span><strong>{pendingOrders} <small>{rtl ? "سفارش" : "orders"}</small></strong></div><span className="insight-aside">{rtl ? "از سفارش‌های ثبت‌شده" : "Awaiting follow-up"}</span></div><div className="insight-item"><span className="insight-icon amber"><Package size={17} /></span><div><span>{rtl ? "هشدارهای موجودی" : "Low stock alerts"}</span><strong>{data.summary?.low_stock_products ?? data.products.filter((product) => product.status === "Low stock").length} <small>{rtl ? "محصول" : "products"}</small></strong></div><button className="text-button" onClick={() => onNavigate("/inventory")}>{rtl ? "بررسی" : "Review"} <ArrowRight size={14} /></button></div></section>
  </>;
}

function ActivityItem({ icon: Icon, tone, title, detail, time }: { icon: LucideIcon; tone: string; title: string; detail: string; time: string }) {
  return <div className="activity-item"><span className={`activity-icon ${tone}`}><Icon size={16} /></span><div className="activity-copy"><strong>{title}</strong><span>{detail}</span></div><time>{time}</time></div>;
}

function LoginScreen({ lang, onLanguageToggle, onAuthenticated }: { lang: Lang; onLanguageToggle: () => void; onAuthenticated: (tokens: { access: string; refresh: string }) => void }) {
  const rtl = lang === "fa";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      onAuthenticated(await authenticate(username, password));
    } catch (failure) {
      setError(localizeError(lang, failure instanceof Error ? failure.message : "Sign in failed."));
    } finally {
      setSubmitting(false);
    }
  };
  return <main className="login-shell" dir={rtl ? "rtl" : "ltr"} lang={lang}>
    <button className="login-language" onClick={onLanguageToggle}><Globe2 size={16} />{rtl ? "English" : "فارسی"}</button>
    <form className="login-card" onSubmit={(event) => void submit(event)}>
      <span className="brand-mark login-mark"><Command size={21} /></span>
      <span className="eyebrow">{rtl ? "فضای کاری امن شما" : "YOUR BUSINESS WORKSPACE"}</span>
      <h1>{rtl ? "به نکساکور خوش آمدید" : "Welcome to NexaCore"}</h1>
      <p>{rtl ? "برای ورود به فضای کاری خود اطلاعات حساب را وارد کنید." : "Sign in to continue to your workspace."}</p>
      <label className="form-label">{rtl ? "نام کاربری" : "Username"}<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label className="form-label">{rtl ? "گذرواژه" : "Password"}<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <div role="alert" className="login-error">{error}</div>}
      <button className="button button-primary login-submit" type="submit" disabled={submitting}>{submitting ? (rtl ? "در حال ورود..." : "Signing in...") : (rtl ? "ورود به فضای کاری" : "Sign in to workspace")}<ArrowRight size={16} /></button>
      <small>{rtl ? "ورود امن با توکن JWT" : "Secure sign-in protected with JWT authentication"}</small>
      <div className="auth-switch">{rtl ? "حساب کاربری ندارید؟" : "New to NexaCore?"} <Link to="/signup">{rtl ? "ایجاد حساب" : "Create an account"}</Link></div>
    </form>
  </main>;
}

function RegistrationScreen({ lang, onLanguageToggle, onAuthenticated }: { lang: Lang; onLanguageToggle: () => void; onAuthenticated: (tokens: { access: string; refresh: string }) => void }) {
  const rtl = lang === "fa";
  const [form, setForm] = useState<RegistrationForm>({
    full_name: "",
    email: "",
    username: "",
    organization_name: "",
    password: "",
    confirm_password: "",
  });
  const [errors, setErrors] = useState<Partial<Record<RegistrationField, string>>>({});
  const [submissionError, setSubmissionError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setSubmissionError("");
    const parsed = registrationSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: Partial<Record<RegistrationField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as RegistrationField;
        nextErrors[field] ??= issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await registerAccount(parsed.data);
      try {
        const tokens = await authenticate(parsed.data.username, parsed.data.password);
        onAuthenticated(tokens);
      } catch {
        setSuccess(rtl
          ? "حساب و فضای کاری ایجاد شد، اما ورود خودکار انجام نشد. برای ورود دوباره تلاش کنید."
          : "Your account and workspace were created, but automatic sign-in failed. Please sign in to continue.");
      }
    } catch (failure) {
      if (failure instanceof RegistrationRequestError) {
        setErrors(failure.fieldErrors);
        setSubmissionError(localizeError(lang, failure.message));
      } else {
        setSubmissionError(rtl ? "ثبت‌نام انجام نشد. دوباره تلاش کنید." : "Registration failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: RegistrationField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const fieldLabel: Record<RegistrationField, string> = {
    full_name: rtl ? "نام کامل" : "Full name",
    email: rtl ? "ایمیل" : "Email address",
    username: rtl ? "نام کاربری" : "Username",
    organization_name: rtl ? "نام سازمان" : "Organization name",
    password: rtl ? "گذرواژه" : "Password",
    confirm_password: rtl ? "تأیید گذرواژه" : "Confirm password",
  };
  const fieldHint: Record<RegistrationField, string> = {
    full_name: "Ada Lovelace",
    email: "you@company.com",
    username: "ada.lovelace",
    organization_name: "Your company or workspace",
    password: "",
    confirm_password: "",
  };
  const renderField = (field: RegistrationField, type = "text") => {
    const passwordField = field === "password" || field === "confirm_password";
    const visible = field === "password" ? showPassword : showConfirmation;
    const inputType = passwordField ? (visible ? "text" : "password") : type;
    const toggleVisibility = field === "password" ? () => setShowPassword((value) => !value) : () => setShowConfirmation((value) => !value);
    return <label className="form-label" htmlFor={`signup-${field}`} key={field}>
      {fieldLabel[field]}
      {passwordField ? <span className="auth-password-control">
        <input
          id={`signup-${field}`}
          name={field}
          type={inputType}
          autoComplete={field === "password" ? "new-password" : "new-password"}
          required
          value={form[field]}
          onChange={(event) => updateField(field, event.target.value)}
          aria-invalid={Boolean(errors[field])}
          aria-describedby={errors[field] ? `signup-${field}-error` : undefined}
        />
        <button
          className="auth-password-toggle"
          type="button"
          onClick={toggleVisibility}
          aria-label={visible ? (rtl ? "پنهان‌کردن گذرواژه" : "Hide password") : (rtl ? "نمایش گذرواژه" : "Show password")}
          aria-pressed={visible}
        >{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </span> : <input
        id={`signup-${field}`}
        name={field}
        type={inputType}
        autoComplete={field === "full_name" ? "name" : field === "email" ? "email" : "username"}
        placeholder={fieldHint[field]}
        required
        value={form[field]}
        onChange={(event) => updateField(field, event.target.value)}
        aria-invalid={Boolean(errors[field])}
        aria-describedby={errors[field] ? `signup-${field}-error` : undefined}
      />}
      {field === "password" && !errors[field] && <small className="field-hint">{rtl ? "حداقل ۱۲ نویسه؛ از واژه‌های رایج و اطلاعات شخصی استفاده نکنید." : "Use 12+ characters; avoid common words and personal information."}</small>}
      {errors[field] && <small className="field-error" id={`signup-${field}-error`}>{localizeError(lang, errors[field]!)}</small>}
    </label>;
  };

  return <main className="login-shell" dir={rtl ? "rtl" : "ltr"} lang={lang}>
    <button className="login-language" type="button" onClick={onLanguageToggle}><Globe2 size={16} />{rtl ? "English" : "فارسی"}</button>
    <form className="login-card signup-card" onSubmit={(event) => void submit(event)} noValidate>
      <span className="brand-mark login-mark"><Command size={21} /></span>
      <span className="eyebrow">{rtl ? "ایجاد فضای کاری" : "CREATE YOUR WORKSPACE"}</span>
      <h1>{rtl ? "به نکساکور بپیوندید" : "Create your NexaCore account"}</h1>
      <p>{rtl ? "حساب و فضای کاری سازمان خود را ایجاد کنید." : "Set up your account and a new organization workspace."}</p>
      {success ? <>
        <div className="auth-success" role="status">{success}</div>
        <Link className="button button-primary login-submit auth-success-link" to="/login">{rtl ? "رفتن به ورود" : "Continue to sign in"}<ArrowRight size={16} /></Link>
      </> : <>
        <div className="signup-fields">
          {renderField("full_name")}
          {renderField("email", "email")}
          {renderField("username")}
          {renderField("organization_name")}
          {renderField("password", "password")}
          {renderField("confirm_password", "password")}
        </div>
        <div className="form-note signup-note">{rtl ? "حساب نخست مدیر همین سازمان خواهد بود؛ این نقش دسترسی سراسری مدیر سیستم را ایجاد نمی‌کند." : "The first account administers this organization only; it does not receive global system administrator access."}</div>
        {submissionError && <div role="alert" className="login-error">{submissionError}</div>}
        <button className="button button-primary login-submit" type="submit" disabled={submitting}>
          {submitting ? (rtl ? "در حال ایجاد حساب..." : "Creating account...") : (rtl ? "ایجاد حساب" : "Create account")}<ArrowRight size={16} />
        </button>
      </>}
      <div className="auth-switch">{rtl ? "از قبل حساب دارید؟" : "Already have an account?"} <Link to="/login">{rtl ? "ورود" : "Sign in"}</Link></div>
    </form>
  </main>;
}

function InventoryOperations({ lang, search, notify, canManage }: { lang: Lang; search: string; notify: (message: string) => void; canManage: boolean }) {
  const rtl = lang === "fa";
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const productQuery = useQuery({ queryKey: ["entity", "products"], queryFn: () => getEntityData("products") });
  const movementQuery = useQuery({ queryKey: ["stock-movements"], queryFn: () => getStockMovements() });
  const products = (productQuery.data ?? []).filter((item): item is Product => "sku" in item);
  const activeProducts = products.filter((product) => product.isActive !== false);
  const movementList: StockMovement[] = movementQuery.data ?? [];
  const movements = movementList.filter((movement) =>
    `${movement.product_name} ${movement.kind} ${movement.reference} ${movement.note}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedProduct = products.find((product) => product.id === productId);

  const submitAdjustment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const parsedQuantity = Number(normalizeLocalizedNumber(quantity));
    if (!productId || !Number.isInteger(parsedQuantity) || parsedQuantity === 0) {
      setError(rtl ? "محصول و تعداد صحیح غیرصفر را انتخاب کنید." : "Choose a product and enter a non-zero whole-number adjustment.");
      return;
    }
    if (selectedProduct && selectedProduct.stock + parsedQuantity < 0) {
      setError(rtl ? "موجودی نمی‌تواند منفی شود." : "Stock cannot become negative.");
      return;
    }
    setSaving(true);
    try {
      await adjustStock({ product: productId, quantity: parsedQuantity, note });
      setQuantity("");
      setNote("");
      notify(rtl ? "تغییر موجودی ثبت شد." : "Stock adjustment recorded.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["entity", "products"] }),
        queryClient.invalidateQueries({ queryKey: ["entity", "inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (failure) {
      setError(localizeError(lang, failure instanceof Error ? failure.message : "Could not adjust stock."));
    } finally {
      setSaving(false);
    }
  };

  if (productQuery.isPending || movementQuery.isPending) return <div className="page-loading"><div className="loading-spinner" />{rtl ? "در حال بارگذاری..." : "Loading inventory operations..."}</div>;
  if (productQuery.isError || movementQuery.isError) {
    const message = productQuery.error?.message ?? movementQuery.error?.message ?? "Unknown inventory error.";
    return <div className="page-error"><strong>{rtl ? "بارگیری موجودی ناموفق بود" : "Could not load inventory"}</strong><p>{message}</p><button className="button button-primary" onClick={() => { void productQuery.refetch(); void movementQuery.refetch(); }}>{rtl ? "تلاش دوباره" : "Try again"}</button></div>;
  }

  const lowStock = activeProducts.filter((product) => product.status !== "In stock");
  return <section className="entity-page">
    <div className="welcome-row entity-title-row"><div><div className="eyebrow">{rtl ? "عملیات / انبار" : "OPERATIONS / INVENTORY"}</div><h1>{rtl ? "عملیات موجودی" : "Inventory operations"}</h1><p>{rtl ? "سطح موجودی و تاریخچه تغییرات ثبت‌شده را بررسی کنید." : "Review on-hand stock and its audited movement history."}</p></div><Link className="button button-secondary" to="/products"><Package size={16} />{rtl ? "مدیریت محصولات" : "Manage products"}</Link></div>
    <div className="entity-metrics">
      <div className="entity-metric"><span>{rtl ? "محصولات فعال" : "Active products"}</span><strong>{formatNumber(activeProducts.length, lang)}</strong><small>{rtl ? "از فهرست محصولات" : "From product catalog"}</small></div>
      <div className="entity-metric"><span>{rtl ? "نیازمند سفارش" : "Below reorder point"}</span><strong>{lowStock.length}</strong><small className={lowStock.length ? "attention-label" : ""}>{lowStock.length ? (rtl ? "نیازمند بررسی" : "Needs attention") : (rtl ? "همه مناسب است" : "All in range")}</small></div>
      <div className="entity-metric"><span>{rtl ? "حرکت‌های موجودی" : "Recorded movements"}</span><strong>{movementList.length}</strong><small>{rtl ? "تاریخچه حسابرسی‌شده" : "Audited history"}</small></div>
    </div>
    <div className="panel entity-table-panel"><div className="panel-heading"><div><h2>{t(lang, "Stock levels")}</h2><p>{t(lang, "On hand quantities and product-specific reorder thresholds.")}</p></div></div>
      {activeProducts.length ? <div className="table-wrap"><table><thead><tr><th>{t(lang, "Product")}</th><th>{t(lang, "SKU")}</th><th>{t(lang, "On hand")}</th><th>{t(lang, "Reorder point")}</th><th>{t(lang, "Stock status")}</th></tr></thead><tbody>{activeProducts.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.sku}</td><td>{formatNumber(product.stock, lang)} {formatUnit(product.unitOfMeasure ?? "unit", lang)}</td><td>{formatNumber(product.reorderPoint ?? 0, lang)}</td><td><StatusBadge status={product.status} lang={lang} /></td></tr>)}</tbody></table></div> : <div className="empty-state">{t(lang, "No active products are available.")}</div>}
    </div>
    {canManage ? <div className="panel preference-panel">
      <div className="panel-heading"><div><h2>{rtl ? "ثبت تغییر موجودی" : "Record a stock adjustment"}</h2><p>{rtl ? "ورودی مثبت برای دریافت و منفی برای کاهش موجودی استفاده کنید." : "Use a positive quantity for a receipt and a negative quantity for a reduction."}</p></div></div>
      <form className="settings-form stock-adjustment-form" onSubmit={(event) => void submitAdjustment(event)}>
        <label className="form-label">{t(lang, "Product")}<select required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">{t(lang, "Select a product...")}</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatNumber(product.stock, lang)} {formatUnit(product.unitOfMeasure ?? "unit", lang)}</option>)}</select></label>
        <label className="form-label">{t(lang, "Quantity change (+/-)")}<input type="text" inputMode="numeric" dir="ltr" required value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={t(lang, "e.g. 12 or -2")} /></label>
        <label className="form-label">{rtl ? "یادداشت" : "Reason / note"}<input maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} placeholder={rtl ? "دلیل تغییر موجودی" : "Reason for this adjustment"} /></label>
        <button className="button button-primary" disabled={saving || !activeProducts.length} type="submit">{saving ? (rtl ? "در حال ثبت..." : "Saving...") : (rtl ? "ثبت تغییر" : "Record adjustment")}</button>
      </form>
      {error && <div role="alert" className="login-error settings-error">{error}</div>}
      {selectedProduct && <p className="form-note stock-hint">{rtl ? "موجودی پس از تغییر: " : "On hand after adjustment: "}{selectedProduct.stock + (Number(quantity) || 0)}</p>}
    </div> : <div className="form-note">{rtl ? "برای اصلاح موجودی به دسترسی مدیر یا سرپرست نیاز دارید." : "Stock adjustments require manager or administrator access."}</div>}
    <div className="panel entity-table-panel"><div className="panel-heading table-heading"><div><h2>{rtl ? "تاریخچه حرکت موجودی" : "Stock movement history"}</h2><p>{rtl ? "دریافت‌ها، فروش‌ها، اصلاحات و برگشت‌ها." : "Receipts, sales, adjustments, and reversals."}</p></div></div>
      {movements.length ? <div className="table-wrap entity-table-wrap"><table><thead><tr><th>{t(lang, "Product")}</th><th>{t(lang, "Type")}</th><th>{t(lang, "Change")}</th><th>{t(lang, "Reference")}</th><th>{t(lang, "Note")}</th><th>{t(lang, "Recorded")}</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{movement.product_name}</td><td>{t(lang, movement.kind.charAt(0).toUpperCase() + movement.kind.slice(1))}</td><td className={movement.quantity < 0 ? "attention-label" : ""}>{movement.quantity > 0 ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />}{movement.quantity > 0 ? "+" : ""}{formatNumber(movement.quantity, lang)}</td><td>{movement.reference || "—"}</td><td>{movement.note || "—"}</td><td>{formatDate(movement.created_at, lang)} {new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(movement.created_at))}</td></tr>)}</tbody></table></div> : <div className="empty-state">{rtl ? "هنوز حرکتی ثبت نشده است." : "No stock movements have been recorded yet."}</div>}
    </div>
    {lowStock.length > 0 && <div className="form-note stock-hint">{rtl ? `${lowStock.length} محصول زیر نقطه سفارش مجدد است.` : `${lowStock.length} product${lowStock.length === 1 ? " is" : "s are"} at or below its reorder point.`} <Link to="/products">{rtl ? "مشاهده محصولات" : "Review products"}</Link></div>}
  </section>;
}

function PreferencesPage({ lang, profile, onPreferencesSaved }: { lang: Lang; profile?: UserProfile; onPreferencesSaved: (profile: UserProfile) => void }) {
  const rtl = lang === "fa";
  const [fullName, setFullName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<Lang>(lang);
  const [preferredTheme, setPreferredTheme] = useState<"light" | "dark">("light");
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setPreferredLanguage(profile.preferred_language);
    setPreferredTheme(profile.preferred_theme);
  }, [profile]);

  if (!profile) return <div className="page-loading"><div className="loading-spinner" />{rtl ? "در حال بارگذاری تنظیمات..." : "Loading your preferences..."}</div>;

  const savePreferences = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    setSavingProfile(true);
    try {
      const updated = await updateUserProfile({
        full_name: fullName.trim(),
        preferred_language: preferredLanguage,
        preferred_theme: preferredTheme,
      });
      onPreferencesSaved(updated);
      setProfileSaved(true);
    } catch (failure) {
      setProfileError(localizeError(lang, failure instanceof Error ? failure.message : "Could not save preferences."));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    if (passwords.new_password.length < 12) {
      setPasswordError(rtl ? "گذرواژه باید حداقل ۱۲ نویسه داشته باشد." : "Use at least 12 characters for the new password.");
      return;
    }
    if (passwords.new_password !== passwords.confirm_password) {
      setPasswordError(rtl ? "گذرواژه‌ها مطابقت ندارند." : "The new passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(passwords);
      setPasswords({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordSaved(true);
    } catch (failure) {
      setPasswordError(localizeError(lang, failure instanceof Error ? failure.message : "Could not update your password."));
    } finally {
      setSavingPassword(false);
    }
  };

  return <section className="entity-page preferences-page">
    <div className="welcome-row entity-title-row"><div><div className="eyebrow">{rtl ? "حساب کاربری / ترجیحات" : "ACCOUNT / PREFERENCES"}</div><h1>{rtl ? "ترجیحات شما" : "Your preferences"}</h1><p>{rtl ? "اطلاعات شخصی، زبان، ظاهر و امنیت حساب خود را مدیریت کنید." : "Manage your personal details, language, appearance, and account security."}</p></div></div>
    <div className="settings-grid">
      <section className="panel preference-panel"><div className="panel-heading"><div><h2>{rtl ? "اطلاعات شخصی و نمایش" : "Personal details and display"}</h2><p>{rtl ? "این تنظیمات فقط برای حساب کاربری شما ذخیره می‌شوند." : "These settings are saved to your account and do not affect other users."}</p></div></div>
        <form className="settings-form" onSubmit={(event) => void savePreferences(event)}>
          <label className="form-label">{rtl ? "نام کامل" : "Display name"}<input required minLength={3} maxLength={150} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label className="form-label">{rtl ? "نام کاربری" : "Username"}<input value={profile.username} readOnly /></label>
          <label className="form-label">{rtl ? "ایمیل" : "Email address"}<input type="email" value={profile.email} readOnly /></label>
          <label className="form-label">{rtl ? "زبان" : "Language"}<select value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value as Lang)}><option value="en">English</option><option value="fa">فارسی</option></select></label>
          <label className="form-label">{rtl ? "پوسته" : "Theme"}<select value={preferredTheme} onChange={(event) => setPreferredTheme(event.target.value as "light" | "dark")}><option value="light">{rtl ? "روشن" : "Light"}</option><option value="dark">{rtl ? "تیره" : "Dark"}</option></select></label>
          <div className="form-note">{rtl ? `فضای کاری: ${profile.organization_name} · نقش: ${profile.role}` : `Workspace: ${profile.organization_name} · Role: ${profile.role}`}</div>
          {profileError && <div role="alert" className="login-error settings-error">{profileError}</div>}
          {profileSaved && <div role="status" className="auth-success">{rtl ? "ترجیحات ذخیره شد." : "Preferences saved."}</div>}
          <button className="button button-primary" type="submit" disabled={savingProfile}>{savingProfile ? (rtl ? "در حال ذخیره..." : "Saving...") : (rtl ? "ذخیره ترجیحات" : "Save preferences")}</button>
        </form>
      </section>
      {!mockDataMode && <section className="panel preference-panel"><div className="panel-heading"><div><h2>{rtl ? "امنیت حساب" : "Account security"}</h2><p>{rtl ? "برای تغییر گذرواژه، گذرواژه فعلی را تأیید کنید." : "Confirm your current password before choosing a new one."}</p></div></div>
        <form className="settings-form" onSubmit={(event) => void savePassword(event)}>
          <label className="form-label">{rtl ? "گذرواژه فعلی" : "Current password"}<input type="password" autoComplete="current-password" required value={passwords.current_password} onChange={(event) => setPasswords((value) => ({ ...value, current_password: event.target.value }))} /></label>
          <label className="form-label">{rtl ? "گذرواژه جدید" : "New password"}<input type="password" autoComplete="new-password" minLength={12} required value={passwords.new_password} onChange={(event) => setPasswords((value) => ({ ...value, new_password: event.target.value }))} /><small className="field-hint">{rtl ? "حداقل ۱۲ نویسه؛ گذرواژه با قوانین امنیتی سرور بررسی می‌شود." : "At least 12 characters; Django password validators are also applied."}</small></label>
          <label className="form-label">{rtl ? "تکرار گذرواژه جدید" : "Confirm new password"}<input type="password" autoComplete="new-password" required value={passwords.confirm_password} onChange={(event) => setPasswords((value) => ({ ...value, confirm_password: event.target.value }))} /></label>
          {passwordError && <div role="alert" className="login-error settings-error">{passwordError}</div>}
          {passwordSaved && <div role="status" className="auth-success">{rtl ? "گذرواژه با موفقیت به‌روزرسانی شد." : "Password updated successfully."}</div>}
          <button className="button button-primary" type="submit" disabled={savingPassword}>{savingPassword ? (rtl ? "در حال به‌روزرسانی..." : "Updating...") : (rtl ? "تغییر گذرواژه" : "Change password")}</button>
        </form>
      </section>}
    </div>
  </section>;
}

function OrganizationSettingsPage({ lang, canManage, notify }: { lang: Lang; canManage: boolean; notify: (message: string) => void }) {
  const rtl = lang === "fa";
  const queryClient = useQueryClient();
  const organizationQuery = useQuery({ queryKey: ["organization-profile"], queryFn: getOrganizationProfile });
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (organizationQuery.data) setName(organizationQuery.data.name);
  }, [organizationQuery.data]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const updated = await updateOrganizationProfile(name.trim());
      queryClient.setQueryData(["organization-profile"], updated);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      notify(rtl ? "اطلاعات سازمان به‌روزرسانی شد." : "Organization profile updated.");
    } catch (failure) {
      setError(localizeError(lang, failure instanceof Error ? failure.message : "Could not update the organization."));
    } finally {
      setSaving(false);
    }
  };

  if (organizationQuery.isPending) return <div className="page-loading"><div className="loading-spinner" />{rtl ? "در حال بارگذاری سازمان..." : "Loading organization..."}</div>;
  if (organizationQuery.isError) return <div className="page-error"><strong>{rtl ? "بارگیری سازمان ناموفق بود" : "Could not load organization settings"}</strong><p>{localizeError(lang, organizationQuery.error.message)}</p><button className="button button-primary" onClick={() => void organizationQuery.refetch()}>{rtl ? "تلاش دوباره" : "Try again"}</button></div>;

  const organization: OrganizationProfile = organizationQuery.data;
  return <section className="entity-page">
    <div className="welcome-row entity-title-row"><div><div className="eyebrow">{rtl ? "مدیریت / سازمان" : "MANAGE / ORGANIZATION"}</div><h1>{rtl ? "اطلاعات سازمان" : "Organization profile"}</h1><p>{rtl ? "اطلاعات فضای کاری مشترک سازمان خود را مشاهده کنید." : "View and manage the shared profile for your organization workspace."}</p></div></div>
    <section className="panel preference-panel organization-panel"><div className="panel-heading"><div><h2>{rtl ? "مشخصات فضای کاری" : "Workspace details"}</h2><p>{rtl ? "تغییر نام سازمان فقط برای مدیران و سرپرستان مجاز است." : "Only organization managers and administrators can change the organization name."}</p></div></div>
      <form className="settings-form" onSubmit={(event) => void save(event)}>
        <label className="form-label">{rtl ? "نام سازمان" : "Organization name"}<input required minLength={2} maxLength={160} value={name} readOnly={!canManage} onChange={(event) => setName(event.target.value)} /></label>
        <label className="form-label">{rtl ? "شناسه فضای کاری" : "Workspace identifier"}<input value={organization.slug} readOnly /></label>
        <label className="form-label">{rtl ? "تاریخ ایجاد" : "Created"}<input value={new Date(organization.created_at).toLocaleDateString(rtl ? "fa-IR" : "en-US")} readOnly /></label>
        {!canManage && <div className="form-note">{rtl ? "حساب شما فقط دسترسی مشاهده دارد. برای تغییر این اطلاعات با مدیر سازمان تماس بگیرید." : "Your role has read-only access. Contact an organization manager to request changes."}</div>}
        {error && <div role="alert" className="login-error settings-error">{error}</div>}
        {canManage && <button className="button button-primary" type="submit" disabled={saving || name.trim() === organization.name}>{saving ? (rtl ? "در حال ذخیره..." : "Saving...") : (rtl ? "ذخیره اطلاعات سازمان" : "Save organization profile")}</button>}
      </form>
    </section>
    <div className="form-note">{rtl ? "مدیریت اعضا و نقش‌ها در این نسخه فعال نیست؛ هیچ عضوی از این صفحه نمی‌تواند امتیاز یا عضویت خود را تغییر دهد." : "Membership and role administration are not available in this release. This screen cannot change your role or organization membership."}</div>
  </section>;
}

function EntityPage({ kind, search, onCreate, onEditCustomer, onEditProduct, lang, notify, canManage = false, onOrderTransition }: { kind: "customers" | "sales" | "products" | "inventory"; search: string; onCreate: () => void; onEditCustomer?: (customer: Customer) => void; onEditProduct?: (product: Product) => void; lang: Lang; notify: (message: string) => void; canManage?: boolean; onOrderTransition?: (id: string, status: "paid" | "cancelled") => Promise<void> }) {
  const rtl = lang === "fa";
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(true);
  const [sortAsc, setSortAsc] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const entityQuery = useQuery({ queryKey: ["entity", kind], queryFn: () => getEntityData(kind) });
  const queryClient = useQueryClient();
  const title = kind === "customers" ? (rtl ? "مشتریان" : "Customers") : kind === "sales" ? (rtl ? "سفارش‌های فروش" : "Sales orders") : kind === "products" ? (rtl ? "محصولات" : "Products") : (rtl ? "نمای کلی موجودی" : "Inventory overview");
  const subtitle = kind === "customers" ? (rtl ? "مشتریان و ارتباطات کسب‌وکار خود را مدیریت کنید." : "Manage your customers and their business information.") : kind === "sales" ? (rtl ? "سفارش‌های فروش را پیگیری، مدیریت و ایجاد کنید." : "Track, manage and create sales orders.") : (rtl ? "موجودی محصولات، ارزش و سطوح سفارش مجدد را مدیریت کنید." : "Manage product stock levels, valuation and reorder points.");
  const filterOptions = kind === "customers" ? ["All", "Active", "Lead", "Inactive"] :
    kind === "sales" ? ["All", "Paid", "Pending", "Overdue"] :
      kind === "products" ? ["All", "Active", "Inactive", "In stock", "Low stock", "Out of stock"] : ["All", "In stock", "Low stock", "Out of stock"];
  const activeFilter = filterOptions.includes(filter) ? filter : "All";
  const rawItems = entityQuery.data ?? [];
  const filtered = useMemo(() => rawItems.filter((item) => {
    const text = Object.values(item).join(" ").toLowerCase().includes(search.toLowerCase());
    const status = "status" in item ? item.status : "";
    const productFilterMatch = kind !== "products" || activeFilter === "All" ||
      (activeFilter === "Active" && (!("isActive" in item) || item.isActive !== false)) ||
      (activeFilter === "Inactive" && "isActive" in item && item.isActive === false) ||
      (activeFilter !== "Active" && activeFilter !== "Inactive" && status === activeFilter);
    return text && (kind === "products" ? productFilterMatch : activeFilter === "All" || status === activeFilter);
  }).sort((a, b) => sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)), [rawItems, search, activeFilter, sortAsc]);
  const pageItems = filtered.slice(page * 5, page * 5 + 5);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 5));
  const allVisibleSelected = pageItems.length > 0 && pageItems.every((item) => selected.includes(item.id));
  const selection = (id: string, checked: boolean) => setSelected((items) => checked ? [...new Set([...items, id])] : items.filter((item) => item !== id));
  const selectAll = (checked: boolean) => setSelected((items) => checked ? [...new Set([...items, ...pageItems.map((item) => item.id)])] : items.filter((id) => !pageItems.some((item) => item.id === id)));
  const bulkArchive = async () => {
    if (kind !== "customers" && kind !== "products") { notify(rtl ? "برای حفظ سابقه، این رکوردها بایگانی نمی‌شوند." : "These records are protected to preserve transaction history."); return; }
    if (!window.confirm(rtl ? `${selected.length} مورد بایگانی شود؟` : `Archive ${selected.length} selected records?`)) return;
    try {
      await Promise.all(selected.map((id) => kind === "customers" ? deleteCustomer(id) : deleteProduct(id)));
      setSelected([]);
      notify(rtl ? "موارد انتخاب‌شده بایگانی شدند." : "Selected records archived.");
      setPage(0);
      await queryClient.invalidateQueries({ queryKey: ["entity", kind] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (failure) {
      notify(localizeError(lang, failure instanceof Error ? failure.message : "Could not delete the selected customers."));
    }
  };
  const removeCustomer = async (id: string, name: string) => {
    if (!window.confirm(rtl ? `${name} بایگانی شود؟` : `Archive ${name}?`)) return;
    try {
      await deleteCustomer(id);
      notify(rtl ? "مشتری حذف شد." : "Customer deleted.");
      await queryClient.invalidateQueries({ queryKey: ["entity", kind] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (failure) {
      notify(localizeError(lang, failure instanceof Error ? failure.message : "Could not delete this customer."));
    }
  };
  const toggleProduct = async (product: Product) => {
    const isActive = product.isActive === false;
    if (!isActive && !window.confirm(`${t(lang, "Deactivate")} ${product.name}? ${t(lang, "Historical transactions will be preserved.")}`)) return;
    try {
      await setProductActive(product.id, isActive);
      notify(t(lang, isActive ? "Product activated." : "Product deactivated."));
      await queryClient.invalidateQueries({ queryKey: ["entity", "products"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (failure) {
      notify(localizeError(lang, failure instanceof Error ? failure.message : "Could not update this product."));
    }
  };
  if (entityQuery.isPending) return <div className="page-loading"><div className="loading-spinner" />{rtl ? "در حال بارگذاری..." : "Loading records..."}</div>;
  if (entityQuery.isError) return <div className="page-error"><strong>{rtl ? "بارگیری اطلاعات ناموفق بود" : "Could not load records"}</strong><p>{localizeError(lang, entityQuery.error.message)}</p><button className="button button-primary" onClick={() => void entityQuery.refetch()}>{rtl ? "تلاش دوباره" : "Try again"}</button></div>;
  return <><section className="entity-page"><div className="welcome-row entity-title-row"><div><div className="eyebrow">{t(lang, "Workspace")} / {title}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="page-actions"><button className="button button-secondary" disabled={!filtered.length} onClick={() => downloadCsv(`nexacore-${kind}.csv`, filtered)}><Download size={16} />{rtl ? "خروجی" : "Export"}</button>{canManage && <button className="button button-primary" onClick={onCreate}><Plus size={17} />{kind === "customers" ? (rtl ? "مشتری جدید" : "Add customer") : kind === "sales" ? (rtl ? "سفارش جدید" : "Create order") : (rtl ? "محصول جدید" : "Add Product")}</button>}</div></div>
    <div className="entity-metrics">{[
      ["Total records", formatNumber(rawItems.length, lang), "Current organization"],
      [kind === "customers" ? "Active" : kind === "sales" ? "Paid" : "In stock", formatNumber(rawItems.filter((item) => item.status === (kind === "customers" ? "Active" : kind === "sales" ? "Paid" : "In stock")).length, lang), "Current status"],
      [kind === "sales" ? "Pending" : kind === "customers" ? "Leads" : "Low stock", formatNumber(rawItems.filter((item) => item.status === (kind === "sales" ? "Pending" : kind === "customers" ? "Lead" : "Low stock")).length, lang), kind === "products" ? "At or below reorder point" : "Current status"],
    ].map(([label, value, detail]) => <div className="entity-metric" key={label}><span>{t(lang, label)}</span><strong>{value}</strong><small>{t(lang, detail)}</small></div>)}</div>
    <div className="panel entity-table-panel"><div className="entity-toolbar"><div className="filter-tabs">{filterOptions.map((item) => <button key={item} className={`filter-tab${activeFilter === item ? " selected" : ""}`} onClick={() => { setFilter(item); setPage(0); }}>{t(lang, item)}<span>{item === "All" ? rawItems.length : rawItems.filter((entry) => kind === "products" && (item === "Active" || item === "Inactive") && "isActive" in entry ? (entry.isActive !== false) === (item === "Active") : entry.status === item).length}</span></button>)}</div><div className="table-tools"><button className="button button-secondary small-button" onClick={() => setVisible(!visible)}><SlidersHorizontal size={15} />{t(lang, "Columns")}</button></div></div>
    {selected.length > 0 && <div className="bulk-toolbar"><span>{selected.length} {rtl ? "مورد انتخاب شد" : "selected"}</span>{canManage && kind !== "sales" && <button className="button button-secondary small-button" onClick={() => void bulkArchive()}>{t(lang, "Archive selected")}</button>}<button className="icon-button" aria-label={t(lang, "Clear selection")} onClick={() => setSelected([])}><X size={15} /></button></div>}
    <div className="table-wrap entity-table-wrap"><table><thead><tr><th className="checkbox-cell"><input type="checkbox" aria-label={t(lang, "Select all rows")} checked={allVisibleSelected} onChange={(event) => selectAll(event.target.checked)} /></th><th>{kind === "customers" ? (rtl ? "نام مشتری" : "Customer") : kind === "sales" ? (rtl ? "سفارش" : "Order") : t(lang, "Product")}<button className="sort-trigger" onClick={() => setSortAsc(!sortAsc)} aria-label={t(lang, "Sort by identifier")}><ChevronDown size={13} /></button></th>{visible && (kind === "customers" ? <><th>{t(lang, "Status")}</th><th>{rtl ? "ایمیل" : "Email address"}</th><th>{rtl ? "شرکت" : "Company"}</th><th>{rtl ? "مکان" : "Location"}</th><th>{rtl ? "تاریخ عضویت" : "Date added"}</th></> : kind === "sales" ? <><th>{t(lang, "Customer")}</th><th>{t(lang, "Date")}</th><th>{t(lang, "Amount")}</th><th>{t(lang, "Items")}</th><th>{t(lang, "Status")}</th></> : <><th>{t(lang, "Category")}</th>{canManage && <th>{t(lang, "Purchase cost")}</th>}<th>{t(lang, "Selling price")}</th><th>{t(lang, "On hand")}</th><th>{t(lang, "Stock status")}</th><th>{t(lang, "Status")}</th></>)}<th className="action-cell" /></tr></thead>
      <tbody>{pageItems.map((item, index) => <tr key={item.id}><td className="checkbox-cell"><input type="checkbox" aria-label={`${t(lang, "Select row")} ${item.id}`} checked={selected.includes(item.id)} onChange={(event) => selection(item.id, event.target.checked)} /></td>
      {kind === "customers" && "company" in item ? <><td><div className="entity-primary"><span className={`customer-avatar avatar-${index % 5}`}>{initials(item.name)}</span><span><strong>{item.name}</strong><small>{item.id}</small></span></div></td>{visible && <><td><StatusBadge status={item.status} lang={lang} /></td><td>{item.email}</td><td>{item.company}</td><td>{item.location}</td><td className="muted-cell">{item.joined}</td></>}{canManage && <td className="action-cell"><button className="icon-button" aria-label={rtl ? `ویرایش ${item.name}` : `Edit ${item.name}`} title={rtl ? "ویرایش" : "Edit"} onClick={() => onEditCustomer?.(item)}><Pencil size={16} /></button><button className="icon-button" aria-label={rtl ? `بایگانی ${item.name}` : `Archive ${item.name}`} title={rtl ? "بایگانی" : "Archive"} onClick={() => void removeCustomer(item.id, item.name)}><Archive size={16} /></button></td>}</>
      : kind === "sales" && "total" in item ? <><td><strong className="id-cell">{item.id}</strong></td>{visible && <><td>{item.customer}</td><td className="muted-cell">{item.date}</td><td className="amount-cell">{formatMoney(item.total, rtl)}</td><td>{item.items} {rtl ? "قلم" : "items"}</td><td><StatusBadge status={item.status} lang={lang} /></td></>}<td className="action-cell">{canManage && item.status === "Pending" && <><button className="icon-button" aria-label={`Mark ${item.id} paid`} title={rtl ? "ثبت پرداخت" : "Mark paid"} onClick={() => { void (async () => { try { await onOrderTransition?.(item.apiId ?? item.id, "paid"); notify(rtl ? "سفارش پرداخت‌شده ثبت شد." : "Order marked as paid."); } catch (failure) { notify(failure instanceof Error ? failure.message : "Could not update order."); } })(); }}><Check size={16} /></button><button className="icon-button" aria-label={`Cancel ${item.id}`} title={rtl ? "لغو سفارش" : "Cancel order"} onClick={() => { if (!window.confirm(rtl ? `سفارش ${item.id} لغو شود؟ موجودی به انبار بازمی‌گردد.` : `Cancel ${item.id}? Its stock will be restored.`)) return; void (async () => { try { await onOrderTransition?.(item.apiId ?? item.id, "cancelled"); notify(rtl ? "سفارش لغو و موجودی بازگردانده شد." : "Order cancelled and stock restored."); } catch (failure) { notify(failure instanceof Error ? failure.message : "Could not update order."); } })(); }}><X size={16} /></button></>}<button className="icon-button" aria-label={`View ${item.id}`} onClick={() => setViewingOrder(item)}><MoreHorizontal size={18} /></button></td></>
      : "sku" in item ? <><td><div className="entity-primary"><span className="product-thumbnail"><Package size={17} /></span><span><button type="button" className="text-button" onClick={() => setViewingProduct(item)}>{item.name}</button><small>{item.sku}</small></span></div></td>{visible && <><td>{item.category}</td>{canManage && <td className="amount-cell">{formatCurrency(item.purchaseCost ?? 0, lang)}</td>}<td className="amount-cell">{formatCurrency(item.price, lang)}</td><td><div className="stock-cell"><span className={item.status === "In stock" ? "" : "stock-low"}>{formatNumber(item.stock, lang)} {formatUnit(item.unitOfMeasure ?? "unit", lang)}</span><small>{t(lang, "Reorder point")}: {formatNumber(item.reorderPoint ?? 0, lang)}</small><span className="stock-bar"><i style={{ width: `${Math.min(100, item.stock)}%` }} className={item.status === "In stock" ? "" : "low"} /></span></div></td><td><StatusBadge status={item.status} lang={lang} /></td><td><StatusBadge status={item.isActive === false ? "Inactive" : "Active"} lang={lang} /></td></>}{<td className="action-cell"><button className="icon-button" aria-label={`${t(lang, "View details")}: ${item.name}`} title={t(lang, "View details")} onClick={() => setViewingProduct(item)}><Eye size={16} /></button>{canManage && <><button className="icon-button" aria-label={`${t(lang, "Edit")}: ${item.name}`} title={t(lang, "Edit")} onClick={() => onEditProduct?.(item)}><Pencil size={16} /></button>{item.isActive === false ? <button className="button button-secondary small-button" onClick={() => void toggleProduct(item)}>{t(lang, "Activate")}</button> : <button className="icon-button" aria-label={`${t(lang, "Deactivate")}: ${item.name}`} title={t(lang, "Deactivate")} onClick={() => void toggleProduct(item)}><Archive size={16} /></button>}</>}</td>}</> : null}</tr>)}</tbody>
    </table>{pageItems.length === 0 && <div className="empty-state"><span className="empty-icon"><Search size={20} /></span><strong>{rtl ? "موردی یافت نشد" : "No results found"}</strong><p>{rtl ? "فیلترها یا عبارت جستجو را تغییر دهید." : "Try adjusting your search or filters."}</p><button className="button button-secondary small-button" onClick={() => { setFilter("All"); }}>{rtl ? "پاک کردن فیلترها" : "Clear filters"}</button></div>}</div>
    <div className="table-pagination"><span>{rtl ? `نمایش ${filtered.length ? page * 5 + 1 : 0} تا ${Math.min(page * 5 + 5, filtered.length)} از ${filtered.length} نتیجه` : `Showing ${filtered.length ? page * 5 + 1 : 0}–${Math.min(page * 5 + 5, filtered.length)} of ${filtered.length} results`}</span><div><button className="button button-secondary small-button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}><ArrowLeft size={14} />{rtl ? "قبلی" : "Previous"}</button><span className="page-indicator">{page + 1} / {pageCount}</span><button className="button button-secondary small-button" onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}>{rtl ? "بعدی" : "Next"}<ArrowRight size={14} /></button></div></div></div>
  </section>{viewingOrder && <OrderDetailsDialog order={viewingOrder} lang={lang} onClose={() => setViewingOrder(null)} />}{viewingProduct && <ProductDetailsDialog product={viewingProduct} lang={lang} canViewCost={canManage} onClose={() => setViewingProduct(null)} />}</>;
}

function EntityModal({ kind, customer, product, lang, onClose, onSaved }: { kind: EntityType; customer?: Customer; product?: Product; lang: Lang; onClose: () => void; onSaved: (message: string) => void }) {
  const rtl = lang === "fa";
  const [submissionError, setSubmissionError] = useState("");
  const customerQuery = useQuery({ queryKey: ["entity", "customers"], queryFn: () => getEntityData("customers"), enabled: kind === "order" });
  const productQuery = useQuery({ queryKey: ["entity", "products"], queryFn: () => getEntityData("products"), enabled: kind === "order" });
  const customerOptions = (customerQuery.data ?? []).filter((item): item is Customer => "company" in item);
  const productOptions = (productQuery.data ?? []).filter((item): item is Product => "sku" in item && item.isActive !== false);
  const common = { mode: "onSubmit" as const };
  const customerForm = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer ? {
      name: customer.name,
      company: customer.company,
      email: customer.email,
      phone: customer.phone,
    } : undefined,
    ...common,
  });
  const productForm = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? {
      name: product.name,
      sku: product.sku,
      category: product.category,
      description: product.description ?? "",
      unit_of_measure: product.unitOfMeasure ?? "unit",
      stock: String(product.stock),
      purchase_cost: String(product.purchaseCost ?? 0),
      price: String(product.price),
      reorder_point: String(product.reorderPoint ?? 0),
      is_active: product.isActive !== false,
    } : {
      name: "",
      sku: "",
      category: "",
      description: "",
      unit_of_measure: "unit",
      stock: "0",
      purchase_cost: "0",
      price: "0",
      reorder_point: "0",
      is_active: true,
    },
    ...common,
  });
  const orderForm = useForm<z.input<typeof orderSchema>, unknown, OrderForm>({ resolver: zodResolver(orderSchema), defaultValues: { quantity: 1, unit_price: 100 }, ...common });
  const productSelect = orderForm.register("product");
  const title = kind === "customer" ? customer ? (rtl ? "ویرایش مشتری" : "Edit customer") : (rtl ? "افزودن مشتری" : "Add a customer") : kind === "order" ? (rtl ? "ایجاد سفارش جدید" : "Create a sales order") : product ? (rtl ? "ویرایش محصول" : "Edit product") : (rtl ? "افزودن محصول" : "Add a product");
  const saveCustomer = async (values: CustomerForm) => {
    try {
      if (customer) {
        await updateCustomer(customer.id, values);
        onSaved(rtl ? "اطلاعات مشتری به‌روزرسانی شد." : "Customer updated successfully.");
      } else {
        await createCustomer(values);
        onSaved(rtl ? "مشتری با موفقیت اضافه شد." : "Customer added successfully.");
      }
    } catch (failure) {
      setSubmissionError(localizeError(lang, failure instanceof Error ? failure.message : "Could not save this customer."));
    }
  };
  const saveProduct = async (values: ProductFormValues) => {
    try {
      if (product) {
        await updateProduct(product.id, getProductWriteValues(values, false));
        onSaved(rtl ? "محصول به‌روزرسانی شد." : "Product updated successfully.");
      } else {
        await createProduct(getProductWriteValues(values, true));
        onSaved(rtl ? "محصول با موفقیت اضافه شد." : "Product added successfully.");
      }
    } catch (failure) {
      if (failure instanceof ApiRequestError) {
        const fieldNames = ["name", "sku", "category", "description", "unit_of_measure", "purchase_cost", "price", "stock", "reorder_point", "is_active"] as const;
        for (const fieldName of fieldNames) {
          const message = failure.fieldErrors[fieldName];
          if (message) productForm.setError(fieldName, { type: "server", message });
        }
      }
      setSubmissionError(localizeError(lang, failure instanceof Error ? failure.message : "Could not save this product."));
    }
  };
  const saveOrder = async (values: OrderForm) => {
    try {
      await createSalesOrder(values);
      onSaved(rtl ? "سفارش جدید ایجاد شد." : "Sales order created successfully.");
    } catch (failure) {
      setSubmissionError(localizeError(lang, failure instanceof Error ? failure.message : "Could not create this order."));
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" dir={rtl ? "rtl" : "ltr"}>
    <div className="modal-header"><div><span className="modal-icon">{kind === "customer" ? <Users size={19} /> : kind === "order" ? <ShoppingCart size={19} /> : <Package size={19} />}</span><div><h2 id="modal-title">{title}</h2><p>{kind === "customer" ? customer ? (rtl ? "اطلاعات مشتری را به‌روزرسانی کنید." : "Update this customer's contact and business information.") : (rtl ? "اطلاعات تماس مشتری جدید را وارد کنید." : "Add a new person or business to your workspace.") : kind === "order" ? (rtl ? "جزئیات سفارش مشتری را ثبت کنید." : "Enter the customer and order details.") : product ? (rtl ? "مشخصات محصول را به‌روزرسانی کنید؛ موجودی را از عملیات انبار تغییر دهید." : "Update product details. Use inventory operations to change stock.") : (rtl ? "جزئیات محصول جدید خود را وارد کنید." : "Add a new item to your product catalog.")}</p></div></div><button className="icon-button" onClick={onClose} aria-label={t(lang, "Close")}><X size={19} /></button></div>
    {submissionError && <div role="alert" className="login-error modal-error">{submissionError}</div>}
    {kind === "customer" && <form onSubmit={customerForm.handleSubmit(saveCustomer)} className="modal-form"><FormField label={rtl ? "نام کامل" : "Full name"} placeholder="Olivia Rhye" error={customerForm.formState.errors.name?.message} {...customerForm.register("name")} /><FormField label={rtl ? "نام شرکت" : "Company name"} placeholder="Acme Inc." error={customerForm.formState.errors.company?.message} {...customerForm.register("company")} /><FormField label={rtl ? "آدرس ایمیل" : "Email address"} placeholder="you@company.com" type="email" error={customerForm.formState.errors.email?.message} {...customerForm.register("email")} /><FormField label={rtl ? "شماره تماس" : "Phone number"} placeholder="+1 555 0123" error={customerForm.formState.errors.phone?.message} {...customerForm.register("phone")} /><ModalActions rtl={rtl} onClose={onClose} loading={customerForm.formState.isSubmitting} /></form>}
    {kind === "product" && <form onSubmit={productForm.handleSubmit((values) => saveProduct({ ...values, is_active: product?.isActive !== false }))} className="modal-form">
      <FormField label={t(lang, "Product name")} placeholder={t(lang, "e.g. Wireless headphones")} error={productForm.formState.errors.name?.message ? localizeError(lang, productForm.formState.errors.name.message) : undefined} {...productForm.register("name")} />
      <FormField label={t(lang, "SKU")} placeholder={t(lang, "e.g. WH-2049")} error={productForm.formState.errors.sku?.message ? localizeError(lang, productForm.formState.errors.sku.message) : undefined} {...productForm.register("sku")} />
      <div className="form-row">
        <FormField label={t(lang, "Category")} placeholder={t(lang, "e.g. Electronics")} error={productForm.formState.errors.category?.message ? localizeError(lang, productForm.formState.errors.category.message) : undefined} {...productForm.register("category")} />
        <FormField label={t(lang, "Unit of measure")} placeholder={t(lang, "unit")} error={productForm.formState.errors.unit_of_measure?.message ? localizeError(lang, productForm.formState.errors.unit_of_measure.message) : undefined} {...productForm.register("unit_of_measure")} />
      </div>
      <label className="form-label">{t(lang, "Description")}<textarea rows={3} maxLength={5000} {...productForm.register("description")} /></label>
      <div className="form-row">
        <FormField label={t(lang, "Purchase cost")} type="text" inputMode="decimal" dir="ltr" placeholder="0.00" {...productForm.register("purchase_cost")} error={productForm.formState.errors.purchase_cost?.message ? localizeError(lang, productForm.formState.errors.purchase_cost.message) : undefined} />
        <FormField label={t(lang, "Selling price")} type="text" inputMode="decimal" dir="ltr" placeholder="0.00" {...productForm.register("price")} error={productForm.formState.errors.price?.message ? localizeError(lang, productForm.formState.errors.price.message) : undefined} />
      </div>
      <div className="form-row">
        <FormField label={t(lang, product ? "Current stock" : "Opening stock")} type="text" inputMode="numeric" dir="ltr" readOnly={Boolean(product)} {...productForm.register("stock")} error={productForm.formState.errors.stock?.message ? localizeError(lang, productForm.formState.errors.stock.message) : undefined} />
        <FormField label={t(lang, "Reorder point")} type="text" inputMode="numeric" dir="ltr" {...productForm.register("reorder_point")} error={productForm.formState.errors.reorder_point?.message ? localizeError(lang, productForm.formState.errors.reorder_point.message) : undefined} />
      </div>
      {product && <div className="form-note">{t(lang, "Status")}: {t(lang, product.isActive === false ? "Inactive" : "Active")} · {t(lang, "Use the product row action to safely change active status.")}</div>}
      <ModalActions rtl={rtl} onClose={onClose} loading={productForm.formState.isSubmitting} />
    </form>}
    {kind === "order" && <form onSubmit={orderForm.handleSubmit(saveOrder)} className="modal-form"><label className="form-label">{rtl ? "مشتری" : "Customer"}<select {...orderForm.register("customer")} defaultValue=""><option value="" disabled>{rtl ? "انتخاب مشتری..." : "Select a customer..."}</option>{customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.company}</option>)}</select>{orderForm.formState.errors.customer && <small className="field-error">{orderForm.formState.errors.customer.message}</small>}</label><label className="form-label">{rtl ? "محصول" : "Product"}<select {...productSelect} defaultValue="" onChange={(event) => { productSelect.onChange(event); const product = productOptions.find((item) => item.id === event.target.value); orderForm.setValue("unit_price", product?.price ?? 0); }}><option value="" disabled>{rtl ? "انتخاب محصول..." : "Select a product..."}</option>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatCurrency(product.price, lang)} · {formatNumber(product.stock, lang)} {formatUnit(product.unitOfMeasure ?? "unit", lang)}</option>)}</select>{orderForm.formState.errors.product && <small className="field-error">{orderForm.formState.errors.product.message}</small>}</label><div className="form-row"><FormField label={rtl ? "تعداد" : "Quantity"} placeholder="1" type="number" min="1" error={orderForm.formState.errors.quantity?.message} {...orderForm.register("quantity")} /><FormField label={rtl ? "قیمت واحد" : "Unit price"} type="number" readOnly error={orderForm.formState.errors.unit_price?.message} {...orderForm.register("unit_price")} /></div><div className="form-note"><CircleHelp size={15} />{rtl ? "موجودی و قیمت نهایی هنگام ثبت سفارش در سرور بررسی می‌شود." : "The server rechecks available stock and uses the product's current price when the order is placed."}</div><ModalActions rtl={rtl} onClose={onClose} loading={orderForm.formState.isSubmitting} /></form>}
  </section></div>;
}

function OrderDetailsDialog({ order, lang, onClose }: { order: Order; lang: Lang; onClose: () => void }) {
  const rtl = lang === "fa";
  const orderId = order.apiId ?? order.id;
  const detailQuery = useQuery({
    queryKey: ["sales-order", orderId],
    queryFn: () => getSalesOrderDetails(orderId),
  });

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card order-details-card" role="dialog" aria-modal="true" aria-labelledby="order-details-title" dir={rtl ? "rtl" : "ltr"}>
      <div className="modal-header"><div><span className="modal-icon"><ShoppingCart size={19} /></span><div><h2 id="order-details-title">{rtl ? "جزئیات سفارش" : "Order details"}</h2><p>{order.id} · {order.customer}</p></div></div><button className="icon-button" onClick={onClose} aria-label={rtl ? "بستن" : "Close"}><X size={19} /></button></div>
      {detailQuery.isPending ? <div className="page-loading"><div className="loading-spinner" />{rtl ? "در حال بارگذاری سفارش..." : "Loading order details..."}</div>
        : detailQuery.isError ? <div role="alert" className="login-error">{localizeError(lang, detailQuery.error.message)}<button className="button button-secondary small-button" onClick={() => void detailQuery.refetch()}>{rtl ? "تلاش دوباره" : "Try again"}</button></div> 
          : <div className="order-detail-content">
            <div className="order-detail-summary"><span>{rtl ? "وضعیت" : "Status"}<StatusBadge status={detailQuery.data.status} lang={lang} /></span><span>{rtl ? "جمع جزء" : "Subtotal"}<strong>{formatMoney(detailQuery.data.subtotal, rtl)}</strong></span><span>{rtl ? "تخفیف" : "Discount"}<strong>{formatMoney(detailQuery.data.discount, rtl)}</strong></span><span>{rtl ? "مالیات" : "Tax"}<strong>{formatMoney(detailQuery.data.tax, rtl)}</strong></span><span>{rtl ? "مبلغ کل" : "Total"}<strong>{formatMoney(detailQuery.data.total, rtl)}</strong></span></div>
            {detailQuery.data.items.length ? <div className="table-wrap"><table><thead><tr><th>{rtl ? "محصول" : "Product"}</th><th>{rtl ? "تعداد" : "Qty"}</th><th>{rtl ? "قیمت واحد" : "Unit price"}</th><th>{rtl ? "جمع" : "Line total"}</th></tr></thead><tbody>{detailQuery.data.items.map((line) => <tr key={line.id}><td>{line.product_name}</td><td>{line.quantity}</td><td>{formatMoney(line.unit_price, rtl)}</td><td>{formatMoney(line.line_total, rtl)}</td></tr>)}</tbody></table></div> : <div className="form-note">{rtl ? "این سفارش جزئیات قلم ندارد." : "This order has no line details."}</div>}
          </div>}
    </section>
  </div>;
}

function ProductDetailsDialog({ product, lang, canViewCost, onClose }: { product: Product; lang: Lang; canViewCost: boolean; onClose: () => void }) {
  const rtl = lang === "fa";
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card order-details-card" role="dialog" aria-modal="true" aria-labelledby="product-details-title" dir={rtl ? "rtl" : "ltr"}>
      <div className="modal-header"><div><span className="modal-icon"><Package size={19} /></span><div><h2 id="product-details-title">{product.name}</h2><p>{product.sku} · {product.id}</p></div></div><button className="icon-button" onClick={onClose} aria-label={rtl ? "بستن" : "Close"}><X size={19} /></button></div>
      <div className="order-detail-content">
        <div className="order-detail-summary">
          <span>{t(lang, "Category")}<strong>{product.category}</strong></span>
          <span>{t(lang, "Unit of measure")}<strong>{formatUnit(product.unitOfMeasure ?? "unit", lang)}</strong></span>
          {canViewCost &&           <span>{t(lang, "Purchase cost")}<strong>{formatCurrency(product.purchaseCost ?? 0, lang)}</strong></span>}
          <span>{t(lang, "Selling price")}<strong>{formatCurrency(product.price, lang)}</strong></span>
          <span>{t(lang, "On hand")}<strong>{formatNumber(product.stock, lang)}</strong></span>
          <span>{t(lang, "Reorder point")}<strong>{formatNumber(product.reorderPoint ?? 0, lang)}</strong></span>
          {product.description && <span>{t(lang, "Description")}<strong>{product.description}</strong></span>}
          <span>{t(lang, "Stock status")}<StatusBadge status={product.status} lang={lang} /></span>
          <span>{t(lang, "Status")}<StatusBadge status={product.isActive === false ? "Inactive" : "Active"} lang={lang} /></span>
        </div>
      </div>
    </section>
  </div>;
}

const FormField = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }>(
  ({ label, error, ...props }, ref) => (
    <label className="form-label">{label}<input ref={ref} {...props} />{error && <small className="field-error">{error}</small>}</label>
  ),
);
FormField.displayName = "FormField";
function ModalActions({ rtl, onClose, loading }: { rtl: boolean; onClose: () => void; loading: boolean }) {
  return <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>{rtl ? "انصراف" : "Cancel"}</button><button type="submit" className="button button-primary" disabled={loading}><Plus size={16} />{rtl ? "ذخیره" : "Save changes"}</button></div>;
}
function StatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const className = status.toLowerCase().replace(" ", "-");
  return <span className={`status-badge ${className}`}><i />{t(lang, status)}</span>;
}
function downloadCsv(fileName: string, rows: object[]) {
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const encode = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns, ...rows.map((row) => columns.map((column) => encode(Reflect.get(row, column))))]
    .map((line) => line.join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatMoney(amount: number, rtl: boolean) {
  return new Intl.NumberFormat(rtl ? "fa-IR" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: "standard" }).format(amount);
}
function seriesPath(data: { revenue: number; expenses: number }[], key: "revenue" | "expenses") {
  const maximum = Math.max(1, ...data.map((item) => item[key]));
  const step = data.length > 1 ? 720 / (data.length - 1) : 0;
  return data.map((item, index) => {
    const x = index * step;
    const y = 185 - (item[key] / maximum) * 165;
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
}

export default App;
