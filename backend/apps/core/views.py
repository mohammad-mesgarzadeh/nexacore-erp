from datetime import date, datetime, time
from django.db.models import Count, F, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.core.serializers import DashboardSerializer
from apps.customers.models import Customer
from apps.inventory.models import Product
from apps.sales.models import SalesOrder, SalesOrderLine
from apps.accounting.models import JournalEntry, JournalLine

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=DashboardSerializer)
    def get(self, request):
        organization_id = request.user.organization_id
        customers = Customer.objects.filter(organization_id=organization_id)
        products = Product.objects.filter(organization_id=organization_id, is_active=True)
        orders = SalesOrder.objects.filter(organization_id=organization_id).select_related("customer")
        today = timezone.localdate()
        first_month_index = today.year * 12 + today.month - 1 - 11
        first_year, first_month_zero_based = divmod(first_month_index, 12)
        first_month = date(first_year, first_month_zero_based + 1, 1)
        first_month_start = timezone.make_aware(datetime.combine(first_month, time.min))
        monthly_revenue = {
            (item["month"].year, item["month"].month): item["revenue"]
            for item in orders.filter(
                status=SalesOrder.Status.PAID,
                created_at__gte=first_month_start,
            ).annotate(month=TruncMonth("created_at")).values("month").annotate(revenue=Sum("total"))
        }
        monthly_expenses = {
            (item["month"].year, item["month"].month): item["expenses"]
            for item in JournalLine.objects.filter(
                entry__organization_id=organization_id,
                entry__status__in=[JournalEntry.Status.POSTED, JournalEntry.Status.REVERSAL],
                entry__entry_date__gte=first_month,
                account__kind="expense",
            ).annotate(month=TruncMonth("entry__entry_date"))
            .values("month")
            .annotate(expenses=Sum(F("debit") - F("credit")))
        }
        trend = []
        for offset in range(12):
            month_index = first_month_index + offset
            year, month_zero_based = divmod(month_index, 12)
            month = month_zero_based + 1
            trend.append({
                "month": f"{year:04d}-{month:02d}",
                "revenue": monthly_revenue.get((year, month), 0),
                "expenses": monthly_expenses.get((year, month), 0),
            })
        category_values = list(
            SalesOrderLine.objects.filter(
                order__organization_id=organization_id,
                order__status=SalesOrder.Status.PAID,
            ).values(category=F("product__category")).annotate(value=Sum("line_total")).order_by("-value")
        )
        category_total = sum((item["value"] for item in category_values), 0)
        category_colors = ["#645cf1", "#9a91f8", "#c4befb", "#e4e1fe"]
        categories = [
            {
                "name": item["category"],
                "value": item["value"],
                "percent": round(item["value"] * 100 / category_total) if category_total else 0,
                "color": category_colors[index % len(category_colors)],
            }
            for index, item in enumerate(category_values)
        ]
        return Response({
            "summary": {
                "revenue": orders.filter(status=SalesOrder.Status.PAID).aggregate(total=Sum("total"))["total"] or 0,
                "orders": orders.count(),
                "customers": customers.count(),
                "inventory_value": products.aggregate(total=Sum(F("stock") * F("price")))["total"] or 0,
                "pending_invoices": orders.filter(status=SalesOrder.Status.PENDING).count(),
                "low_stock_products": products.filter(stock__lte=F("reorder_point")).count(),
                "monthly_expenses": monthly_expenses.get((today.year, today.month), 0),
            },
            "customers": list(customers.values("id", "name", "company", "email", "phone", "location", "status", "created_at")[:10]),
            "products": list(products.values("id", "name", "sku", "category", "stock", "price", "reorder_point")[:10]),
            "orders": list(orders.annotate(items_count=Count("lines")).values("id", "number", "customer__name", "created_at", "total", "status", "items_count")[:10]),
            "order_statuses": list(orders.values("status").annotate(count=Count("id")).order_by("status")),
            "analytics": {"trend": trend, "categories": categories},
        })
