from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.organizations.models import Organization
from .models import Customer

class CustomerTenantIsolationTests(TestCase):
    def setUp(self):
        first = Organization.objects.create(name="First", slug="first")
        second = Organization.objects.create(name="Second", slug="second")
        self.user = get_user_model().objects.create_user(username="first", password="test-password", organization=first)
        self.user.role = "staff"
        self.user.save(update_fields=["role"])
        Customer.objects.create(organization=first, name="Visible", company="First", email="first@example.com")
        Customer.objects.create(organization=second, name="Private", company="Second", email="second@example.com")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_list_only_returns_customers_for_the_users_organization(self):
        response = self.client.get("/api/v1/customers/")
        self.assertEqual(response.status_code, 200)
        names = [item["name"] for item in response.data["results"]]
        self.assertEqual(names, ["Visible"])

    def test_foreign_organization_customer_is_not_retrievable(self):
        private = Customer.objects.get(email="second@example.com")
        response = self.client.get(f"/api/v1/customers/{private.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_manager_can_update_a_customer_in_their_organization(self):
        self.user.role = "manager"
        self.user.save(update_fields=["role"])
        customer = Customer.objects.get(email="first@example.com")

        response = self.client.patch(
            f"/api/v1/customers/{customer.pk}/",
            {"name": "Updated name", "phone": "+1 555 0100"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        customer.refresh_from_db()
        self.assertEqual(customer.name, "Updated name")
        self.assertEqual(customer.phone, "+1 555 0100")
        self.assertEqual(customer.organization_id, self.user.organization_id)

    def test_manager_cannot_update_a_customer_in_another_organization(self):
        self.user.role = "manager"
        self.user.save(update_fields=["role"])
        private = Customer.objects.get(email="second@example.com")

        response = self.client.patch(
            f"/api/v1/customers/{private.pk}/",
            {"name": "Unauthorized change"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        private.refresh_from_db()
        self.assertEqual(private.name, "Private")

    def test_staff_cannot_mutate_customer_records(self):
        response = self.client.post(
            "/api/v1/customers/",
            {"name": "Blocked", "company": "First", "email": "blocked@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
