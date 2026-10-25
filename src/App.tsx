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

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const [health, setHealth] = useState<HealthCheckResult>({ status: 'checking' });
  const [readiness, setReadiness] = useState<ReadinessCheckResult>({ status: 'checking' });

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
    pollProbes();
  }, [pollProbes]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentTab]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close mobile navigation"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          currentTab={currentTab}
          health={health}
          readiness={readiness}
          isChecking={isChecking}
          onRefreshProbes={pollProbes}
          onToggleSidebar={() => setIsSidebarOpen((value) => !value)}
        />

        <main className="flex-1 overflow-y-auto bg-slate-100/60 p-4 md:p-6 xl:p-8">
          <div className="mx-auto max-w-7xl">
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
            {currentTab === 'settings' && <SettingsPage onRefreshProbes={pollProbes} />}
          </div>
        </main>
      </div>
    </div>
  );
}
