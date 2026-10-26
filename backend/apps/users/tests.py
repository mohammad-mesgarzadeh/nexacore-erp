from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.organizations.models import Organization


class RegistrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.payload = {
            "full_name": "Ada Lovelace",
            "email": "Ada@Example.com",
            "username": "Ada.Lovelace",
            "organization_name": "Analytical Engines",
            "password": "Cobalt-River-74!Orbit",
            "confirm_password": "Cobalt-River-74!Orbit",
        }

    def register(self, **overrides):
        return self.client.post(
            "/api/v1/auth/register/",
            {**self.payload, **overrides},
            format="json",
        )

    def test_registration_creates_admin_user_and_its_own_organization(self):
        response = self.register(
            organization="another-tenant",
            role="admin",
            is_superuser=True,
            is_staff=True,
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(set(response.data), {"detail"})
        user = get_user_model().objects.get(username="ada.lovelace")
        self.assertEqual(user.email, "ada@example.com")
        self.assertEqual(user.first_name, "Ada")
        self.assertEqual(user.last_name, "Lovelace")
        self.assertEqual(user.role, "admin")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.organization.name, "Analytical Engines")
        self.assertEqual(user.organization.members.count(), 1)
        self.assertEqual(user.preferred_language, "en")
        self.assertEqual(user.preferred_theme, "light")
        self.assertNotEqual(user.organization.slug, "another-tenant")
        self.assertTrue(user.check_password(self.payload["password"]))
        self.assertNotEqual(user.password, self.payload["password"])

    def test_registered_user_can_sign_in_using_existing_jwt_endpoint(self):
        self.assertEqual(self.register().status_code, 201)

        response = self.client.post(
            "/api/v1/auth/token/",
            {"username": "ada.lovelace", "password": self.payload["password"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_registration_retry_does_not_create_duplicate_organization_or_membership(self):
        first = self.register()
        second = self.register()

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(Organization.objects.count(), 1)
        user = get_user_model().objects.get(username="ada.lovelace")
        self.assertEqual(user.organization.members.count(), 1)

    def test_new_user_creation_defaults_to_organization_admin_without_global_privileges(self):
        organization = Organization.objects.create(name="Default role", slug="default-role")
        user = get_user_model().objects.create_user(
            username="default-role-user",
            email="default-role@example.com",
            password="Valid-Password-92!Ridge",
            organization=organization,
        )

        self.assertEqual(user.role, "admin")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_authenticated_user_without_organization_gets_clear_access_error(self):
        user = get_user_model().objects.create_user(
            username="unassigned-user",
            email="unassigned@example.com",
            password="Valid-Password-92!Ridge",
            role="admin",
        )
        self.client.force_authenticate(user)

        response = self.client.get("/api/v1/products/")

        self.assertEqual(response.status_code, 403)
        self.assertIn("not assigned to an organization", response.data["detail"])

    def test_new_organization_owner_can_manage_products_after_sign_in(self):
        registration = self.register()
        self.assertEqual(registration.status_code, 201, registration.data)
        user = get_user_model().objects.get(username="ada.lovelace")
        self.assertEqual(user.role, "admin")
        self.assertEqual(user.organization.members.count(), 1)

        tokens = self.client.post(
            "/api/v1/auth/token/",
            {"username": "ada.lovelace", "password": self.payload["password"]},
            format="json",
        )
        self.assertEqual(tokens.status_code, 200, tokens.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens.data['access']}")

        created = self.client.post(
            "/api/v1/products/",
            {
                "name": "Registered workspace product",
                "sku": "NEW-ORG-1",
                "category": "Test",
                "description": "Created by the new organization owner",
                "unit_of_measure": "piece",
                "purchase_cost": "12.50",
                "price": "19.99",
                "stock": 7,
                "reorder_point": 3,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)

        updated = self.client.patch(
            f"/api/v1/products/{created.data['id']}/",
            {"price": "23.45", "reorder_point": 8},
            format="json",
        )
        self.assertEqual(updated.status_code, 200, updated.data)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens.data['access']}")
        refreshed = self.client.get("/api/v1/products/")
        self.assertEqual(refreshed.status_code, 200)
        product = refreshed.data["results"][0]
        self.assertEqual(product["sku"], "NEW-ORG-1")
        self.assertEqual(product["purchase_cost"], "12.50")
        self.assertEqual(product["price"], "23.45")
        self.assertEqual(product["stock"], 7)
        self.assertEqual(product["reorder_point"], 8)

        other_organization = Organization.objects.create(name="Different tenant", slug="different-tenant")
        foreign_product = Product.objects.create(
            organization=other_organization,
            name="Isolated product",
            sku="OTHER-TENANT-1",
            category="Test",
            price="1.00",
        )
        self.assertEqual(self.client.get(f"/api/v1/products/{foreign_product.pk}/").status_code, 404)

    def test_case_insensitive_duplicate_email_is_rejected(self):
        self.assertEqual(self.register().status_code, 201)

        response = self.register(username="another-user", email="ADA@EXAMPLE.COM")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(get_user_model().objects.filter(username="another-user").exists())
        self.assertEqual(Organization.objects.count(), 1)

    def test_duplicate_username_is_rejected_case_insensitively(self):
        self.assertEqual(self.register().status_code, 201)

        response = self.register(username="ADA.LOVELACE", email="different@example.com")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(get_user_model().objects.filter(email="different@example.com").exists())
        self.assertEqual(Organization.objects.count(), 1)

    def test_invalid_email_is_rejected(self):
        response = self.register(email="not-an-email")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertEqual(get_user_model().objects.count(), 0)
        self.assertEqual(Organization.objects.count(), 0)

    def test_weak_password_is_rejected(self):
        response = self.register(
            password="password12345",
            confirm_password="password12345",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)
        self.assertEqual(get_user_model().objects.count(), 0)
        self.assertEqual(Organization.objects.count(), 0)

    def test_password_confirmation_must_match(self):
        response = self.register(confirm_password="Different-Password-123!")

        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_password", response.data)
        self.assertEqual(get_user_model().objects.count(), 0)

    def test_registration_throttle_limits_anonymous_requests(self):
        responses = [
            self.register(username=f"signup-{index}", email=f"signup-{index}@example.com")
            for index in range(6)
        ]

        self.assertEqual([response.status_code for response in responses], [201] * 5 + [429])

    def test_email_database_constraint_is_case_insensitive(self):
        self.assertEqual(self.register().status_code, 201)
        organization = Organization.objects.create(name="Other", slug="other")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                get_user_model().objects.create_user(
                    username="duplicate-email",
                    email="ADA@EXAMPLE.COM",
                    password="Some-Valid-Password-123!",
                    organization=organization,
                )

        self.assertEqual(get_user_model().objects.filter(email__iexact="ada@example.com").count(), 1)


class UserPreferencesAndSecurityTests(TestCase):
    def setUp(self):
        organization = Organization.objects.create(name="First", slug="first")
        self.other_organization = Organization.objects.create(name="Second", slug="second")
        self.user = get_user_model().objects.create_user(
            username="preferences-user",
            email="preferences@example.com",
            password="Valid-Password-92!Ridge",
            first_name="Ada",
            last_name="Lovelace",
            organization=organization,
            role="staff",
        )
        self.other_user = get_user_model().objects.create_user(
            username="other-user",
            email="other@example.com",
            password="Valid-Password-92!Ridge",
            organization=self.other_organization,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_preferences_and_display_name_persist_only_for_current_user(self):
        response = self.client.patch(
            "/api/v1/auth/profile/",
            {
                "full_name": "Ada Byron",
                "preferred_language": "fa",
                "preferred_theme": "dark",
                "role": "admin",
                "organization": str(self.other_organization.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.other_user.refresh_from_db()
        self.assertEqual((self.user.first_name, self.user.last_name), ("Ada", "Byron"))
        self.assertEqual((self.user.preferred_language, self.user.preferred_theme), ("fa", "dark"))
        self.assertEqual(self.user.role, "staff")
        self.assertNotEqual(self.user.organization_id, self.other_organization.pk)
        self.assertEqual((self.other_user.preferred_language, self.other_user.preferred_theme), ("en", "light"))
        self.assertNotIn("password", response.data)

    def test_password_change_requires_current_password_and_uses_django_hashing(self):
        response = self.client.post(
            "/api/v1/auth/password/",
            {
                "current_password": "wrong-current-password",
                "new_password": "New-Valid-Password-82!Ridge",
                "confirm_password": "New-Valid-Password-82!Ridge",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)

        response = self.client.post(
            "/api/v1/auth/password/",
            {
                "current_password": "Valid-Password-92!Ridge",
                "new_password": "New-Valid-Password-82!Ridge",
                "confirm_password": "New-Valid-Password-82!Ridge",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("New-Valid-Password-82!Ridge"))
        self.assertNotEqual(self.user.password, "New-Valid-Password-82!Ridge")

    def test_profile_requires_authentication(self):
        unauthenticated = APIClient()
        self.assertEqual(unauthenticated.get("/api/v1/auth/profile/").status_code, 401)
