from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="product",
            name="unit_of_measure",
            field=models.CharField(default="unit", max_length=30),
        ),
        migrations.AddField(
            model_name="product",
            name="purchase_cost",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0"))]),
        ),
    ]
