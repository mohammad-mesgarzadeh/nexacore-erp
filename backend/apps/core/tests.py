from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.organizations.models import Organization
from apps.accounting.models import Account, JournalEntry, JournalLine
from django.utils import timezone


class DashboardInventoryMetricsTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Dashboard Org", slug="dashboard-org")
        self.other_organization = Organization.objects.create(name="Other Dashboard Org", slug="other-dashboard-org")
        self.user = get_user_model().objects.create_user(
            username="dashboard-user",
            password="test-password",
            organization=self.organization,
            role="manager",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_low_stock_metric_uses_reorder_points_across_all_tenant_products(self):
        for index in range(12):
            Product.objects.create(
                organization=self.organization,
                name=f"Product {index}",
                sku=f"SKU-{index}",
                category="Test",
                stock=3 if index < 11 else 12,
                reorder_point=5 if index < 11 else 10,
                price="1.00",
            )
        Product.objects.create(
            organization=self.other_organization,
            name="Foreign low stock",
            sku="FOREIGN",
            category="Test",
            stock=0,
            reorder_point=10,
            price="1.00",
        )

        response = self.client.get("/api/v1/dashboard/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["products"]), 10)
        self.assertEqual(response.data["summary"]["low_stock_products"], 11)

    def test_monthly_expenses_come_from_posted_expense_journal_lines(self):
        expense = Account.objects.create(organization=self.organization, code="5000", name="Rent", kind="expense")
        cash = Account.objects.create(organization=self.organization, code="1000", name="Cash", kind="asset")
        entry = JournalEntry.objects.create(
            organization=self.organization,
            reference="RENT-1",
            description="Recorded rent",
            entry_date=timezone.localdate(),
            status=JournalEntry.Status.POSTED,
        )
        JournalLine.objects.create(entry=entry, account=expense, debit="125.00", credit="0")
        JournalLine.objects.create(entry=entry, account=cash, debit="0", credit="125.00")

        response = self.client.get("/api/v1/dashboard/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(str(response.data["summary"]["monthly_expenses"]), "125.00")
        current_month = next(item for item in response.data["analytics"]["trend"] if item["month"] == timezone.localdate().strftime("%Y-%m"))
        self.assertEqual(str(current_month["expenses"]), "125.00")
