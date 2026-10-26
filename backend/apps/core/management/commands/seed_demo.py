from decimal import Decimal
from django.core.management.base import BaseCommand
from apps.organizations.models import Organization
from apps.users.models import User
from apps.customers.models import Customer
from apps.inventory.models import Product
from apps.sales.services import create_sales_order

class Command(BaseCommand):
    help = "Create an isolated demo organization, login, customers, inventory and order."

    def handle(self, *args, **options):
        organization, _ = Organization.objects.get_or_create(
            slug="northstar-studio",
            defaults={"name": "Northstar Studio"},
        )
        user, created = User.objects.get_or_create(
            username="demo",
            defaults={"email": "demo@nexacore.local", "organization": organization, "role": "admin"},
        )
        if created:
            user.set_password("Demo1234!ChangeMe")
            user.save()
        customer, _ = Customer.objects.get_or_create(
            organization=organization,
            email="olivia@layers.co",
            defaults={
                "name": "Olivia Rhye",
                "company": "Layers",
                "phone": "+1 555 0142",
                "location": "San Francisco",
                "created_by": user,
            },
        )
        product, _ = Product.objects.get_or_create(
            organization=organization,
            sku="WH-2049",
            defaults={
                "name": "Wireless headphones",
                "category": "Electronics",
                "stock": 100,
                "price": Decimal("189.00"),
            },
        )
        if not organization.sales_orders.exists():
            create_sales_order(
                organization=organization,
                customer=customer,
                lines=[{"product": product, "quantity": 2}],
                created_by=user,
            )
        self.stdout.write(self.style.SUCCESS("Demo workspace is ready."))
        self.stdout.write("Username: demo")
        self.stdout.write("Password: Demo1234!ChangeMe (change immediately outside local demos)")
