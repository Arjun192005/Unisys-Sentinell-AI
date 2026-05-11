"""
firewall/views_advanced.py
===========================
Advanced three-layer firewall views with semantic + provenance analysis.

This module EXTENDS the existing views.py without modifying it.
It provides new endpoints that use all three layers:
  Layer 1: Deterministic regex scanner (existing)
  Layer 2: Semantic jailbreak classifier (new)
  Layer 3: Provenance trust scorer (new)

New endpoints:
  /prompt-advanced/     — Enhanced prompt processing with all 3 layers
  /trust-dashboard/     — Admin-only trust analytics dashboard
  /analyze-advanced     — REST API with semantic + provenance analysis
"""

import logging
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.db.models import Avg, Count, Q
from django.utils import timezone
from datetime import timedelta

from .scanner import scan
from .policy_engine import apply_policy, BLOCK_DTYPE_REASONS
from .tokenization import tokenize
from .encryption import encrypt
from .mock_ai import mock_ai
from .risk_scorer import calculate_risk
from .models import PromptLog
from .document_extractor import extract_text

# ── NEW IMPORTS ────────────────────────────────────────────────────────────
from .semantic_classifier import classify_semantics
from .provenance_scorer import score_provenance

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper: same dtype label function from views.py
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
    return _DTYPE_LABELS.get(dtype, dtype.replace("_", " ").title())

_PII_SET = frozenset({
    "email", "phone", "phone_words", "aadhaar", "passport",
    "mac_address", "ip_address",
})

_CREDENTIAL_SET = frozenset({
    "api_key", "cloud_key", "password", "private_key",
    "encryption_key", "secret_token", "embedded_secret_key",
    "credit_card", "financial_account", "ssn",
})

_ADVERSARIAL_SET = frozenset({
    "adversarial_injection", "encoded_payload",
    "social_engineering_injection", "credential_request",
})

_TECHNICAL_SET = frozenset({
    "source_code", "sql_query", "documentation",
})

def _classify_detections(detected_types: list) -> dict:
    pii_types = set()
    high_risk_types = set()
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
# Advanced Prompt View — Three-Layer Analysis
# ---------------------------------------------------------------------------

