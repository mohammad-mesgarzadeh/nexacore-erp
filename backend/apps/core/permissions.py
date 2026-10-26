from rest_framework.permissions import SAFE_METHODS, BasePermission

class IsOrganizationMemberOrManager(BasePermission):
    message = "You do not have permission to modify this organization."

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if not user.organization_id:
            self.message = "Your account is not assigned to an organization. Contact your administrator."
            return False
        return request.method in SAFE_METHODS or user.role in {"admin", "manager"}
