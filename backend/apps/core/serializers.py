from rest_framework import serializers


class DashboardSummarySerializer(serializers.Serializer):
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    orders = serializers.IntegerField()
    customers = serializers.IntegerField()
    inventory_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    pending_invoices = serializers.IntegerField()
    low_stock_products = serializers.IntegerField()
    monthly_expenses = serializers.DecimalField(max_digits=14, decimal_places=2)


class DashboardTrendSerializer(serializers.Serializer):
    month = serializers.CharField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    expenses = serializers.DecimalField(max_digits=14, decimal_places=2)


class DashboardCategorySerializer(serializers.Serializer):
    name = serializers.CharField()
    value = serializers.DecimalField(max_digits=14, decimal_places=2)
    percent = serializers.IntegerField()
    color = serializers.CharField()


class DashboardCustomerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    company = serializers.CharField()
    email = serializers.EmailField()
    phone = serializers.CharField()
    location = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()


class DashboardProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    sku = serializers.CharField()
    category = serializers.CharField()
    stock = serializers.IntegerField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    reorder_point = serializers.IntegerField()


class DashboardOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    number = serializers.CharField()
    customer__name = serializers.CharField()
    created_at = serializers.DateTimeField()
    total = serializers.DecimalField(max_digits=14, decimal_places=2)
    status = serializers.CharField()
    items_count = serializers.IntegerField()


class DashboardOrderStatusSerializer(serializers.Serializer):
    status = serializers.CharField()
    count = serializers.IntegerField()


class DashboardAnalyticsSerializer(serializers.Serializer):
    trend = DashboardTrendSerializer(many=True)
    categories = DashboardCategorySerializer(many=True)


class DashboardSerializer(serializers.Serializer):
    summary = DashboardSummarySerializer()
    customers = DashboardCustomerSerializer(many=True)
    products = DashboardProductSerializer(many=True)
    orders = DashboardOrderSerializer(many=True)
    order_statuses = DashboardOrderStatusSerializer(many=True)
    analytics = DashboardAnalyticsSerializer()
