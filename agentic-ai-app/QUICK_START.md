# Agentic AI - Quick Start Guide

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- Ollama with qwen2.5-coder:1.5b model
- SentinelAI running on port 8000

## Installation

### 1. Backend Setup

```bash
cd agentic-ai-app/backend
npm install
npm run dev
```

Backend runs on: http://localhost:3001

### 2. Frontend Setup

```bash
cd agentic-ai-app/frontend
npm install
npm run dev
```

Frontend runs on: http://localhost:3000

### 3. SentinelAI Setup

```bash
cd "UniSys Project"
python manage.py runserver
```

SentinelAI runs on: http://localhost:8000

## Login Credentials

```
Admin:    admin@agenticai.demo    / AgentAdmin@2026
Employee: employee@agenticai.demo / AgentEmp@2026
Intern:   intern@agenticai.demo   / AgentIntern@2026
```

## Validation

Run the comprehensive validation suite:

```bash
python agentic-ai-app/validate_agentic_ai.py
```

## Key Features

### 1. Secure Chat with PII Protection
- All prompts scanned by SentinelAI
- PII (Aadhaar, email, phone) automatically masked
- Adversarial prompts blocked

### 2. Continuous Conversation
- Full conversation history maintained
- AI remembers context across messages
- No limit on conversation length

### 3. Self-Learning
- Give thumbs up/down feedback
- AI learns from positive responses
- Improves over time

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `DELETE /api/sessions/:id` - Delete session
- `GET /api/sessions/:id/messages` - Get messages

### Chat
- `POST /api/chat` - Send message (non-streaming)
- `POST /api/chat/stream` - Send message (streaming)

### Feedback
- `POST /api/feedback` - Submit feedback
- `GET /api/feedback/stats` - Get statistics
- `GET /api/feedback/learned` - View learned patterns

### Health
- `GET /health` - Backend health + Ollama status

## Environment Variables

### Backend (.env)
```env
PORT=3001
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:1.5b
SENTINEL_BASE_URL=http://localhost:8000
SENTINEL_INTERNAL_KEY=sentinel-internal-key-2026
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_DEFAULT_MODEL=qwen2.5-coder:1.5b
```

## Troubleshooting

### Issue: "Burst Pattern" error
**Solution**: Wait 2 minutes or increase threshold in `provenance_scorer.py`

### Issue: Chat blocked after 3 messages
**Solution**: Already fixed! Rate limit is 100 requests/minute

### Issue: Ollama not connected
**Solution**: 
```bash
ollama serve
ollama pull qwen2.5-coder:1.5b
```

### Issue: SentinelAI not responding
**Solution**:
```bash
cd "UniSys Project"
python manage.py runserver
```

## Testing

### Test Continuous Conversation
```bash
python agentic-ai-app/test_continuous_conversation.py
```

### Test PII Tokenization
```bash
python agentic-ai-app/test_aadhaar_flow.py
```

### Test Firewall (SentinelAI)
```bash
python agentic-ai-app/test_firewall_batches.py --batch 3 --batch 4
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│                  http://localhost:3000                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│                 Backend (Express/TypeScript)             │
│                  http://localhost:3001                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  1. Tokenize PII (SentinelAI /tokenize-prompt)   │   │
│  │  2. Check action: ALLOW/TOKENIZE/BLOCK           │   │
│  │  3. Send masked text to LLM                      │   │
│  │  4. Scan response (SentinelAI /analyze-advanced) │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
          ↓                             ↓
┌──────────────────────┐    ┌──────────────────────┐
│    SentinelAI        │    │   Ollama LLM         │
│  localhost:8000      │    │  localhost:11434     │
│  - Scan prompts      │    │  qwen2.5-coder:1.5b  │
│  - Tokenize PII      │    │                      │
│  - Block threats     │    │                      │
└──────────────────────┘    └──────────────────────┘
```

## Next Steps

1. ✅ Run validation suite
2. ✅ Test continuous conversation
3. ✅ Try PII tokenization
4. ✅ Give feedback on responses
5. ✅ Monitor learned patterns

## Support

For issues or questions:
1. Check `VALIDATION_REPORT.md` for known issues
2. Run validation suite to diagnose problems
3. Check backend/frontend console logs
4. Verify all services are running

## Success Criteria

✅ All 8 validation tests pass
✅ Continuous conversation works
✅ PII is tokenized (not blocked)
✅ Context is maintained across messages
✅ Adversarial prompts are blocked
✅ LLM connection is healthy
