'use client';

import { useState } from 'react';
import { Session, AuthUser } from '@/types';
import { sessionsApi } from '@/lib/api';
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  X,
  Bot,
  Settings,
  Cpu,
  LogOut,
  Shield,
} from 'lucide-react';
import clsx from 'clsx';

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onOpenSettings: () => void;
  currentModel: string;
  currentUser: AuthUser;
  onLogout: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:    'text-red-400',
  EMPLOYEE: 'text-blue-400',
  INTERN:   'text-green-400',
};

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onOpenSettings,
  currentModel,
  currentUser,
  onLogout,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  function startEdit(session: Session) {
    setEditingId(session.id);
    setEditValue(session.title);
  }

  async function commitEdit(id: string) {
    if (editValue.trim()) {
      await sessionsApi.rename(id, editValue.trim());
      onRenameSession(id, editValue.trim());
    }
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <aside className="w-64 flex flex-col bg-surface-card border-r border-surface-border h-full shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-surface-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">Agentic AI</h1>
            <p className="text-xs text-slate-500">Coding Assistant</p>
          </div>
        </div>

        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Session
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 ? (
          <p className="text-xs text-slate-500 text-center mt-8 px-4">
            No sessions yet. Start a new one!
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={clsx(
                'group flex items-center gap-2 mx-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                activeSessionId === session.id
                  ? 'bg-surface-hover text-slate-100'
                  : 'text-slate-400 hover:bg-surface-hover hover:text-slate-200'
              )}
              onClick={() => onSelectSession(session.id)}
            >
              <MessageSquare size={14} className="shrink-0 text-slate-500" />

              {editingId === session.id ? (
                <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(session.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="flex-1 bg-surface-border text-slate-100 text-xs px-2 py-1 rounded outline-none min-w-0"
                  />
                  <button onClick={() => commitEdit(session.id)} className="text-green-400 hover:text-green-300">
                    <Check size={12} />
                  </button>
                  <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-300">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-xs truncate">{session.title}</span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(session); }}
                      className="text-slate-500 hover:text-slate-300 p-0.5"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                      className="text-slate-500 hover:text-red-400 p-0.5"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-surface-border space-y-1">
        {/* User info */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded mb-1">
          <Shield size={12} className={ROLE_COLORS[currentUser.role] ?? 'text-slate-500'} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-300 truncate">{currentUser.email}</p>
            <p className={clsx('text-xs font-mono', ROLE_COLORS[currentUser.role] ?? 'text-slate-500')}>
              {currentUser.role}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-500">
          <Cpu size={12} />
          <span className="truncate">{currentModel}</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-hover text-xs transition-colors"
        >
          <Settings size={14} />
          Settings & Rules
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-surface-hover text-xs transition-colors"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
