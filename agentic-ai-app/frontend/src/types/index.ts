export interface Session {
  id: string;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  model: string;
  total_tokens: number;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'sentinel_block';

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

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface AgentRule {
  id: number;
  rule_key: string;
  rule_value: string;
  description?: string;
  enabled: number;
  created_at: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface StreamEvent {
  type: 'session' | 'chunk' | 'done' | 'error' | 'response_blocked';
  session_id?: string;
  content?: string;
  message_id?: string;
  tokens?: number;
  error?: string;
  sentinel?: {
    status: 'SAFE' | 'BLOCK';
    riskScore: number;
    riskLevel?: string;
    detectedTypes?: string[];
    explanation?: string;
    semanticFlags?: string[];
  };
  sentinel_prompt?: { status: string; riskScore: number };
  sentinel_response?: { status: string; riskScore: number };
}

export interface AuthUser {
  id: number;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'INTERN';
  name: string;
}

export interface DemoUser {
  email: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'INTERN';
  name: string;
}
