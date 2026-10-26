# NexaCore ERP

A modular ERP portfolio application with a bilingual React dashboard, organization-scoped Django REST API, PostgreSQL, and Docker Compose.

## What works today

- Responsive dashboard with revenue trends, category breakdown, KPIs, recent orders, and activity.
- API-backed dashboard totals are organization-scoped; pending orders are not invoices, inventory value is estimated at catalog prices, and monthly expenses include posted expense journal entries only.
- English and Persian interface controls, RTL layout, localized number formatting, and Vazirmatn font.
- Customers: searchable/status-filtered list, pagination, selection, create/edit flows, and archival.
- Sales: searchable/filterable orders, validated creation, order details, manager-controlled paid/cancel transitions, and stock restoration/audit entries when an order is cancelled.
- Products and inventory: separate Products and Inventory routes; searchable product create/edit/deactivate workflows with SKU, description, unit, purchase cost, selling price, opening stock, and per-product reorder points. Opening stock creates an audited receipt movement; later quantity changes use controlled adjustments or transactional sales/procurement operations. Product status distinguishes out-of-stock, low-stock, and in-stock levels.
- Manage: organization profile read access for members and name updates for managers/administrators; customer and product master-data workflows are organization-scoped.
- Organization: profile read/update, plus tenant-owned departments and positions managed through HR.
- Preferences: user-specific display name, English/Persian language, light/dark theme, and authenticated password change. Account preferences are persisted by the API and reloaded at sign-in; language controls RTL and locale-based formatting, and theme is applied throughout the shell.
- HR: manager-only employee directory, department/job-position setup, employee create/edit/deactivation, and organization-scoped search/filtering. Employee records do not create login accounts.
- Suppliers: manager-controlled supplier create/edit/deactivation, member read access, and links to actual purchase-order history; supplier records are retained.
- Procurement: purchase orders with explicit draft/approval/rejection/order transitions and audited partial/full goods receipt that updates product stock and stock movements atomically.
- Accounting: organization chart of accounts, manager-only draft journal entries, double-entry validation at posting, immutable posted entries, reversals, and a persisted-ledger trial balance.
- Browser demo mode uses a separate local-storage data layer; set `VITE_API_URL` to connect the API-backed dashboard.
- Django API includes JWT endpoints, tenant-scoped sales, customers, products, HR, suppliers, procurement, accounting, stock movements, transactional operations, OpenAPI/Swagger, and demo seed data.
- Self-service sign-up creates a new organization and an organization-scoped administrator account; registration never accepts an organization ID or grants Django global staff or superuser privileges.
- Docker Compose provisions PostgreSQL, Django, and a production-built Nginx frontend.

Payroll, tax/compliance calculations, leave management, supplier invoicing, accounts payable/receivable, fiscal periods, currency conversion, automatic sales/purchase accounting postings, organization membership administration, and email invitations are not implemented.

## Run locally: frontend demo

Requirements: Node.js 20+ and npm.

```powershell
npm install
npm run dev
```

Open <http://localhost:5173>. No backend is required for the browser-persisted demo workspace.

## Run the full stack with Docker

Requirements: Docker Desktop with Compose.

1. Copy `.env.example` to `.env`.
2. Set `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD` to strong, unique values.
3. For local Vite development, set `VITE_API_URL=http://localhost:8001/api/v1`. Docker builds the frontend with the same-origin `/api/v1` reverse-proxy path.
4. Start the services:

```powershell
docker compose up --build
```

The application is served at <http://localhost:8080>. The API is available through the frontend proxy at <http://localhost:8080/api/v1/>; the loopback-only direct backend port is <http://localhost:8001>, with interactive OpenAPI docs at <http://localhost:8001/api/docs/>.

Compose waits for PostgreSQL health before starting Django; Django applies migrations on startup, and the frontend waits until the API health check succeeds.

Seed an isolated demo organization from a second terminal:

```powershell
docker compose exec backend python manage.py seed_demo
```

