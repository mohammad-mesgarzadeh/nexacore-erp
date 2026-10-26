from rest_framework import serializers
from apps.customers.models import Customer
from apps.inventory.models import Product
from .models import SalesOrder, SalesOrderLine

class SalesOrderLineInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)

class SalesOrderLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    class Meta:
        model = SalesOrderLine
        fields = ["id", "product", "product_name", "quantity", "unit_price", "line_total"]


class SalesOrderTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["paid", "cancelled"])


class SalesOrderSerializer(serializers.ModelSerializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    lines = SalesOrderLineInputSerializer(many=True, write_only=True, required=False)
    items = SalesOrderLineSerializer(source="lines", many=True, read_only=True)

    class Meta:
        model = SalesOrder
        fields = ["id", "number", "customer", "customer_name", "status", "subtotal", "discount", "tax", "total", "lines", "items", "created_at"]
        read_only_fields = ["id", "number", "status", "subtotal", "tax", "total", "created_at", "items"]

    def validate_customer(self, customer):
        if customer.organization_id != self.context["request"].user.organization_id:
            raise serializers.ValidationError("Customer does not belong to your organization.")
        return customer

    def validate_lines(self, lines):
        organization_id = self.context["request"].user.organization_id
        for line in lines:
            if line["product"].organization_id != organization_id:
                raise serializers.ValidationError("All products must belong to your organization.")
            if not line["product"].is_active:
                raise serializers.ValidationError("Choose an active product.")
        return lines

    def validate(self, attrs):
        if not attrs.get("lines"):
            raise serializers.ValidationError({"lines": "An order must contain at least one product."})
        return attrs
