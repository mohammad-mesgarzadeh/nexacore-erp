from rest_framework import generics
from rest_framework.exceptions import PermissionDenied

from apps.core.permissions import IsOrganizationMemberOrManager
from .serializers import OrganizationProfileSerializer


class OrganizationProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = OrganizationProfileSerializer
    permission_classes = [IsOrganizationMemberOrManager]

    def get_object(self):
        organization = self.request.user.organization
        if organization is None:
            raise PermissionDenied("Your account is not assigned to an organization.")
        return organization
