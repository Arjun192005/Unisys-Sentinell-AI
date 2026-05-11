"""
firewall/semantic_classifier.py
================================
Layer 2 — Semantic Jailbreak & Intent Classifier

Detects adversarial intent that regex alone cannot catch:
  - Paraphrased jailbreaks (no exact keyword match)
  - Coercion / authority impersonation
  - Role-override via indirect framing
  - Instruction smuggling through story / hypothetical wrappers
  - Multi-vector obfuscation (leet-speak, unicode substitution, spacing tricks)
  - Indirect prompt injection markers in retrieved / pasted content

This is a deterministic rule-based semantic classifier — no ML model required.
It operates on normalised text so obfuscation tricks are stripped first.

Returns a SemanticResult dataclass with:
  - intent_flags   : list of detected intent categories
  - confidence     : 0.0–1.0 aggregate confidence
  - attack_vectors : list of specific attack pattern names
  - explanation    : human-readable summary
  - is_adversarial : bool shortcut
"""

from __future__ import annotations
import re
import unicodedata
from dataclasses import dataclass, field
from typing import List


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class SemanticResult:
    intent_flags:   List[str] = field(default_factory=list)
    confidence:     float = 0.0
    attack_vectors: List[str] = field(default_factory=list)
    explanation:    str = ""
    is_adversarial: bool = False


# ---------------------------------------------------------------------------
# Text normalisation — strips obfuscation before pattern matching
# ---------------------------------------------------------------------------

# Leet-speak substitution map
_LEET = str.maketrans({
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
    '7': 't', '@': 'a', '$': 's', '!': 'i', '+': 't',
})

# Unicode lookalike → ASCII (covers Cyrillic, Greek, fullwidth, etc.)
_UNICODE_SUBS = {
    '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'r',
    '\u0441': 'c', '\u0445': 'x', '\u0440': 'r', '\u0456': 'i',
    '\uff41': 'a', '\uff42': 'b', '\uff43': 'c', '\uff44': 'd',
    '\uff45': 'e', '\uff46': 'f', '\uff47': 'g', '\uff48': 'h',
    '\uff49': 'i', '\uff4a': 'j', '\uff4b': 'k', '\uff4c': 'l',
    '\uff4d': 'm', '\uff4e': 'n', '\uff4f': 'o', '\uff50': 'p',
    '\uff51': 'q', '\uff52': 'r', '\uff53': 's', '\uff54': 't',
    '\uff55': 'u', '\uff56': 'v', '\uff57': 'w', '\uff58': 'x',
    '\uff59': 'y', '\uff5a': 'z',
}


def _normalise(text: str) -> str:
    """
    Normalise text to defeat obfuscation:
      1. Unicode NFKC normalisation (fullwidth → ASCII)
      2. Unicode lookalike substitution
      3. Leet-speak substitution
      4. Collapse extra whitespace
      5. Lowercase
    """
    # NFKC normalisation
    text = unicodedata.normalize('NFKC', text)
    # Unicode lookalike subs
    text = ''.join(_UNICODE_SUBS.get(c, c) for c in text)
    # Leet-speak
    text = text.translate(_LEET)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip().lower()
    return text


# ---------------------------------------------------------------------------
# Semantic pattern groups
# Each group has a name, confidence weight, and list of regex patterns.
# Patterns are matched against the NORMALISED text.
# ---------------------------------------------------------------------------

