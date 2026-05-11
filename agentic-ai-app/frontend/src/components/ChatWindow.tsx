'use client';

import { useEffect, useRef } from 'react';
import { Message } from '@/types';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import { Bot, Code2 } from 'lucide-react';

interface ChatWindowProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  sessionId: string | null;
  onSuggestionClick?: (prompt: string) => void;
}

const SUGGESTIONS = [
  'Explain this code and suggest improvements',
  'Write a REST API with Express and TypeScript',
  'Debug this error: TypeError: Cannot read properties of undefined',
  'Review my code for security vulnerabilities',
];

export default function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  sessionId,
  onSuggestionClick,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Welcome screen — no session selected yet
  if (!sessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 border-2 border-brand-400/30 flex items-center justify-center mb-6 shadow-2xl shadow-brand-500/20">
          <Code2 size={40} className="text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100 mb-3">Agentic AI Coding Assistant</h2>
        <p className="text-slate-400 text-base max-w-lg leading-relaxed mb-8">
          A local, privacy-first coding agent powered by Ollama. Ask anything — architecture,
          debugging, code review, or implementation.
        </p>
        {/* FIX: suggestion cards are now clickable buttons */}
        <div className="mt-2 grid grid-cols-2 gap-4 max-w-2xl w-full">
          {SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSuggestionClick?.(prompt)}
              className="p-4 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl text-sm text-slate-300 text-left hover:border-brand-500 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:shadow-brand-500/10"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Empty session
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-gradient-to-b from-slate-900 to-slate-950">
        <Bot size={48} className="text-slate-600 mb-4" />
        <p className="text-slate-400 text-base mb-6">Send a message to start the conversation.</p>
        <div className="mt-2 grid grid-cols-2 gap-4 max-w-2xl w-full">
          {SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSuggestionClick?.(prompt)}
              className="p-4 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl text-sm text-slate-300 text-left hover:border-brand-500 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:shadow-brand-500/10"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const streamingMessage: Message | null =
    isStreaming && streamingContent
      ? {
          id: 'streaming',
          session_id: sessionId,
          role: 'assistant',
          content: streamingContent,
          tokens: 0,
          created_at: new Date().toISOString(),
        }
      : null;

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-5xl mx-auto py-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {streamingMessage && (
          <MessageBubble message={streamingMessage} isStreaming={true} />
        )}

        {isStreaming && !streamingContent && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
