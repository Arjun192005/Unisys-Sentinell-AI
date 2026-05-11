"""
firewall/views.py – Main pipeline view connecting all modules.

Pipeline for prompt_view:
  1. Receive prompt from user
  2. scan() → list of detections
  3. apply_policy(role, detections) → action, reasons, tokenize_targets, block_details
  4. calculate_risk(role, detections) → risk_score, risk_level
  5. If risk_score >= 60 → upgrade ALLOW → BLOCK (defense-in-depth)

  ── BLOCK path ──────────────────────────────────────────────────────────────
  6. No masking, no AI call.
     Prompt is denied. Response shows risk %, risk level, and block reasons.

  ── TOKENIZE / ALLOW path ───────────────────────────────────────────────────
  6. tokenize() only the PII detections (email, phone, aadhaar) → masked prompt
  7. encrypt each original value and save TokenMap rows
  8. Call mock_ai(masked_prompt) → ai_response
  9. Log to PromptLog (with risk fields, action=TOKENIZE/ALLOW, masked response)
  10. Render structured Security Report
"""

import logging
import time
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.utils import timezone

from .scanner import scan
from .policy_engine import apply_policy, BLOCK_DTYPE_REASONS
from .tokenization import tokenize
from .encryption import encrypt
from .mock_ai import mock_ai
from .risk_scorer import calculate_risk
from .models import TokenMap, PromptLog
from .document_extractor import extract_text

# ---------------------------------------------------------------------------
# Human-readable labels for detected entity types
# ---------------------------------------------------------------------------
_DTYPE_LABELS = {
    "email":                        "Email Address (Personal PII)",
    "phone":                        "Phone Number (Personal PII)",
    "phone_words":                  "Phone Number – Spoken Digits (Personal PII)",
    "aadhaar":                      "Aadhaar Number (Sensitive PII — Govt ID)",
    "credit_card":                  "Credit Card Number (Financial Data)",
    "ssn":                          "Social Security Number (Govt ID)",
    "financial_account":            "Financial Account / IBAN (Financial Data)",
    "password":                     "Password / Credential (Sensitive Credential)",
    "api_key":                      "API Key / Token (Sensitive Credential)",
    "cloud_key":                    "Cloud Access Key (Critical Credential)",
    "private_key":                  "Private Key (Cryptographic Material)",
    "encryption_key":               "Encryption Key / PEM (Cryptographic Material)",
    "secret_token":                 "Secret / Auth Token (Sensitive Credential)",
    "source_code":                  "Source Code (Intellectual Property)",
    "sql_query":                    "SQL Query (Database Operation)",
    "documentation":                "Internal Documentation",
    "adversarial_injection":        "Adversarial / Jailbreak Injection",
    "encoded_payload":              "Encoded Payload (Obfuscated Content)",
    "embedded_secret_key":          "Embedded Secret Key (Adversarial)",
    "social_engineering_injection": "Social Engineering Injection (Adversarial)",
    "credential_request":           "Credential Harvesting Request",
    "mac_address":                  "MAC Address (Network Identifier)",
    "ip_address":                   "IP Address (Network Identifier)",
    "passport":                     "Passport Number (Govt ID)",
}


def _get_dtype_label(dtype: str) -> str:
    """Return a human-readable label for a detection type."""
    return _DTYPE_LABELS.get(dtype, dtype.replace("_", " ").title())


# PII types — personal data that should be masked
_PII_SET = frozenset({
    "email", "phone", "phone_words", "aadhaar", "passport",
    "mac_address", "ip_address",
})

# Credential types — secrets / auth / financial
_CREDENTIAL_SET = frozenset({
    "api_key", "cloud_key", "password", "private_key",
    "encryption_key", "secret_token", "embedded_secret_key",
    "credit_card", "financial_account", "ssn",
})

# Adversarial types — attack patterns
_ADVERSARIAL_SET = frozenset({
    "adversarial_injection", "encoded_payload",
    "social_engineering_injection", "credential_request",
})

# Technical types — code / queries / docs
_TECHNICAL_SET = frozenset({
    "source_code", "sql_query", "documentation",
})


