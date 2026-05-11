/**
 * SQLite database schema definitions for the Agentic AI session store.
 */

export const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL DEFAULT 'New Session',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    model       TEXT NOT NULL DEFAULT 'qwen2.5-coder:7b',
    total_tokens INTEGER NOT NULL DEFAULT 0
  )
`;

export const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content     TEXT NOT NULL,
    tool_calls  TEXT,          -- JSON array of tool calls (nullable)
    tool_name   TEXT,          -- name of tool if role = 'tool'
    tokens      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )
`;

export const CREATE_TOOL_EXECUTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS tool_executions (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL,
    message_id   TEXT NOT NULL,
    tool_name    TEXT NOT NULL,
    tool_input   TEXT NOT NULL,   -- JSON
    tool_output  TEXT,            -- JSON (nullable until resolved)
    status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','success','error')),
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at  TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  )
`;

export const CREATE_AGENT_RULES_TABLE = `
  CREATE TABLE IF NOT EXISTS agent_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key    TEXT NOT NULL UNIQUE,
    rule_value  TEXT NOT NULL,
    description TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_FEEDBACK_TABLE = `
  CREATE TABLE IF NOT EXISTS feedback (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    message_id  TEXT NOT NULL,
    rating      INTEGER NOT NULL CHECK(rating IN (1, -1)),  -- 1 = thumbs up, -1 = thumbs down
    comment     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  )
`;

export const CREATE_LEARNED_PATTERNS_TABLE = `
  CREATE TABLE IF NOT EXISTS learned_patterns (
    id          TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,  -- 'good_response', 'bad_response', 'user_preference'
    context     TEXT NOT NULL,   -- User prompt or context
    response    TEXT NOT NULL,   -- AI response
    rating      INTEGER NOT NULL,
    frequency   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const DEFAULT_RULES: Array<{ key: string; value: string; description: string }> = [
  {
    key: 'language',
    value: 'Always respond in the same language the user writes in.',
    description: 'Language consistency rule',
  },
  {
    key: 'code_quality',
    value: 'Always write clean, well-commented, production-ready code with proper error handling.',
    description: 'Code quality standard',
  },
  {
    key: 'no_hallucination',
    value: 'Never invent library APIs or function signatures. If unsure, say so explicitly.',
    description: 'Accuracy rule',
  },
  {
    key: 'explain_steps',
    value: 'Break down complex solutions into numbered steps before writing code.',
    description: 'Explanation rule',
  },
  {
    key: 'security',
    value: 'Always flag potential security issues in code and suggest secure alternatives.',
    description: 'Security awareness rule',
  },
  {
    key: 'consistency',
    value: 'Maintain consistent naming conventions, style, and patterns throughout a session.',
    description: 'Consistency rule',
  },
];
