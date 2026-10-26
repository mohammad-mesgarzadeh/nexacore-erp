from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase
from django.db.migrations.executor import MigrationExecutor

from apps.inventory.models import Product
from apps.organizations.models import Organization


class PromoteUsersToAdminMigrationTests(TransactionTestCase):
    migrate_from = ("users", "0003_user_preferences")

    def test_promotes_roles_without_changing_users_or_business_records(self):
        executor = MigrationExecutor(connection)
        migrate_to = executor.loader.graph.leaf_nodes()
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        OldUser = old_apps.get_model("users", "User")

        try:
            organization = Organization.objects.create(name="Role migration tenant", slug="role-migration-tenant")
            product = Product.objects.create(
                organization=organization,
                name="Preserved product",
                sku="ROLE-MIGRATION-1",
                category="Test",
                stock=4,
                price="10.00",
            )
            original_users = {}
            for index, role in enumerate(("staff", "manager", "admin", "auditor")):
                user = OldUser.objects.create(
                    username=f"role-migration-{index}",
                    password=f"preserved-password-hash-{index}",
                    organization_id=organization.pk,
                    role=role,
                    is_staff=False,
                    is_superuser=False,
                )
                original_users[user.username] = (user.pk, user.organization_id, user.password)

            executor = MigrationExecutor(connection)
            executor.migrate(migrate_to)
            User = get_user_model()

            for username, (user_id, organization_id, password) in original_users.items():
                user = User.objects.get(username=username)
                self.assertEqual(user.role, "admin")
                self.assertEqual(user.pk, user_id)
                self.assertEqual(user.organization_id, organization_id)
                self.assertEqual(user.password, password)
                self.assertFalse(user.is_staff)
                self.assertFalse(user.is_superuser)

            product.refresh_from_db()
            self.assertEqual(product.organization_id, organization.pk)
            self.assertEqual(product.stock, 4)
            self.assertTrue(Product.objects.filter(pk=product.pk).exists())
        finally:
            MigrationExecutor(connection).migrate(migrate_to)