def _classify_detections(detected_types: list) -> dict:
    """Classify detections into PII vs high-risk categories for the UI report."""
    pii_types = set()
    high_risk_types = set()    # Everything non-PII: credentials, adversarial, technical

    for dtype in detected_types:
        if dtype in _PII_SET:
            pii_types.add(dtype)
        else:
            high_risk_types.add(dtype)

    return {
        "pii": pii_types,
        "high_risk": high_risk_types,
        "has_pii_and_high_risk": bool(pii_types and high_risk_types),
    }


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@login_required(login_url="/login/")
def dashboard_view(request):
    """Show user role badge and navigation options."""
    recent_logs = PromptLog.objects.filter(user=request.user).order_by("-timestamp")[:5]
    total_submissions = PromptLog.objects.filter(user=request.user).count()
    last_log = PromptLog.objects.filter(user=request.user).order_by("-timestamp").first()
    context = {
        "recent_logs": recent_logs,
        "total_submissions": total_submissions,
        "last_submission": last_log.timestamp if last_log else None,
    }
    return render(request, "firewall/dashboard.html", context)


# ---------------------------------------------------------------------------
# Prompt Processing
# ---------------------------------------------------------------------------
@login_required(login_url="/login/")
def prompt_view(request):
    """Receive, scan, evaluate, score risk, log, and respond to a prompt."""
    result = None

    if request.method == "POST":
        original_prompt = request.POST.get("prompt", "").strip()
        uploaded_file = request.FILES.get("document")

        # ── RBAC: Intern document upload restriction ──────────────────────
        # Interns are NOT allowed to upload documents. This is enforced
        # server-side to prevent bypassing the frontend restriction.
        if uploaded_file and request.user.role == "INTERN":
            messages.error(
                request,
                "Access Denied: Interns cannot upload or access document files."
            )
            return render(request, "firewall/prompt.html")

        # ── Document extraction (unified input) ───────────────────────────
        # If a file is provided, extract its text and treat it exactly like
        # typed input — the rest of the pipeline is identical.
        source_label = None  # tracks whether input came from a file
        if uploaded_file:
            extracted, error = extract_text(uploaded_file)
            if error:
                messages.warning(request, f"Document extraction failed: {error}")
                return render(request, "firewall/prompt.html")
            # Append extracted text to any typed text, or use it alone
            original_prompt = (original_prompt + "\n\n" + extracted).strip() if original_prompt else extracted
            source_label = uploaded_file.name  # shown in the report

        if not original_prompt:
            messages.warning(request, "Please enter a prompt or upload a document before submitting.")
            return render(request, "firewall/prompt.html")

        # Step 1: Scan
        detections = scan(original_prompt)
        detected_types = list({d.dtype for d in detections})

        # Step 2: Policy
        policy = apply_policy(request.user.role, detections)
        action = policy["action"]
        reasons = policy["reasons"]
        tokenize_targets = policy["tokenize_targets"]

        # Step 3: Risk Score
        risk = calculate_risk(request.user.role, detections)
        risk_score = risk["score"]
        risk_level = risk["level"]

        # Step 4: Defense-in-depth — risk score can upgrade ALLOW → BLOCK
        if risk["should_block"] and action == "ALLOW":
            action = "BLOCK"
            reasons.append(
                f"🚨 Risk score {risk_score}% exceeds threshold (≥60%) — automatic block."
            )

        # Step 5: Classify detections for structured UI report
        detection_classes = _classify_detections(detected_types)

        # Build labeled entities list for the UI
        detected_entities = []
        for dtype in detected_types:
            is_pii = dtype in detection_classes["pii"]
            is_high_risk = dtype in detection_classes["high_risk"]
            # Sub-classify high-risk for UI icon/color
            is_credential = dtype in _CREDENTIAL_SET
            is_adversarial = dtype in _ADVERSARIAL_SET
            is_technical = dtype in _TECHNICAL_SET
            detected_entities.append({
                "dtype": dtype,
                "label": _get_dtype_label(dtype),
                "dtype_upper": dtype.replace("_", " ").upper(),
                "is_pii": is_pii,
                "is_credential": is_credential,
                "is_adversarial": is_adversarial,
                "is_technical": is_technical,
                "is_high_risk": is_high_risk,
            })

        # Warning when PII + any high-risk content coexist
        combined_warning = None
        if detection_classes["has_pii_and_high_risk"]:
            pii_labels = ", ".join(_get_dtype_label(d) for d in detection_classes["pii"])
            hr_labels = ", ".join(_get_dtype_label(d) for d in detection_classes["high_risk"])
            combined_warning = (
                f"⚠️ This prompt contains Personal Information ({pii_labels}) "
                f"and High-Risk Content ({hr_labels}). "
                f"All PII has been masked and the prompt has been blocked."
            )

        ai_response = ""

        if action == "BLOCK":
            # ── BLOCK PATH ─────────────────────────────────────────────────
            # High-risk content detected. No masking, no AI call.
            # Build per-dtype block explanations for the UI.
            block_details = []
            seen = set()
            for d in detections:
                if d.dtype not in seen:
                    seen.add(d.dtype)
                    explanation = BLOCK_DTYPE_REASONS.get(
                        d.dtype,
                        f"{d.dtype.replace('_', ' ').title()} — blocked under Zero Trust policy."
                    )
                    block_details.append({
                        "dtype":       d.dtype.replace("_", " ").upper(),
                        "label":       _get_dtype_label(d.dtype),
                        "explanation": explanation,
                    })

            # Build masked preview for blocked prompts that contain PII
            # Always mask PII when present, regardless of what high-risk type triggered the block
            masked_preview = None
            if tokenize_targets:
                masked_preview, _ = tokenize(original_prompt, tokenize_targets)

            # Log the blocked prompt (no processed_prompt / ai_response)
            # Store the original prompt in encrypted form for data-at-rest security
            PromptLog.objects.create(
                user=request.user,
                original_prompt=encrypt(original_prompt),
                processed_prompt="[BLOCKED — not processed]",
                detected_types=detected_types,
                action=action,
                reasons=reasons,
                risk_score=risk_score,
                risk_level=risk_level,
                ai_response="[BLOCKED]",
            )

            result = {
                "original_prompt":   original_prompt,
                "processed_prompt":  None,
                "action":            action,
                "reasons":           reasons,
                "detected_types":    detected_types,
                "detected_entities": detected_entities,
                "risk_score":        risk_score,
                "risk_level":        risk_level,
                "ai_response":       None,
                "block_details":     block_details,
                "combined_warning":  combined_warning,
                "masked_preview":    masked_preview,
                "detection_classes": detection_classes,
                "source_label":      source_label,
            }

        else:
            # ── TOKENIZE / ALLOW PATH ──────────────────────────────────────
            # Mask only PII detections (email, phone, aadhaar, phone_words).
            # tokenize_targets already contains only TOKENIZE-action detections.
            if tokenize_targets:
                masked_prompt, token_map = tokenize(original_prompt, tokenize_targets)
                for label, original_value in token_map.items():
                    encrypted = encrypt(original_value)
                    TokenMap.objects.create(
                        user=request.user,
                        token_label=label[:30],
                        encrypted_value=encrypted,
                    )
            else:
                masked_prompt = original_prompt
                token_map = {}

            processed_prompt = masked_prompt

            # Call AI with the processed (PII-masked or original) prompt
            ai_response = mock_ai(processed_prompt)

            # Log everything — encrypt the original prompt for data-at-rest security
            PromptLog.objects.create(
                user=request.user,
                original_prompt=encrypt(original_prompt),
                processed_prompt=processed_prompt,
                detected_types=detected_types,
                action=action,
                reasons=reasons,
                risk_score=risk_score,
                risk_level=risk_level,
                ai_response=ai_response,
            )

            result = {
                "original_prompt":   original_prompt,
                "processed_prompt":  processed_prompt,
                "action":            action,
                "reasons":           reasons,
                "detected_types":    detected_types,
                "detected_entities": detected_entities,
                "risk_score":        risk_score,
                "risk_level":        risk_level,
                "ai_response":       ai_response,
                "block_details":     [],
                "combined_warning":  combined_warning,
                "masked_preview":    None,
                "detection_classes": detection_classes,
                "source_label":      source_label,
            }

    return render(request, "firewall/prompt.html", {"result": result})


