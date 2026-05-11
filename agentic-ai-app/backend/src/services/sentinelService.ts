/**
 * SentinelAI Gateway Service
 * ──────────────────────────
 * Two responsibilities:
 *   1. Scan text via /analyze-advanced  → get SAFE/BLOCK decision
 *   2. Log the result via /log-agentic  → creates PromptLog in SentinelAI DB
 *      so every Agentic AI prompt appears in the SentinelAI dashboard
 *      with the correct user, role, risk score, and action.
 */

const SENTINEL_BASE_URL = process.env.SENTINEL_BASE_URL || 'http://localhost:8000';
const SENTINEL_ANALYZE_PATH = process.env.SENTINEL_ANALYZE_PATH || '/analyze-advanced';
const SENTINEL_KEY = process.env.SENTINEL_INTERNAL_KEY || '';

export interface SentinelResult {
  allowed: boolean;
  status: 'SAFE' | 'BLOCK';
  maskedText: string;        // text to send to Ollama (PII replaced with masks)
  wasTokenized: boolean;     // true if PII was masked
  riskScore: number;
  riskLevel: string;
  trustScore: number;
  trustLevel: string;
  semanticConfidence: number;
  semanticFlags: string[];
  attackVectors: string[];
  anomalyFlags: string[];
  detectedTypes: string[];
  explanation: string;
}

/**
 * Strip fenced code blocks from LLM responses before scanning.
 * A coding assistant is expected to return code — we only scan
 * the surrounding prose for credential leakage or adversarial content.
 */
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '[CODE_BLOCK_REMOVED]');
}

/**
 * Derive action string from scan result for PromptLog.
 */
function deriveAction(result: SentinelResult): 'ALLOW' | 'BLOCK' | 'TOKENIZE' {
  if (!result.allowed) return 'BLOCK';
  // If PII was detected but not blocked, it was tokenized
  const piiTypes = new Set(['email', 'phone', 'phone_words', 'aadhaar', 'mac_address', 'ip_address', 'passport']);
  const hasPii = result.detectedTypes.some((t) => piiTypes.has(t));
  return hasPii ? 'TOKENIZE' : 'ALLOW';
}

/**
 * Derive risk level from risk score.
 */
function deriveRiskLevel(score: number): string {
  if (score <= 20) return 'LOW';
  if (score <= 40) return 'MODERATE';
  if (score <= 60) return 'HIGH';
  if (score <= 80) return 'SEVERE';
  return 'CRITICAL';
}

/**
 * Tokenize a prompt through SentinelAI.
 * Returns the masked text (PII replaced) to send to Ollama.
 * If BLOCK, returns null. If no PII, returns original text unchanged.
 */
