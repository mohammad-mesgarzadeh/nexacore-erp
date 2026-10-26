from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from apps.core.permissions import IsOrganizationMemberOrManager
from .models import Customer
from .serializers import CustomerSerializer

class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOrganizationMemberOrManager]
    serializer_class = CustomerSerializer
    filterset_fields = ["status"]
    search_fields = ["name", "company", "email", "phone"]
    ordering_fields = ["name", "company", "created_at"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or not user.organization_id:
            return Customer.objects.none()
        return Customer.objects.filter(organization_id=user.organization_id)

    def perform_create(self, serializer):
        if not self.request.user.organization_id:
            raise PermissionDenied("Your account is not assigned to an organization.")
        serializer.save(organization=self.request.user.organization, created_by=self.request.user)

    def perform_destroy(self, instance):
        instance.status = Customer.Status.INACTIVE
        instance.save(update_fields=["status", "updated_at"])
