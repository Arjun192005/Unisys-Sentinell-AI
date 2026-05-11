import { ApiResponse, Session, Message, OllamaModel, AgentRule, StreamEvent, AuthUser, DemoUser } from '@/types';

const BASE = '/api';

// ─── Token storage (in-memory, survives page navigation but not refresh) ──────
let _token: string | null = null;

export function setAuthToken(token: string | null) { _token = token; }
export function getAuthToken(): string | null { return _token; }

function authHeaders(): Record<string, string> {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

/**
 * Base request helper — wraps fetch with auth headers and safe JSON parsing.
 */
async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options?.headers ?? {}),
      },
      ...options,
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}` };
  }

  try {
    const data = (await res.json()) as ApiResponse<T>;
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  } catch {
    return { success: false, error: `HTTP ${res.status} — invalid response body` };
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request('/auth/logout', { method: 'POST' }),

  me: () => request<AuthUser>('/auth/me'),

  demoUsers: () => request<DemoUser[]>('/auth/demo-users'),
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  list: () => request<Session[]>('/sessions'),

  create: (model?: string, title?: string) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ model, title }),
    }),

  get: (id: string) => request<Session>(`/sessions/${id}`),

  rename: (id: string, title: string) =>
    request<Session>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  delete: (id: string) => request(`/sessions/${id}`, { method: 'DELETE' }),

  messages: (id: string) => request<Message[]>(`/sessions/${id}/messages`),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chatApi = {
  send: (message: string, sessionId?: string, model?: string) =>
    request<{
      session_id: string;
      message_id: string;
      content: string;
      role: 'assistant';
      tokens: number;
      model: string;
    }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId, model }),
    }),

  /**
   * Stream a chat response via SSE.
   * Returns a cleanup/abort function.
   * Handles the new 'response_blocked' event from SentinelAI response scan.
   */
  stream: (
    message: string,
    onEvent: (event: StreamEvent) => void,
    sessionId?: string,
    model?: string
  ): (() => void) => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${BASE}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({ message, session_id: sessionId, model }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`;
          try {
            // Parse the 403 response — SentinelAI block returns JSON with sentinel field
            const body = await res.json() as {
              success: boolean;
              error?: string;
              sentinel?: {
                status: 'SAFE' | 'BLOCK';
                riskScore: number;
                riskLevel?: string;
                detectedTypes?: string[];
                explanation?: string;
                semanticFlags?: string[];
              };
            };
            if (body.error) errMsg = body.error;
            if (body.sentinel) {
              onEvent({
                type: 'error',
                error: body.error ?? errMsg,
                sentinel: body.sentinel,
              });
              return;
            }
          } catch { /* ignore parse errors */ }
          onEvent({ type: 'error', error: errMsg });
          return;
        }

        if (!res.body) {
          onEvent({ type: 'error', error: 'No response body from server' });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6)) as StreamEvent;
                  onEvent(event);
                } catch {
                  // Malformed SSE line — skip
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onEvent({ type: 'error', error: String(err) });
        }
      }
    })();

    return () => controller.abort();
  },
};

// ─── Models ───────────────────────────────────────────────────────────────────

export const modelsApi = {
  list: () => request<OllamaModel[]>('/models'),
  health: () => request<{ ollama: string }>('/models/health'),
};

// ─── Rules ────────────────────────────────────────────────────────────────────

export const rulesApi = {
  list: () => request<AgentRule[]>('/rules'),

  update: (key: string, value: string) =>
    request<AgentRule>(`/rules/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    }),

  toggle: (key: string, enabled: boolean) =>
    request<AgentRule>(`/rules/${key}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
};
