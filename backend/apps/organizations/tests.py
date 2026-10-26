from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Organization


class OrganizationProfileTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Current", slug="current")
        self.other_organization = Organization.objects.create(name="Private", slug="private")
        self.staff_user = get_user_model().objects.create_user(
            username="staff-member",
            password="Valid-Password-92!Ridge",
            organization=self.organization,
            role="staff",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.staff_user)

    def test_member_can_read_only_their_organization(self):
        response = self.client.get("/api/v1/organization/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["name"], "Current")
        self.assertNotIn(str(self.other_organization.pk), str(response.data))

    def test_staff_cannot_change_organization_profile(self):
        response = self.client.patch("/api/v1/organization/", {"name": "Unauthorized"}, format="json")

        self.assertEqual(response.status_code, 403)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.name, "Current")

    def test_manager_can_change_organization_name_but_not_slug(self):
        self.staff_user.role = "manager"
        self.staff_user.save(update_fields=["role"])

        response = self.client.patch(
            "/api/v1/organization/",
            {"name": "Updated Workspace", "slug": "private"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.name, "Updated Workspace")
        self.assertEqual(self.organization.slug, "current")