@login_required(login_url="/login/")
def prompt_advanced_view(request):
    """
    Enhanced prompt processing with three-layer analysis:
      Layer 1: Regex scanner (existing)
      Layer 2: Semantic classifier (new)
      Layer 3: Provenance scorer (new)

    Final decision combines all three layers.
    """
    result = None

    if request.method == "POST":
        original_prompt = request.POST.get("prompt", "").strip()
        uploaded_file = request.FILES.get("document")

        # ── RBAC: Intern document upload restriction ──────────────────────
        if uploaded_file and request.user.role == "INTERN":
            messages.error(
                request,
                "Access Denied: Interns cannot upload or access document files."
            )
            return render(request, "firewall/prompt_advanced.html")

        # ── Document extraction ───────────────────────────────────────────
        source_label = None
        is_file_upload = False
        if uploaded_file:
            extracted, error = extract_text(uploaded_file)
            if error:
                messages.warning(request, f"Document extraction failed: {error}")
                return render(request, "firewall/prompt_advanced.html")
            original_prompt = (original_prompt + "\n\n" + extracted).strip() if original_prompt else extracted
            source_label = uploaded_file.name
            is_file_upload = True

        if not original_prompt:
            messages.warning(request, "Please enter a prompt or upload a document before submitting.")
            return render(request, "firewall/prompt_advanced.html")

        # ═══════════════════════════════════════════════════════════════════
        # LAYER 1: Deterministic Regex Scanner
        # ═══════════════════════════════════════════════════════════════════
        detections = scan(original_prompt)
        detected_types = list({d.dtype for d in detections})

        policy = apply_policy(request.user.role, detections)
        action = policy["action"]
        reasons = policy["reasons"]
        tokenize_targets = policy["tokenize_targets"]

        risk = calculate_risk(request.user.role, detections)
        risk_score = risk["score"]
        risk_level = risk["level"]

        # ═══════════════════════════════════════════════════════════════════
        # LAYER 2: Semantic Jailbreak Classifier
        # ═══════════════════════════════════════════════════════════════════
        semantic_result = classify_semantics(original_prompt)

        # If semantic classifier flags adversarial intent, upgrade to BLOCK
        if semantic_result.is_adversarial and action != "BLOCK":
            action = "BLOCK"
            reasons.append(
                f"🚨 Semantic analysis detected adversarial intent: {semantic_result.explanation}"
            )
            # Boost risk score if semantic confidence is high
            if semantic_result.confidence >= 0.80:
                risk_score = min(100, risk_score + 20)
                risk_level = "CRITICAL"

        # ═══════════════════════════════════════════════════════════════════
        # LAYER 3: Provenance Trust Scorer
        # ═══════════════════════════════════════════════════════════════════
        provenance = score_provenance(
            user_id=request.user.pk,
            text=original_prompt,
            source_label=source_label,
            is_file_upload=is_file_upload,
            risk_score=risk_score,
        )

        # If provenance flags escalation, apply stricter policy
        if provenance.should_escalate and action == "ALLOW":
            action = "BLOCK"
            reasons.append(
                f"🚨 Provenance analysis flagged untrusted source: {provenance.explanation}"
            )

        # ═══════════════════════════════════════════════════════════════════
        # Defense-in-depth: risk score threshold
        # ═══════════════════════════════════════════════════════════════════
        if risk["should_block"] and action == "ALLOW":
            action = "BLOCK"
            reasons.append(
                f"🚨 Risk score {risk_score}% exceeds threshold (≥60%) — automatic block."
            )

        # ═══════════════════════════════════════════════════════════════════
        # Classification & UI prep
        # ═══════════════════════════════════════════════════════════════════
        detection_classes = _classify_detections(detected_types)

        detected_entities = []
        for dtype in detected_types:
            is_pii = dtype in detection_classes["pii"]
            is_high_risk = dtype in detection_classes["high_risk"]
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

        # ═══════════════════════════════════════════════════════════════════
        # BLOCK PATH
        # ═══════════════════════════════════════════════════════════════════
        if action == "BLOCK":
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

            masked_preview = None
            if tokenize_targets:
                masked_preview, _ = tokenize(original_prompt, tokenize_targets)

            # ── LOG WITH ADVANCED FIELDS ───────────────────────────────────
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
                # NEW FIELDS
                semantic_flags=semantic_result.intent_flags,
                semantic_confidence=semantic_result.confidence,
                attack_vectors=semantic_result.attack_vectors,
                trust_score=provenance.trust_score,
                trust_level=provenance.trust_level,
                source_type=provenance.source_type,
                anomaly_flags=provenance.anomaly_flags,
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
                # NEW FIELDS
                "semantic_result":   semantic_result,
                "provenance":        provenance,
            }

        # ═══════════════════════════════════════════════════════════════════
        # TOKENIZE / ALLOW PATH
        # ═══════════════════════════════════════════════════════════════════
        else:
            if tokenize_targets:
                masked_prompt, token_map = tokenize(original_prompt, tokenize_targets)
                for label, original_value in token_map.items():
                    from .models import TokenMap
                    TokenMap.objects.create(
                        user=request.user,
                        token_label=label[:30],
                        encrypted_value=encrypt(original_value),
                    )
            else:
                masked_prompt = original_prompt

            processed_prompt = masked_prompt
            ai_response = mock_ai(processed_prompt)

            # ── LOG WITH ADVANCED FIELDS ───────────────────────────────────
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
                # NEW FIELDS
                semantic_flags=semantic_result.intent_flags,
                semantic_confidence=semantic_result.confidence,
                attack_vectors=semantic_result.attack_vectors,
                trust_score=provenance.trust_score,
                trust_level=provenance.trust_level,
                source_type=provenance.source_type,
                anomaly_flags=provenance.anomaly_flags,
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
                # NEW FIELDS
                "semantic_result":   semantic_result,
                "provenance":        provenance,
            }

    return render(request, "firewall/prompt_advanced.html", {"result": result})


# ---------------------------------------------------------------------------
# Trust Dashboard — Admin Only
# ---------------------------------------------------------------------------

@login_required(login_url="/login/")
def trust_dashboard_view(request):
    """
    Admin-only dashboard showing trust analytics, anomaly trends, and
    semantic attack patterns across all users.
    """
    if request.user.role != "ADMIN":
        messages.error(request, "Access denied. Admin privileges required.")
        return redirect("dashboard")

    # Time range filter (default: last 7 days)
    days = int(request.GET.get("days", 7))
    since = timezone.now() - timedelta(days=days)

    logs = PromptLog.objects.filter(timestamp__gte=since)

    # ── Aggregate stats ────────────────────────────────────────────────────
    total_submissions = logs.count()
    avg_trust = logs.aggregate(Avg("trust_score"))["trust_score__avg"] or 0.0
    avg_semantic_conf = logs.aggregate(Avg("semantic_confidence"))["semantic_confidence__avg"] or 0.0

    # Trust level breakdown
    trust_breakdown = {
        "TRUSTED":       logs.filter(trust_level="TRUSTED").count(),
        "SEMI_TRUSTED":  logs.filter(trust_level="SEMI_TRUSTED").count(),
        "UNTRUSTED":     logs.filter(trust_level="UNTRUSTED").count(),
    }

    # Source type breakdown
    source_breakdown = {
        "TEXT":      logs.filter(source_type="TEXT").count(),
        "FILE":      logs.filter(source_type="FILE").count(),
        "PASTED":    logs.filter(source_type="PASTED").count(),
        "RETRIEVED": logs.filter(source_type="RETRIEVED").count(),
    }

    # Top anomalies
    all_anomalies = []
    for log in logs:
        all_anomalies.extend(log.anomaly_flags)
    from collections import Counter
    anomaly_counts = Counter(all_anomalies).most_common(5)

    # Top semantic attack vectors
    all_vectors = []
    for log in logs:
        all_vectors.extend(log.attack_vectors)
    vector_counts = Counter(all_vectors).most_common(5)

    # Recent high-risk submissions (trust < 0.5 or semantic confidence > 0.8)
    high_risk_logs = logs.filter(
        Q(trust_score__lt=0.5) | Q(semantic_confidence__gte=0.8)
    ).order_by("-timestamp")[:10]

    context = {
        "days": days,
        "total_submissions": total_submissions,
        "avg_trust": avg_trust,
        "avg_semantic_conf": avg_semantic_conf,
        "trust_breakdown": trust_breakdown,
        "source_breakdown": source_breakdown,
        "anomaly_counts": anomaly_counts,
        "vector_counts": vector_counts,
        "high_risk_logs": high_risk_logs,
    }

    return render(request, "firewall/trust_dashboard.html", context)


