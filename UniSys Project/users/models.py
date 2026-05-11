"""
users/models.py – Custom User model with RBAC and security fields.

Security Features:
  - Account lockout after failed login attempts
  - Role-based access control (Admin, Employee, Intern)
"""

from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class CustomUser(AbstractUser):
    """Extended user model with role-based access control and security features."""

    # ── Role Choices ──────────────────────────────────────────────────────────
    ADMIN = "ADMIN"
    EMPLOYEE = "EMPLOYEE"
    INTERN = "INTERN"

    ROLE_CHOICES = [
        (ADMIN, "Admin"),
        (EMPLOYEE, "Employee"),
        (INTERN, "Intern"),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=INTERN)

    # ── Account Lockout ───────────────────────────────────────────────────────
    failed_login_attempts = models.PositiveIntegerField(default=0)
    account_locked_until = models.DateTimeField(blank=True, null=True)

    # ── Full Name ─────────────────────────────────────────────────────────────
    full_name = models.CharField(max_length=150, blank=True, default="")

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    # ── Role helpers ──────────────────────────────────────────────────────────
    def is_admin_role(self):
        return self.role == self.ADMIN

    def is_employee_role(self):
        return self.role == self.EMPLOYEE

    def is_intern_role(self):
        return self.role == self.INTERN

    # ── Account Lockout helpers ───────────────────────────────────────────────
    @property
    def is_account_locked(self):
        """Check if the account is currently locked."""
        return bool(self.account_locked_until and timezone.now() < self.account_locked_until)

    def record_failed_login(self):
        """Record a failed login attempt. Lock after 5 failures for 30 minutes."""
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            self.account_locked_until = timezone.now() + timedelta(minutes=30)
        self.save(update_fields=["failed_login_attempts", "account_locked_until"])

    def reset_failed_logins(self):
        """Reset failed login counter after successful login."""
        self.failed_login_attempts = 0
        self.account_locked_until = None
        self.save(update_fields=["failed_login_attempts", "account_locked_until"])
