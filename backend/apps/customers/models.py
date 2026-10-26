from django.conf import settings
from django.db import models

class Customer(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        LEAD = "lead", "Lead"
        INACTIVE = "inactive", "Inactive"

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=160)
    company = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    location = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_customers")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["organization", "email"], name="unique_customer_email_per_org")]

    def __str__(self):
        return f"{self.name} — {self.company}"
