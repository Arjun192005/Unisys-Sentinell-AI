'use client';

import { useEffect, useState } from 'react';
import { AgentRule, OllamaModel } from '@/types';
import { rulesApi, modelsApi } from '@/lib/api';
import { X, RefreshCw, Cpu, Shield } from 'lucide-react';
import clsx from 'clsx';

interface SettingsPanelProps {
  currentModel: string;
  onModelChange: (model: string) => void;
  onClose: () => void;
}

export default function SettingsPanel({ currentModel, onModelChange, onClose }: SettingsPanelProps) {
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    const [rulesRes, modelsRes, healthRes] = await Promise.all([
      rulesApi.list(),
      modelsApi.list(),
      modelsApi.health(),
    ]);
    if (rulesRes.data) setRules(rulesRes.data);
    if (modelsRes.data) setModels(modelsRes.data);
    setOllamaStatus(healthRes.data?.ollama === 'online' ? 'online' : 'offline');
    setLoading(false);
  }

  async function toggleRule(key: string, currentEnabled: number) {
    const newEnabled = currentEnabled === 1 ? false : true;
    await rulesApi.toggle(key, newEnabled);
    setRules((prev) =>
      prev.map((r) => (r.rule_key === key ? { ...r, enabled: newEnabled ? 1 : 0 } : r))
    );
  }

  async function saveRule(key: string) {
    if (!editValue.trim()) return;
    await rulesApi.update(key, editValue.trim());
    setRules((prev) =>
      prev.map((r) => (r.rule_key === key ? { ...r, rule_value: editValue.trim() } : r))
    );
    setEditingRule(null);
  }

  function formatBytes(bytes: number) {
    const gb = bytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-base font-semibold text-slate-100">Settings & Agent Rules</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Ollama Status */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Cpu size={12} />
              Ollama Status
            </h3>
            <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-surface-border">
              <div
                className={clsx(
                  'w-2 h-2 rounded-full',
                  ollamaStatus === 'online' ? 'bg-green-400' : ollamaStatus === 'offline' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
                )}
              />
              <span className="text-sm text-slate-300 capitalize">{ollamaStatus}</span>
              <button
                onClick={loadData}
                className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </section>

          {/* Model Selection */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Active Model
            </h3>
            {loading ? (
              <div className="text-sm text-slate-500">Loading models…</div>
            ) : models.length === 0 ? (
              <div className="text-sm text-slate-500 p-3 bg-surface rounded-lg border border-surface-border">
                No models found. Run{' '}
                <code className="text-brand-500 font-mono text-xs">
                  ollama pull qwen2.5-coder:7b
                </code>{' '}
                to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {models.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => onModelChange(m.name)}
                    className={clsx(
                      'w-full flex items-center justify-between p-3 rounded-lg border text-sm transition-colors text-left',
                      currentModel === m.name
                        ? 'border-brand-500 bg-brand-500/10 text-slate-100'
                        : 'border-surface-border bg-surface hover:border-slate-600 text-slate-300'
                    )}
                  >
                    <span className="font-mono text-xs">{m.name}</span>
                    <span className="text-xs text-slate-500">{formatBytes(m.size)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Agent Rules */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Shield size={12} />
              Agent Rules
            </h3>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.rule_key}
                  className="p-3 bg-surface rounded-lg border border-surface-border"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-semibold text-brand-500">
                          {rule.rule_key}
                        </span>
                        {rule.description && (
                          <span className="text-xs text-slate-500">{rule.description}</span>
                        )}
                      </div>

                      {editingRule === rule.rule_key ? (
                        <div className="space-y-2">
                          <textarea
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            rows={3}
                            className="w-full bg-surface-border text-slate-200 text-xs px-2 py-1.5 rounded outline-none resize-none border border-slate-600 focus:border-brand-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveRule(rule.rule_key)}
                              className="text-xs px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRule(null)}
                              className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className="text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
                          onClick={() => {
                            setEditingRule(rule.rule_key);
                            setEditValue(rule.rule_value);
                          }}
                          title="Click to edit"
                        >
                          {rule.rule_value}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => toggleRule(rule.rule_key, rule.enabled)}
                      className={clsx(
                        'shrink-0 w-8 h-4 rounded-full transition-colors relative mt-1',
                        rule.enabled === 1 ? 'bg-brand-600' : 'bg-slate-700'
                      )}
                      title={rule.enabled === 1 ? 'Disable rule' : 'Enable rule'}
                    >
                      <span
                        className={clsx(
                          'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                          rule.enabled === 1 ? 'translate-x-4' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
