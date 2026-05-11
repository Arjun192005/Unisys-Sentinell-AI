from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "username",
        "email",
        "full_name",
        "role",
        "is_staff",
        "is_active",
        "failed_login_attempts",
    )
    list_filter = ("role", "is_staff", "is_active")
    search_fields = ("username", "email", "full_name")

    fieldsets = UserAdmin.fieldsets + (
        ("Role & Access", {"fields": ("role", "full_name")}),
        (
            "Security",
            {
                "fields": (
                    "failed_login_attempts",
                    "account_locked_until",
                )
            },
        ),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Role & Access", {"fields": ("role", "full_name", "email")}),
    )
