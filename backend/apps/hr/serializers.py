from rest_framework import serializers
from .models import Department, Employee, JobPosition


class OrganizationScopedSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        org_id = self.context["request"].user.organization_id
        for name in ("department", "position"):
            obj = attrs.get(name)
            if obj and obj.organization_id != org_id:
                raise serializers.ValidationError({name: "This record is outside your organization."})
        return attrs


class DepartmentSerializer(OrganizationScopedSerializer):
    class Meta:
        model = Department
        fields = ["id", "name", "description", "is_active"]

    def validate_name(self, value):
        organization_id = self.context["request"].user.organization_id
        matches = Department.objects.filter(organization_id=organization_id, name=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("A department with this name already exists.")
        return value


class JobPositionSerializer(OrganizationScopedSerializer):
    class Meta:
        model = JobPosition
        fields = ["id", "department", "title", "is_active"]

    def validate_title(self, value):
        organization_id = self.context["request"].user.organization_id
        matches = JobPosition.objects.filter(organization_id=organization_id, title=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("A position with this title already exists.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        department = attrs.get("department", getattr(self.instance, "department", None))
        if department and not department.is_active:
            raise serializers.ValidationError({"department": "Choose an active department."})
        return attrs


class EmployeeSerializer(OrganizationScopedSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    position_title = serializers.CharField(source="position.title", read_only=True)

    class Meta:
        model = Employee
        fields = ["id", "employee_number", "full_name", "email", "phone", "department", "department_name", "position", "position_title", "joined_on", "status", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        department = attrs.get("department", getattr(self.instance, "department", None))
        position = attrs.get("position", getattr(self.instance, "position", None))
        if department and position and position.department_id not in (None, department.pk):
            raise serializers.ValidationError({"position": "The selected position belongs to another department."})
        status = attrs.get("status", getattr(self.instance, "status", Employee.Status.ACTIVE))
        if status == Employee.Status.ACTIVE:
            if department and not department.is_active:
                raise serializers.ValidationError({"department": "Active employees must belong to an active department."})
            if position and not position.is_active:
                raise serializers.ValidationError({"position": "Active employees must have an active position."})
        return attrs

    def validate_employee_number(self, value):
        organization_id = self.context["request"].user.organization_id
        matches = Employee.objects.filter(organization_id=organization_id, employee_number=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("An employee already uses this number.")
        return value