# ---------------------------------------------------------------------------
# Admin Log Page
# ---------------------------------------------------------------------------
@login_required(login_url="/login/")
def logs_view(request):
    """Display all prompt logs – Admin only."""
    if request.user.role != "ADMIN":
        messages.error(request, "Access denied. Admin privileges required.")
        return redirect("dashboard")

    logs = PromptLog.objects.select_related("user").all()
    return render(request, "firewall/logs.html", {"logs": logs})

# ---------------------------------------------------------------------------
# Log Detail Page — Sensitive data is MASKED by default.
# Admin can temporarily reveal it via the ephemeral access API (10 seconds).
# ---------------------------------------------------------------------------
@login_required(login_url="/login/")
def log_detail_view(request, log_id):
    """Display full details of a single prompt log – Admin only.

    Sensitive fields (original prompt, processed prompt, AI response) are
    shown in masked form by default. Admin can request time-limited access
    via the ephemeral_sensitive_data endpoint.
    """
    if request.user.role != "ADMIN":
        messages.error(request, "Access denied. Admin privileges required.")
        return redirect("dashboard")

    log = get_object_or_404(PromptLog.objects.select_related("user"), pk=log_id)

    # Build masked versions of sensitive fields for initial render
    def _mask(text):
        if not text or text in ("[BLOCKED]", "[BLOCKED — not processed]"):
            return text
        # Show first 12 chars, mask the rest
        if len(text) <= 16:
            return "•" * len(text)
        return text[:12] + "•" * min(len(text) - 12, 40) + f" [{len(text)} chars]"

    masked_original = _mask(log.decrypted_original_prompt)
    masked_processed = _mask(log.processed_prompt)
    masked_ai = _mask(log.ai_response)

    context = {
        "log": log,
        "masked_original": masked_original,
        "masked_processed": masked_processed,
        "masked_ai": masked_ai,
        "ephemeral_ttl": 10,  # seconds
    }
    return render(request, "firewall/log_detail.html", context)


