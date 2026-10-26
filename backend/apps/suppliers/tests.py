from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.organizations.models import Organization
from .models import Supplier


class SupplierApiTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Supply Org", slug="supply-org")
        self.other = Organization.objects.create(name="Other Supply", slug="other-supply")
        self.manager = get_user_model().objects.create_user(username="supply-manager", password="test-password", organization=self.org, role="manager")
        self.staff = get_user_model().objects.create_user(username="supply-staff", password="test-password", organization=self.org, role="staff")
        self.foreign = Supplier.objects.create(organization=self.other, name="Private Supplier")
        self.client = APIClient()

    def test_supplier_create_and_archive_preserves_record(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post("/api/v1/suppliers/", {"name": "Parts Co", "email": "bad"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/v1/suppliers/", {"name": "Parts Co", "email": "parts@example.com"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        supplier_id = response.data["id"]
        archived = self.client.patch(f"/api/v1/suppliers/{supplier_id}/", {"status": "inactive"}, format="json")
        self.assertEqual(archived.status_code, 200)
        self.assertTrue(Supplier.objects.filter(pk=supplier_id, organization=self.org, status="inactive").exists())

    def test_staff_can_read_but_not_write_and_foreign_supplier_is_hidden(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/api/v1/suppliers/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(self.client.post("/api/v1/suppliers/", {"name": "Nope"}, format="json").status_code, 403)
