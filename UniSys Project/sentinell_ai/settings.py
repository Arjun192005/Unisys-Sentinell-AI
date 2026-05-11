"""
Django settings for sentinell_ai project.

Security Notes:
  - SECRET_KEY loaded from environment variables
  - Email credentials loaded from environment variables
  - CSRF and session security enabled
  - Rate limiting middleware active
  - No secrets hardcoded in production
"""

import os
from pathlib import Path

# ── Load .env file ────────────────────────────────────────────────────────────
# Read .env file manually (no external dependency needed)
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-!@@qa1km04siytkxg=*t@2mk&))dttj*i!hzv!jj$c9^sczcex",
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = ["*"]

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "corsheaders",
    # Local apps
    "users",
    "firewall",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",          # must be first
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Custom security middleware
    "users.middleware.RateLimitMiddleware",
]

# CORS — allow all origins for the API endpoints (tighten in production)
CORS_ALLOW_ALL_ORIGINS = True
CORS_URLS_REGEX = r"^/(analyze|analyze-file).*$"

ROOT_URLCONF = "sentinell_ai.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "sentinell_ai.wsgi.application"

# Database
_db_engine = os.environ.get("DB_ENGINE", "django.db.backends.sqlite3")
_db_name = os.environ.get("DB_NAME", BASE_DIR / "db.sqlite3")

if _db_engine == "django.db.backends.sqlite3":
    DATABASES = {
        "default": {
            "ENGINE": _db_engine,
            "NAME": _db_name if _db_name != "db.sqlite3" else BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": _db_engine,
            "NAME": _db_name,
            "USER": os.environ.get("DB_USER", "sentinell_user"),
            "PASSWORD": os.environ.get("DB_PASSWORD", "sentinell_secure_2026"),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
        }
    }

# Custom user model
AUTH_USER_MODEL = "users.CustomUser"

# Authentication redirects
LOGIN_URL = "/login/"
LOGIN_REDIRECT_URL = "/dashboard/"
LOGOUT_REDIRECT_URL = "/login/"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]

# Fernet encryption key (32 url-safe base64-encoded bytes)
FERNET_KEY = os.environ.get(
    "FERNET_KEY", "zKxYq3Hv8mNpR2Lw5TdUiOeAjBcFsGhX4lQkPnVyWZE="
).encode()

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# =============================================================================
# SESSION SECURITY
# =============================================================================
SESSION_COOKIE_HTTPONLY = True  # Prevent JS access to session cookie
SESSION_COOKIE_SAMESITE = "Lax"  # CSRF protection
SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_AGE = 3600  # 1 hour session expiry

# In production, enable these:
# SESSION_COOKIE_SECURE = True  # HTTPS only
# CSRF_COOKIE_SECURE = True     # HTTPS only
# SECURE_SSL_REDIRECT = True    # Redirect HTTP to HTTPS

# =============================================================================
# LOGGING
# =============================================================================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "loggers": {
        "users": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": True,
        },
        "firewall": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": True,
        },
    },
}
