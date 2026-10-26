from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from apps.core.views import DashboardView
from apps.customers.views import CustomerViewSet
from apps.inventory.views import ProductViewSet, StockMovementViewSet
from apps.sales.views import SalesOrderViewSet
from apps.users.views import RegistrationView
from apps.users.views import PasswordChangeView, UserProfileView
from apps.organizations.views import OrganizationProfileView
from apps.hr.views import DepartmentViewSet, EmployeeViewSet, JobPositionViewSet
from apps.suppliers.views import SupplierViewSet
from apps.procurement.views import PurchaseOrderViewSet
from apps.accounting.views import AccountViewSet, JournalEntryViewSet, AccountingReportView

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("products", ProductViewSet, basename="product")
router.register("stock-movements", StockMovementViewSet, basename="stock-movement")
router.register("sales-orders", SalesOrderViewSet, basename="sales-order")
router.register("departments", DepartmentViewSet, basename="department")
router.register("job-positions", JobPositionViewSet, basename="job-position")
router.register("employees", EmployeeViewSet, basename="employee")
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register("accounts", AccountViewSet, basename="account")
router.register("journal-entries", JournalEntryViewSet, basename="journal-entry")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/v1/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/v1/auth/register/", RegistrationView.as_view(), name="register"),
    path("api/v1/auth/profile/", UserProfileView.as_view(), name="user-profile"),
    path("api/v1/auth/password/", PasswordChangeView.as_view(), name="password-change"),
    path("api/v1/organization/", OrganizationProfileView.as_view(), name="organization-profile"),
    path("api/v1/accounting/reports/", AccountingReportView.as_view(), name="accounting-reports"),
    path("api/v1/dashboard/", DashboardView.as_view(), name="dashboard"),
    path("api/v1/", include(router.urls)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
