import React, { useState } from 'react';
import { Settings as SettingsIcon, Database, Server, Key, ShieldCheck, Check } from 'lucide-react';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';

interface SettingsPageProps {
  onRefreshProbes: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onRefreshProbes }) => {
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(apiUrl);
    setSavedNotice(true);
    onRefreshProbes();
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Configuration Header */}
      <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <SettingsIcon className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-bold text-slate-900">
            Phase 1 Platform Environment Configuration
          </h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Runtime parameters, connection strings, and security boundaries. Values correspond to <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">backend/app/core/config.py</code> and <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">.env</code>.
        </p>
      </div>

      {/* API Endpoint Setting */}
      <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            FastAPI Backend Service Target
          </h3>
        </div>

        <form onSubmit={handleSaveUrl} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Backend Base URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://localhost:8000"
                className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors flex items-center gap-1.5"
              >
                {savedNotice ? <Check className="w-3.5 h-3.5 text-teal-400" /> : null}
                <span>{savedNotice ? 'Saved & Polled' : 'Save & Reconnect'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Default is <code className="font-mono text-slate-700">http://localhost:8000</code> when running locally or via Docker Compose.
            </p>
          </div>
        </form>
      </div>

      {/* Database Pool Configuration (Read-only specification) */}
      <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            PostgreSQL Connection Pool Specification
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Database Engine</span>
            <span className="font-semibold text-slate-800">PostgreSQL 16 (psycopg2)</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Pool Size</span>
            <span className="font-semibold text-slate-800">20 Connections</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Max Overflow</span>
            <span className="font-semibold text-slate-800">10 Connections</span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Connection Pre-Ping</span>
            <span className="font-semibold text-teal-700">Enabled (pool_pre_ping=True)</span>
          </div>
        </div>
      </div>

      {/* Idempotency Defaults (Phase 3 Specification) */}
      <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Idempotency &amp; Concurrency Guarantees
          </h3>
        </div>

        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            In Phase 1, the <code className="font-mono text-slate-700">payments</code> table enforces a database-level <code className="font-mono text-slate-700">UNIQUE</code> constraint on <code className="font-mono text-slate-700">idempotency_key</code>.
          </p>
          <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1">
            <div className="font-medium text-slate-800">Planned Phase 3 Enhancements:</div>
            <ul className="list-disc list-inside text-slate-500 space-y-0.5">
              <li>Scoped multi-tenant unique index: <code className="font-mono text-slate-700">(client_id, idempotency_key)</code></li>
              <li>Cryptographic request fingerprinting: <code className="font-mono text-slate-700">SHA-256(payload)</code></li>
              <li>Key retention TTL: 86,400 seconds (24 hours)</li>
              <li>Distributed lock acquisition window: 5,000 milliseconds</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