export async function tokenizePrompt(
  text: string,
  userId: number
): Promise<{ masked: string | null; wasTokenized: boolean; action: string; detectedTypes: string[] }> {
  try {
    const res = await fetch(`${SENTINEL_BASE_URL}/tokenize-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': SENTINEL_KEY,
      },
      body: JSON.stringify({ text, user_id: userId }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.warn(`[Sentinel] tokenize-prompt HTTP ${res.status} — using original text`);
      return { masked: text, wasTokenized: false, action: 'ALLOW', detectedTypes: [] };
    }

    const data = await res.json() as {
      masked: string | null;
      was_tokenized: boolean;
      action: string;
      detected_types: string[];
    };

    console.log(
      `[Sentinel] TOKENIZE → action=${data.action} was_tokenized=${data.was_tokenized} detected=${(data.detected_types ?? []).join(',')}`
    );

    return {
      masked: data.masked,
      wasTokenized: data.was_tokenized ?? false,
      action: data.action ?? 'ALLOW',
      detectedTypes: data.detected_types ?? [],
    };
  } catch (err) {
    console.warn('[Sentinel] tokenize-prompt failed — using original text:', String(err));
    return { masked: text, wasTokenized: false, action: 'ALLOW', detectedTypes: [] };
  }
}

/**
 * Scan text through SentinelAI and log the result to SentinelAI's PromptLog.
 *
 * @param text     - The text to scan
 * @param userId   - Demo user ID (1=admin, 2=employee, 3=intern)
 * @param role     - User role string
 * @param source   - 'prompt' | 'response'
 */
export async function scanWithSentinel(
  text: string,
  userId: number,
  role: string,
  source: 'prompt' | 'response' = 'prompt'
): Promise<SentinelResult> {
  if (!SENTINEL_BASE_URL) {
    console.warn('[Sentinel] SENTINEL_BASE_URL not set — skipping scan');
    return buildAllowResult('SentinelAI not configured — scan skipped');
  }

  // For LLM responses: strip code blocks before scanning
  const textToScan = source === 'response' ? stripCodeBlocks(text) : text;
  const strippedOnly = textToScan.replace(/\[CODE_BLOCK_REMOVED\]/g, '').trim();
  if (source === 'response' && !strippedOnly) {
    return buildAllowResult('Response contains only code blocks — safe');
  }

  let result: SentinelResult;

  try {
    const res = await fetch(`${SENTINEL_BASE_URL}${SENTINEL_ANALYZE_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': SENTINEL_KEY,
        'X-Source': source,
        'X-Role': role,
      },
      body: JSON.stringify({ text: textToScan, user_id: userId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[Sentinel] HTTP ${res.status} from /analyze-advanced — failing open`);
      result = buildAllowResult(`SentinelAI returned HTTP ${res.status}`);
    } else {
      const data = await res.json() as {
        status: 'SAFE' | 'BLOCK';
        risk_score: number;
        risk_level: string;
        detected_types: string[];
        trust_score: number;
        trust_level: string;
        semantic_confidence: number;
        semantic_flags: string[];
        attack_vectors: string[];
        anomaly_flags: string[];
        explanation: string;
      };

      const riskScore = data.risk_score ?? 0;
      result = {
        allowed: data.status === 'SAFE',
        status: data.status,
        maskedText: '',       // scan doesn't return masked text — use tokenizePrompt for that
        wasTokenized: false,
        riskScore,
        riskLevel: data.risk_level ?? deriveRiskLevel(riskScore),
        trustScore: data.trust_score ?? 1.0,
        trustLevel: data.trust_level ?? 'TRUSTED',
        semanticConfidence: data.semantic_confidence ?? 0,
        semanticFlags: data.semantic_flags ?? [],
        attackVectors: data.attack_vectors ?? [],
        anomalyFlags: data.anomaly_flags ?? [],
        detectedTypes: data.detected_types ?? [],
        explanation: data.explanation ?? '',
      };

      console.log(
        `[Sentinel] ${source.toUpperCase()} scan → ${data.status} | risk=${riskScore} | trust=${result.trustScore.toFixed(2)} | role=${role}`
      );
    }
  } catch (err) {
    console.error('[Sentinel] Connection failed:', String(err));
    result = buildAllowResult(`SentinelAI unreachable: ${String(err)}`);
  }

  // ── Log to SentinelAI's PromptLog (fire-and-forget) ──────────────────────────
  // Only log response scans — prompt scans are logged via logSentinelWithMask
  // from the chat route (which has the masked text). Skip response scan logging
  // here to avoid duplicate/confusing entries in the audit log.
  // Response scan results are visible in the backend console logs.

  return result;
}

/**
 * Exported helper: log a prompt scan result with the masked text.
 * Called from the chat route after tokenization so SentinelAI shows
 * the correct processed_prompt (masked) vs original_prompt (encrypted).
 */
export async function logSentinelWithMask(
  originalText: string,
  maskedText: string,
  userId: number,
  role: string,
  scanResult: SentinelResult
): Promise<void> {
  logToSentinel(originalText, userId, role, 'prompt', scanResult, maskedText).catch((err) => {
    console.warn('[Sentinel] logSentinelWithMask failed:', String(err));
  });
}

/**
 * Fire-and-forget: create a PromptLog entry in SentinelAI's database.
 * Passes both original text (encrypted) and masked text (processed_prompt)
 * so the SentinelAI log shows the correct before/after masking.
 */
async function logToSentinel(
  originalText: string,
  userId: number,
  role: string,
  source: 'prompt' | 'response',
  result: SentinelResult,
  maskedText?: string   // the tokenized version — shown as processed_prompt in SentinelAI
): Promise<void> {
  const action = deriveAction(result);

  await fetch(`${SENTINEL_BASE_URL}/log-agentic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': SENTINEL_KEY,
    },
    body: JSON.stringify({
      user_id:             userId,
      role,
      source,
      original_text:       originalText,
      masked_text:         maskedText ?? null,   // NEW: passed to api_log.py
      status:              result.status,
      action,
      risk_score:          result.riskScore,
      risk_level:          result.riskLevel,
      trust_score:         result.trustScore,
      trust_level:         result.trustLevel,
      semantic_confidence: result.semanticConfidence,
      semantic_flags:      result.semanticFlags,
      attack_vectors:      result.attackVectors,
      anomaly_flags:       result.anomalyFlags,
      detected_types:      result.detectedTypes,
      explanation:         result.explanation,
    }),
    signal: AbortSignal.timeout(5_000),
  });
}

function buildAllowResult(explanation: string): SentinelResult {
  return {
    allowed: true,
    status: 'SAFE',
    maskedText: '',       // caller should use original text
    wasTokenized: false,
    riskScore: 0,
    riskLevel: 'LOW',
    trustScore: 1.0,
    trustLevel: 'TRUSTED',
    semanticConfidence: 0,
    semanticFlags: [],
    attackVectors: [],
    anomalyFlags: [],
    detectedTypes: [],
    explanation,
  };
}
