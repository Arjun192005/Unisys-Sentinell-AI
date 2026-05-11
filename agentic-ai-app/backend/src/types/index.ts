// ─── Session ─────────────────────────────────────────────────────────────────
export interface Session {
  id: string;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  model: string;
  total_tokens: number;
}

// ─── Message ─────────────────────────────────────────────────────────────────
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[] | null;
  tool_name?: string | null;
  tokens: number;
  created_at: string;
}

// ─── Tool ─────────────────────────────────────────────────────────────────────
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolExecution {
  id: string;
  session_id: string;
  message_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output?: unknown;
  status: 'pending' | 'running' | 'success' | 'error';
  started_at: string;
  finished_at?: string;
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_ctx?: number;
    num_predict?: number;  // FIX: was missing — caused num_predict to be silently dropped
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export interface AgentRule {
  id: number;
  rule_key: string;
  rule_value: string;
  description?: string;
  enabled: number; // 1 = true, 0 = false
  created_at: string;
}

export interface ChatRequest {
  session_id?: string;
  message: string;
  model?: string;
}

export interface ChatResponse {
  session_id: string;
  message_id: string;
  content: string;
  role: 'assistant';
  tokens: number;
  model: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
