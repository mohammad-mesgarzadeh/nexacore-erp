import uuid

from django.contrib.auth import password_validation
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils.text import slugify
from rest_framework import serializers

from apps.organizations.models import Organization
from .models import User


class RegistrationSerializer(serializers.Serializer):
    full_name = serializers.CharField(min_length=2, max_length=150, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    username = serializers.CharField(
        max_length=150,
        min_length=3,
        trim_whitespace=True,
        validators=[UnicodeUsernameValidator()],
    )
    organization_name = serializers.CharField(min_length=2, max_length=160, trim_whitespace=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=12)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        attrs["email"] = attrs["email"].strip().lower()
        attrs["username"] = attrs["username"].strip().lower()

        duplicate = User.objects.filter(username__iexact=attrs["username"]).exists()
        duplicate = duplicate or User.objects.filter(email__iexact=attrs["email"]).exists()
        if duplicate:
            raise serializers.ValidationError({
                "non_field_errors": [
                    "An account could not be created with those details. Try signing in or use different details."
                ]
            })

        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": ["Passwords do not match."]})

        name_parts = attrs["full_name"].split()
        user = User(
            username=attrs["username"],
            email=attrs["email"],
            first_name=name_parts[0],
            last_name=" ".join(name_parts[1:]),
        )
        try:
            password_validation.validate_password(attrs["password"], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages}) from error
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        full_name = validated_data["full_name"].split()
        first_name = full_name[0]
        last_name = " ".join(full_name[1:])
        organization_name = validated_data["organization_name"].strip()
        slug_base = slugify(organization_name)[:160].strip("-") or "workspace"
        organization = Organization.objects.create(
            name=organization_name,
            slug=f"{slug_base}-{uuid.uuid4().hex[:12]}",
        )
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=first_name,
            last_name=last_name,
            organization=organization,
            role="admin",
            is_staff=False,
            is_superuser=False,
        )


class RegistrationResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()


class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(max_length=150, trim_whitespace=True)
    organization_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "role",
            "organization_name",
            "preferred_language",
            "preferred_theme",
        ]
        read_only_fields = ["id", "username", "email", "role", "organization_name"]

    def validate_full_name(self, value):
        if len(value.split()) < 2:
            raise serializers.ValidationError("Enter both a first and last name.")
        return value

    def get_organization_name(self, obj) -> str:
        return obj.organization.name if obj.organization_id else ""

    def update(self, instance, validated_data):
        full_name = validated_data.pop("full_name", None)
        if full_name:
            name_parts = full_name.split()
            instance.first_name = name_parts[0]
            instance.last_name = " ".join(name_parts[1:])
        return super().update(instance, validated_data)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=12)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": ["Current password is incorrect."]})
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": ["Passwords do not match."]})
        try:
            password_validation.validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": error.messages}) from error
        return attrs

    def save(self, **kwargs):
        user = kwargs["user"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user
