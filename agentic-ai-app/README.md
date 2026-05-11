# Agentic AI Coding Assistant

A local, privacy-first agentic AI coding assistant built with:

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS (port **3000**)
- **Backend**: Express.js + Node.js + TypeScript (port **3001**)
- **Database**: SQLite via `better-sqlite3` (session logs, messages, agent rules)
- **AI**: Ollama (local LLM — `qwen2.5-coder:7b` by default)

> Ports are intentionally different from the SentinelAI Django project (port 8000).

---

## Quick Start

### 1. Install Ollama & pull the model

```bash
# Install Ollama from https://ollama.com
ollama pull qwen2.5-coder:7b
```

### 2. Install dependencies

```bash
# From the agentic-ai-app folder:
npm run install:all
```

Or individually:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Start the backend (port 3001)

```bash
cd backend
npm run dev
```

### 4. Start the frontend (port 3000)

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
agentic-ai-app/
├── backend/                  # Express.js API server (port 3001)
│   ├── src/
│   │   ├── db/               # SQLite schema + database singleton
│   │   ├── middleware/       # Error handler, rate limiter, logger, validator
│   │   ├── routes/           # /api/sessions, /api/chat, /api/models, /api/rules
│   │   ├── services/         # agentService (agentic loop), ollamaService
│   │   ├── types/            # Shared TypeScript types
│   │   └── index.ts          # Express app entry point
│   └── data/                 # SQLite DB file (auto-created)
│
└── frontend/                 # Next.js app (port 3000)
    └── src/
        ├── app/              # Next.js App Router
        ├── components/       # Sidebar, ChatWindow, MessageBubble, etc.
        ├── lib/              # API client (proxied through Next.js rewrites)
        └── types/            # Frontend TypeScript types
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List all sessions |
| POST | `/api/sessions` | Create a new session |
| GET | `/api/sessions/:id` | Get session details |
| PATCH | `/api/sessions/:id` | Rename session |
| DELETE | `/api/sessions/:id` | Delete session |
| GET | `/api/sessions/:id/messages` | Get session messages |
| POST | `/api/chat` | Send message (non-streaming) |
| POST | `/api/chat/stream` | Send message (SSE streaming) |
| GET | `/api/models` | List Ollama models |
| GET | `/api/models/health` | Check Ollama status |
| GET | `/api/rules` | List agent rules |
| PATCH | `/api/rules/:key` | Update a rule |
| PATCH | `/api/rules/:key/toggle` | Enable/disable a rule |
| POST | `/api/feedback` | Submit feedback (thumbs up/down) |
| GET | `/api/feedback/stats` | Get feedback statistics |
| GET | `/api/feedback/learned` | Get learned patterns |

## Agent Rules

The agent has 6 built-in configurable rules stored in SQLite:

- **language** — respond in the user's language
- **code_quality** — write clean, production-ready code
- **no_hallucination** — never invent APIs
- **explain_steps** — break down complex solutions
- **security** — flag security issues
- **consistency** — maintain consistent style per session

Rules can be edited and toggled on/off from the Settings panel in the UI.

## Self-Learning & Feedback System

The AI includes a feedback system that enables continuous improvement:

- **User Feedback**: Rate responses with thumbs up/down
- **Pattern Learning**: System identifies successful response patterns
- **Dynamic Integration**: Top patterns incorporated into system prompt
- **Statistics**: Track feedback metrics and learned patterns

See [FEEDBACK_SYSTEM_GUIDE.md](./FEEDBACK_SYSTEM_GUIDE.md) for detailed documentation.

## SentinelAI Security Integration

The Agentic AI integrates with SentinelAI for advanced security:

- **PII Tokenization**: Automatically masks sensitive data (Aadhaar, email, phone)
- **Adversarial Detection**: Blocks prompt injection and jailbreak attempts
- **Credential Protection**: Detects and blocks API keys, tokens, passwords
- **Risk Scoring**: Real-time threat assessment for all interactions
- **Continuous Conversation**: Full context retention across messages

See [VALIDATION_REPORT.md](./VALIDATION_REPORT.md) for comprehensive test results.

## Port Reference

| Service | Port |
|---------|------|
| SentinelAI (Django) | 8000 |
| Agentic AI Backend (Express) | **3001** |
| Agentic AI Frontend (Next.js) | **3000** |
| Ollama | 11434 |
