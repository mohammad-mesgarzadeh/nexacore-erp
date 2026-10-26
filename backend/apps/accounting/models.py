import uuid
from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Account(models.Model):
    class Kind(models.TextChoices):
        ASSET = "asset", "Asset"
        LIABILITY = "liability", "Liability"
        EQUITY = "equity", "Equity"
        REVENUE = "revenue", "Revenue"
        EXPENSE = "expense", "Expense"

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="accounts")
    code = models.CharField(max_length=24)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        constraints = [models.UniqueConstraint(fields=["organization", "code"], name="unique_account_code_per_org")]


class JournalEntry(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"
        REVERSAL = "reversal", "Reversal"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="journal_entries")
    reference = models.CharField(max_length=80)
    description = models.CharField(max_length=240)
    entry_date = models.DateField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    reverses = models.OneToOneField("self", on_delete=models.PROTECT, null=True, blank=True, related_name="reversal_entry")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-entry_date", "-created_at"]


class JournalLine(models.Model):
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="journal_lines")
    description = models.CharField(max_length=160, blank=True)
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=[MinValueValidator(Decimal("0"))])
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), validators=[MinValueValidator(Decimal("0"))])

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(debit__gt=0, credit=0) | models.Q(debit=0, credit__gt=0)),
                name="journal_line_one_positive_side",
            ),
        ]
