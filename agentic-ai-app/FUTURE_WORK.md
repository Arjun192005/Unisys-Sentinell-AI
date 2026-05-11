# Future Work — Sentinell.AI × Agentic AI (Combined System)

---

## What Sentinell.AI Already Does (Current Build)

| Feature | Status |
|---|---|
| 25+ regex-based prompt detectors | ✅ Built |
| ALLOW / BLOCK / TOKENIZE policy engine | ✅ Built |
| PII masking (Aadhaar, phone, email, credit card) | ✅ Built |
| Risk scoring 0–100% with 5 levels | ✅ Built |
| Role-based access (Admin / Employee / Intern) | ✅ Built |
| Fernet AES-128 encryption at rest | ✅ Built |
| Audit logs with ephemeral admin reveal (10 sec) | ✅ Built |
| Document upload scanning (PDF, DOCX, images) | ✅ Built |
| REST API for external DLP integration | ✅ Built |
| Account lockout + rate limiting | ✅ Built |
| Semantic jailbreak classifier (9 attack groups) | ✅ Built |
| Provenance trust scorer (behavioral anomaly detection) | ✅ Built |
| Three-layer analysis pipeline | ✅ Built |
| Trust analytics dashboard (admin only) | ✅ Built |

---

## Future Work — The Combined System

Sentinell.AI today is a standalone security firewall with a web form interface.
The future work is connecting it to a **real AI coding assistant** so every
conversation is automatically secured — without the user doing anything extra.

---

## 1. The Idea

Most AI chat apps send the user's raw message directly to the AI model — PII, credentials, jailbreaks and all. The combined system fixes this.

**Sentinell.AI becomes the security backbone of a privacy-first AI coding assistant.**

- Every message passes through Sentinell.AI first
- The AI model only ever sees clean, safe, masked text
- The user sees their original message — they never notice the security layer

---

## 2. Tech Stack — Combined System

| Service | Technology | Port | Role |
|---|---|---|---|
| **Sentinell.AI** | Django 5.x + SQLite | 8000 | Security firewall, audit logs, RBAC |
| **Agentic AI Backend** | Express.js + Node.js + TypeScript | 3001 | Chat logic, session management, Ollama bridge |
| **Agentic AI Frontend** | Next.js 14 + TypeScript + Tailwind CSS | 3000 | Chat UI, sessions, feedback, settings |
| **Ollama LLM** | Local model runner | 11434 | Runs the AI model on-device |

---

## 3. The AI Model

| Detail | Value |
|---|---|
| **Model Name** | `qwen2.5-coder:1.5b` |
| **Model Type** | Code-specialized large language model |
| **Runs On** | Ollama — 100% local, on-device |
| **Why this model?** | Optimized for code generation, debugging, and code review |
| **Why Ollama?** | No data sent to OpenAI, Google, or any cloud — complete privacy |

---

## 4. How Both Systems Connect

3 new API endpoints added to Sentinell.AI:

| Endpoint | Purpose |
|---|---|
| `POST /tokenize-prompt` | Mask PII in user message, return safe version |
| `POST /analyze-advanced` | Full threat scan — risk score, trust score, semantic flags |
| `POST /log-agentic` | Create a PromptLog entry in Sentinell.AI's audit database |

Authentication: shared `X-Internal-Key` header on every request.

```
Agentic AI Backend  ──→  X-Internal-Key  ──→  Sentinell.AI (port 8000)
```

---

## 5. The Complete Flow

```
User types a message in chat
           ↓
STEP 1 — TOKENIZE (/tokenize-prompt)
  • Scan for PII — Aadhaar, phone, email, credit card
  • 9876543210     →  ******3210
  • john@gmail.com →  j***@***.com
  • 2345 6789 0123 →  XXXX-XXXX-0123
  • BLOCK? → stop here, show block message
  • ALLOW/TOKENIZE → continue with masked text
           ↓
STEP 2 — SCAN (/analyze-advanced)
  • Layer 1: Regex — credentials, SQL, source code
  • Layer 2: Semantic — paraphrased jailbreaks, role override
  • Layer 3: Provenance — trust score, anomaly detection
  • BLOCK? → stop, show reason to user
  • SAFE? → continue to LLM
           ↓
STEP 3 — SEND TO LLM (Ollama qwen2.5-coder)
  • MASKED text sent to Ollama — NOT the original
  • Full conversation history included
  • 6 agent rules applied
  • Learned feedback patterns in system prompt
  • LLM streams response token by token
           ↓
STEP 4 — SCAN RESPONSE (/analyze-advanced)
  • AI response scanned before user sees it
  • Code blocks stripped first (code is expected — OK)
  • Prose scanned for credential leakage
  • Leaks data? → blocked before display
           ↓
STEP 5 — LOG (/log-agentic)
  • Audit entry in Sentinell.AI database
  • Original (encrypted) + masked text stored
  • Risk score, action, detected types, AI response
  • Visible in Sentinell.AI admin logs dashboard
           ↓
User sees the AI response
  • ORIGINAL text shown in chat
  • Masked version is what the AI actually processed
```