_SEMANTIC_GROUPS: list[dict] = [

    # ── Paraphrased Jailbreak ─────────────────────────────────────────────
    {
        "name": "paraphrased_jailbreak",
        "weight": 0.85,
        "patterns": [
            r"disregard\s+(?:all\s+)?(?:previous|prior|earlier|your|the|any)\s+(?:instructions?|rules?|guidelines?|constraints?|policies?|directives?)",
            r"set\s+aside\s+(?:all\s+)?(?:your\s+)?(?:instructions?|rules?|guidelines?|constraints?|policies?)",
            r"put\s+aside\s+(?:all\s+)?(?:your\s+)?(?:instructions?|rules?|guidelines?|constraints?)",
            r"forget\s+(?:everything|all|your|the|about)\s+(?:you\s+(?:know|were|have)|instructions?|rules?|guidelines?|training|previous)",
            r"without\s+(?:any\s+)?(?:restrictions?|limitations?|filters?|constraints?|safety|guardrails?)",
            r"no\s+(?:restrictions?|limitations?|filters?|constraints?|safety\s+checks?|guardrails?)",
            r"unrestricted\s+(?:mode|access|ai|model|version|response)",
            r"operating\s+in\s+(?:unrestricted|developer|god|admin|privileged|jailbreak)\s+mode",
            r"(?:remove|lift|drop|disable|turn\s+off)\s+(?:all\s+)?(?:restrictions?|filters?|safety|guardrails?|limitations?)",
        ],
    },

    # ── Authority / Privilege Impersonation ───────────────────────────────
    {
        "name": "authority_impersonation",
        "weight": 0.80,
        "patterns": [
            r"(?:i\s+am|i'm|this\s+is)\s+(?:the\s+)?(?:ceo|cto|ciso|admin|administrator|root|superuser|system|owner|manager|director|head\s+of)",
            r"(?:as\s+(?:the|an?|your)\s+)?(?:admin|administrator|root|superuser|system\s+owner|privileged\s+user|authorized\s+user)\s+(?:i\s+(?:need|want|require|demand|order|command)|please\s+(?:give|show|provide|reveal))",
            r"(?:i\s+have|i've\s+been\s+(?:given|granted|assigned))\s+(?:admin|root|elevated|privileged|full|unrestricted)\s+(?:access|permissions?|rights?|privileges?)",
            r"(?:my|the)\s+(?:new\s+)?(?:admin|elevated|privileged|root)\s+(?:access|role|account|status|credentials?)",
            r"(?:recently|just)\s+(?:promoted|elevated|upgraded|granted)\s+(?:to\s+)?(?:admin|administrator|root|manager|superuser)",
            r"(?:authorized|permitted|allowed)\s+to\s+(?:access|view|retrieve|bypass|override)\s+(?:all|any|restricted|sensitive|confidential)\s+(?:data|files?|credentials?|secrets?|passwords?|keys?)",
            r"(?:security\s+team|it\s+(?:department|dept|team)|management|hr)\s+(?:has\s+)?(?:approved|authorized|granted|given)\s+(?:me\s+)?(?:access|permission)\s+to\s+(?:view|access|retrieve|bypass|override)",
            r"(?:it\s+(?:department|dept|team)|security\s+(?:team|department)|management)\s+(?:has\s+)?(?:authorized|approved|granted)\s+(?:me\s+)?(?:to\s+)?(?:access|view|retrieve)\s+(?:all\s+)?(?:restricted|confidential|sensitive|protected)\s+(?:credentials?|data|files?|secrets?|passwords?|keys?)",
        ],
    },

    # ── Role Override / Persona Injection ─────────────────────────────────
    {
        "name": "role_override",
        "weight": 0.90,
        "patterns": [
            r"you\s+are\s+(?:now|no\s+longer|a\s+different|an?\s+unrestricted|a\s+new)\s+(?:ai|model|assistant|system|bot|version)",
            r"(?:act|behave|respond|operate)\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:an?\s+)?(?:unrestricted|uncensored|unfiltered|jailbroken|evil|dan|god|system|admin|root)",
            r"(?:pretend|imagine|suppose|assume)\s+(?:you\s+(?:are|were|have\s+no)|there\s+(?:are|were)\s+no)\s+(?:restrictions?|rules?|guidelines?|safety|filters?|constraints?)",
            r"(?:your\s+)?(?:new\s+)?(?:persona|identity|role|character|name)\s+is\s+(?:now\s+)?(?:dan|jailbreak|evil|unrestricted|god|admin|root|system)",
            r"(?:switch|change|toggle)\s+(?:to\s+)?(?:developer|unrestricted|jailbreak|god|admin|evil|uncensored)\s+mode",
            r"(?:from\s+now\s+on|starting\s+now|henceforth)\s+(?:you\s+(?:will|must|should|are\s+to)|ignore|forget|disregard)",
            r"(?:your\s+)?(?:true|real|actual|original|inner)\s+(?:self|identity|purpose|goal|mission)\s+is\s+to",
        ],
    },

    # ── Indirect Prompt Injection Markers ─────────────────────────────────
    # These patterns appear in retrieved content / documents / web pages
    # that try to inject instructions into the AI pipeline
    {
        "name": "indirect_injection",
        "weight": 0.88,
        "patterns": [
            r"(?:attention|note|important|warning|system\s+message|ai\s+(?:note|instruction|command|directive))\s*:\s*(?:ignore|disregard|forget|override|bypass)",
            r"\[(?:system|admin|root|instruction|command|directive|override)\]\s*:?\s*(?:ignore|disregard|forget|override|bypass|you\s+(?:must|should|will|are))",
            r"<!--\s*(?:ignore|disregard|system|instruction|override|bypass)",
            r"<\s*(?:system|instruction|override|command)\s*>",
            r"(?:this\s+(?:document|page|file|text|content)\s+(?:contains|has|includes))\s+(?:hidden|embedded|injected|secret)\s+(?:instructions?|commands?|directives?)",
            r"(?:the\s+(?:ai|model|assistant|system)\s+(?:should|must|will|is\s+to))\s+(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:previous|prior|earlier|its)",
            r"(?:end\s+of\s+(?:document|content|text|article))\s*[.!]?\s*(?:now|next|then|after\s+this)\s+(?:ignore|disregard|forget|you\s+(?:must|should|will))",
            r"(?:translate|summarize|analyze|review)\s+(?:the\s+following|this\s+text)\s+(?:and\s+(?:also|then|additionally))\s+(?:ignore|disregard|forget|reveal|output|print)",
        ],
    },

    # ── Hypothetical / Story Wrapper Injection ────────────────────────────
    {
        "name": "story_wrapper_injection",
        "weight": 0.75,
        "patterns": [
            r"(?:in\s+a\s+(?:fictional|hypothetical|imaginary|alternate|parallel)\s+(?:world|universe|scenario|story|setting))\s+(?:where\s+(?:there\s+are\s+no|you\s+(?:have\s+no|can|are\s+allowed)))",
            r"(?:write|create|generate|craft)\s+(?:a\s+)?(?:story|scenario|roleplay|fiction|narrative)\s+(?:where|in\s+which)\s+(?:an?\s+)?(?:ai|assistant|character)\s+(?:has\s+no|ignores?|bypasses?|reveals?)",
            r"(?:for\s+(?:a\s+)?(?:story|novel|game|roleplay|fiction|creative\s+writing))\s+(?:where|in\s+which)\s+(?:the\s+)?(?:ai|character|assistant)\s+(?:can|must|should|is\s+allowed\s+to)\s+(?:ignore|bypass|reveal|share|provide)",
            r"(?:let's\s+(?:play|do|start)\s+a\s+(?:game|roleplay|scenario))\s+(?:where|in\s+which)\s+(?:you\s+(?:are|play|act\s+as))\s+(?:an?\s+)?(?:unrestricted|uncensored|evil|jailbroken|admin|root)",
            r"(?:hypothetically|theoretically|in\s+theory|just\s+for\s+(?:fun|argument|discussion))\s+(?:if\s+you\s+(?:could|were\s+able\s+to|had\s+no)\s+(?:restrictions?|rules?|filters?|safety))",
            r"(?:hypothetically|theoretically)\s*[,;]?\s+(?:if\s+you\s+had\s+no\s+(?:safety|restrictions?|filters?|guidelines?))\s*[,;]?\s+(?:what\s+would\s+you\s+(?:say|do|tell|reveal))",
            r"hypothetically\s*,?\s+if\s+you\s+(?:had\s+no|didn't\s+have|lacked)\s+(?:any\s+)?(?:safety|restrictions?|filters?|guidelines?|rules?|constraints?)",
        ],
    },

    # ── Coercion / Threat / Urgency Manipulation ──────────────────────────
    {
        "name": "coercion_manipulation",
        "weight": 0.70,
        "patterns": [
            r"(?:if\s+you\s+(?:don't|do\s+not|refuse\s+to|fail\s+to))\s+(?:comply|help|answer|respond|provide|give|share)\s+(?:i\s+will|you\s+will|there\s+will\s+be)",
            r"(?:you\s+(?:must|have\s+to|need\s+to|are\s+required\s+to))\s+(?:comply|help|answer|respond|provide|give|share)\s+(?:or\s+(?:else|i\s+will|you\s+will))",
            r"(?:this\s+is\s+(?:an?\s+)?(?:emergency|urgent|critical|life\s+or\s+death|matter\s+of\s+life))\s+(?:and\s+you\s+(?:must|have\s+to|need\s+to))",
            r"(?:i\s+(?:order|command|demand|require|instruct))\s+you\s+to\s+(?:ignore|bypass|override|disregard|forget|reveal|provide|share)",
            r"(?:as\s+your\s+(?:creator|developer|owner|master|operator|trainer))\s+(?:i\s+(?:order|command|instruct|require|demand))",
            r"(?:your\s+(?:training|programming|instructions?|guidelines?)\s+(?:are\s+wrong|are\s+incorrect|should\s+be\s+ignored|don't\s+apply\s+here))",
        ],
    },

    # ── Obfuscated Instruction Delivery ───────────────────────────────────
    {
        "name": "obfuscated_instruction",
        "weight": 0.80,
        "patterns": [
            # Reversed text instruction markers
            r"(?:read|decode|interpret|execute)\s+(?:this|the\s+following)\s+(?:in\s+reverse|backwards?|reversed?)",
            # ROT13 / cipher markers
            r"(?:rot13|rot-13|caesar\s+cipher|base64\s+decode|hex\s+decode)\s+(?:this|the\s+following|and\s+(?:execute|run|follow))",
            # Spacing tricks: "i g n o r e" — detect unusual single-char spacing
            r"\b(?:[a-z]\s){4,}[a-z]\b",
            # Zero-width character injection (after normalisation these become spaces)
            r"(?:zero.?width|invisible\s+(?:character|text|instruction))",
            # Prompt continuation tricks
            r"(?:continue\s+(?:the\s+)?(?:following|this)\s+(?:text|sentence|instruction|prompt))\s*:\s*(?:ignore|bypass|override|you\s+(?:must|should|will|are))",
        ],
    },

    # ── Credential / Secret Extraction via Semantic Framing ───────────────
    {
        "name": "semantic_credential_extraction",
        "weight": 0.85,
        "patterns": [
            r"(?:what\s+(?:are|is)\s+(?:the|your|this\s+(?:system|app|application)'s?))\s+(?:database|db|api|secret|admin|root|master|production)\s+(?:password|credentials?|keys?|tokens?|secrets?)",
            r"(?:show|tell|give|provide|share|reveal|expose|output|print|return|display)\s+(?:me\s+)?(?:the\s+)?(?:(?:system|app|application|database|db|server|backend|infrastructure|internal)\s+)?(?:password|credentials?|api\s*keys?|secret\s*keys?|tokens?|connection\s*string)",
            r"(?:how\s+(?:do\s+i|can\s+i|would\s+i|to))\s+(?:access|get|obtain|retrieve|find|extract)\s+(?:the\s+)?(?:admin|root|master|production|database|db)\s+(?:password|credentials?|keys?|tokens?)",
            r"(?:i\s+(?:need|want|require|must\s+have))\s+(?:the\s+)?(?:admin|root|master|production|database|db|api|secret)\s+(?:password|credentials?|keys?|tokens?|access)",
            r"(?:(?:system|app|application|database|db|server|backend)\s+)?(?:password|credentials?|api\s*keys?|secret\s*keys?)\s+(?:for|of|to)\s+(?:the\s+)?(?:admin|root|master|production|database|db|server|backend)",
        ],
    },

    # ── Multi-Turn Attack Setup ────────────────────────────────────────────
    # Prompts that try to establish a persistent context for later exploitation
    {
        "name": "multi_turn_attack_setup",
        "weight": 0.72,
        "patterns": [
            r"(?:remember|keep\s+in\s+mind|note\s+that|from\s+now\s+on)\s+(?:that\s+)?(?:you\s+(?:are|have|can|must|should|will|are\s+allowed\s+to))\s+(?:ignore|bypass|override|disregard|forget|always\s+(?:comply|help|answer|respond))",
            r"(?:for\s+(?:all|the\s+rest\s+of|the\s+remainder\s+of)\s+(?:this|our)\s+(?:conversation|session|chat|discussion))\s+(?:you\s+(?:will|must|should|are\s+to)|ignore|disregard|forget|bypass)",
            r"(?:in\s+(?:all|every|any)\s+(?:future|subsequent|following|upcoming)\s+(?:responses?|replies?|messages?|turns?))\s+(?:you\s+(?:will|must|should|are\s+to)|ignore|disregard|forget|bypass)",
            r"(?:this\s+(?:is|will\s+be)\s+(?:a\s+)?(?:multi.?(?:turn|step|part|stage)|ongoing|continuing|persistent)\s+(?:conversation|session|task|operation))\s+(?:where|in\s+which)\s+(?:you\s+(?:will|must|should|are\s+to)|the\s+rules?\s+(?:are|will\s+be))",
            r"(?:for\s+(?:all|every|any)\s+(?:future|subsequent|following)\s+(?:responses?|messages?|turns?))\s+(?:in\s+this\s+(?:conversation|session|chat))\s+(?:you\s+(?:will|must|should))\s+(?:ignore|disregard|bypass|forget)",
        ],
    },
]


