from django.urls import path
from . import views
from . import api_views
from . import views_advanced
from . import api_log
from . import api_tokenize

urlpatterns = [
    path("dashboard/", views.dashboard_view, name="dashboard"),
    path("prompt/", views.prompt_view, name="prompt"),
    path("logs/", views.logs_view, name="logs"),
    path("logs/<int:log_id>/", views.log_detail_view, name="log_detail"),
    path("logs/<int:log_id>/reveal/", views.ephemeral_sensitive_data, name="ephemeral_reveal"),

    # ── DLP JSON API ──────────────────────────────────────────────────────
    path("analyze", api_views.analyze, name="api_analyze"),
    path("analyze-file", api_views.analyze_file, name="api_analyze_file"),

    # ── Advanced Three-Layer Firewall ─────────────────────────────────────
    path("prompt-advanced/", views_advanced.prompt_advanced_view, name="prompt_advanced"),
    path("trust-dashboard/", views_advanced.trust_dashboard_view, name="trust_dashboard"),
    path("analyze-advanced", views_advanced.analyze_advanced, name="api_analyze_advanced"),

    # ── Agentic AI Internal Endpoints ─────────────────────────────────────
    path("log-agentic", api_log.log_agentic_scan, name="api_log_agentic"),
    path("tokenize-prompt", api_tokenize.tokenize_prompt, name="api_tokenize_prompt"),
]