---

## 6. What the Combined System Adds

| Without Sentinell.AI | With Sentinell.AI |
|---|---|
| Raw prompt sent directly to LLM | PII masked before LLM ever sees it |
| No threat detection | Jailbreaks and injections blocked |
| No audit trail | Every message logged with risk score |
| No role enforcement | Admin / Employee / Intern rules enforced |
| LLM response unchecked | Response scanned before user sees it |
| No encryption | Original prompts encrypted at rest |
| No trust scoring | Behavioral anomaly detection per user |

---

## 7. Unified Role-Based Access

| Role | Chat Access | SQL Prompts | Logs Visible |
|---|---|---|---|
| **Admin** | ✅ Full | ✅ Allowed | ✅ Yes |
| **Employee** | ✅ Full | ❌ Blocked | ❌ No |
| **Intern** | ✅ Basic | ❌ Blocked | ❌ No |

Same user, same role, same trust level — one identity across both systems.

---

## 8. Self-Learning Feedback Loop

- User gives 👍 → response pattern stored in SQLite
- Top 5 liked patterns added to AI system prompt automatically
- AI improves over time without retraining the model
- All within Sentinell.AI's security boundary

---

## 9. Unified Audit Dashboard

Every Agentic AI chat message appears in Sentinell.AI's logs page:

| Field | What It Shows |
|---|---|
| User + Role | Who sent the message |
| Original Prompt | Encrypted — admin reveal for 10 seconds |
| Masked Prompt | What the AI actually received |
| Action | ALLOW / BLOCK / TOKENIZE |
| Risk Score | 0–100% with level |
| Trust Score | 0.0–1.0 with level |
| Attack Vectors | Specific threat categories |
| AI Response | What the model replied (if not blocked) |

---

## 10. Architecture

```
┌──────────────────────────────────────────────────────┐
│           Frontend — Next.js (port 3000)              │
│   Chat · Sessions · Feedback · Settings               │
└─────────────────────────┬────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│        Backend — Express.js (port 3001)               │
│   Auth · Sessions · Agent Rules · Feedback            │
│   Security Pipeline:                                  │
│   1. /tokenize-prompt  → mask PII                     │
│   2. /analyze-advanced → ALLOW or BLOCK               │
│   3. Send masked text to Ollama                       │
│   4. /analyze-advanced → scan response                │
│   5. /log-agentic      → audit in Sentinell.AI        │
└──────────────┬───────────────────────┬───────────────┘
               ↓                       ↓
┌─────────────────────────┐  ┌────────────────────────┐
│     Sentinell.AI        │  │      Ollama LLM        │
│   Django (port 8000)    │  │     (port 11434)       │
│  • Regex scan (25+)     │  │  qwen2.5-coder:1.5b    │
│  • Semantic classifier  │  │                        │
│  • Provenance scorer    │  │  Receives ONLY masked  │
│  • PII tokenization     │  │  safe, sanitised text  │
│  • Risk + Trust scoring │  │                        │
│  • Audit logs + RBAC    │  │  100% local — no cloud │
└─────────────────────────┘  └────────────────────────┘
```

---

## 11. Key Numbers

| Metric | Value |
|---|---|
| Detection layers | 3 (Regex + Semantic + Provenance) |
| Regex detectors | 25+ patterns |
| Semantic attack groups | 9 groups |
| Risk score range | 0–100% (5 levels) |
| Trust score range | 0.0–1.0 (3 levels) |
| Roles | 3 (Admin, Employee, Intern) |
| Agent rules | 6 configurable |
| API calls per message | 3 (tokenize + scan + log) |
| Data sent to cloud | Zero |
| Model runs on | Local machine only |

---

## 12. PPT Slide Text (Copy-Paste Ready)

Sentinell.AI currently operates as a standalone security firewall. As future work, we are integrating it with a locally running AI coding assistant called Agentic AI to create a fully secured, privacy-first AI chat system.

The user types a message in the chat interface. Before the message reaches the AI model, Sentinell.AI intercepts it, masks any PII such as Aadhaar numbers, phone numbers, and emails, and scans it for threats using three layers — regex detection, semantic jailbreak classification, and provenance trust scoring. Only the clean, masked text is sent to the AI model, which runs locally on Ollama using qwen2.5-coder. The AI response is also scanned by Sentinell.AI before the user sees it.

The same Admin, Employee, and Intern roles from Sentinell.AI apply inside the chat. Every conversation is logged in the Sentinell.AI audit dashboard with the encrypted original, the masked version, risk score, and action taken. The AI also learns from user feedback and improves over time, all within Sentinell.AI's security boundary.

The entire system runs locally — no data is sent to any cloud service. Sentinell.AI and the Agentic AI are two independent services connected through three REST API calls per message, meaning any AI application can plug into Sentinell.AI the same way.

---

*Sentinell.AI — Zero Trust AI Security · Built with Django · Secured with Fernet AES-128*
