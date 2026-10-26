from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.organizations.models import Organization
from .models import Product, StockMovement

class InventoryMovementTests(TestCase):
    def setUp(self):
        organization = Organization.objects.create(name="Northstar", slug="northstar")
        self.user = get_user_model().objects.create_user(
            username="manager",
            password="test-password",
            organization=organization,
            role="manager",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_initial_stock_is_recorded_as_a_receipt(self):
        response = self.client.post(
            "/api/v1/products/",
            {"name": "Keyboard", "sku": "KB-1", "category": "Electronics", "stock": 8, "price": "40.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(StockMovement.objects.get().quantity, 8)
        self.assertEqual(StockMovement.objects.get().kind, StockMovement.Kind.RECEIPT)

    def test_inventory_changes_must_use_adjustment_endpoint(self):
        product = Product.objects.create(
            organization=self.user.organization,
            name="Keyboard",
            sku="KB-2",
            category="Electronics",
            stock=8,
            price=Decimal("40.00"),
        )
        response = self.client.patch(
            f"/api/v1/products/{product.pk}/",
            {"stock": 2},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        product.refresh_from_db()
        self.assertEqual(product.stock, 8)

    def test_product_profile_can_be_updated_without_changing_stock(self):
        product = Product.objects.create(
            organization=self.user.organization,
            name="Keyboard",
            sku="KB-EDIT",
            category="Electronics",
            stock=8,
            price=Decimal("40.00"),
        )

        response = self.client.patch(
            f"/api/v1/products/{product.pk}/",
            {"name": "Compact keyboard", "category": "Accessories", "stock": 8},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        product.refresh_from_db()
        self.assertEqual(product.name, "Compact keyboard")
        self.assertEqual(product.category, "Accessories")
        self.assertEqual(product.stock, 8)

    def test_product_details_prices_and_reorder_point_are_persisted(self):
        response = self.client.post(
            "/api/v1/products/",
            {
                "name": "Desk lamp",
                "sku": "LAMP-1",
                "category": "Lighting",
                "description": "LED desk lamp",
                "unit_of_measure": "piece",
                "stock": 6,
                "purchase_cost": "12.50",
                "price": "24.99",
                "reorder_point": 3,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(pk=response.data["id"])
        self.assertEqual(product.purchase_cost, Decimal("12.50"))
        self.assertEqual(product.description, "LED desk lamp")
        self.assertEqual(product.unit_of_measure, "piece")
        self.assertEqual(product.reorder_point, 3)
        self.assertEqual(StockMovement.objects.filter(product=product).count(), 1)

        updated = self.client.patch(
            f"/api/v1/products/{product.pk}/",
            {"price": "29.99", "reorder_point": 8},
            format="json",
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        product.refresh_from_db()
        self.assertEqual(product.price, Decimal("29.99"))
        self.assertEqual(product.reorder_point, 8)
        self.assertEqual(product.stock, 6)
        self.assertEqual(StockMovement.objects.filter(product=product).count(), 1)

    def test_purchase_cost_is_hidden_from_staff_and_product_writes_are_manager_only(self):
        staff = get_user_model().objects.create_user(
            username="staff",
            password="********",
            organization=self.user.organization,
            role="staff",
        )
        product = Product.objects.create(
            organization=self.user.organization,
            name="Secure item",
            sku="STAFF-1",
            category="Test",
            purchase_cost=Decimal("8.00"),
            price=Decimal("12.00"),
        )
        self.client.force_authenticate(staff)
        listing = self.client.get("/api/v1/products/")
        self.assertEqual(listing.status_code, 200)
        record = next(item for item in listing.data["results"] if item["id"] == product.pk)
        self.assertNotIn("purchase_cost", record)
        self.assertEqual(record["price"], "12.00")
        update = self.client.patch(
            f"/api/v1/products/{product.pk}/",
            {"price": "2.00"},
            format="json",
        )
        self.assertEqual(update.status_code, 403)

    def test_product_sku_is_unique_per_organization_not_globally(self):
        first = self.client.post(
            "/api/v1/products/",
            {"name": "Shared SKU", "sku": "ORG-SKU", "category": "Test", "price": "1.00"},
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.data)
        other_organization = Organization.objects.create(name="Another Org", slug="another-org")
        other_user = get_user_model().objects.create_user(
            username="other-manager",
            password="********",
            organization=other_organization,
            role="manager",
        )
        self.client.force_authenticate(other_user)
        second = self.client.post(
            "/api/v1/products/",
            {"name": "Other organization item", "sku": "ORG-SKU", "category": "Test", "price": "1.00"},
            format="json",
        )
        self.assertEqual(second.status_code, 201, second.data)

    def test_negative_prices_quantities_and_reorder_points_are_rejected(self):
        base = {"name": "Monitor", "sku": "MON-1", "category": "Displays", "price": "10.00"}
        for field, value in (("price", "-1"), ("purchase_cost", "-1"), ("stock", -1), ("reorder_point", -1)):
            response = self.client.post("/api/v1/products/", {**base, field: value}, format="json")
            self.assertEqual(response.status_code, 400, (field, response.data))
        self.assertFalse(Product.objects.filter(sku="MON-1").exists())
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_stock_status_distinguishes_out_of_stock_and_uses_custom_reorder_point(self):
        out_of_stock = Product.objects.create(
            organization=self.user.organization,
            name="Out of stock",
            sku="STATUS-0",
            category="Test",
            stock=0,
            reorder_point=0,
            price=Decimal("1.00"),
        )
        low_stock = Product.objects.create(
            organization=self.user.organization,
            name="Low stock",
            sku="STATUS-1",
            category="Test",
            stock=4,
            reorder_point=5,
            price=Decimal("1.00"),
        )
        response = self.client.get("/api/v1/products/")
        statuses = {item["sku"]: item["status"] for item in response.data["results"]}
        self.assertEqual(statuses[out_of_stock.sku], "out_of_stock")
        self.assertEqual(statuses[low_stock.sku], "low_stock")

    def test_product_from_another_organization_is_not_retrievable(self):
        other_organization = Organization.objects.create(name="Other", slug="other")
        foreign_product = Product.objects.create(
            organization=other_organization,
            name="Private keyboard",
            sku="KB-PRIVATE",
            category="Electronics",
            stock=4,
            price=Decimal("20.00"),
        )

        response = self.client.get(f"/api/v1/products/{foreign_product.pk}/")

        self.assertEqual(response.status_code, 404)

    def test_product_and_inventory_lists_are_scoped_to_the_authenticated_organization(self):
        other_organization = Organization.objects.create(name="Other", slug="other")
        foreign_product = Product.objects.create(
            organization=other_organization,
            name="Private stock",
            sku="KB-PRIVATE-STOCK",
            category="Electronics",
            stock=4,
            price=Decimal("20.00"),
        )
        StockMovement.objects.create(
            organization=other_organization,
            product=foreign_product,
            kind=StockMovement.Kind.RECEIPT,
            quantity=4,
            note="Other tenant",
        )

        products = self.client.get("/api/v1/products/")
        movements = self.client.get("/api/v1/stock-movements/")

        self.assertEqual(products.status_code, 200)
        self.assertNotIn("KB-PRIVATE-STOCK", [item["sku"] for item in products.data["results"]])
        self.assertEqual(movements.status_code, 200)
        self.assertEqual(movements.data["count"], 0)

    def test_adjustment_is_audited_and_cannot_make_stock_negative(self):
        product = Product.objects.create(
            organization=self.user.organization,
            name="Keyboard",
            sku="KB-3",
            category="Electronics",
            stock=8,
            price=Decimal("40.00"),
        )
        response = self.client.post(
            "/api/v1/stock-movements/adjust/",
            {"product": product.pk, "quantity": -3, "note": "Cycle count"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        product.refresh_from_db()
        self.assertEqual(product.stock, 5)
        self.assertEqual(StockMovement.objects.get().quantity, -3)
        response = self.client.post(
            "/api/v1/stock-movements/adjust/",
            {"product": product.pk, "quantity": -6, "note": "Invalid adjustment"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        product.refresh_from_db()
        self.assertEqual(product.stock, 5)

    def test_duplicate_sku_is_rejected_and_product_deactivation_is_persisted(self):
        payload = {"name": "Keyboard", "sku": "UNIQUE-1", "category": "Electronics", "stock": 4, "price": "40.00"}
        created = self.client.post("/api/v1/products/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)

        duplicate = self.client.post(
            "/api/v1/products/",
            {**payload, "name": "Another keyboard"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400)

        archived = self.client.delete(f"/api/v1/products/{created.data['id']}/")
        self.assertEqual(archived.status_code, 204)
        product = Product.objects.get(pk=created.data["id"])
        self.assertFalse(product.is_active)
        self.assertEqual(product.stock, 4)
        self.assertEqual(StockMovement.objects.filter(product=product).count(), 1)

    def test_movement_report_supports_date_and_kind_filters(self):
        product = Product.objects.create(
            organization=self.user.organization,
            name="Filterable item",
            sku="FILTER-1",
            category="Test",
            stock=5,
            price="2.00",
        )
        self.client.post(
            "/api/v1/stock-movements/adjust/",
            {"product": product.pk, "quantity": 1, "note": "Report filter"},
            format="json",
        )
        matching = self.client.get("/api/v1/stock-movements/?kind=adjustment&from=2000-01-01")
        excluded = self.client.get("/api/v1/stock-movements/?from=2099-01-01")
        self.assertEqual(matching.status_code, 200)
        self.assertEqual(matching.data["count"], 1)
        self.assertEqual(excluded.data["count"], 0)
