import uuid
from rest_framework import serializers
from apps.inventory.models import Product
from apps.suppliers.models import Supplier
from .models import PurchaseOrder, PurchaseOrderLine, PurchaseReceipt


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = ["id", "product", "product_name", "quantity", "received_quantity", "unit_cost"]
        read_only_fields = ["id", "received_quantity"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ["id", "number", "supplier", "supplier_name", "status", "expected_on", "created_at", "lines"]
        read_only_fields = ["id", "number", "status", "created_at"]

    def validate(self, attrs):
        request = self.context["request"]
        supplier = attrs.get("supplier", getattr(self.instance, "supplier", None))
        if supplier and supplier.organization_id != request.user.organization_id:
            raise serializers.ValidationError({"supplier": "Supplier does not belong to your organization."})
        if supplier and supplier.status != Supplier.Status.ACTIVE and (
            not self.instance or supplier.pk != self.instance.supplier_id
        ):
            raise serializers.ValidationError({"supplier": "Choose an active supplier."})
        if self.instance and self.instance.status != PurchaseOrder.Status.DRAFT:
            raise serializers.ValidationError("Only draft purchase orders can be edited.")
        lines = attrs.get("lines", [])
        if not self.instance and not lines:
            raise serializers.ValidationError({"lines": "At least one product is required."})
        org_products = Product.objects.filter(organization_id=request.user.organization_id, is_active=True)
        for index, line in enumerate(lines):
            if not org_products.filter(pk=line["product"].pk).exists():
                raise serializers.ValidationError({"lines": {index: {"product": "Product is outside your organization."}}})
        if len({line["product"].pk for line in lines}) != len(lines):
            raise serializers.ValidationError({"lines": "Each product may appear only once per order."})
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines")
        order = PurchaseOrder.objects.create(
            organization=self.context["request"].user.organization,
            number=f"PO-{uuid.uuid4().hex[:12].upper()}",
            created_by=self.context["request"].user,
            **validated_data,
        )
        PurchaseOrderLine.objects.bulk_create([PurchaseOrderLine(order=order, **line) for line in lines])
        return order

    def update(self, instance, validated_data):
        lines = validated_data.pop("lines", None)
        instance = super().update(instance, validated_data)
        if lines is not None:
            instance.lines.all().delete()
            PurchaseOrderLine.objects.bulk_create([PurchaseOrderLine(order=instance, **line) for line in lines])
        return instance


class PurchaseOrderTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["approved", "rejected", "ordered", "cancelled"])


class PurchaseReceiptSerializer(serializers.Serializer):
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)

    def validate_lines(self, lines):
        order = self.context["order"]
        validated = []
        seen = set()
        for item in lines:
            try:
                line = order.lines.get(pk=item["order_line"])
                quantity = int(item["quantity"])
            except (KeyError, TypeError, ValueError, PurchaseOrderLine.DoesNotExist):
                raise serializers.ValidationError("Each receipt line needs a valid order_line and quantity.")
            if line.pk in seen or quantity < 1 or line.received_quantity + quantity > line.quantity:
                raise serializers.ValidationError("Receipt quantities must be positive, unique, and no greater than outstanding quantities.")
            seen.add(line.pk)
            validated.append((line, quantity))
        return validated
