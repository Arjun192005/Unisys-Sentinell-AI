"""
users/views.py – Authentication views for Sentinell.AI.

Flows implemented:
  1. Login (with account lockout)
  2. Signup (direct registration)
  3. Logout

Security Features:
  - All forms use Django CSRF protection
  - Passwords hashed with PBKDF2 (Django default, bcrypt-level)
  - Input validation and sanitization via Django forms/ORM
  - Account lockout after 5 failed attempts
  - Rate limiting via middleware
"""

import html
import logging
import re

from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.shortcuts import redirect, render
from django.utils import timezone

from .models import CustomUser
from .validators import validate_password_strength

logger = logging.getLogger(__name__)


# =============================================================================
# LOGIN
# =============================================================================
def login_view(request):
    """
    Handle user login with security checks:
      - Account lockout detection
      - Failed attempt tracking
      - Role-based redirect
    """
    if request.user.is_authenticated:
        return redirect("dashboard")

    if request.method == "POST":
        email = request.POST.get("email", "").strip().lower()
        password = request.POST.get("password", "")

        # ── Input validation ──────────────────────────────────────────────
        if not email or not password:
            messages.error(request, "Please enter both email and password.")
            return render(request, "users/login.html")

        # ── Find user by email ────────────────────────────────────────────
        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            messages.error(request, "Invalid email or password. Please try again.")
            return render(request, "users/login.html")

        # ── Check account lockout ─────────────────────────────────────────
        if user.is_account_locked:
            remaining = (user.account_locked_until - timezone.now()).seconds // 60
            messages.error(
                request,
                f"Account locked due to too many failed attempts. Try again in {remaining + 1} minutes.",
            )
            return render(request, "users/login.html")

        # ── Authenticate ──────────────────────────────────────────────────
        auth_user = authenticate(request, username=user.username, password=password)
        if auth_user is None:
            user.record_failed_login()
            remaining_attempts = 5 - user.failed_login_attempts
            if remaining_attempts > 0:
                messages.error(
                    request,
                    f"Invalid email or password. {remaining_attempts} attempt(s) remaining.",
                )
            else:
                messages.error(
                    request,
                    "Account locked due to too many failed attempts. Try again in 30 minutes.",
                )
            return render(request, "users/login.html")

        # ── Successful login ──────────────────────────────────────────────
        auth_user.reset_failed_logins()
        login(request, auth_user)
        logger.info(f"User {auth_user.username} logged in (role: {auth_user.role})")
        return redirect("dashboard")

    return render(request, "users/login.html")


# =============================================================================
# SIGNUP
# =============================================================================
def signup_view(request):
    """
    Handle new user registration with:
      - Email uniqueness check
      - Password strength validation
      - Direct account creation
    """
    if request.user.is_authenticated:
        return redirect("dashboard")

    if request.method == "POST":
        full_name = html.escape(request.POST.get("full_name", "").strip())
        email = request.POST.get("email", "").strip().lower()
        password = request.POST.get("password", "")
        confirm_password = request.POST.get("confirm_password", "")
        role = request.POST.get("role", "INTERN").upper()

        # ── Basic validation ─────────────────────────────────────────────
        if not all([full_name, email, password, confirm_password]):
            messages.error(request, "All fields are required.")
            return render(request, "users/signup.html", {
                "form_data": {"full_name": full_name, "email": email, "role": role}
            })

        # ── Email format validation ───────────────────────────────────────
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email):
            messages.error(request, "Please enter a valid email address.")
            return render(request, "users/signup.html", {
                "form_data": {"full_name": full_name, "email": email, "role": role}
            })

        # ── Email uniqueness ──────────────────────────────────────────────
        if CustomUser.objects.filter(email=email).exists():
            messages.error(request, "An account with this email already exists.")
            return render(request, "users/signup.html", {
                "form_data": {"full_name": full_name, "email": email, "role": role}
            })

        # ── Password match ────────────────────────────────────────────────
        if password != confirm_password:
            messages.error(request, "Passwords do not match.")
            return render(request, "users/signup.html", {
                "form_data": {"full_name": full_name, "email": email, "role": role}
            })

        # ── Password strength ─────────────────────────────────────────────
        password_errors = validate_password_strength(password)
        if password_errors:
            for err in password_errors:
                messages.error(request, err)
            return render(request, "users/signup.html", {
                "form_data": {"full_name": full_name, "email": email, "role": role}
            })

        # ── Role validation ───────────────────────────────────────────────
        valid_roles = [r[0] for r in CustomUser.ROLE_CHOICES]
        if role not in valid_roles:
            role = "INTERN"

        # ── Create user ──────────────────────────────────────────────────
        username = email.split("@")[0]
        # Ensure username uniqueness
        base_username = username
        counter = 1
        while CustomUser.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1

        user = CustomUser.objects.create_user(
            username=username,
            email=email,
            password=password,
            full_name=full_name,
            role=role,
        )
        messages.success(
            request,
            "Account created successfully! Please log in with your credentials.",
        )
        return redirect("login")

    return render(request, "users/signup.html")


# =============================================================================
# LOGOUT
# =============================================================================
def logout_view(request):
    """Log the user out and redirect to login."""
    logout(request)
    messages.success(request, "You have been logged out successfully.")
    return redirect("login")
