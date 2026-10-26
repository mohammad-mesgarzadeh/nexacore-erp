from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.organizations.models import Organization
from .models import Department, Employee


class HrAccessTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="HR Org", slug="hr-org")
        self.other = Organization.objects.create(name="Other HR", slug="other-hr")
        self.manager = get_user_model().objects.create_user(username="hr-manager", password="test-password", organization=self.org, role="manager")
        self.staff = get_user_model().objects.create_user(username="hr-staff", password="test-password", organization=self.org, role="staff")
        self.department = Department.objects.create(organization=self.org, name="Engineering")
        self.client = APIClient()

    def test_employee_create_is_tenant_scoped_and_manager_only(self):
        self.client.force_authenticate(self.staff)
        denied = self.client.post("/api/v1/employees/", {"employee_number": "E1", "full_name": "Person", "joined_on": "2025-01-01"}, format="json")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.manager)
        outside_department = Department.objects.create(organization=self.other, name="Private")
        response = self.client.post("/api/v1/employees/", {
            "employee_number": "E1", "full_name": "Person", "joined_on": "2025-01-01", "department": outside_department.pk,
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        valid = self.client.post("/api/v1/employees/", {
            "employee_number": "E1", "full_name": "Person", "joined_on": date.today().isoformat(), "department": self.department.pk,
        }, format="json")
        self.assertEqual(valid.status_code, 201, valid.data)
        self.assertEqual(Employee.objects.get().organization, self.org)
        duplicate = self.client.post("/api/v1/employees/", {
            "employee_number": "E1", "full_name": "Another Person", "joined_on": date.today().isoformat(),
        }, format="json")
        self.assertEqual(duplicate.status_code, 400)

    def test_staff_cannot_read_confidential_hr_data(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get("/api/v1/employees/").status_code, 403)

    def test_employee_report_date_range_is_applied(self):
        self.client.force_authenticate(self.manager)
        Employee.objects.create(
            organization=self.org,
            employee_number="E-DATE",
            full_name="Report employee",
            joined_on=date(2025, 1, 1),
        )
        within_range = self.client.get("/api/v1/employees/?from=2025-01-01&to=2025-01-31")
        outside_range = self.client.get("/api/v1/employees/?from=2026-01-01")
        self.assertEqual(within_range.status_code, 200)
        self.assertEqual(within_range.data["count"], 1)
        self.assertEqual(outside_range.data["count"], 0)
