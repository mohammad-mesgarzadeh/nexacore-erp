from django.db import transaction
from django.db.models import F
from rest_framework.exceptions import ValidationError
from apps.inventory.models import Product, StockMovement
from .models import PurchaseOrder, PurchaseOrderLine, PurchaseReceipt, PurchaseReceiptLine


@transaction.atomic
def transition_order(*, order, status, user):
    order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
    allowed = {
        PurchaseOrder.Status.DRAFT: {PurchaseOrder.Status.APPROVED, PurchaseOrder.Status.REJECTED},
        PurchaseOrder.Status.APPROVED: {PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.CANCELLED},
    }
    if status not in allowed.get(order.status, set()):
        raise ValidationError({"status": "This purchase-order transition is not allowed."})
    order.status = status
    if status == PurchaseOrder.Status.APPROVED:
        order.approved_by = user
    order.save(update_fields=["status", "approved_by"])
    return order


@transaction.atomic
def receive_order(*, order, lines, user):
    order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
    if order.status not in {PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.PARTIAL}:
        raise ValidationError({"status": "Only ordered purchase orders can receive stock."})
    product_ids = sorted({line.product_id for line, _ in lines})
    products = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=product_ids, organization_id=order.organization_id).order_by("pk")}
    receipt = PurchaseReceipt.objects.create(order=order, received_by=user)
    for order_line, quantity in lines:
        product = products.get(order_line.product_id)
        if product is None:
            raise ValidationError({"lines": "An order product is outside this organization."})
        order_line = PurchaseOrderLine.objects.select_for_update().get(pk=order_line.pk)
        if order_line.received_quantity + quantity > order_line.quantity:
            raise ValidationError({"lines": "Received quantity exceeds the outstanding amount."})
        order_line.received_quantity += quantity
        order_line.save(update_fields=["received_quantity"])
        PurchaseReceiptLine.objects.create(receipt=receipt, order_line=order_line, quantity=quantity)
        product.stock += quantity
        product.save(update_fields=["stock"])
        StockMovement.objects.create(
            organization=order.organization,
            product=product,
            kind=StockMovement.Kind.RECEIPT,
            quantity=quantity,
            reference=order.number,
            note=f"Purchase receipt {receipt.pk}",
            created_by=user,
        )
    outstanding = order.lines.filter(received_quantity__lt=F("quantity")).exists()
    order.status = PurchaseOrder.Status.PARTIAL if outstanding else PurchaseOrder.Status.RECEIVED
    order.save(update_fields=["status"])
    return receipt
