from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from apps.core.permissions import IsOrganizationMemberOrManager
from apps.core.date_filters import filter_date_range
from .models import Product, StockMovement
from .serializers import ProductSerializer, StockAdjustmentSerializer, StockMovementSerializer

class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOrganizationMemberOrManager]
    serializer_class = ProductSerializer
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "sku", "category"]
    ordering_fields = ["name", "stock", "price", "created_at"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or not user.organization_id:
            return Product.objects.none()
        return Product.objects.filter(organization_id=user.organization_id)

    @transaction.atomic
    def perform_create(self, serializer):
        if not self.request.user.organization_id:
            raise PermissionDenied("Your account is not assigned to an organization.")
        product = serializer.save(organization=self.request.user.organization)
        if product.stock:
            StockMovement.objects.create(
                organization=self.request.user.organization,
                product=product,
                kind=StockMovement.Kind.RECEIPT,
                quantity=product.stock,
                reference=product.sku,
                note="Initial stock",
                created_by=self.request.user,
            )

    def perform_update(self, serializer):
        if serializer.validated_data.get("stock", serializer.instance.stock) != serializer.instance.stock:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"stock": "Use the stock adjustment endpoint to change inventory."})
        serializer.save()

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])

class StockMovementViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsOrganizationMemberOrManager]
    serializer_class = StockMovementSerializer
    filterset_fields = ["kind", "product"]
    search_fields = ["product__name", "reference", "note"]
    ordering_fields = ["created_at", "quantity"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or not user.organization_id:
            return StockMovement.objects.none()
        queryset = StockMovement.objects.filter(organization_id=user.organization_id).select_related("product")
        return filter_date_range(queryset, self.request.query_params, "created_at", datetime_field=True)

    @action(detail=False, methods=["post"])
    def adjust(self, request):
        serializer = StockAdjustmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            product = Product.objects.select_for_update().get(pk=serializer.validated_data["product"].pk)
            quantity = serializer.validated_data["quantity"]
            if product.stock + quantity < 0:
                return Response({"quantity": ["Stock cannot become negative."]}, status=status.HTTP_400_BAD_REQUEST)
            product.stock += quantity
            product.save(update_fields=["stock"])
            movement = StockMovement.objects.create(
                organization=request.user.organization,
                product=product,
                kind=StockMovement.Kind.ADJUSTMENT,
                quantity=quantity,
                note=serializer.validated_data.get("note", ""),
                created_by=request.user,
            )
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)
