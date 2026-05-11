"""
users/urls.py – URL configuration for authentication flows.
"""

from django.urls import path

from . import views

urlpatterns = [
    # Authentication
    path("login/", views.login_view, name="login"),
    path("signup/", views.signup_view, name="signup"),
    path("logout/", views.logout_view, name="logout"),
]
