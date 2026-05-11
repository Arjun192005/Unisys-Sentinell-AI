'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Message, Session, AuthUser } from '@/types';
import { sessionsApi, chatApi, authApi, setAuthToken } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import ChatInput from '@/components/ChatInput';
import SettingsPanel from '@/components/SettingsPanel';
import LoginScreen from '@/components/LoginScreen';
import { AlertCircle, X } from 'lucide-react';

const DEFAULT_MODEL = process.env.NEXT_PUBLIC_DEFAULT_MODEL || 'qwen2.5-coder:1.5b';

export default function HomePage() {
  // ─── Auth state ───────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // ─── Chat state ───────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [currentModel, setCurrentModel] = useState(DEFAULT_MODEL);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStreamRef = useRef<(() => void) | null>(null);
  const accumulatedRef = useRef<string>('');
  const activeSessionRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSessionId;
  }, [activeSessionId]);

  // ─── Check existing session on mount ─────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem('auth_token');
    if (stored) {
      setAuthToken(stored);
      authApi.me().then((res) => {
        if (res.data) {
          setCurrentUser(res.data);
        } else {
          sessionStorage.removeItem('auth_token');
          setAuthToken(null);
        }
        setAuthChecked(true);
      });
    } else {
      setAuthChecked(true);
    }
  }, []);

  function handleLogin(user: AuthUser, token: string) {
    setCurrentUser(user);
    sessionStorage.setItem('auth_token', token);
    loadSessions();
  }

  function handleLogout() {
    authApi.logout();
    setAuthToken(null);
    sessionStorage.removeItem('auth_token');
    setCurrentUser(null);
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
  }

  // ─── Load sessions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentUser) loadSessions();
  }, [currentUser]);

  async function loadSessions() {
    const res = await sessionsApi.list();
    if (res.data) setSessions(res.data);
  }

  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    loadMessages(activeSessionId);
  }, [activeSessionId]);

  async function loadMessages(sessionId: string) {
    const res = await sessionsApi.messages(sessionId);
    if (res.data) setMessages(res.data);
  }

  // ─── Inject SentinelAI block as an inline chat message ───────────────────
  function injectSentinelBlock(
    sessionId: string,
    riskScore: number | undefined,
    riskLevel: string | undefined,
    reason: string,
    semanticFlags: string[],
    detectedTypes: string[],
    source: 'prompt' | 'response'
  ) {
    const blockMsg: Message = {
      id: `sentinel-${Date.now()}`,
      session_id: sessionId,
      role: 'sentinel_block',
      content: JSON.stringify({ riskScore, riskLevel, reason, semanticFlags, detectedTypes, source }),
      tokens: 0,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, blockMsg]);
  }

  // ─── Finalize streaming ───────────────────────────────────────────────────
  const finalizeStreamRef = useRef<(sessionId: string) => void>(() => {});

  function finalizeStream(sessionId: string) {
    setIsStreaming(false);
    setStreamingContent('');
    const partial = accumulatedRef.current;
    accumulatedRef.current = '';

    if (partial.trim()) {
      const partialMsg: Message = {
        id: `partial-${Date.now()}`,
        session_id: sessionId,
        role: 'assistant',
        content: partial,
        tokens: 0,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) =>
        [...prev.filter((m) => !m.id.startsWith('temp-') && !m.id.startsWith('partial-')), partialMsg]
      );
    }
    loadMessages(sessionId);
    loadSessions();
  }

  finalizeStreamRef.current = finalizeStream;

  // ─── Session management ───────────────────────────────────────────────────
  async function handleNewSession() {
    const res = await sessionsApi.create(currentModel);
    if (res.data) {
      setSessions((prev) => [res.data!, ...prev]);
      setActiveSessionId(res.data.id);
      setMessages([]);
    }
  }

  async function handleDeleteSession(id: string) {
    await sessionsApi.delete(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
  }

  function handleRenameSession(id: string, title: string) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  // ─── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (userMessage: string) => {
      console.log('%c🚀 SENDING MESSAGE', 'background: #4f6ef7; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
      console.log('Message:', userMessage);
      console.log('Session ID:', activeSessionRef.current);
      console.log('Model:', currentModel);
      
      setError(null);
      accumulatedRef.current = '';

      let sessionId = activeSessionRef.current;
      if (!sessionId) {
        const res = await sessionsApi.create(currentModel);
        if (!res.data) { setError('Failed to create session'); return; }
        sessionId = res.data.id;
        setSessions((prev) => [res.data!, ...prev]);
        setActiveSessionId(sessionId);
        activeSessionRef.current = sessionId;
        console.log('✅ New session created:', sessionId);
      }

      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          session_id: sessionId!,
          role: 'user',
          content: userMessage,
          tokens: 0,
          created_at: new Date().toISOString(),
        } as Message,
      ]);

      setIsStreaming(true);
      setStreamingContent('');

      const currentSessionId = sessionId;

      const stop = chatApi.stream(
        userMessage,
        (event) => {
          if (event.type === 'session' && event.session_id) {
            console.log('%c📋 SESSION EVENT', 'background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
            console.log('Session ID:', event.session_id);
            
            // Log SentinelAI prompt scan results
            if ((event as any).sentinel_prompt) {
              const promptScan = (event as any).sentinel_prompt;
              console.log('%c🛡️ SENTINELAI PROMPT SCAN', 'background: #f59e0b; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
              console.log('Status:', promptScan.status);
              console.log('Risk Score:', promptScan.riskScore + '/100');
              console.log('Was Tokenized:', promptScan.wasTokenized);
              console.log('Detected Types:', promptScan.detectedTypes);
              
              // Show original vs masked prompt
              if (promptScan.originalPrompt && promptScan.maskedPrompt) {
                console.log('\n%c📝 PROMPT COMPARISON', 'background: #8b5cf6; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
                console.log('%c❌ Original (what you typed):', 'color: #ef4444; font-weight: bold;');
                console.log(promptScan.originalPrompt);
                console.log('\n%c✅ Masked (sent to LLM):', 'color: #10b981; font-weight: bold;');
                console.log(promptScan.maskedPrompt);
                
                if (promptScan.wasTokenized) {
                  console.log('\n%c🔒 PII DETECTED & MASKED', 'background: #8b5cf6; color: white; padding: 4px 8px; border-radius: 4px;');
                  console.log('Your sensitive data was replaced with tokens before sending to the LLM');
                  console.log('The LLM never sees your real:', promptScan.detectedTypes.join(', '));
                }
              }
            }
            
            if (event.session_id !== currentSessionId) {
              setActiveSessionId(event.session_id);
              activeSessionRef.current = event.session_id;
            }
          } else if (event.type === 'chunk' && event.content) {
            accumulatedRef.current += event.content;
            setStreamingContent(accumulatedRef.current);
          } else if (event.type === 'done') {
            console.log('%c✅ RESPONSE COMPLETE', 'background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
            console.log('Message ID:', (event as any).message_id);
            console.log('Tokens:', (event as any).tokens);
            
            // Log SentinelAI response scan results
            if ((event as any).sentinel_response) {
              const responseScan = (event as any).sentinel_response;
              console.log('%c🛡️ SENTINELAI RESPONSE SCAN', 'background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
              console.log('Status:', responseScan.status);
              console.log('Risk Score:', responseScan.riskScore + '/100');
              console.log('✅ Response is SAFE - delivered to you');
            }
            
            finalizeStreamRef.current(activeSessionRef.current ?? currentSessionId);
          } else if (event.type === 'response_blocked') {
            console.log('%c🚫 RESPONSE BLOCKED BY SENTINELAI', 'background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
            console.log('Error:', event.error);
            
            if (event.sentinel) {
              console.log('%c🛡️ SENTINELAI RESPONSE SCAN', 'background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
              console.log('Status:', event.sentinel.status);
              console.log('Risk Score:', event.sentinel.riskScore + '/100');
              console.log('Risk Level:', event.sentinel.riskLevel);
              console.log('Detected Types:', event.sentinel.detectedTypes);
              console.log('Explanation:', event.sentinel.explanation);
              console.log('Semantic Flags:', event.sentinel.semanticFlags);
              console.log('❌ AI response was dangerous - blocked before reaching you');
            }
            
            // LLM response blocked — stop streaming, keep user msg, show block bubble
            setIsStreaming(false);
            setStreamingContent('');
            accumulatedRef.current = '';
            const sid = activeSessionRef.current ?? currentSessionId;
            // Replace temp user message with a real one (keep it visible)
            setMessages((prev) => prev.map((m) =>
              m.id === tempId ? { ...m, id: `user-blocked-${Date.now()}` } : m
            ));
            injectSentinelBlock(
              sid,
              event.sentinel?.riskScore,
              event.sentinel?.riskLevel,
              event.error ?? 'AI response blocked by SentinelAI security gateway',
              event.sentinel?.semanticFlags ?? [],
              event.sentinel?.detectedTypes ?? [],
              'response'
            );
            // Don't call loadMessages — it would wipe the block bubble
            loadSessions();
          } else if (event.type === 'error') {
            console.log('%c❌ ERROR EVENT', 'background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
            console.log('Error:', event.error);
            
            setIsStreaming(false);
            setStreamingContent('');
            accumulatedRef.current = '';
            if (event.sentinel) {
              console.log('%c🚫 PROMPT BLOCKED BY SENTINELAI', 'background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
              console.log('%c🛡️ SENTINELAI PROMPT SCAN', 'background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;');
              console.log('Status:', event.sentinel.status);
              console.log('Risk Score:', event.sentinel.riskScore + '/100');
              console.log('Risk Level:', event.sentinel.riskLevel);
              console.log('Detected Types:', event.sentinel.detectedTypes);
              console.log('Explanation:', event.sentinel.explanation);
              console.log('Semantic Flags:', event.sentinel.semanticFlags);
              console.log('❌ Your message was blocked - never sent to LLM');
              
              const sid = activeSessionRef.current ?? currentSessionId;
              // Keep the user message visible, inject block bubble below it
              setMessages((prev) => prev.map((m) =>
                m.id === tempId ? { ...m, id: `user-blocked-${Date.now()}` } : m
              ));
              injectSentinelBlock(
                sid,
                event.sentinel.riskScore,
                event.sentinel.riskLevel,
                event.error ?? 'Message blocked by SentinelAI security gateway',
                event.sentinel.semanticFlags ?? [],
                event.sentinel.detectedTypes ?? [],
                'prompt'
              );
              // Don't call loadMessages — it would wipe the block bubble
              loadSessions();
            } else {
              // Non-sentinel error — finalize normally
              setError(event.error ?? 'Streaming error');
              finalizeStreamRef.current(activeSessionRef.current ?? currentSessionId);
            }
          }
        },
        sessionId,
        currentModel
      );

      stopStreamRef.current = stop;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentModel]
  );

  function handleStop() {
    stopStreamRef.current?.();
    stopStreamRef.current = null;
    const sessionId = activeSessionRef.current;
    if (sessionId) {
      finalizeStreamRef.current(sessionId);
    } else {
      setIsStreaming(false);
      setStreamingContent('');
      accumulatedRef.current = '';
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onOpenSettings={() => setShowSettings(true)}
        currentModel={currentModel}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {/* General error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-900/30 border-b border-red-800/50 text-red-300 text-sm">
            <AlertCircle size={14} />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X size={14} /></button>
          </div>
        )}

        <ChatWindow
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
          sessionId={activeSessionId}
          onSuggestionClick={handleSend}
        />

        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          disabled={false}
        />
      </main>

      {showSettings && (
        <SettingsPanel
          currentModel={currentModel}
          onModelChange={setCurrentModel}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
