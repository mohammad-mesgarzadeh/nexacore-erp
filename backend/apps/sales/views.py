from decimal import Decimal
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from apps.core.permissions import IsOrganizationMemberOrManager
from apps.core.date_filters import filter_date_range
from .models import SalesOrder
from .serializers import SalesOrderSerializer, SalesOrderTransitionSerializer
from .services import create_sales_order, transition_sales_order

class SalesOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOrganizationMemberOrManager]
    serializer_class = SalesOrderSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["status", "customer"]
    search_fields = ["number", "customer__name", "customer__company"]
    ordering_fields = ["created_at", "total", "number"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or not user.organization_id:
            return SalesOrder.objects.none()
        queryset = SalesOrder.objects.filter(
            organization_id=user.organization_id
        ).select_related("customer").prefetch_related("lines__product")
        return filter_date_range(queryset, self.request.query_params, "created_at", datetime_field=True)

    def create(self, request, *args, **kwargs):
        if not request.user.organization_id:
            raise PermissionDenied("Your account is not assigned to an organization.")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = create_sales_order(
            organization=request.user.organization,
            customer=serializer.validated_data["customer"],
            lines=serializer.validated_data["lines"],
            discount=serializer.validated_data.get("discount", Decimal("0")),
            created_by=request.user,
        )
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @extend_schema(request=SalesOrderTransitionSerializer, responses=SalesOrderSerializer)
    def transition(self, request, pk=None):
        order = self.get_object()
        serializer = SalesOrderTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transitioned = transition_sales_order(
            order=order,
            status=serializer.validated_data["status"],
            changed_by=request.user,
        )
        return Response(self.get_serializer(transitioned).data)
