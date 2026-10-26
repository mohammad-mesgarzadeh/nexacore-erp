from django.db import transaction
from django.db.models import Sum
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.fields import DateField
from rest_framework.views import APIView
from apps.core.permissions import IsOrganizationMemberOrManager
from .models import Account, JournalEntry, JournalLine
from .serializers import AccountingReportSerializer, AccountSerializer, JournalActionSerializer, JournalEntrySerializer
from .services import post_entry, reverse_entry


class FinanceManagerOnly(IsOrganizationMemberOrManager):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in {"admin", "manager"}


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.none()
    serializer_class = AccountSerializer
    permission_classes = [FinanceManagerOnly]
    http_method_names = ["get", "post", "patch", "head", "options"]
    search_fields = ["code", "name"]
    filterset_fields = ["kind", "is_active"]
    ordering_fields = ["code", "name"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "organization_id", None):
            return Account.objects.none()
        return Account.objects.filter(organization_id=self.request.user.organization_id)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class JournalEntryViewSet(viewsets.ModelViewSet):
    queryset = JournalEntry.objects.none()
    serializer_class = JournalEntrySerializer
    permission_classes = [FinanceManagerOnly]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status"]
    search_fields = ["reference", "description"]
    ordering_fields = ["entry_date", "created_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "organization_id", None):
            return JournalEntry.objects.none()
        return JournalEntry.objects.filter(organization_id=self.request.user.organization_id).prefetch_related("lines__account")

    def perform_update(self, serializer):
        if serializer.instance.status != JournalEntry.Status.DRAFT:
            raise PermissionDenied("Posted accounting entries cannot be changed.")
        with transaction.atomic():
            serializer.save()

    @action(detail=True, methods=["post"])
    def post(self, request, pk=None):
        entry = post_entry(entry=self.get_object())
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        serializer = JournalActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = reverse_entry(entry=self.get_object(), user=request.user, description=serializer.validated_data.get("description", "Reversal"))
        return Response(self.get_serializer(entry).data, status=status.HTTP_201_CREATED)


class AccountingReportView(APIView):
    permission_classes = [FinanceManagerOnly]

    @extend_schema(responses=AccountingReportSerializer)
    def get(self, request):
        entries = JournalEntry.objects.filter(
            organization_id=request.user.organization_id,
            status__in=[JournalEntry.Status.POSTED, JournalEntry.Status.REVERSAL],
        )
        try:
            start_raw = request.query_params.get("from")
            end_raw = request.query_params.get("to")
            start = DateField().run_validation(start_raw) if start_raw else None
            end = DateField().run_validation(end_raw) if end_raw else None
        except ValidationError:
            raise ValidationError({"date": "Use ISO dates in YYYY-MM-DD format."})
        if start and end and start > end:
            raise ValidationError({"to": "End date must be on or after the start date."})
        if start:
            entries = entries.filter(entry_date__gte=start)
        if end:
            entries = entries.filter(entry_date__lte=end)
        lines = JournalLine.objects.filter(entry__in=entries)
        account_rows = list(
            lines.values("account_id", "account__code", "account__name", "account__kind")
            .annotate(debits=Sum("debit"), credits=Sum("credit"))
            .order_by("account__code")
        )
        for row in account_rows:
            row["balance"] = row["debits"] - row["credits"]
        ledger = []
        account_id = request.query_params.get("account")
        if account_id:
            try:
                account = Account.objects.get(pk=account_id, organization_id=request.user.organization_id)
            except (Account.DoesNotExist, ValueError):
                raise ValidationError({"account": "Choose an account in your organization."})
            ledger = list(
                lines.filter(account=account).select_related("entry")
                .order_by("entry__entry_date", "entry__created_at")
                .values(
                    "entry_id", "entry__reference", "entry__description",
                    "entry__entry_date", "entry__status", "debit", "credit",
                )[:500]
            )
        return Response({
            "from_date": start,
            "to_date": end,
            "trial_balance": account_rows,
            "debit_total": sum((row["debits"] or 0 for row in account_rows), 0),
            "credit_total": sum((row["credits"] or 0 for row in account_rows), 0),
            "entries": list(entries.values("id", "reference", "description", "entry_date", "status", "posted_at").order_by("-entry_date", "-created_at")[:100]),
            "ledger": ledger,
        })
