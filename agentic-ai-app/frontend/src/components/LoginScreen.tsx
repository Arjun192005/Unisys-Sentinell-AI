'use client';

import { useState, useEffect } from 'react';
import { authApi, setAuthToken } from '@/lib/api';
import { AuthUser, DemoUser } from '@/types';
import { Bot, Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface LoginScreenProps {
  onLogin: (user: AuthUser, token: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:    'text-red-400 bg-red-400/10 border-red-400/30',
  EMPLOYEE: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  INTERN:   'text-green-400 bg-green-400/10 border-green-400/30',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN:    'Full access — permissive policy',
  EMPLOYEE: 'Standard access — moderate restrictions',
  INTERN:   'Restricted access — strict policy',
};

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);

  useEffect(() => {
    authApi.demoUsers().then((res) => {
      if (res.data) setDemoUsers(res.data);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await authApi.login(email, password);
    setLoading(false);

    if (!res.success || !res.data) {
      setError(res.error ?? 'Login failed');
      return;
    }

    setAuthToken(res.data.token);
    onLogin(res.data.user, res.data.token);
  }

  function fillDemo(user: DemoUser) {
    setEmail(user.email);
    const pwMap: Record<string, string> = {
      ADMIN:    'AgentAdmin@2026',
      EMPLOYEE: 'AgentEmp@2026',
      INTERN:   'AgentIntern@2026',
    };
    setPassword(pwMap[user.role] ?? '');
    setError('');
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-600/30 flex items-center justify-center mx-auto mb-4">
            <Bot size={32} className="text-brand-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Agentic AI</h1>
          <p className="text-slate-500 text-sm mt-1">Coding Assistant · Secured by SentinelAI</p>
        </div>

        {/* Login form */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 mb-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 pr-10 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Demo accounts */}
        {demoUsers.length > 0 && (
          <div className="bg-surface-card border border-surface-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={12} className="text-slate-500" />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Demo Accounts</span>
            </div>
            <div className="space-y-2">
              {demoUsers.map((user) => (
                <button
                  key={user.email}
                  onClick={() => fillDemo(user)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg border border-surface-border hover:border-slate-600 bg-surface hover:bg-surface-hover transition-colors text-left"
                >
                  <div>
                    <p className="text-xs text-slate-300 font-medium">{user.email}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{ROLE_DESCRIPTIONS[user.role]}</p>
                  </div>
                  <span className={clsx(
                    'text-xs font-mono px-2 py-0.5 rounded border',
                    ROLE_COLORS[user.role]
                  )}>
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-3 text-center">
              Click a demo account to auto-fill credentials
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
