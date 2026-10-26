from django.db import models


class Department(models.Model):
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="departments")
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=240, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["organization", "name"], name="unique_department_per_org")]

    def __str__(self):
        return self.name


class JobPosition(models.Model):
    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="job_positions")
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="positions", null=True, blank=True)
    title = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["title"]
        constraints = [models.UniqueConstraint(fields=["organization", "title"], name="unique_position_per_org")]

    def __str__(self):
        return self.title


class Employee(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="employees")
    employee_number = models.CharField(max_length=40)
    full_name = models.CharField(max_length=160)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="employees", null=True, blank=True)
    position = models.ForeignKey(JobPosition, on_delete=models.PROTECT, related_name="employees", null=True, blank=True)
    joined_on = models.DateField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    notes = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["full_name"]
        constraints = [models.UniqueConstraint(fields=["organization", "employee_number"], name="unique_employee_number_per_org")]

    def __str__(self):
        return f"{self.employee_number} — {self.full_name}"
