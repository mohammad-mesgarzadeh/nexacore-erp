from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from apps.core.permissions import IsOrganizationMemberOrManager
from .models import Supplier
from .serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.none()
    serializer_class = SupplierSerializer
    permission_classes = [IsOrganizationMemberOrManager]
    http_method_names = ["get", "post", "patch", "head", "options"]
    search_fields = ["name", "contact_name", "email", "phone"]
    filterset_fields = ["status"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "organization_id", None):
            return Supplier.objects.none()
        return Supplier.objects.filter(organization_id=self.request.user.organization_id)

    def perform_create(self, serializer):
        if self.request.user.role not in {"admin", "manager"}:
            raise PermissionDenied("Only organization managers can manage suppliers.")
        serializer.save(organization=self.request.user.organization)

    def perform_update(self, serializer):
        if self.request.user.role not in {"admin", "manager"}:
            raise PermissionDenied("Only organization managers can manage suppliers.")
        serializer.save()
