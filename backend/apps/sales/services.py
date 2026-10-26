from decimal import Decimal
import uuid
from django.db import transaction
from rest_framework.exceptions import ValidationError
from apps.inventory.models import Product, StockMovement
from .models import SalesOrder, SalesOrderLine

@transaction.atomic
def create_sales_order(*, organization, customer, lines, discount=Decimal("0"), created_by=None):
    product_ids = [line["product"].pk for line in lines]
    products = {
        product.pk: product
        for product in Product.objects.select_for_update().filter(
            organization=organization, pk__in=product_ids
        ).order_by("pk")
    }
    quantities = {}
    for line in lines:
        product_id = line["product"].pk
        if product_id not in products:
            raise ValidationError({"lines": "A product does not belong to this organization."})
        if not products[product_id].is_active:
            raise ValidationError({"lines": "Choose an active product."})
        quantities[product_id] = quantities.get(product_id, 0) + line["quantity"]
    for product_id, quantity in quantities.items():
        if products[product_id].stock < quantity:
            raise ValidationError({"lines": f"Insufficient stock for {products[product_id].name}."})

    subtotal = sum(
        (products[line["product"].pk].price * line["quantity"] for line in lines),
        Decimal("0"),
    )
    if discount < 0 or discount > subtotal:
        raise ValidationError({"discount": "Discount must be between zero and the subtotal."})
    tax = (subtotal - discount) * Decimal("0.08")
    order = SalesOrder.objects.create(
        organization=organization,
        customer=customer,
        number=f"SO-{uuid.uuid4().hex[:12].upper()}",
        subtotal=subtotal,
        discount=discount,
        tax=tax,
        total=subtotal - discount + tax,
        created_by=created_by,
    )
    for line in lines:
        product = products[line["product"].pk]
        quantity = line["quantity"]
        product.stock -= quantity
        product.save(update_fields=["stock"])
        SalesOrderLine.objects.create(
            order=order,
            product=product,
            quantity=quantity,
            unit_price=product.price,
            line_total=product.price * quantity,
        )
        StockMovement.objects.create(
            organization=organization,
            product=product,
            kind=StockMovement.Kind.SALE,
            quantity=-quantity,
            reference=order.number,
            created_by=created_by,
        )
    return order


@transaction.atomic
def transition_sales_order(*, order, status, changed_by=None):
    locked_order = SalesOrder.objects.select_for_update().get(pk=order.pk)
    if locked_order.status != SalesOrder.Status.PENDING:
        raise ValidationError({"status": "Only pending orders can be marked paid or cancelled."})
    if status not in {SalesOrder.Status.PAID, SalesOrder.Status.CANCELLED}:
        raise ValidationError({"status": "Choose paid or cancelled."})

    if status == SalesOrder.Status.CANCELLED:
        lines = list(
            SalesOrderLine.objects.filter(order=locked_order)
            .select_related("product")
            .order_by("product_id")
        )
        products = {
            product.pk: product
            for product in Product.objects.select_for_update()
            .filter(pk__in=[line.product_id for line in lines], organization_id=locked_order.organization_id)
            .order_by("pk")
        }
        for line in lines:
            product = products.get(line.product_id)
            if product is None:
                raise ValidationError({"status": "An order product is no longer available for reversal."})
            product.stock += line.quantity
            product.save(update_fields=["stock"])
            StockMovement.objects.create(
                organization=locked_order.organization,
                product=product,
                kind=StockMovement.Kind.REVERSAL,
                quantity=line.quantity,
                reference=locked_order.number,
                note="Cancelled sales order",
                created_by=changed_by,
            )

    locked_order.status = status
    locked_order.save(update_fields=["status"])
    return locked_order
