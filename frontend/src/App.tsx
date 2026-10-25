/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewPage } from './pages/OverviewPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ChaosLabPage } from './pages/ChaosLabPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { ProcessorRoutingPage } from './pages/ProcessorRoutingPage';
import { SettingsPage } from './pages/SettingsPage';
import { NavigationTab, HealthCheckResult, ReadinessCheckResult } from './types';
import { checkBackendHealth, checkBackendReadiness } from './services/api';

const TAB_FROM_HASH: Record<string, NavigationTab> = {
  overview: 'overview',
  transactions: 'transactions',
  'chaos-lab': 'chaos-lab',
  monitoring: 'monitoring',
  'processor-routing': 'processor-routing',
  settings: 'settings',
};

const getTabFromHash = (): NavigationTab => {
  const hash = window.location.hash.replace('#', '').trim();
  return TAB_FROM_HASH[hash] ?? 'overview';
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>(() => getTabFromHash());
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const [health, setHealth] = useState<HealthCheckResult>({
    status: 'checking',
  });

  const [readiness, setReadiness] = useState<ReadinessCheckResult>({
    status: 'checking',
  });

  const pollProbes = useCallback(async () => {
    setIsChecking(true);
    try {
      const [healthRes, readinessRes] = await Promise.all([
        checkBackendHealth(),
        checkBackendReadiness(),
      ]);
      setHealth(healthRes);
      setReadiness(readinessRes);
    } catch {
      setHealth({ status: 'unreachable', error: 'Connection failed' });
      setReadiness({ status: 'unreachable', error: 'Connection failed' });
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const nextTab = getTabFromHash();
      setCurrentTab((prev) => (prev === nextTab ? prev : nextTab));
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    window.location.hash = currentTab;
  }, [currentTab]);

  useEffect(() => {
    pollProbes();
  }, [pollProbes]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          currentTab={currentTab}
          health={health}
          readiness={readiness}
          isChecking={isChecking}
          onRefreshProbes={pollProbes}
        />

        <main className="flex-1 overflow-y-auto p-8">
          {currentTab === 'overview' && (
            <OverviewPage
              health={health}
              readiness={readiness}
              isChecking={isChecking}
              onRefreshProbes={pollProbes}
            />
          )}

          {currentTab === 'transactions' && <TransactionsPage />}

          {currentTab === 'chaos-lab' && <ChaosLabPage />}

          {currentTab === 'monitoring' && <MonitoringPage />}

          {currentTab === 'processor-routing' && <ProcessorRoutingPage />}

          {currentTab === 'settings' && (
            <SettingsPage onRefreshProbes={pollProbes} />
          )}
        </main>
      </div>
    </div>
  );
}
