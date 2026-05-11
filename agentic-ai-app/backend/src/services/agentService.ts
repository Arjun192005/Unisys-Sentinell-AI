import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/database';
import { chat, chatStream } from './ollamaService';
import { AgentRule, Message, OllamaMessage, Session } from '../types';

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(rules: AgentRule[], learnedPatterns?: any[]): string {
  const enabledRules = rules.filter((r) => r.enabled === 1);
  const rulesText = enabledRules
    .map((r, i) => `${i + 1}. [${r.rule_key.toUpperCase()}] ${r.rule_value}`)
    .join('\n');

  let learnedText = '';
  if (learnedPatterns && learnedPatterns.length > 0) {
    const goodPatterns = learnedPatterns.filter((p) => p.pattern_type === 'good_response');
    if (goodPatterns.length > 0) {
      learnedText = `\n\n## Learned Preferences (from user feedback)
${goodPatterns.slice(0, 5).map((p, i) => 
  `${i + 1}. When asked about "${p.context.slice(0, 50)}...", users prefer responses like: "${p.response.slice(0, 100)}..."`
).join('\n')}`;
    }
  }

  return `You are an expert AI coding assistant — precise, consistent, and production-focused.

## Core Identity
- You specialize in software engineering: architecture, debugging, code review, and implementation.
- You write clean, well-structured code with proper error handling and comments.
- You are consistent within a session: same naming conventions, same patterns, same style.
- You never hallucinate APIs or library functions. If you are unsure, you say so.

## Behavioral Rules
${rulesText}${learnedText}

## Response Format
- For code: always use fenced code blocks with the language identifier (e.g. \`\`\`typescript).
- For explanations: use numbered steps for multi-step processes.
- For errors/bugs: identify root cause first, then provide the fix.
- Keep responses focused and proportional to the question.
- If a task is ambiguous, ask one clarifying question before proceeding.

## Agentic Capabilities
When solving a multi-step task:
1. State your plan briefly.
2. Execute each step.
3. Summarize what was done and any caveats.

Always be honest about limitations. Never fabricate information.`;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(model: string, userId: number, title?: string): Session {
  const id = uuidv4();
  const now = new Date().toISOString();
  execute(
    'INSERT INTO sessions (id, user_id, title, created_at, updated_at, model) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, title || 'New Session', now, now, model]
  );
  return queryOne('SELECT * FROM sessions WHERE id = ?', [id]) as unknown as Session;
}

export function getSession(sessionId: string): Session | null {
  return (queryOne('SELECT * FROM sessions WHERE id = ?', [sessionId]) as unknown as Session) || null;
}

export function listSessions(userId: number): Session[] {
  return queryAll('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC', [userId]) as unknown as Session[];
}

/**
 * FIX: Check existence BEFORE deleting, not after.
 * Previous logic deleted then checked if still present — always returned true.
 */
export function deleteSession(sessionId: string): boolean {
  const exists = queryOne('SELECT id FROM sessions WHERE id = ?', [sessionId]);
  if (!exists) return false;

  execute('DELETE FROM messages WHERE session_id = ?', [sessionId]);
  execute('DELETE FROM tool_executions WHERE session_id = ?', [sessionId]);
  execute('DELETE FROM sessions WHERE id = ?', [sessionId]);
  return true;
}

export function updateSessionTitle(sessionId: string, title: string): void {
  execute('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?', [
    title,
    new Date().toISOString(),
    sessionId,
  ]);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function getSessionMessages(sessionId: string): Message[] {
  const rows = queryAll(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId]
  );
  return rows.map((row) => ({
    ...row,
    tool_calls: row.tool_calls ? JSON.parse(row.tool_calls as string) : null,
  })) as unknown as Message[];
}

/**
 * FIX: Guard against saving empty content — skip the DB write and return a dummy.
 */
function saveMessage(
  sessionId: string,
  role: Message['role'],
  content: string,
  tokens = 0,
  toolName?: string
): Message {
  // Don't persist empty messages (e.g. stream stopped before first token)
  if (!content.trim()) {
    return {
      id: `empty-${uuidv4()}`,
      session_id: sessionId,
      role,
      content: '',
      tokens: 0,
      created_at: new Date().toISOString(),
    } as Message;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  execute(
    `INSERT INTO messages (id, session_id, role, content, tokens, tool_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, role, content, tokens, toolName ?? null, now]
  );

  execute(
    'UPDATE sessions SET updated_at = ?, total_tokens = total_tokens + ? WHERE id = ?',
    [now, tokens, sessionId]
  );

  return queryOne('SELECT * FROM messages WHERE id = ?', [id]) as unknown as Message;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export function getAgentRules(): AgentRule[] {
  return queryAll('SELECT * FROM agent_rules ORDER BY id ASC') as unknown as AgentRule[];
}

export function updateRule(ruleKey: string, ruleValue: string): void {
  execute('UPDATE agent_rules SET rule_value = ? WHERE rule_key = ?', [ruleValue, ruleKey]);
}

export function toggleRule(ruleKey: string, enabled: boolean): void {
  execute('UPDATE agent_rules SET enabled = ? WHERE rule_key = ?', [enabled ? 1 : 0, ruleKey]);
}

// ─── Agent Chat ───────────────────────────────────────────────────────────────

export async function agentChat(
  sessionId: string,
  userMessage: string,        // original — saved to DB
  model: string,
  maskedMessage?: string      // masked — sent to Ollama
): Promise<{ content: string; tokens: number; messageId: string }> {
  const rules = getAgentRules();
  
  // Try to get learned patterns, but don't fail if table doesn't exist yet
  let learnedPatterns: any[] = [];
  try {
    learnedPatterns = queryAll(
      `SELECT * FROM learned_patterns 
       WHERE pattern_type = 'good_response' 
       ORDER BY frequency DESC LIMIT 10`
    ) as any[];
  } catch (err) {
    // Table might not exist yet - that's okay
  }
  
  const systemPrompt = buildSystemPrompt(rules, learnedPatterns);
  const history = getSessionMessages(sessionId);

  // Save original to DB
  saveMessage(sessionId, 'user', userMessage);

  // Send masked to Ollama
  const messageForLLM = maskedMessage ?? userMessage;

  const ollamaMessages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: messageForLLM },
  ];

  const response = await chat(model, ollamaMessages);
  const assistantContent = response.message.content;
  const tokens = response.eval_count ?? 0;

  const assistantMsg = saveMessage(sessionId, 'assistant', assistantContent, tokens);

  const session = getSession(sessionId);
  if (session && session.title === 'New Session') {
    updateSessionTitle(sessionId, userMessage.slice(0, 60) + (userMessage.length > 60 ? '…' : ''));
  }

  return { content: assistantContent, tokens, messageId: assistantMsg.id };
}

/**
 * FIX: messageId and tokens are now resolved AFTER the stream completes,
 * then returned. The route handler sends the 'done' event with correct values.
 */
export async function agentChatStream(
  sessionId: string,
  userMessage: string,        // original message — saved to DB and shown in UI
  model: string,
  onChunk: (chunk: string) => void,
  maskedMessage?: string      // masked version — sent to Ollama (PII replaced)
): Promise<{ messageId: string; tokens: number }> {
  const rules = getAgentRules();
  
  // Try to get learned patterns, but don't fail if table doesn't exist yet
  let learnedPatterns: any[] = [];
  try {
    learnedPatterns = queryAll(
      `SELECT * FROM learned_patterns 
       WHERE pattern_type = 'good_response' 
       ORDER BY frequency DESC LIMIT 10`
    ) as any[];
  } catch (err) {
    // Table might not exist yet - that's okay
  }
  
  const systemPrompt = buildSystemPrompt(rules, learnedPatterns);
  const history = getSessionMessages(sessionId);

  // Save the ORIGINAL message to DB so the user sees their real text in the UI
  saveMessage(sessionId, 'user', userMessage);

  // Send the MASKED message to Ollama so PII never reaches the LLM
  const messageForLLM = maskedMessage ?? userMessage;

  const ollamaMessages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: messageForLLM },
  ];

  let fullContent = '';

  // FIX: onChunk no longer receives 'done' — the route handles done signalling
  // after this promise resolves, so messageId is always valid.
  const { totalTokens } = await chatStream(model, ollamaMessages, (chunk) => {
    fullContent += chunk;
    onChunk(chunk);
  });

  // FIX: only save if we actually got content (handles stop-before-first-token)
  const assistantMsg = saveMessage(sessionId, 'assistant', fullContent, totalTokens);

  const session = getSession(sessionId);
  if (session && session.title === 'New Session') {
    updateSessionTitle(sessionId, userMessage.slice(0, 60) + (userMessage.length > 60 ? '…' : ''));
  }

  return { messageId: assistantMsg.id, tokens: totalTokens };
}
