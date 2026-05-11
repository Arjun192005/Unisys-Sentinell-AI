"""
firewall/api_log.py
===================
Internal logging endpoint for the Agentic AI service.

POST /log-agentic
─────────────────
Accepts a scan result from the Agentic AI Express backend and creates
a PromptLog entry so every Agentic AI prompt appears in the SentinelAI
dashboard with the correct user, role, risk score, action, and
properly masked processed prompt.

This is a NEW file — zero changes to any existing SentinelAI code.
Authentication: shared internal key via X-Internal-Key header.
"""

import json
import logging
import os

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.contrib.auth import get_user_model

from .models import PromptLog
from .encryption import encrypt
from .scanner import scan
from .policy_engine import apply_policy
from .tokenization import tokenize
from .risk_scorer import calculate_risk

logger = logging.getLogger(__name__)

User = get_user_model()

# Internal shared secret — must match SENTINEL_INTERNAL_KEY in Express .env
_INTERNAL_KEY = os.environ.get("SENTINEL_INTERNAL_KEY", "sentinel-internal-key-2026")

# Role map: Agentic AI demo user IDs → SentinelAI role strings
_ROLE_MAP = {1: "ADMIN", 2: "EMPLOYEE", 3: "INTERN"}


def _check_internal_key(request) -> bool:
    return request.headers.get("X-Internal-Key", "") == _INTERNAL_KEY


@csrf_exempt
@require_POST
def log_agentic_scan(request):
    """
    POST /log-agentic

    Body (JSON):
    {
        "user_id":             1,
        "role":                "ADMIN",
        "source":              "prompt",
        "original_text":       "...",
        "status":              "SAFE",
        "action":              "ALLOW",
        "risk_score":          0,
        "risk_level":          "LOW",
        "trust_score":         1.0,
        "trust_level":         "TRUSTED",
        "semantic_confidence": 0.0,
        "semantic_flags":      [],
        "attack_vectors":      [],
        "anomaly_flags":       [],
        "detected_types":      [],
        "explanation":         "..."
    }
    """
    if not _check_internal_key(request):
        logger.warning("log_agentic_scan: rejected — invalid X-Internal-Key")
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    user_id        = body.get("user_id", 1)
    source         = body.get("source", "prompt")
    original_text  = body.get("original_text", "")
    masked_text    = body.get("masked_text", None)   # NEW: pre-masked text from Express
    action         = body.get("action", "ALLOW").upper()
    risk_score     = int(body.get("risk_score", 0))
    risk_level     = body.get("risk_level", "LOW").upper()
    trust_score    = float(body.get("trust_score", 1.0))
    trust_level    = body.get("trust_level", "TRUSTED").upper()
    sem_conf       = float(body.get("semantic_confidence", 0.0))
    sem_flags      = body.get("semantic_flags", [])
    attack_vectors = body.get("attack_vectors", [])
    anomaly_flags  = body.get("anomaly_flags", [])
    detected_types = body.get("detected_types", [])
    explanation    = body.get("explanation", "")

    if action not in ("ALLOW", "BLOCK", "TOKENIZE"):
        action = "ALLOW"

    # ── Resolve role and user ─────────────────────────────────────────────────
    target_role = _ROLE_MAP.get(user_id, "INTERN")
    user = User.objects.filter(role=target_role).first()
    if not user:
        user = User.objects.filter(is_superuser=True).first()

    # ── Build processed_prompt ────────────────────────────────────────────────
    # Priority: use masked_text from Express (already tokenized) if provided.
    # Fallback: re-run scanner + tokenizer locally.
    processed_prompt = original_text
    ai_response = ""

    if action == "BLOCK":
        processed_prompt = "[BLOCKED — Agentic AI gateway]"
        ai_response = "[BLOCKED]"
    elif source == "response":
        processed_prompt = "[AI RESPONSE — scanned by Agentic AI gateway]"
        ai_response = original_text[:500] if original_text else ""
    elif masked_text and masked_text != original_text:
        # Express already tokenized it — use the pre-masked text directly
        processed_prompt = masked_text
        action = "TOKENIZE"
    elif original_text and action in ("ALLOW", "TOKENIZE"):
        # Fallback: re-run scanner + tokenizer locally
        try:
            detections = scan(original_text)
            policy = apply_policy(target_role, detections)
            tokenize_targets = policy.get("tokenize_targets", [])

            if tokenize_targets:
                masked, _token_map = tokenize(original_text, tokenize_targets)
                processed_prompt = masked
                action = "TOKENIZE"  # Ensure action reflects masking occurred

                # Recalculate risk with actual detections if not already set
                if risk_score == 0 and detections:
                    risk_data = calculate_risk(target_role, detections)
                    risk_score = risk_data["score"]
                    risk_level = risk_data["level"]

                # Update detected_types from actual scan if not provided
                if not detected_types:
                    detected_types = list({d.dtype for d in detections})
            else:
                processed_prompt = original_text
        except Exception as e:
            logger.warning("log_agentic_scan: tokenization failed — %s", e)
            processed_prompt = original_text

    # ── Encrypt original text ─────────────────────────────────────────────────
    try:
        encrypted_original = encrypt(original_text) if original_text else ""
    except Exception:
        encrypted_original = original_text

    # ── Create PromptLog ──────────────────────────────────────────────────────
    try:
        log = PromptLog.objects.create(
            user=user,
            original_prompt=encrypted_original,
            processed_prompt=processed_prompt,
            detected_types=detected_types,
            action=action,
            reasons=[explanation] if explanation else [],
            risk_score=risk_score,
            risk_level=risk_level,
            ai_response=ai_response,
            semantic_flags=sem_flags,
            semantic_confidence=sem_conf,
            attack_vectors=attack_vectors,
            trust_score=trust_score,
            trust_level=trust_level,
            source_type="TEXT",
            anomaly_flags=anomaly_flags,
        )

        logger.info(
            "log_agentic_scan: PromptLog id=%d user=%s role=%s source=%s action=%s risk=%d/%s",
            log.pk,
            user.username if user else "unknown",
            target_role,
            source,
            action,
            risk_score,
            risk_level,
        )

        return JsonResponse({"success": True, "log_id": log.pk})

    except Exception as exc:
        logger.error("log_agentic_scan: failed to create PromptLog — %s", exc)
        return JsonResponse({"error": f"Failed to create log: {exc}"}, status=500)
