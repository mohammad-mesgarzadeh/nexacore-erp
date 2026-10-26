from django.db import IntegrityError
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .serializers import (
    PasswordChangeSerializer,
    RegistrationResponseSerializer,
    RegistrationSerializer,
    UserProfileSerializer,
)


class RegistrationView(generics.CreateAPIView):
    serializer_class = RegistrationSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "registration"

    @extend_schema(
        request=RegistrationSerializer,
        responses={status.HTTP_201_CREATED: RegistrationResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {
                    "non_field_errors": [
                        "An account could not be created with those details. Try signing in or use different details."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"detail": "Account created. You can now sign in."},
            status=status.HTTP_201_CREATED,
        )


class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user


class PasswordChangeView(generics.GenericAPIView):
    serializer_class = PasswordChangeSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response({"detail": "Password updated successfully."})
