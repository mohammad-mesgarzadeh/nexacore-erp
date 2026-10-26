from decimal import Decimal
from rest_framework import serializers
from .models import Account, JournalEntry, JournalLine


class TrialBalanceLineSerializer(serializers.Serializer):
    account_id = serializers.IntegerField()
    account__code = serializers.CharField()
    account__name = serializers.CharField()
    account__kind = serializers.CharField()
    debits = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    credits = serializers.DecimalField(max_digits=14, decimal_places=2, allow_null=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2)


class AccountingReportSerializer(serializers.Serializer):
    from_date = serializers.DateField(source="from", allow_null=True)
    to_date = serializers.DateField(source="to", allow_null=True)
    trial_balance = TrialBalanceLineSerializer(many=True)
    debit_total = serializers.DecimalField(max_digits=16, decimal_places=2)
    credit_total = serializers.DecimalField(max_digits=16, decimal_places=2)
    entries = serializers.ListField(child=serializers.DictField())
    ledger = serializers.ListField(child=serializers.DictField())


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ["id", "code", "name", "kind", "is_active"]
        read_only_fields = ["id"]

    def validate_code(self, value):
        matches = Account.objects.filter(organization_id=self.context["request"].user.organization_id, code=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("An account already uses this code.")
        return value


class JournalLineSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = JournalLine
        fields = ["id", "account", "account_name", "description", "debit", "credit"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        debit = attrs.get("debit", Decimal("0"))
        credit = attrs.get("credit", Decimal("0"))
        if debit < 0 or credit < 0 or (debit == 0 and credit == 0) or (debit > 0 and credit > 0):
            raise serializers.ValidationError("A journal line must have a positive debit or credit, but not both.")
        account = attrs.get("account")
        request = self.context.get("request")
        if account and request and account.organization_id != request.user.organization_id:
            raise serializers.ValidationError({"account": "Account does not belong to your organization."})
        return attrs


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True)
    debit_total = serializers.SerializerMethodField()
    credit_total = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntry
        fields = ["id", "reference", "description", "entry_date", "status", "created_at", "posted_at", "reverses", "lines", "debit_total", "credit_total"]
        read_only_fields = ["id", "status", "created_at", "posted_at", "reverses", "debit_total", "credit_total"]

    def get_debit_total(self, obj) -> Decimal:
        return sum((line.debit for line in obj.lines.all()), Decimal("0"))

    def get_credit_total(self, obj) -> Decimal:
        return sum((line.credit for line in obj.lines.all()), Decimal("0"))

    def validate(self, attrs):
        if self.instance and self.instance.status != JournalEntry.Status.DRAFT:
            raise serializers.ValidationError("Posted journal entries cannot be edited; create a reversal or adjustment.")
        lines = attrs.get("lines", [])
        if not self.instance and len(lines) < 2:
            raise serializers.ValidationError({"lines": "A journal entry requires at least two lines."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines")
        entry = JournalEntry.objects.create(
            organization=self.context["request"].user.organization,
            created_by=self.context["request"].user,
            **validated_data,
        )
        JournalLine.objects.bulk_create([JournalLine(entry=entry, **line) for line in lines])
        return entry

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        instance = super().update(instance, validated_data)
        if lines is not None:
            instance.lines.all().delete()
            JournalLine.objects.bulk_create([JournalLine(entry=instance, **line) for line in lines])
        return instance


class JournalActionSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=240, required=False)
