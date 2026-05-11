'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import clsx from 'clsx';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  return (
    <div className="border-t border-slate-700/50 bg-gradient-to-b from-slate-900/50 to-slate-900 p-5 shadow-2xl">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end gap-3 bg-slate-800/80 border-2 border-slate-700/50 rounded-2xl px-5 py-4 focus-within:border-brand-500 focus-within:shadow-lg focus-within:shadow-brand-500/20 transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'AI is responding…' : 'Ask anything about code… (Enter to send, Shift+Enter for newline)'}
            disabled={isStreaming || disabled}
            rows={1}
            className={clsx(
              'flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-[15px] resize-none outline-none leading-relaxed',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={{ maxHeight: '200px' }}
          />

          {isStreaming ? (
            <button
              onClick={onStop}
              className="w-10 h-10 rounded-xl bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-all shadow-lg hover:shadow-xl shrink-0"
              title="Stop generation"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim() || disabled}
              className={clsx(
                'w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all shadow-lg shrink-0',
                value.trim() && !disabled
                  ? 'bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 hover:shadow-xl hover:shadow-brand-500/30'
                  : 'bg-slate-700 opacity-50 cursor-not-allowed'
              )}
              title="Send message"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 text-center mt-3 font-medium">
          🔒 Powered by Ollama · Running locally · No data leaves your machine
        </p>
      </div>
    </div>
  );
}
