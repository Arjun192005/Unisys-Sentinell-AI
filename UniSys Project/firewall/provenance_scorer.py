"""
firewall/provenance_scorer.py
==============================
Layer 3 — Context Trust & Provenance Scoring Engine

Evaluates the TRUSTWORTHINESS of the input source, not just the content.

Trust dimensions:
  1. Source Type       — typed text vs uploaded file vs pasted content
  2. User Behavior     — submission frequency, time-of-day patterns, role consistency
  3. Session Context   — conversation history, cross-turn attack patterns
  4. Document Origin   — file metadata, external URL markers, retrieved content flags
  5. Temporal Anomaly  — unusual submission timing, burst patterns

Returns a ProvenanceScore dataclass with:
  - trust_score       : 0.0–1.0 (1.0 = fully trusted, 0.0 = untrusted)
  - trust_level       : TRUSTED / SEMI_TRUSTED / UNTRUSTED
  - source_type       : TEXT / FILE / PASTED / RETRIEVED
  - anomaly_flags     : list of detected anomalies
  - explanation       : human-readable summary
  - should_escalate   : bool — if True, apply stricter policy
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import re


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class ProvenanceScore:
    trust_score:     float = 1.0
    trust_level:     str = "TRUSTED"
    source_type:     str = "TEXT"
    anomaly_flags:   List[str] = field(default_factory=list)
    explanation:     str = ""
    should_escalate: bool = False


# ---------------------------------------------------------------------------
# In-memory session tracking (use Redis in production)
# ---------------------------------------------------------------------------

# Key: user_id → list of (timestamp, source_type, risk_score)
_user_history: dict[int, list[tuple[datetime, str, int]]] = defaultdict(list)

# Key: user_id → last_submission_time
_last_submission: dict[int, datetime] = {}


# ---------------------------------------------------------------------------
# Source type classification
# ---------------------------------------------------------------------------

def _classify_source(
    text: str,
    source_label: Optional[str],
    is_file_upload: bool,
) -> str:
    """
    Classify the input source type.

    Returns: TEXT | FILE | PASTED | RETRIEVED
    """
    if is_file_upload or source_label:
        return "FILE"

    # Detect pasted content markers
    # - Multiple line breaks (>5 consecutive newlines)
    # - HTML tags (suggests copy-paste from web)
    # - URL markers (suggests retrieved content)
    if re.search(r'\n{5,}', text):
        return "PASTED"
    if re.search(r'<[a-z]+[^>]*>', text, re.IGNORECASE):
        return "PASTED"
    if re.search(r'https?://|www\.', text, re.IGNORECASE):
        return "RETRIEVED"

    return "TEXT"


# ---------------------------------------------------------------------------
# Behavioral anomaly detection
# ---------------------------------------------------------------------------

def _detect_anomalies(
    user_id: int,
    source_type: str,
    risk_score: int,
    timestamp: datetime,
) -> List[str]:
    """
    Detect behavioral anomalies based on user history.

    Returns a list of anomaly flag strings.
    """
    anomalies: List[str] = []

    # ── Burst pattern detection ───────────────────────────────────────────
    # More than 20 submissions in the last 2 minutes = burst (increased for chat apps)
    recent = [
        ts for ts, _, _ in _user_history[user_id]
        if timestamp - ts < timedelta(minutes=2)
    ]
    if len(recent) >= 20:
        anomalies.append("burst_pattern")

    # ── Rapid escalation ──────────────────────────────────────────────────
    # Risk score jumped by >40 points in last 3 submissions
    last_3 = _user_history[user_id][-3:] if len(_user_history[user_id]) >= 3 else []
    if last_3:
        prev_risk = last_3[0][2]
        if risk_score - prev_risk > 40:
            anomalies.append("rapid_risk_escalation")

    # ── Off-hours submission ──────────────────────────────────────────────
    # Submission between 2 AM and 5 AM local time (suspicious for enterprise)
    hour = timestamp.hour
    if 2 <= hour < 5:
        anomalies.append("off_hours_submission")

    # ── Source type switching ─────────────────────────────────────────────
    # User switched from TEXT to FILE or PASTED in last 2 submissions
    last_2_sources = [st for _, st, _ in _user_history[user_id][-2:]]
    if len(last_2_sources) == 2 and last_2_sources[0] != last_2_sources[1]:
        if source_type in ("FILE", "PASTED", "RETRIEVED"):
            anomalies.append("source_type_switching")

    # ── High-risk file upload ─────────────────────────────────────────────
    # File upload with risk_score >= 60
    if source_type == "FILE" and risk_score >= 60:
        anomalies.append("high_risk_file_upload")

    return anomalies


# ---------------------------------------------------------------------------
# Trust score calculation
# ---------------------------------------------------------------------------

def _calculate_trust(
    source_type: str,
    anomaly_flags: List[str],
    risk_score: int,
) -> tuple[float, str]:
    """
    Calculate trust score and level.

    Returns: (trust_score, trust_level)
      trust_score: 0.0–1.0
      trust_level: TRUSTED | SEMI_TRUSTED | UNTRUSTED
    """
    # Base trust by source type
    base_trust = {
        "TEXT":      1.0,
        "FILE":      0.85,
        "PASTED":    0.70,
        "RETRIEVED": 0.60,
    }.get(source_type, 0.80)

    # Penalty per anomaly
    penalty = len(anomaly_flags) * 0.15

    # Risk score penalty (if risk >= 60, reduce trust)
    if risk_score >= 80:
        penalty += 0.25
    elif risk_score >= 60:
        penalty += 0.15

    trust_score = max(0.0, base_trust - penalty)

    # Classify trust level
    if trust_score >= 0.75:
        trust_level = "TRUSTED"
    elif trust_score >= 0.50:
        trust_level = "SEMI_TRUSTED"
    else:
        trust_level = "UNTRUSTED"

    return trust_score, trust_level


# ---------------------------------------------------------------------------
# Public scoring function
# ---------------------------------------------------------------------------

def score_provenance(
    user_id: int,
    text: str,
    source_label: Optional[str],
    is_file_upload: bool,
    risk_score: int,
) -> ProvenanceScore:
    """
    Score the provenance and trustworthiness of the input.

    Args:
        user_id        : User ID for behavioral tracking
        text           : The prompt text
        source_label   : File name if uploaded, else None
        is_file_upload : True if this is a file upload
        risk_score     : Risk score from risk_scorer (0–100)

    Returns:
        ProvenanceScore with trust_score, trust_level, anomaly_flags, etc.
    """
    timestamp = datetime.now()

    # Classify source type
    source_type = _classify_source(text, source_label, is_file_upload)

    # Detect anomalies
    anomaly_flags = _detect_anomalies(user_id, source_type, risk_score, timestamp)

    # Calculate trust score
    trust_score, trust_level = _calculate_trust(source_type, anomaly_flags, risk_score)

    # Escalation flag: if trust_score < 0.60 or any critical anomaly
    critical_anomalies = {"burst_pattern", "rapid_risk_escalation", "high_risk_file_upload"}
    should_escalate = trust_score < 0.60 or bool(set(anomaly_flags) & critical_anomalies)

    # Build explanation
    if anomaly_flags:
        readable_anomalies = {
            "burst_pattern":            "Burst Pattern (>20 submissions in 2 min)",
            "rapid_risk_escalation":    "Rapid Risk Escalation (+40 points)",
            "off_hours_submission":     "Off-Hours Submission (2–5 AM)",
            "source_type_switching":    "Source Type Switching",
            "high_risk_file_upload":    "High-Risk File Upload (risk ≥60%)",
        }
        anomaly_labels = [readable_anomalies.get(a, a.replace("_", " ").title()) for a in anomaly_flags]
        explanation = f"Trust: {trust_level} ({trust_score:.0%}). Source: {source_type}. Anomalies: {', '.join(anomaly_labels)}."
    else:
        explanation = f"Trust: {trust_level} ({trust_score:.0%}). Source: {source_type}. No anomalies detected."

    # Update user history
    _user_history[user_id].append((timestamp, source_type, risk_score))
    # Keep only last 50 entries per user
    if len(_user_history[user_id]) > 50:
        _user_history[user_id] = _user_history[user_id][-50:]
    _last_submission[user_id] = timestamp

    return ProvenanceScore(
        trust_score=trust_score,
        trust_level=trust_level,
        source_type=source_type,
        anomaly_flags=anomaly_flags,
        explanation=explanation,
        should_escalate=should_escalate,
    )
