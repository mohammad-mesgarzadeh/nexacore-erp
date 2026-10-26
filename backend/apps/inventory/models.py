from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

class Product(models.Model):
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="products")
    name = models.CharField(max_length=180)
    sku = models.CharField(max_length=80)
    category = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    unit_of_measure = models.CharField(max_length=30, default="unit")
    stock = models.PositiveIntegerField(default=0)
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(Decimal("0"))])
    reorder_point = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["organization", "sku"], name="unique_product_sku_per_org")]

    def __str__(self):
        return f"{self.name} ({self.sku})"

class StockMovement(models.Model):
    class Kind(models.TextChoices):
        RECEIPT = "receipt", "Receipt"
        SALE = "sale", "Sale"
        ADJUSTMENT = "adjustment", "Adjustment"
        REVERSAL = "reversal", "Reversal"

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="stock_movements")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="movements")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    quantity = models.IntegerField()
    reference = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=240, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
