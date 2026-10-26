from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.organizations.models import Organization
from .models import Account, JournalEntry


class AccountingPostingTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Finance Org", slug="finance-org")
        self.other = Organization.objects.create(name="Other Finance", slug="other-finance")
        self.manager = get_user_model().objects.create_user(username="finance-manager", password="test-password", organization=self.org, role="manager")
        self.staff = get_user_model().objects.create_user(username="finance-staff", password="test-password", organization=self.org, role="staff")
        self.cash = Account.objects.create(organization=self.org, code="1000", name="Cash", kind="asset")
        self.revenue = Account.objects.create(organization=self.org, code="4000", name="Revenue", kind="revenue")
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def create_entry(self, debit, credit, account=None):
        return self.client.post("/api/v1/journal-entries/", {
            "reference": "INV-01", "description": "Opening entry", "entry_date": "2025-01-01",
            "lines": [
                {"account": self.cash.pk, "debit": debit, "credit": "0"},
                {"account": account or self.revenue.pk, "debit": "0", "credit": credit},
            ],
        }, format="json")

    def test_unbalanced_entry_is_rejected_at_post_and_balanced_entry_is_immutable(self):
        unbalanced = self.create_entry("25", "20")
        self.assertEqual(unbalanced.status_code, 201, unbalanced.data)
        failed = self.client.post(f"/api/v1/journal-entries/{unbalanced.data['id']}/post/", {}, format="json")
        self.assertEqual(failed.status_code, 400)
        balanced = self.create_entry("25", "25")
        self.assertEqual(balanced.status_code, 201)
        posted = self.client.post(f"/api/v1/journal-entries/{balanced.data['id']}/post/", {}, format="json")
        self.assertEqual(posted.status_code, 200, posted.data)
        changed = self.client.patch(f"/api/v1/journal-entries/{balanced.data['id']}/", {"description": "mutated"}, format="json")
        self.assertEqual(changed.status_code, 400)
        report = self.client.get("/api/v1/accounting/reports/")
        self.assertEqual(report.status_code, 200)
        self.assertEqual(str(report.data["debit_total"]), str(report.data["credit_total"]))
        ledger = self.client.get(f"/api/v1/accounting/reports/?account={self.cash.pk}&from=2025-01-01&to=2025-01-31")
        self.assertEqual(ledger.status_code, 200, ledger.data)
        self.assertEqual(len(ledger.data["ledger"]), 1)
        self.assertEqual(ledger.data["ledger"][0]["entry__reference"], "INV-01")
        self.assertEqual(self.client.get("/api/v1/accounting/reports/?from=not-a-date").status_code, 400)

    def test_foreign_accounts_and_staff_access_are_rejected(self):
        foreign = Account.objects.create(organization=self.other, code="9000", name="Private", kind="asset")
        response = self.create_entry("10", "10", account=foreign.pk)
        self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get("/api/v1/journal-entries/").status_code, 403)
