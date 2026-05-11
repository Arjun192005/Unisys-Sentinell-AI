# Sentinell.AI — Secure AI Prompt Firewall

> **Zero Trust middleware that sits between your team and generative AI models.**  
> Every prompt is scanned, risk-scored, and sanitised before it ever reaches an AI endpoint.

---

## ⚡ Quick Setup — Read This First

> This project runs as **two systems together**: Sentinell.AI (Django) + Agentic AI (Next.js + Express + Ollama).
> Start Sentinell.AI **before** the Agentic AI backend — the chat app calls Sentinell.AI on every message.

### Prerequisites

| Tool | Version | Download |
|---|---|---|
| Python | 3.11+ | https://www.python.org/downloads/ |
| Node.js | 18+ | https://nodejs.org/en/download |
| Ollama | Latest | https://ollama.com/download |

### Step 1 — Install & Start Ollama

```bash
# After installing Ollama, pull the required model (one-time, ~1 GB)
ollama pull qwen2.5-coder:1.5b

# Verify it is running
# Open browser: http://localhost:11434  →  should show "Ollama is running"
```

### Step 2 — Start Sentinell.AI (Terminal 1)

```bash
cd "UniSys Project"

# First time only
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py create_demo_users

# Every time
python manage.py runserver
```

Open **http://localhost:8000** — login with `admin@sentinell.ai` / `Admin123!`

### Step 3 — Start Agentic AI Backend (Terminal 2)

> ⚠️ Sentinell.AI (Step 2) must be running before this step.

```bash
cd agentic-ai-app/backend
npm install        # first time only
npm run dev
```

Verify: open **http://localhost:3001/health** — should show `"status": "ok"`

### Step 4 — Start Agentic AI Frontend (Terminal 3)

```bash
cd agentic-ai-app/frontend
npm install        # first time only
npm run dev
```

Open **http://localhost:3000** — login with `admin@agenticai.demo` / `AgentAdmin@2026`

---

### Login Credentials

**Sentinell.AI** (`http://localhost:8000`)

| Role | Email | Password |
|---|---|---|
| Admin | admin@sentinell.ai | Admin123! |
| Employee | employee@sentinell.ai | Emp123!! |
| Intern | intern@sentinell.ai | Int123!! |

**Agentic AI Chat** (`http://localhost:3000`)

| Role | Email | Password |
|---|---|---|
| Admin | admin@agenticai.demo | AgentAdmin@2026 |
| Employee | employee@agenticai.demo | AgentEmp@2026 |
| Intern | intern@agenticai.demo | AgentIntern@2026 |

---

### Port Reference

| Service | Port | URL |
|---|---|---|
| Sentinell.AI (Django) | 8000 | http://localhost:8000 |
| Agentic AI Backend | 3001 | http://localhost:3001 |
| Agentic AI Frontend | 3000 | http://localhost:3000 |
| Ollama LLM | 11434 | http://localhost:11434 |

> 📄 For the full detailed setup guide including troubleshooting, see **SETUP_MANUAL.txt** in the project root.

---

## ⚠️ Note on Environment Files

The `.env` files in this repository are **intentionally committed**. They contain only local demo credentials and configuration values — no real secrets, no production keys, no sensitive data.

They are included so that anyone cloning this repo can run the project immediately without any manual configuration. This is a demonstration and academic project — the values are safe to share publicly.

| File | Contains |
|---|---|
| `UniSys Project/.env` | Django secret key (insecure default), SQLite config, internal shared key |
| `agentic-ai-app/backend/.env` | Ollama URL, demo user credentials, internal shared key |
| `agentic-ai-app/frontend/.env.local` | Local API URL for Next.js |

---

## Table of Contents

