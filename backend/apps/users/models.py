from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

class User(AbstractUser):
    LANGUAGE_CHOICES = [("en", "English"), ("fa", "Persian")]
    THEME_CHOICES = [("light", "Light"), ("dark", "Dark")]

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="members",
        null=True,
        blank=True,
    )
    ROLE_CHOICES = [("admin", "Admin"), ("manager", "Manager"), ("staff", "Staff")]
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default="admin")
    preferred_language = models.CharField(max_length=2, choices=LANGUAGE_CHOICES, default="en")
    preferred_theme = models.CharField(max_length=8, choices=THEME_CHOICES, default="light")

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=~Q(email=""),
                name="unique_user_email_case_insensitive",
            ),
        ]

    @property
    def full_name(self):
        return self.get_full_name()