The seed command creates the local-only login `demo` / `Demo1234!ChangeMe`. Change it immediately and do not reuse it outside a local demo.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/register/` | Register an account and create its own organization |
| POST | `/api/v1/auth/token/` | Obtain JWT access and refresh tokens |
| POST | `/api/v1/auth/token/refresh/` | Refresh an access token |
| GET/PATCH | `/api/v1/auth/profile/` | Read/update the signed-in user's display name and personal preferences |
| POST | `/api/v1/auth/password/` | Change the signed-in user's password after current-password validation |
| GET/PATCH | `/api/v1/organization/` | Read the user's organization; managers/administrators can change its name |
| GET | `/api/v1/dashboard/` | Organization dashboard summary |
| GET/POST | `/api/v1/customers/` | List/create organization customers |
| GET/PATCH/DELETE | `/api/v1/customers/{id}/` | Read/update/archive a customer |
| GET/POST | `/api/v1/products/` | List/create organization products |
| GET/PATCH/DELETE | `/api/v1/products/{id}/` | Read/update/archive a product |
| GET | `/api/v1/stock-movements/` | List organization stock movements |
| POST | `/api/v1/stock-movements/adjust/` | Record an inventory adjustment |
| GET/POST/PATCH | `/api/v1/departments/` | List/create/update organization departments (managers/admins) |
| GET/POST/PATCH | `/api/v1/job-positions/` | List/create/update organization job positions (managers/admins) |
| GET/POST/PATCH | `/api/v1/employees/` | Search employee records; HR records are manager/admin-only |
| GET/POST/PATCH | `/api/v1/suppliers/` | List/create/update and deactivate suppliers; no hard deletion |
| GET/POST | `/api/v1/sales-orders/` | List or create sales orders |
| GET | `/api/v1/sales-orders/{id}/` | Read a sales order |
| POST | `/api/v1/sales-orders/{id}/transition/` | Mark a pending order paid or cancel it; cancellation restores stock and records reversal movements |
| GET/POST/PATCH | `/api/v1/purchase-orders/` | Create draft orders and list/update organization purchase orders |
| POST | `/api/v1/purchase-orders/{id}/transition/` | Approve/reject drafts, place approved orders, or cancel approved orders |
| POST | `/api/v1/purchase-orders/{id}/receive/` | Receive outstanding quantities and atomically create receipt stock movements |
| GET/POST/PATCH | `/api/v1/accounts/` | Maintain the organization chart of accounts (managers/admins) |
| GET/POST/PATCH | `/api/v1/journal-entries/` | Create draft accounting entries and read journal history |
| POST | `/api/v1/journal-entries/{id}/post/` | Post a draft only when debit and credit totals balance |
| POST | `/api/v1/journal-entries/{id}/reverse/` | Create a posted, balanced reversal instead of editing posted history |
| GET | `/api/v1/accounting/reports/?from=YYYY-MM-DD&to=YYYY-MM-DD` | Trial balance and posted journal history for the selected range |
| GET | `/api/schema/` | OpenAPI schema |
| GET | `/api/docs/` | Swagger UI |

Use the sign-in screen with the seeded demo account after enabling `VITE_API_URL`, or send a JWT bearer access token for authenticated API requests. Access tokens refresh automatically using the stored rotating refresh token. List endpoints support page-number pagination, `search`, `ordering`, and applicable status/category filters. Orders cannot be edited or deleted; managers and administrators may mark pending orders paid or cancel them through the transition endpoint. Cancellation restores stock and records reversal movements. Customer and product DELETE actions archive records rather than removing transaction history.

The public `/signup` route creates a new organization and its first account in one database transaction. All application user accounts receive the organization-scoped `admin` role (not Django's global staff or superuser privileges); the existing-user data migration promotes roles without changing user or organization records, and new user records default to `admin`. Registration automatically signs the user in through the existing JWT endpoint. Users cannot choose or join another organization during registration. Subsequent accounts require an administrator-provisioned invitation flow, which is not yet implemented. Registration is limited to five requests per hour per client IP. Passwords use Django's validators, require at least 12 characters, and are stored using Django's password hashers. Email verification is not configured. Preferences are stored per authenticated user; the browser-only demo saves its demo settings locally. Display formats use the selected application language; accounting and product prices remain USD because no multi-currency or conversion policy exists.

Purchasing is deliberately not an accounting event: a goods receipt updates inventory but does not create a payable or journal entry. Journal entries must be entered explicitly until organization-specific invoice, tax, currency, and posting rules are defined. The trial balance is calculated only from persisted posted journal lines; there are no fabricated expenses or balances. HR access is restricted to managers/admins; employees do not need user accounts. HR includes no payroll, leave, or legal-compliance claims. Department/position changes are organization scoped. Suppliers and purchase orders are retained, and only active suppliers can be selected for new orders. Product costs are visible only to managers and administrators; historical sales and purchase lines retain their stored transaction prices. Product prices continue to use the existing USD display convention because per-organization currency configuration is not implemented.

## Security and permissions

- JWT-authenticated data access is scoped to the signed-in user's organization.
- `staff` accounts can read organization data but cannot perform protected business-data or organization-profile mutations. `manager` and `admin` roles may mutate supported records; those permissions are enforced by DRF.
- HR and accounting records are restricted to managers/administrators for both reads and writes. Supplier and purchase-order reads are available to members; mutations require manager/administrator authorization.
- Procurement receipt/stock updates and accounting posting/reversal are transactional. Posted journal history is immutable; reversal entries preserve audit history.
- The user profile endpoint only updates the authenticated user's display name and personal preferences. It does not accept role or organization membership changes.
- Organization profile reads are scoped to the current membership; only managers and administrators can update its name.
- Organization membership and role administration are intentionally unavailable in the UI. Assign elevated roles only through an independently trusted administrative process.
- Password changes verify the current password and apply Django's configured password validators. Email verification and outgoing email delivery are not implemented.

## Test and build

```powershell
npm test
npm run lint
npm run build
docker compose exec backend python manage.py test apps.users apps.organizations apps.sales apps.customers apps.inventory apps.hr apps.suppliers apps.procurement apps.accounting
docker compose run --rm backend python manage.py makemigrations --check --dry-run
docker compose run --rm backend python manage.py spectacular --validate
```

## Architecture

- `src/data/store.ts` is the browser-only demo persistence adapter; UI components do not contain mock response payloads.
- `src/data/api.ts` is the API boundary for live authentication, user preferences, organization profile, HR, suppliers, procurement, accounting, dashboard, customers, inventory, and sales workflows. The API URL is supplied by `VITE_API_URL`.
- `backend/apps` separates users, organizations, customers, inventory, sales, HR, suppliers, procurement, accounting, and shared reporting concerns.
- Tenant-owned querysets are scoped to the authenticated user's organization. HR and accounting are additionally restricted to manager/administrator roles.
- Sales and procurement stock locking/updates, receiving, journal posting, reversal, and movement recording are isolated in atomic domain services.
- `.env.example` documents runtime configuration; secrets are never committed as configuration defaults for deployment.

## Contributing

Contributions should keep organization-scoped access checks in the backend, add regression tests for business and permission behavior, and preserve the documented distinction between implemented modules and planned work. Run the frontend build and targeted Django test command above before submitting changes.

## License

No license has been specified for this project yet.

## Current scope and next steps

This increment includes order processing, inventory reconciliation, customer/product master-data management, organization profile and structure, user preferences, password changes, HR directory workflows, suppliers, purchase orders and receiving, and a foundational double-entry journal/trial balance. Self-service registration and JWT sign-in/refresh are implemented. Planned work includes invitations and safe administrator onboarding, member/role management, payroll/leave, supplier invoices and payables/receivables, fiscal periods, currency/tax policies, automatic accounting integrations, email verification, and automated frontend component tests.
