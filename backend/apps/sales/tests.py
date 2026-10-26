from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from apps.customers.models import Customer
from apps.inventory.models import Product, StockMovement
from apps.organizations.models import Organization
from .models import SalesOrder
from .services import create_sales_order

class SalesOrderServiceTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Northstar", slug="northstar")
        self.user = get_user_model().objects.create_user(
            username="seller",
            password="test-password",
            organization=self.organization,
            role="admin",
        )
        self.customer = Customer.objects.create(
            organization=self.organization,
            name="Olivia Rhye",
            company="Layers",
            email="olivia@example.com",
            created_by=self.user,
        )
        self.product = Product.objects.create(
            organization=self.organization,
            name="Headphones",
            sku="WH-1",
            category="Audio",
            stock=5,
            price=Decimal("100.00"),
        )

    def test_create_order_calculates_totals_and_records_stock_movement(self):
        order = create_sales_order(
            organization=self.organization,
            customer=self.customer,
            lines=[{"product": self.product, "quantity": 2}],
            discount=Decimal("10.00"),
            created_by=self.user,
        )
        self.product.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal("200.00"))
        self.assertEqual(order.tax, Decimal("15.20"))
        self.assertEqual(order.total, Decimal("205.20"))
        self.assertEqual(self.product.stock, 3)
        self.assertEqual(StockMovement.objects.get(reference=order.number).quantity, -2)

    def test_order_cannot_make_stock_negative(self):
        with self.assertRaises(ValidationError):
            create_sales_order(
                organization=self.organization,
                customer=self.customer,
                lines=[{"product": self.product, "quantity": 6}],
                created_by=self.user,
            )
        self.assertEqual(SalesOrder.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)

    def test_deactivated_products_cannot_be_sold(self):
        self.product.is_active = False
        self.product.save(update_fields=["is_active"])
        with self.assertRaises(ValidationError):
            create_sales_order(
                organization=self.organization,
                customer=self.customer,
                lines=[{"product": self.product, "quantity": 1}],
                created_by=self.user,
            )
        self.assertEqual(SalesOrder.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)

    def test_api_calculates_price_from_product_and_records_stock(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post(
            "/api/v1/sales-orders/",
            {"customer": str(self.customer.pk), "lines": [{"product": self.product.pk, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["total"], "216.00")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)
        self.assertEqual(StockMovement.objects.filter(kind=StockMovement.Kind.SALE).count(), 1)

    def test_api_rejects_orders_without_product_lines(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post(
            "/api/v1/sales-orders/",
            {"customer": str(self.customer.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("lines", response.data)

    def test_sales_report_date_filters_are_applied_and_validated(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.user)
        create_sales_order(
            organization=self.organization,
            customer=self.customer,
            lines=[{"product": self.product, "quantity": 1}],
        )

        after = client.get("/api/v1/sales-orders/?from=2099-01-01")
        self.assertEqual(after.status_code, 200)
        self.assertEqual(after.data["count"], 0)
        invalid = client.get("/api/v1/sales-orders/?from=2026-02-01&to=2026-01-01")
        self.assertEqual(invalid.status_code, 400)

    def test_manager_cancellation_restores_stock_and_records_reversal(self):
        from rest_framework.test import APIClient

        order = create_sales_order(
            organization=self.organization,
            customer=self.customer,
            lines=[{"product": self.product, "quantity": 2}],
            created_by=self.user,
        )
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.post(
            f"/api/v1/sales-orders/{order.pk}/transition/",
            {"status": SalesOrder.Status.CANCELLED},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.product.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(order.status, SalesOrder.Status.CANCELLED)
        self.assertEqual(self.product.stock, 5)
        reversal = StockMovement.objects.get(kind=StockMovement.Kind.REVERSAL, reference=order.number)
        self.assertEqual(reversal.quantity, 2)

    def test_staff_cannot_transition_order_status(self):
        from rest_framework.test import APIClient

        self.user.role = "staff"
        self.user.save(update_fields=["role"])
        order = create_sales_order(
            organization=self.organization,
            customer=self.customer,
            lines=[{"product": self.product, "quantity": 1}],
            created_by=self.user,
        )
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.post(
            f"/api/v1/sales-orders/{order.pk}/transition/",
            {"status": SalesOrder.Status.PAID},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        order.refresh_from_db()
        self.assertEqual(order.status, SalesOrder.Status.PENDING)

    def test_foreign_organization_order_cannot_be_transitioned(self):
        from rest_framework.test import APIClient

        other_organization = Organization.objects.create(name="Other", slug="other")
        other_customer = Customer.objects.create(
            organization=other_organization,
            name="Private customer",
            company="Private",
            email="private@example.com",
        )
        other_product = Product.objects.create(
            organization=other_organization,
            name="Private product",
            sku="PRIVATE-1",
            category="Other",
            stock=4,
            price=Decimal("25.00"),
        )
        foreign_order = create_sales_order(
            organization=other_organization,
            customer=other_customer,
            lines=[{"product": other_product, "quantity": 1}],
        )
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.post(
            f"/api/v1/sales-orders/{foreign_order.pk}/transition/",
            {"status": SalesOrder.Status.PAID},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        foreign_order.refresh_from_db()
        self.assertEqual(foreign_order.status, SalesOrder.Status.PENDING)
