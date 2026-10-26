from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.core.permissions import IsOrganizationMemberOrManager
from apps.core.date_filters import filter_date_range
from .models import Department, Employee, JobPosition
from .serializers import DepartmentSerializer, EmployeeSerializer, JobPositionSerializer


class ManagerOnly(IsOrganizationMemberOrManager):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in {"admin", "manager"}


class OrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ManagerOnly]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization)


class DepartmentViewSet(OrganizationViewSet):
    queryset = Department.objects.none()
    serializer_class = DepartmentSerializer
    search_fields = ["name", "description"]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "organization_id", None):
            return Department.objects.none()
        return Department.objects.filter(organization_id=self.request.user.organization_id)


class JobPositionViewSet(OrganizationViewSet):
    queryset = JobPosition.objects.none()
    serializer_class = JobPositionSerializer
    search_fields = ["title", "department__name"]
    filterset_fields = ["department", "is_active"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "organization_id", None):
            return JobPosition.objects.none()
        return JobPosition.objects.filter(organization_id=self.request.user.organization_id).select_related("department")


class EmployeeViewSet(OrganizationViewSet):
    queryset = Employee.objects.none()
    serializer_class = EmployeeSerializer
    search_fields = ["employee_number", "full_name", "email", "department__name", "position__title"]
    filterset_fields = ["status", "department", "position"]
    ordering_fields = ["full_name", "joined_on", "employee_number"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not getattr(self.request.user, "organization_id", None):
            return Employee.objects.none()
        queryset = Employee.objects.filter(organization_id=self.request.user.organization_id).select_related("department", "position")
        return filter_date_range(queryset, self.request.query_params, "joined_on")
