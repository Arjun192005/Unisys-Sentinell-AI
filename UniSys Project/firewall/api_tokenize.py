"""
firewall/api_tokenize.py
========================
Internal tokenization endpoint for the Agentic AI service.

POST /tokenize-prompt
─────────────────────
Accepts raw text + user_id, runs the full scanner + policy engine + tokenizer,
and returns the masked text. The Agentic AI Express backend calls this BEFORE
sending the prompt to Ollama so PII never reaches the LLM.

This is a NEW file — zero changes to any existing SentinelAI code.
Authentication: shared internal key via X-Internal-Key header.
"""

import json
import logging
import os

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .scanner import scan
from .policy_engine import apply_policy
from .tokenization import tokenize
from .risk_scorer import calculate_risk

logger = logging.getLogger(__name__)

_INTERNAL_KEY = os.environ.get("SENTINEL_INTERNAL_KEY", "sentinel-internal-key-2026")
_ROLE_MAP = {1: "ADMIN", 2: "EMPLOYEE", 3: "INTERN"}


def _check_internal_key(request) -> bool:
    return request.headers.get("X-Internal-Key", "") == _INTERNAL_KEY


@csrf_exempt
@require_POST
def tokenize_prompt(request):
    """
    POST /tokenize-prompt

    Body: { "text": "...", "user_id": 1 }

    Returns:
    {
        "original":       "this my phone number 8877660833",
        "masked":         "this my phone number ******0833",
        "was_tokenized":  true,
        "detected_types": ["phone"],
        "action":         "TOKENIZE"
    }

    If no PII is detected, "masked" == "original" and "was_tokenized" == false.
    If the prompt should be BLOCKED, returns { "action": "BLOCK", "masked": null }.
    """
    if not _check_internal_key(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    text = body.get("text", "")
    user_id = body.get("user_id", 1)

    if not isinstance(text, str) or not text.strip():
        return JsonResponse({"error": "Field 'text' is required."}, status=400)

    role = _ROLE_MAP.get(user_id, "EMPLOYEE")

    # Run scanner
    detections = scan(text)
    detected_types = list({d.dtype for d in detections})

    # Apply role-based policy
    policy = apply_policy(role, detections)
    action = policy["action"]
    tokenize_targets = policy.get("tokenize_targets", [])

    if action == "BLOCK":
        logger.info("tokenize_prompt: BLOCK for role=%s detected=%s", role, detected_types)
        return JsonResponse({
            "original":       text,
            "masked":         None,
            "was_tokenized":  False,
            "detected_types": detected_types,
            "action":         "BLOCK",
        })

    # Tokenize PII if needed
    if tokenize_targets:
        masked, _token_map = tokenize(text, tokenize_targets)
        logger.info(
            "tokenize_prompt: TOKENIZE role=%s detected=%s",
            role, detected_types
        )
        return JsonResponse({
            "original":       text,
            "masked":         masked,
            "was_tokenized":  True,
            "detected_types": detected_types,
            "action":         "TOKENIZE",
        })

    # No PII — pass through unchanged
    return JsonResponse({
        "original":       text,
        "masked":         text,
        "was_tokenized":  False,
        "detected_types": detected_types,
        "action":         "ALLOW",
    })