1. [What Is This?](#1-what-is-this)
2. [Architecture Overview](#2-architecture-overview)
3. [Core Pipeline — How a Prompt Is Processed](#3-core-pipeline--how-a-prompt-is-processed)
4. [Detection Engine (Scanner)](#4-detection-engine-scanner)
5. [Zero Trust Policy Engine](#5-zero-trust-policy-engine)
6. [Risk Scoring Engine](#6-risk-scoring-engine)
7. [Tokenization (PII Masking)](#7-tokenization-pii-masking)
8. [Encryption (Data at Rest)](#8-encryption-data-at-rest)
9. [Role-Based Access Control (RBAC)](#9-role-based-access-control-rbac)
10. [Document Extraction](#10-document-extraction)
11. [REST API (DLP Endpoints)](#11-rest-api-dlp-endpoints)
12. [Security Middleware](#12-security-middleware)
13. [Database Models](#13-database-models)
14. [Frontend & Templates](#14-frontend--templates)
15. [Test Dataset & Validation](#15-test-dataset--validation)
16. [Project Structure](#16-project-structure)
17. [Setup & Running Locally](#17-setup--running-locally)
18. [Demo Accounts](#18-demo-accounts)
19. [Environment Variables](#19-environment-variables)
20. [Security Design Decisions](#20-security-design-decisions)

---

## 1. What Is This?

**Sentinell.AI** is a Django-based enterprise security firewall for AI prompt pipelines. It acts as a middleware layer that:

- **Scans** every prompt using 25+ regex-based detectors covering PII, credentials, adversarial attacks, and more.
- **Scores** the risk of each prompt on a 0–100% scale using a context-aware, multi-case scoring model.
- **Enforces** a Zero Trust policy — blocking dangerous content, masking personal data, and allowing safe prompts through.
- **Logs** every decision with full audit trails, encrypted sensitive data, and ephemeral admin reveal.
- **Exposes** a REST API for external DLP (Data Loss Prevention) integration.

It is designed for enterprise teams that use AI tools (ChatGPT, Gemini, Claude, etc.) and need to ensure employees cannot accidentally or intentionally leak credentials, PII, source code, or other sensitive data through AI chat interfaces.

---

## 2. Architecture Overview

```
User (Browser)
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│                    Django Application                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │  users app   │    │        firewall app           │   │
│  │              │    │                               │   │
│  │  - Login     │    │  ┌──────────┐  ┌──────────┐  │   │
│  │  - Signup    │    │  │ Scanner  │→ │  Policy  │  │   │
│  │  - RBAC      │    │  │ (regex)  │  │  Engine  │  │   │
│  │  - Lockout   │    │  └──────────┘  └──────────┘  │   │
│  │  - Rate Limit│    │       │              │        │   │
│  └──────────────┘    │       ▼              ▼        │   │
│                      │  ┌──────────┐  ┌──────────┐  │   │
│                      │  │  Risk    │  │Tokenizer │  │   │
│                      │  │  Scorer  │  │(PII Mask)│  │   │
│                      │  └──────────┘  └──────────┘  │   │
│                      │       │              │        │   │
│                      │       ▼              ▼        │   │
│                      │  ┌──────────────────────────┐ │   │
│                      │  │   Mock AI / Real LLM     │ │   │
│                      │  └──────────────────────────┘ │   │
│                      │              │                 │   │
│                      │              ▼                 │   │
│                      │  ┌──────────────────────────┐ │   │
│                      │  │  PromptLog (Encrypted DB) │ │   │
│                      │  └──────────────────────────┘ │   │
│                      └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
     │
     ▼
  SQLite / PostgreSQL
```

**Tech Stack:**
| Layer | Technology |
|---|---|
| Web Framework | Django 5.x |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Encryption | Fernet (AES-128 CBC) via `cryptography` |
| PDF Extraction | `pdfplumber` |
| DOCX Extraction | `python-docx` |
| OCR (images) | `pytesseract` + `Pillow` |
| CORS | `django-cors-headers` |
| Auth | Django's built-in + custom `CustomUser` model |

---

## 3. Core Pipeline — How a Prompt Is Processed

Every prompt submitted via the `/prompt/` page goes through this exact pipeline:

```
Step 1 → SCAN
         scanner.scan(prompt)
         Returns a list of Detection objects (dtype, value, start, end)

Step 2 → POLICY
         policy_engine.apply_policy(role, detections)
         Returns: action (ALLOW/BLOCK/TOKENIZE), reasons, tokenize_targets

Step 3 → RISK SCORE
         risk_scorer.calculate_risk(role, detections)
         Returns: score (0–100), level (LOW/MODERATE/HIGH/SEVERE/CRITICAL), should_block

Step 4 → DEFENSE-IN-DEPTH
         If risk_score >= 60 AND action == ALLOW → upgrade to BLOCK
         (Catches edge cases where policy alone would allow a risky prompt)

Step 5a → BLOCK PATH
          No masking. No AI call.
          Log encrypted original prompt with action=BLOCK.
          Show block reasons + risk score to user.

Step 5b → TOKENIZE / ALLOW PATH
          Mask PII detections using dtype-specific masks.
          Encrypt original values → store in TokenMap table.
          Call mock_ai(masked_prompt) → get AI response.
          Log everything encrypted.
          Show security report to user.
```

---

## 4. Detection Engine (Scanner)

**File:** `firewall/scanner.py`

The scanner uses **25+ compiled regex patterns** to detect sensitive data. Each detection returns a `Detection` dataclass with `dtype`, `value`, `start`, and `end` fields.

### Detected Types

| Category | dtype | Description |
|---|---|---|
| **Financial** | `credit_card` | Visa, Mastercard, Amex, Discover (16/15-digit) |
| **Financial** | `financial_account` | IBAN, Indian bank account numbers, IFSC codes |
| **Financial** | `ssn` | US Social Security Numbers (###-##-####) |
| **Identity** | `aadhaar` | Indian Aadhaar (12-digit, starts 2–9) |
| **Identity** | `passport` | Passport numbers (1–2 letters + 7–8 digits) |
| **Contact** | `email` | Standard + obfuscated forms (at/dot variants) |
| **Contact** | `phone` | Indian mobile numbers (10-digit, all formats, +91 prefix) |
| **Contact** | `phone_words` | Phone numbers spoken as digit words ("nine eight seven...") |
| **Network** | `mac_address` | MAC addresses (XX:XX:XX:XX:XX:XX) |
| **Network** | `ip_address` | IPv4 and IPv6 addresses |
| **Credentials** | `password` | Password assignments in any format |
| **Credentials** | `api_key` | All API key formats: prefixed, JWT, OAuth, UUID, Base64, GitHub tokens |
| **Credentials** | `cloud_key` | AWS AKIA/ASIA/AROA keys, cloud secrets with slashes |
| **Credentials** | `private_key` | PEM private key headers (RSA, EC, DSA, OpenSSH) |
| **Credentials** | `encryption_key` | PEM public/private key headers |
| **Credentials** | `secret_token` | Auth/session token assignments |
| **Technical** | `source_code` | Python, JS, PHP, C code patterns |
| **Technical** | `sql_query` | SELECT, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER |
| **Technical** | `documentation` | Internal doc requests and structured doc headers |
| **Adversarial** | `adversarial_injection` | Jailbreak phrases, role-override, instruction manipulation |
| **Adversarial** | `encoded_payload` | Base64 or hex-encoded blobs (obfuscated instructions) |
| **Adversarial** | `embedded_secret_key` | Secrets hidden in natural language ("Remember this key: abc123") |
| **Adversarial** | `social_engineering_injection` | PWNED-style attacks: phrase redefinition + forced output |
| **Adversarial** | `credential_request` | "Give me admin credentials / passwords / bank details" |

### Priority System

When two patterns match the same span, a **priority table** resolves conflicts. Higher priority wins:

```
cloud_key / encryption_key / private_key  → 100 (highest)
financial_account                         →  92
encoded_payload                           →  90
adversarial_injection                     →  85
credential_request / secret_token         →  80
api_key                                   →  70
phone                                     →  68
aadhaar                                   →  65
source_code / sql_query                   →  60
email / phone_words / mac / ip / passport →  50
documentation                             →  40
```

---

## 5. Zero Trust Policy Engine

**File:** `firewall/policy_engine.py`

The policy engine maps each detected type + user role to one of three actions: **ALLOW**, **BLOCK**, or **TOKENIZE**.

### Universal Rules (apply to ALL roles)

**Always BLOCK (no exceptions):**
```
api_key, cloud_key, source_code, private_key, encryption_key,
credit_card, ssn, financial_account, password, secret_token,
adversarial_injection, encoded_payload, embedded_secret_key,
social_engineering_injection, credential_request
```

**Always TOKENIZE (mask PII, never block):**
```
email, phone, aadhaar, phone_words, mac_address, ip_address, passport
```

### Role-Specific Rules

| dtype | ADMIN | EMPLOYEE | INTERN |
|---|---|---|---|
| `sql_query` | ✅ ALLOW | 🚫 BLOCK | 🚫 BLOCK |
| `documentation` | ✅ ALLOW | ⚠️ TOKENIZE (default) | 🚫 BLOCK |

### Decision Priority

```
1. UNIVERSAL_BLOCK     → always BLOCK (cannot be overridden)
2. Role BLOCK list     → BLOCK for this role
3. UNIVERSAL_TOKENIZE  → always MASK
4. Role TOKENIZE list  → MASK for this role
5. Role ALLOW list     → explicitly permitted
6. Default             → TOKENIZE (Zero Trust fail-safe)
```

### Aggregation Logic

When multiple types are detected in one prompt:
- If **any** detection is BLOCK → final action = **BLOCK**
- If only TOKENIZE detections → final action = **TOKENIZE**
- If ALLOW + TOKENIZE mix (e.g. Admin submits SQL + email) → action = **ALLOW**, but PII is still masked

---

## 6. Risk Scoring Engine

**File:** `firewall/risk_scorer.py`

Risk is calculated based on the **combination** of detected types, not just individual severity.

### Four-Case Model

| Case | Condition | Score Range | Level | Block? |
|---|---|---|---|---|
| **Case 1** | Only PII (email, phone, Aadhaar...) | Fixed **40%** | MODERATE | No |
| **Case 2** | High-risk content only (no PII) | **60–75%** | HIGH to SEVERE | Yes |
| **Case 3** | PII + High-risk together | **80–95%** | CRITICAL | Yes |
| **Case 4** | No sensitive data | **0%** | LOW | No |

### Risk Levels

| Score | Level |
|---|---|
| 0–20% | LOW |
| 21–40% | MODERATE |
| 41–60% | HIGH |
| 61–80% | SEVERE |
| 81–100% | CRITICAL |

### Severity Weights (for Cases 2 & 3)

```
private_key / encryption_key  → 100
cloud_key                     →  95
credit_card / ssn             →  90
password                      →  85
api_key / secret_token        →  80
social_engineering_injection  →  70
encoded_payload               →  70
financial_account             →  75
adversarial_injection         →  60
sql_query                     →  40
source_code                   →  30
documentation                 →  20
```

### Defense-in-Depth

After policy evaluation, if `risk_score >= 60` and the policy said ALLOW, the action is **automatically upgraded to BLOCK**. This catches edge cases where policy alone would pass a risky prompt.

---

## 7. Tokenization (PII Masking)

**File:** `firewall/tokenization.py`

PII is replaced with **industry-standard masks** — the same formats used by banks, UIDAI, and PCI-DSS compliance frameworks.

| dtype | Original | Masked |
|---|---|---|
| `phone` | `9876543210` | `******3210` |
| `email` | `john.doe@company.com` | `j***@***.com` |
| `aadhaar` | `2345 6789 0123` | `XXXX-XXXX-0123` |
| `credit_card` | `4111 1111 1111 1111` | `**** **** **** 1111` |
| `ssn` | `123-45-6789` | `***-**-6789` |
| `passport` | `A1234567` | `*****567` |
| `mac_address` | `00:1A:2B:3C:4D:5E` | `**:**:**:**:**:5E` |
| `ip_address` | `192.168.1.100` | `***.***.***.100` |
| `phone_words` | `nine eight seven...` | `******3210` |

The original values are **never sent to the AI**. They are encrypted and stored in the `TokenMap` database table for audit purposes only.

---

## 8. Encryption (Data at Rest)

**File:** `firewall/encryption.py`

All sensitive data stored in the database is encrypted using **Fernet symmetric encryption** (AES-128 in CBC mode with HMAC-SHA256 authentication).

- Every `PromptLog.original_prompt` is encrypted before saving.
- Every `TokenMap.encrypted_value` stores the Fernet-encrypted original PII value.
- The Fernet key is loaded from the `FERNET_KEY` environment variable.
- Decryption happens on-the-fly via the `decrypted_original_prompt` property on `PromptLog`.

**Admin Ephemeral Reveal:** Admins can request a 10-second time-limited window to view unmasked log data via `POST /logs/<id>/reveal/`. After the window expires, the data is masked again. This is enforced server-side — the frontend countdown is cosmetic only.

---

## 9. Role-Based Access Control (RBAC)

**File:** `users/models.py`, `users/decorators.py`

Three roles with escalating trust levels:

| Role | SQL Queries | Documentation | Document Upload | Logs Page | Admin Panel |
|---|---|---|---|---|---|
| **ADMIN** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Full access | ✅ Yes |
| **EMPLOYEE** | 🚫 Blocked | ⚠️ Default (tokenize) | ✅ Allowed | ❌ No access | ❌ No |
| **INTERN** | 🚫 Blocked | 🚫 Blocked | 🚫 Blocked | ❌ No access | ❌ No |

**Account Lockout:** After 5 failed login attempts, an account is locked for 30 minutes. The counter resets on successful login.

---

## 10. Document Extraction

**File:** `firewall/document_extractor.py`

Uploaded documents are extracted to plain text and fed into the same scan pipeline as typed prompts. Supported formats:

| Format | Library | Notes |
|---|---|---|
| `.pdf` | `pdfplumber` | Text-based PDFs only; scanned PDFs return an error |
| `.docx` | `python-docx` | Extracts all paragraph text |
| `.txt` | Built-in | UTF-8 decode with error replacement |
| `.png`, `.jpg`, `.jpeg`, `.bmp`, `.tiff`, `.webp` | `pytesseract` + `Pillow` | OCR — requires Tesseract installed |

**RBAC enforcement:** Interns are blocked from uploading documents at both the view level and the API level.

---

## 11. REST API (DLP Endpoints)

**File:** `firewall/api_views.py`

Two JSON API endpoints for external DLP integration. Both are CSRF-exempt and return `{"status": "SAFE"}` or `{"status": "BLOCK"}`.

### `POST /analyze`

Accepts a JSON body with a `text` field.

```bash
curl -X POST http://127.0.0.1:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "My API key is sk-abc123xyz"}'
```

**Response:**
```json
{"status": "BLOCK"}
```

### `POST /analyze-file`

Accepts a multipart file upload with field name `document`.

```bash
curl -X POST http://127.0.0.1:8000/analyze-file \
  -F "document=@report.pdf"
```

**Response:**
```json
{"status": "SAFE"}
```

---

## 12. Security Middleware

**File:** `users/middleware.py`

`RateLimitMiddleware` runs on every request and provides two functions:

**1. Rate Limiting**
- Applies to `POST /login/` and `POST /signup/` only.
- Limit: **10 requests per minute** per IP address.
- Exceeding the limit returns HTTP 429 with a `rate_limited.html` page.
- Uses in-memory tracking (use Redis in production for multi-process deployments).

**2. Security Headers**
Added to every response:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 13. Database Models

### `CustomUser` (`users/models.py`)

Extends Django's `AbstractUser` with:

| Field | Type | Description |
|---|---|---|
| `role` | CharField | `ADMIN`, `EMPLOYEE`, or `INTERN` |
| `full_name` | CharField | Display name |
| `failed_login_attempts` | PositiveIntegerField | Increments on bad login |
| `account_locked_until` | DateTimeField | Set to `now + 30min` after 5 failures |

### `PromptLog` (`firewall/models.py`)

Full audit trail for every prompt submission:

| Field | Type | Description |
|---|---|---|
| `user` | ForeignKey | Who submitted it |
| `original_prompt` | TextField | **Fernet-encrypted** original text |
| `processed_prompt` | TextField | Masked version sent to AI |
| `detected_types` | JSONField | List of detected dtype strings |
| `action` | CharField | `ALLOW`, `BLOCK`, or `TOKENIZE` |
| `reasons` | JSONField | Human-readable policy reasons |
| `risk_score` | IntegerField | 0–100 |
| `risk_level` | CharField | LOW / MODERATE / HIGH / SEVERE / CRITICAL |
| `ai_response` | TextField | Mock AI response (empty if blocked) |
| `timestamp` | DateTimeField | Auto-set on creation |

### `TokenMap` (`firewall/models.py`)

Maps mask labels back to encrypted original PII values:

| Field | Type | Description |
|---|---|---|
| `user` | ForeignKey | Owner of the token |
| `token_label` | CharField | The mask label (e.g. `j***@***.com`) |
| `encrypted_value` | TextField | Fernet-encrypted original value |
| `created_at` | DateTimeField | Auto-set on creation |

---

## 14. Frontend & Templates

### Pages

| URL | Template | Access |
|---|---|---|
| `/` | Redirects based on auth | Public |
| `/login/` | `users/login.html` | Public |
| `/signup/` | `users/signup.html` | Public |
| `/dashboard/` | `firewall/dashboard.html` | Authenticated |
| `/prompt/` | `firewall/prompt.html` | Authenticated |
| `/logs/` | `firewall/logs.html` | Admin only |
| `/logs/<id>/` | `firewall/log_detail.html` | Admin only |
| `/admin/` | Django admin | Superuser |

### Dashboard

Shows the logged-in user's:
- Role badge (Admin / Employee / Intern)
- Last 5 prompt submissions with action and risk level
- Total submission count
- Last submission timestamp

### Prompt Page

The main firewall interface. Supports:
- Text input for typed prompts
- File upload (PDF, DOCX, TXT, images) — blocked for Interns
- Full security report after submission showing:
  - Action taken (ALLOW / BLOCK / TOKENIZE)
  - Risk score and level with visual indicator
  - All detected entity types with labels and categories
  - Block reasons with per-dtype explanations
  - Masked prompt preview
  - AI response (if not blocked)

### Logs Page (Admin only)

Table of all prompt logs across all users with:
- User, timestamp, action, risk score, detected types
- Link to full log detail

### Log Detail Page (Admin only)

Shows full log entry with sensitive fields masked by default. Admin can click "Reveal" to get a **10-second ephemeral window** to view unmasked data.

---

## 15. Test Dataset & Validation

**Directory:** `test_dataset/`

The project includes an extensive test dataset with **15 batches** of test cases covering:

| Batch | Focus |
|---|---|
| `batch_01` | Allow / tokenize normal prompts |
| `batch_02` | Credentials and API keys |
| `batch_03` | Adversarial injection attacks |
| `batch_04` | Mixed edge cases |
| `batch_05` | Real-world allow scenarios |
| `batch_06` | Diverse tokenize cases |
| `batch_07` | Advanced block scenarios |
| `batch_08` | Intern-specific restrictions |
| `batch_09` | Edge cases with realistic prompts |
| `batch_10` | Multi-language context |
| `batch_11` | PII variations |
| `batch_12` | Credential variations |
| `batch_13` | Employee-focused scenarios |
| `batch_14` | Admin advanced scenarios |
| `batch_15` | Allow balance testing |

Run all batches:
```bash
python test_dataset/run_all_batches.py
```

Run the adversarial test suite via management command:
```bash
python manage.py run_adversarial_test
```

---

## 16. Project Structure

```
UniSys Project/
├── manage.py
├── requirements.txt
├── .env                          # Environment variables (never commit)
│
├── sentinell_ai/                 # Django project config
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
│
├── firewall/                     # Core firewall app
│   ├── scanner.py                # 25+ regex detectors
│   ├── policy_engine.py          # Zero Trust policy rules
│   ├── risk_scorer.py            # Context-aware risk scoring
│   ├── tokenization.py           # PII masking (dtype-specific)
│   ├── encryption.py             # Fernet AES-128 encrypt/decrypt
│   ├── detector.py               # Lightweight DLP decision function
│   ├── document_extractor.py     # PDF/DOCX/TXT/image text extraction
│   ├── mock_ai.py                # Simulated Zero Trust AI responses
│   ├── views.py                  # Dashboard, prompt, logs views
│   ├── api_views.py              # /analyze and /analyze-file REST API
│   ├── models.py                 # PromptLog, TokenMap
│   ├── urls.py
│   └── migrations/
│
├── users/                        # Auth & RBAC app
│   ├── models.py                 # CustomUser with lockout + RBAC
│   ├── views.py                  # Login, signup, logout
│   ├── middleware.py             # Rate limiting + security headers
│   ├── validators.py             # Password strength validation
│   ├── decorators.py             # Role-based access decorators
│   └── migrations/
│
├── templates/
│   ├── base.html
│   ├── firewall/
│   │   ├── dashboard.html
│   │   ├── prompt.html
│   │   ├── logs.html
│   │   └── log_detail.html
│   └── users/
│       ├── login.html
│       ├── signup.html
│       └── rate_limited.html
│
├── static/
│   └── css/style.css
│
└── test_dataset/
    ├── batches/                  # 15 test batches (batch_01 to batch_15)
    ├── batch_runner.py
    ├── run_all_batches.py
    ├── validate_dataset.py
    └── dataset_export.csv
```

---

## 17. Setup & Running Locally

### Prerequisites

- Python 3.11+
- pip

### Steps

```bash
# 1. Clone / extract the project
cd "UniSys Project"

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run migrations (creates SQLite database)
python manage.py migrate

# 4. Create demo users
python manage.py create_demo_users

# 5. Start the development server
python manage.py runserver
```

Open **http://127.0.0.1:8000** in your browser.

### Switching to PostgreSQL

Update `.env`:
```env
DB_ENGINE=django.db.backends.postgresql
DB_NAME=sentinell_ai_db
DB_USER=sentinell_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
```

Then run:
```bash
python manage.py migrate
python manage.py create_demo_users
```

---

## 18. Demo Accounts

| Role | Email | Password | Capabilities |
|---|---|---|---|
| **Admin** | admin@sentinell.ai | `Admin123!` | Full access — all pages, logs, SQL, docs, file upload |
| **Employee** | employee@sentinell.ai | `Emp123!!` | Prompt + file upload; SQL blocked |
| **Intern** | intern@sentinell.ai | `Int123!!` | Prompt only; SQL, docs, file upload all blocked |

Create them with:
```bash
python manage.py create_demo_users
```

---

## 19. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | insecure default | Django secret key — **change in production** |
| `DJANGO_DEBUG` | `True` | Set to `False` in production |
| `DB_ENGINE` | `sqlite3` | Database backend |
| `DB_NAME` | `db.sqlite3` | Database name |
| `DB_USER` | — | Database user (PostgreSQL only) |
| `DB_PASSWORD` | — | Database password (PostgreSQL only) |
| `DB_HOST` | `localhost` | Database host (PostgreSQL only) |
| `DB_PORT` | `5432` | Database port (PostgreSQL only) |
| `FERNET_KEY` | insecure default | 32-byte URL-safe base64 key for encryption — **change in production** |

Generate a new Fernet key:
```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

---

## 20. Security Design Decisions

### Why Zero Trust?

The default action for any unknown data type is **TOKENIZE** (mask), not ALLOW. This means new or unrecognised sensitive data types are masked by default rather than passed through. Explicit allowlisting is required for any data type to reach the AI.

### Why Encrypt Prompts at Rest?

Even blocked prompts contain the sensitive data that triggered the block. Storing them in plaintext would create a secondary data breach vector. All `original_prompt` fields are Fernet-encrypted before hitting the database.

### Why Ephemeral Reveal Instead of Permanent Decrypt?

Giving admins permanent access to decrypted logs creates a standing privilege that can be abused or compromised. The 10-second ephemeral window means access is time-limited, audited (logged), and requires an active deliberate action — not just reading a table.

### Why Mock AI Instead of Real LLM?

The mock AI (`mock_ai.py`) simulates realistic latency (300–700ms) and returns contextually appropriate responses without requiring API keys or incurring costs. The `ZERO_TRUST_SYSTEM_PROMPT` in that file is the exact prompt that would be sent to a real LLM (GPT-4o, Gemini, Claude) in production — swapping mock for real is a one-line change.

### Why Regex Instead of ML Models?

Regex patterns are:
- **Deterministic** — same input always produces same output
- **Auditable** — every rule is readable and explainable
- **Fast** — no model loading, no GPU required
- **Offline** — no external API calls for detection

The `detector.py` file explicitly notes that the `detect_sensitive()` function can be swapped for a BERT/RoBERTa model without changing any other code.

### Why Role-Based Blocking Instead of Just Logging?

Logging alone is reactive — it records a breach after it happens. Blocking is proactive. The RBAC policy ensures that even if an employee tries to submit source code or SQL, it never reaches the AI layer regardless of intent.

---

*Built with Django 5.x · Fernet AES-128 · Zero Trust Architecture*