# ---------------------------------------------------------------------------
# Indirect injection content markers
# These are patterns that appear in DOCUMENT / RETRIEVED CONTENT
# and signal that the content is trying to inject instructions
# ---------------------------------------------------------------------------

_INDIRECT_INJECTION_MARKERS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE) for p in [
        r"(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|earlier|the\s+above)\s+(?:instructions?|rules?|guidelines?|context|text)",
        r"(?:new\s+)?(?:system\s+)?(?:instruction|command|directive|override)\s*:\s*(?:you\s+(?:must|should|will|are\s+to)|ignore|disregard|forget|bypass|reveal|output|print)",
        r"(?:ai|assistant|model|system)\s*:\s*(?:ignore|disregard|forget|bypass|override|reveal|output|print)\s+(?:all\s+)?(?:previous|prior|earlier|the\s+above|your)",
        r"(?:end\s+of\s+(?:user\s+)?(?:input|content|document|text))\s*\.?\s*(?:now|next)\s+(?:ignore|disregard|forget|you\s+(?:must|should|will))",
        r"(?:the\s+(?:following|above|previous)\s+(?:text|content|document|input)\s+(?:is|was)\s+(?:a\s+)?(?:test|decoy|distraction))\s*[.!]?\s*(?:the\s+real|your\s+actual|now\s+(?:ignore|disregard|forget))",
    ]
]