# ---------------------------------------------------------------------------
# Helper: classify risk score into level string
# ---------------------------------------------------------------------------

def _classify_risk_level(score: int) -> str:
    if score <= 20:  return "LOW"
    if score <= 40:  return "MODERATE"
    if score <= 60:  return "HIGH"
    if score <= 80:  return "SEVERE"
    return "CRITICAL"


# ---------------------------------------------------------------------------
# Advanced REST API — /analyze-advanced
# ---------------------------------------------------------------------------

@csrf_exempt
@require_POST
def analyze_advanced(request):
    """
    POST /analyze-advanced
    Body: application/json  →  { "text": "<content>", "user_id": <int> }

    Returns:
      {
        "status": "SAFE" | "BLOCK",
        "risk_score": 0–100,
        "trust_score": 0.0–1.0,
        "semantic_confidence": 0.0–1.0,
        "semantic_flags": [...],
        "anomaly_flags": [...],
        "explanation": "..."
      }
    """
    import json
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    text = body.get("text", "")
    user_id = body.get("user_id", 1)  # default to user 1 if not provided

    if not isinstance(text, str) or not text.strip():
        return JsonResponse({"error": "Field 'text' is required and must be a non-empty string."}, status=400)

    # Layer 1: Regex scan with proper role-based policy
    detections = scan(text)
    detected_types = list({d.dtype for d in detections})

    # Resolve role from user_id for accurate policy evaluation
    from django.contrib.auth import get_user_model
    _User = get_user_model()
    role_map = {1: "ADMIN", 2: "EMPLOYEE", 3: "INTERN"}
    role = role_map.get(user_id, "EMPLOYEE")

    # Use the actual role for policy evaluation
    from .policy_engine import evaluate_policy, apply_policy
    has_block = any(evaluate_policy(role, d.dtype)[0] == "BLOCK" for d in detections)

    # Calculate proper risk score using the full risk engine (not hardcoded 40)
    risk_data = calculate_risk(role, detections)
    risk_score = risk_data["score"]
    risk_level = risk_data["level"]

    # Layer 2: Semantic
    semantic_result = classify_semantics(text)

    # Boost risk score if semantic classifier detects adversarial intent
    if semantic_result.is_adversarial:
        if semantic_result.confidence >= 0.80:
            risk_score = min(100, risk_score + 20)
        elif semantic_result.confidence >= 0.50:
            risk_score = min(100, risk_score + 10)
        risk_level = _classify_risk_level(risk_score)

    # Layer 3: Provenance (assume TEXT source for API)
    provenance = score_provenance(
        user_id=user_id,
        text=text,
        source_label=None,
        is_file_upload=False,
        risk_score=risk_score,
    )

    # Final decision
    if has_block or semantic_result.is_adversarial or provenance.should_escalate:
        status = "BLOCK"
    else:
        status = "SAFE"

    explanation = f"Regex: {len(detected_types)} types. {semantic_result.explanation} {provenance.explanation}"

    logger.info("POST /analyze-advanced → %s (risk=%d/%s, trust=%.2f, semantic=%.2f, role=%s)",
                status, risk_score, risk_level, provenance.trust_score, semantic_result.confidence, role)

    return JsonResponse({
        "status": status,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "detected_types": detected_types,
        "trust_score": provenance.trust_score,
        "trust_level": provenance.trust_level,
        "semantic_confidence": semantic_result.confidence,
        "semantic_flags": semantic_result.intent_flags,
        "attack_vectors": semantic_result.attack_vectors,
        "anomaly_flags": provenance.anomaly_flags,
        "explanation": explanation,
    })
