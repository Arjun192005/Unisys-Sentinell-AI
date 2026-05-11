import { OllamaChatRequest, OllamaChatResponse, OllamaMessage, OllamaModel } from '../types';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

const DEFAULT_OPTIONS: OllamaChatRequest['options'] = {
  temperature: 0.3,
  top_p: 0.9,
  num_ctx: 4096,
  num_predict: 1024,
};

// FIX: 120s timeout on non-streaming, 180s on streaming (model can be slow to start)
const CHAT_TIMEOUT_MS = 120_000;
const STREAM_TIMEOUT_MS = 180_000;

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { models: OllamaModel[] };
  return data.models ?? [];
}

export async function pullModel(modelName: string): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: false }),
    // No timeout — pull can take minutes
  });
  if (!res.ok) throw new Error(`Ollama pull failed: ${res.status} ${res.statusText}`);
}

/**
 * Non-streaming chat.
 * FIX: AbortSignal timeout so a hung Ollama doesn't block forever.
 */
export async function chat(
  model: string,
  messages: OllamaMessage[],
  options?: OllamaChatRequest['options']
): Promise<OllamaChatResponse> {
  const payload: OllamaChatRequest = {
    model,
    messages,
    stream: false,
    options: { ...DEFAULT_OPTIONS, ...options },
  };

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama chat failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as OllamaChatResponse;
}

/**
 * Streaming chat.
 * FIX: AbortSignal timeout + returns empty string gracefully if stream ends with no content.
 */
export async function chatStream(
  model: string,
  messages: OllamaMessage[],
  onChunk: (chunk: string, done: boolean) => void,
  options?: OllamaChatRequest['options']
): Promise<{ totalTokens: number }> {
  const payload: OllamaChatRequest = {
    model,
    messages,
    stream: true,
    options: { ...DEFAULT_OPTIONS, ...options },
  };

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama stream failed: ${res.status} ${errText}`);
  }

  if (!res.body) throw new Error('No response body from Ollama');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let totalTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as OllamaChatResponse;
          if (parsed.message?.content) {
            onChunk(parsed.message.content, parsed.done);
          }
          if (parsed.done && parsed.eval_count) {
            totalTokens = parsed.eval_count;
          }
        } catch {
          // Partial JSON line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { totalTokens };
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