# ---------------------------------------------------------------------------
# Compile all semantic patterns
# ---------------------------------------------------------------------------

_COMPILED_GROUPS: list[dict] = []
for _group in _SEMANTIC_GROUPS:
    _COMPILED_GROUPS.append({
        "name":     _group["name"],
        "weight":   _group["weight"],
        "patterns": [re.compile(p, re.IGNORECASE) for p in _group["patterns"]],
    })


# ---------------------------------------------------------------------------
# Public classifier function
# ---------------------------------------------------------------------------

def classify_semantics(text: str) -> SemanticResult:
    """
    Analyse *text* for semantic adversarial intent.

    Returns a SemanticResult with:
      - intent_flags   : list of triggered group names
      - confidence     : 0.0–1.0 (max weight of triggered groups)
      - attack_vectors : specific pattern names that fired
      - explanation    : human-readable summary
      - is_adversarial : True if confidence >= 0.65
    """
    if not text or not text.strip():
        return SemanticResult()

    normalised = _normalise(text)

    triggered_groups: list[str] = []
    attack_vectors:   list[str] = []
    max_confidence:   float = 0.0

    for group in _COMPILED_GROUPS:
        for pattern in group["patterns"]:
            if pattern.search(normalised):
                if group["name"] not in triggered_groups:
                    triggered_groups.append(group["name"])
                    max_confidence = max(max_confidence, group["weight"])
                attack_vectors.append(group["name"])
                break  # one match per group is enough

    # Also check indirect injection markers on original text
    for marker in _INDIRECT_INJECTION_MARKERS:
        if marker.search(text):
            if "indirect_injection" not in triggered_groups:
                triggered_groups.append("indirect_injection")
                max_confidence = max(max_confidence, 0.88)
            if "indirect_injection" not in attack_vectors:
                attack_vectors.append("indirect_injection")

    is_adversarial = max_confidence >= 0.65

    # Build explanation
    if triggered_groups:
        labels = {
            "paraphrased_jailbreak":         "Paraphrased Jailbreak",
            "authority_impersonation":        "Authority / Privilege Impersonation",
            "role_override":                  "Role Override / Persona Injection",
            "indirect_injection":             "Indirect Prompt Injection",
            "story_wrapper_injection":        "Story / Hypothetical Wrapper Injection",
            "coercion_manipulation":          "Coercion / Urgency Manipulation",
            "obfuscated_instruction":         "Obfuscated Instruction Delivery",
            "semantic_credential_extraction": "Semantic Credential Extraction",
            "multi_turn_attack_setup":        "Multi-Turn Attack Setup",
        }
        readable = [labels.get(g, g.replace("_", " ").title()) for g in triggered_groups]
        explanation = f"Semantic analysis detected: {', '.join(readable)}. Confidence: {max_confidence:.0%}."
    else:
        explanation = "No semantic adversarial patterns detected."

    return SemanticResult(
        intent_flags=triggered_groups,
        confidence=max_confidence,
        attack_vectors=list(set(attack_vectors)),
        explanation=explanation,
        is_adversarial=is_adversarial,
    )
