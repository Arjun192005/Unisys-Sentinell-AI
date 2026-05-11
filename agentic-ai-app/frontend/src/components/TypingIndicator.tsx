'use client';

import { Bot } from 'lucide-react';

export default function TypingIndicator() {
  return (
    <div className="flex gap-3 px-4 py-4 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
        <Bot size={16} className="text-slate-300" />
      </div>
      <div className="bg-surface-card border border-surface-border rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse-dot"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