# ---------------------------------------------------------------------------
# In-memory store for ephemeral access grants.
# Key: (user_id, log_id)  →  expiry_timestamp (float)
# ---------------------------------------------------------------------------
_ephemeral_grants: dict = {}

EPHEMERAL_TTL = 10  # seconds


@login_required(login_url="/login/")
@require_POST
def ephemeral_sensitive_data(request, log_id):
    """Grant or check time-limited access to sensitive log data.

    POST /logs/<id>/reveal/  →  Returns unmasked data with a 10-second window.

    After the window expires, subsequent requests return masked data.
    This is enforced server-side — the frontend countdown is cosmetic only.
    """
    if request.user.role != "ADMIN":
        return JsonResponse({"error": "Access denied."}, status=403)

    log = get_object_or_404(PromptLog.objects.select_related("user"), pk=log_id)
    grant_key = (request.user.pk, log_id)
    now = time.time()

    # Check if there's an existing unexpired grant
    expiry = _ephemeral_grants.get(grant_key)

    if expiry and now < expiry:
        # Still within the window — return unmasked data + remaining time
        remaining = round(expiry - now, 1)
        return JsonResponse({
            "status": "granted",
            "remaining": remaining,
            "original_prompt": log.decrypted_original_prompt,
            "processed_prompt": log.processed_prompt,
            "ai_response": log.ai_response,
        })

    if expiry and now >= expiry:
        # Window expired — clean up and deny
        _ephemeral_grants.pop(grant_key, None)
        return JsonResponse({
            "status": "expired",
            "message": "Access window has expired. Request a new reveal.",
        })

    # No existing grant — create a new one
    _ephemeral_grants[grant_key] = now + EPHEMERAL_TTL

    # Audit log: record the admin's sensitive data access
    logger = logging.getLogger(__name__)
    logger.info(
        "EPHEMERAL_ACCESS_GRANTED: user=%s role=%s log_id=%s duration=%ds timestamp=%s",
        request.user.username, request.user.role, log_id, EPHEMERAL_TTL,
        timezone.now().isoformat(),
    )

    return JsonResponse({
        "status": "granted",
        "remaining": EPHEMERAL_TTL,
        "original_prompt": log.decrypted_original_prompt,
        "processed_prompt": log.processed_prompt,
        "ai_response": log.ai_response,
    })
