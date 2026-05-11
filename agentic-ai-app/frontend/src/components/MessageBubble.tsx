'use client';

import { Message } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Bot, User, Copy, Check, ShieldX } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all opacity-0 group-hover:opacity-100 shadow-lg border border-slate-700/50"
      title="Copy code"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

// ─── SentinelAI Block Bubble ──────────────────────────────────────────────────
function SentinelBlockBubble({ message }: { message: Message }) {
  let riskScore: number | undefined;
  let riskLevel: string | undefined;
  let reason: string | undefined;
  let semanticFlags: string[] = [];
  let detectedTypes: string[] = [];
  let source: 'prompt' | 'response' = 'prompt';

  try {
    const meta = JSON.parse(message.content);
    riskScore = meta.riskScore;
    riskLevel = meta.riskLevel;
    reason = meta.reason;
    semanticFlags = meta.semanticFlags ?? [];
    detectedTypes = meta.detectedTypes ?? [];
    source = meta.source ?? 'prompt';
  } catch {
    reason = message.content;
  }

  // Risk bar color based on level
  const riskBarColor =
    riskLevel === 'CRITICAL' ? 'bg-red-500' :
    riskLevel === 'SEVERE'   ? 'bg-orange-500' :
    riskLevel === 'HIGH'     ? 'bg-yellow-500' :
    riskLevel === 'MODERATE' ? 'bg-yellow-400' : 'bg-slate-500';

  const riskTextColor =
    riskLevel === 'CRITICAL' ? 'text-red-400' :
    riskLevel === 'SEVERE'   ? 'text-orange-400' :
    riskLevel === 'HIGH'     ? 'text-yellow-400' :
    riskLevel === 'MODERATE' ? 'text-yellow-300' : 'text-slate-400';

  return (
    <div className="flex gap-3 px-4 py-4 animate-fade-in">
      {/* Shield icon avatar */}
      <div className="w-8 h-8 rounded-full bg-red-900/40 border border-red-700/50 flex items-center justify-center shrink-0 mt-0.5">
        <ShieldX size={15} className="text-red-400" />
      </div>

      {/* Block card */}
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm w-full">

        {/* Header row */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <ShieldX size={14} className="text-red-400" />
            <span className="text-red-300 font-semibold text-xs uppercase tracking-wide">
              Blocked by SentinelAI
            </span>
          </div>
          {riskScore !== undefined && riskLevel && (
            <span className={clsx('text-xs font-mono font-bold px-2 py-0.5 rounded bg-red-900/50 border border-red-800/50', riskTextColor)}>
              {riskLevel} · {riskScore}/100
            </span>
          )}
        </div>

        {/* Risk progress bar */}
        {riskScore !== undefined && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">Risk Score</span>
              <span className={clsx('font-mono font-semibold', riskTextColor)}>{riskScore}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all', riskBarColor)}
                style={{ width: `${riskScore}%` }}
              />
            </div>
          </div>
        )}

        {/* What was blocked */}
        <div className="mb-3 p-3 bg-slate-900/50 rounded-lg border border-red-900/30">
          {source === 'response' ? (
            <>
              <p className="text-red-300 text-sm font-semibold mb-1">🛡️ AI Response Blocked</p>
              <p className="text-slate-300 text-xs leading-relaxed">
                The AI generated a response, but it was intercepted and blocked by SentinelAI before reaching you. No output was delivered to protect against potential security risks.
              </p>
            </>
          ) : (
            <>
              <p className="text-red-300 text-sm font-semibold mb-1">🛡️ Your Message Blocked</p>
              <p className="text-slate-300 text-xs leading-relaxed">
                Your message was blocked by SentinelAI security gateway before being sent to the AI. No LLM processing occurred. This protects against malicious prompts and sensitive data leakage.
              </p>
            </>
          )}
        </div>

        {/* Reason */}
        {reason && (
          <div className="mb-3 p-3 bg-orange-950/20 rounded-lg border border-orange-900/30">
            <p className="text-orange-300 text-xs font-semibold mb-1">Why was this blocked?</p>
            <p className="text-slate-300 text-xs leading-relaxed italic">{reason}</p>
          </div>
        )}

        {/* Detected types */}
        {detectedTypes.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-2 font-semibold">🔍 Security Threats Detected:</p>
            <div className="flex flex-wrap gap-2">
              {detectedTypes.map((t) => (
                <span key={t} className="text-xs px-2.5 py-1 rounded-md bg-red-900/50 text-red-200 border border-red-800/50 font-medium">
                  {t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Semantic flags */}
        {semanticFlags.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-2 font-semibold">⚠️ Attack Patterns Identified:</p>
            <div className="flex flex-wrap gap-2">
              {semanticFlags.map((flag) => (
                <span key={flag} className="text-xs px-2.5 py-1 rounded-md bg-orange-900/50 text-orange-200 border border-orange-800/50 font-medium">
                  {flag.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-slate-500 text-xs mt-3 pt-3 border-t border-red-900/30 flex items-center justify-between">
          <span>🔒 Logged in SentinelAI audit trail</span>
          <span className="font-mono">{new Date(message.created_at).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main MessageBubble ───────────────────────────────────────────────────────
export default function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  // Render SentinelAI block as its own distinct bubble
  if (message.role === 'sentinel_block') {
    return <SentinelBlockBubble message={message} />;
  }

  const isUser = message.role === 'user';

  return (
    <div
      className={clsx(
        'flex gap-4 px-6 py-5 animate-fade-in',
        isUser ? 'flex-row-reverse bg-slate-800/30' : 'flex-row bg-transparent'
      )}
    >
      <div
        className={clsx(
          'w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-lg',
          isUser ? 'bg-gradient-to-br from-brand-500 to-brand-600' : 'bg-gradient-to-br from-slate-600 to-slate-700'
        )}
      >
        {isUser ? (
          <User size={18} className="text-white" />
        ) : (
          <Bot size={18} className="text-slate-100" />
        )}
      </div>

      <div
        className={clsx(
          'max-w-[75%] rounded-2xl px-5 py-4 text-base shadow-sm break-words overflow-hidden',
          isUser
            ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-tr-sm'
            : 'bg-slate-800/60 border border-slate-700/50 text-slate-100 rounded-tl-sm'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed text-[15px] break-words">{message.content}</p>
        ) : (
          <div className={clsx('prose prose-invert prose-base max-w-none break-words', isStreaming && 'typing-cursor')}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  if (!inline && match) {
                    return (
                      <div className="relative group my-3">
                        <div className="flex items-center justify-between bg-slate-900 px-4 py-2 rounded-t-xl border border-slate-700 border-b-0">
                          <span className="text-xs text-slate-400 font-mono font-semibold uppercase tracking-wider">{match[1]}</span>
                          <CopyButton text={codeString} />
                        </div>
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: '0 0 12px 12px',
                            border: '1px solid #334155',
                            borderTop: 'none',
                            fontSize: '0.875rem',
                            padding: '1rem',
                            lineHeight: '1.6',
                          }}
                          {...props}
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }
                  return (
                    <code className="bg-slate-900/80 text-brand-400 px-2 py-1 rounded text-sm font-mono border border-slate-700/50" {...props}>
                      {children}
                    </code>
                  );
                },
                p({ children }) { return <p className="mb-3 last:mb-0 leading-relaxed text-slate-200 break-words">{children}</p>; },
                ul({ children }) { return <ul className="list-disc list-inside mb-3 space-y-2 text-slate-200 break-words">{children}</ul>; },
                ol({ children }) { return <ol className="list-decimal list-inside mb-3 space-y-2 text-slate-200 break-words">{children}</ol>; },
                li({ children }) { return <li className="break-words">{children}</li>; },
                blockquote({ children }) {
                  return (
                    <blockquote className="border-l-4 border-brand-500 pl-4 text-slate-300 italic my-3 bg-slate-900/30 py-2 rounded-r">
                      {children}
                    </blockquote>
                  );
                },
                h1({ children }) { return <h1 className="text-xl font-bold mb-3 text-slate-50 break-words">{children}</h1>; },
                h2({ children }) { return <h2 className="text-lg font-semibold mb-3 text-slate-50 break-words">{children}</h2>; },
                h3({ children }) { return <h3 className="text-base font-semibold mb-2 text-slate-100 break-words">{children}</h3>; },
                strong({ children }) { return <strong className="font-semibold text-slate-50">{children}</strong>; },
                em({ children }) { return <em className="italic text-slate-200">{children}</em>; },
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-2">
                      <table className="text-xs border-collapse w-full">{children}</table>
                    </div>
                  );
                },
                th({ children }) {
                  return <th className="border border-surface-border px-2 py-1 bg-surface-hover text-left">{children}</th>;
                },
                td({ children }) {
                  return <td className="border border-surface-border px-2 py-1">{children}</td>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!isUser && message.tokens > 0 && (
          <p className="text-xs text-slate-500 mt-3 text-right font-mono">{message.tokens} tokens</p>
        )}
      </div>
    </div>
  );
}
