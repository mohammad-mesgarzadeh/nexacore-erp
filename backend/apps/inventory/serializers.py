from rest_framework import serializers
from .models import Product, StockMovement

class ProductSerializer(serializers.ModelSerializer):
    stock = serializers.IntegerField(min_value=0, required=False)
    reorder_point = serializers.IntegerField(min_value=0, required=False)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ["id", "name", "sku", "category", "description", "unit_of_measure", "stock", "purchase_cost", "price", "reorder_point", "is_active", "status", "created_at"]
        read_only_fields = ["id", "created_at", "status"]

    def get_status(self, obj) -> str:
        if obj.stock <= 0:
            return "out_of_stock"
        return "low_stock" if obj.stock <= obj.reorder_point else "in_stock"

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        request = self.context.get("request")
        if request and request.user.role not in {"admin", "manager"}:
            representation.pop("purchase_cost", None)
        return representation

    def validate_sku(self, value):
        products = Product.objects.filter(
            organization_id=self.context["request"].user.organization_id,
            sku=value,
        )
        if self.instance:
            products = products.exclude(pk=self.instance.pk)
        if products.exists():
            raise serializers.ValidationError("A product with this SKU already exists in your organization.")
        return value.strip()

    def validate_stock(self, value):
        if self.instance and value != self.instance.stock:
            raise serializers.ValidationError("Use the stock adjustment endpoint to change inventory.")
        return value

    def validate_unit_of_measure(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Unit of measure is required.")
        return value

class StockAdjustmentSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField()
    note = serializers.CharField(max_length=240, required=False, allow_blank=True)

    def validate_product(self, product):
        request = self.context["request"]
        if product.organization_id != request.user.organization_id:
            raise serializers.ValidationError("Product does not belong to your organization.")
        return product

    def validate(self, data):
        if data["quantity"] == 0:
            raise serializers.ValidationError({"quantity": "Adjustment must not be zero."})
        if data["product"].stock + data["quantity"] < 0:
            raise serializers.ValidationError({"quantity": "Stock cannot become negative."})
        return data

class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    class Meta:
        model = StockMovement
        fields = ["id", "product", "product_name", "kind", "quantity", "reference", "note", "created_at"]
