from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from apps.core.permissions import IsOrganizationMemberOrManager
from apps.core.date_filters import filter_date_range
from .models import PurchaseOrder
from .serializers import PurchaseOrderSerializer, PurchaseOrderTransitionSerializer, PurchaseReceiptSerializer
from .services import receive_order, transition_order


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.none()
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsOrganizationMemberOrManager]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status", "supplier"]
    search_fields = ["number", "supplier__name"]
    ordering_fields = ["created_at", "expected_on", "number"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "organization_id", None):
            return PurchaseOrder.objects.none()
        queryset = PurchaseOrder.objects.filter(organization_id=self.request.user.organization_id).select_related("supplier").prefetch_related("lines__product")
        return filter_date_range(queryset, self.request.query_params, "created_at", datetime_field=True)

    def _require_manager(self):
        if self.request.user.role not in {"admin", "manager"}:
            raise PermissionDenied("Only organization managers can change purchase orders.")

    def create(self, request, *args, **kwargs):
        self._require_manager()
        with transaction.atomic():
            return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._require_manager()
        with transaction.atomic():
            return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        self._require_manager()
        order = self.get_object()
        serializer = PurchaseOrderTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = transition_order(order=order, status=serializer.validated_data["status"], user=request.user)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        self._require_manager()
        order = self.get_object()
        serializer = PurchaseReceiptSerializer(data=request.data, context={"order": order})
        serializer.is_valid(raise_exception=True)
        receipt = receive_order(order=order, lines=serializer.validated_data["lines"], user=request.user)
        order.refresh_from_db()
        return Response({"id": str(receipt.pk), "status": order.status}, status=status.HTTP_201_CREATED)
