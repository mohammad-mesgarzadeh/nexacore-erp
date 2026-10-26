from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.inventory.models import Product, StockMovement
from apps.organizations.models import Organization
from apps.suppliers.models import Supplier
from .models import PurchaseOrder


class ProcurementWorkflowTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Procurement Org", slug="procurement-org")
        self.other = Organization.objects.create(name="Other Procurement", slug="other-procurement")
        self.manager = get_user_model().objects.create_user(username="procurement-manager", password="test-password", organization=self.org, role="manager")
        self.staff = get_user_model().objects.create_user(username="procurement-staff", password="test-password", organization=self.org, role="staff")
        self.supplier = Supplier.objects.create(organization=self.org, name="Parts Co")
        self.product = Product.objects.create(organization=self.org, name="Part", sku="P-1", category="Parts", stock=4, price=10)
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def create_order(self):
        return self.client.post("/api/v1/purchase-orders/", {
            "supplier": self.supplier.pk,
            "lines": [{"product": self.product.pk, "quantity": 5, "unit_cost": "4.50"}],
        }, format="json")

    def test_receipt_updates_inventory_and_creates_audited_movement_once(self):
        response = self.create_order()
        self.assertEqual(response.status_code, 201, response.data)
        order_id = response.data["id"]
        self.assertEqual(self.client.post(f"/api/v1/purchase-orders/{order_id}/transition/", {"status": "approved"}, format="json").status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/purchase-orders/{order_id}/transition/", {"status": "ordered"}, format="json").status_code, 200)
        line_id = response.data["lines"][0]["id"]
        received = self.client.post(f"/api/v1/purchase-orders/{order_id}/receive/", {"lines": [{"order_line": line_id, "quantity": 3}]}, format="json")
        self.assertEqual(received.status_code, 201, received.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)
        self.assertEqual(StockMovement.objects.filter(reference=response.data["number"], kind="receipt").count(), 1)
        second = self.client.post(f"/api/v1/purchase-orders/{order_id}/receive/", {"lines": [{"order_line": line_id, "quantity": 3}]}, format="json")
        self.assertEqual(second.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

    def test_staff_cannot_approve_and_cross_tenant_products_are_rejected(self):
        order = self.create_order()
        self.assertEqual(order.status_code, 201, order.data)
        foreign = Product.objects.create(organization=self.other, name="Foreign", sku="F-1", category="Parts", stock=9, price=1)
        bad = self.client.post("/api/v1/purchase-orders/", {"supplier": self.supplier.pk, "lines": [{"product": foreign.pk, "quantity": 1, "unit_cost": "1.00"}]}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.client.force_authenticate(self.staff)
        denied = self.client.post(f"/api/v1/purchase-orders/{order.data['id']}/transition/", {"status": "approved"}, format="json")
        self.assertEqual(denied.status_code, 403)

    def test_purchase_order_report_date_filter_is_applied(self):
        created = self.create_order()
        self.assertEqual(created.status_code, 201, created.data)
        future = self.client.get("/api/v1/purchase-orders/?from=2099-01-01")
        current = self.client.get("/api/v1/purchase-orders/?from=2000-01-01")
        self.assertEqual(future.data["count"], 0)
        self.assertEqual(current.data["count"], 1)
