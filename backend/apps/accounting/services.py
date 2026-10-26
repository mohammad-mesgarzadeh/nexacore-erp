from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import JournalEntry, JournalLine


@transaction.atomic
def post_entry(*, entry):
    entry = JournalEntry.objects.select_for_update().get(pk=entry.pk)
    if entry.status != JournalEntry.Status.DRAFT:
        raise ValidationError({"status": "Only draft entries can be posted."})
    lines = list(entry.lines.select_related("account").all())
    debit = sum((line.debit for line in lines), Decimal("0"))
    credit = sum((line.credit for line in lines), Decimal("0"))
    if len(lines) < 2 or debit <= 0 or debit != credit:
        raise ValidationError({"lines": "Posting requires at least two lines with equal, non-zero debit and credit totals."})
    if any(line.account.organization_id != entry.organization_id for line in lines):
        raise ValidationError({"lines": "Every account must belong to the journal entry organization."})
    if any(not line.account.is_active for line in lines):
        raise ValidationError({"lines": "Inactive accounts cannot be posted."})
    entry.status = JournalEntry.Status.POSTED
    entry.posted_at = timezone.now()
    entry.save(update_fields=["status", "posted_at"])
    return entry


@transaction.atomic
def reverse_entry(*, entry, user, description="Reversal"):
    entry = JournalEntry.objects.select_for_update().get(pk=entry.pk)
    if entry.status != JournalEntry.Status.POSTED or hasattr(entry, "reversal_entry"):
        raise ValidationError({"status": "Only unreversed posted entries can be reversed."})
    reversal = JournalEntry.objects.create(
        organization=entry.organization,
        reference=f"REV-{entry.reference}",
        description=description,
        entry_date=timezone.localdate(),
        status=JournalEntry.Status.REVERSAL,
        created_by=user,
        posted_at=timezone.now(),
        reverses=entry,
    )
    JournalLine.objects.bulk_create([
        JournalLine(entry=reversal, account=line.account, description=line.description, debit=line.credit, credit=line.debit)
        for line in entry.lines.all()
    ])
    return reversal
