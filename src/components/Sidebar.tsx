import React from 'react';
import { LayoutDashboard, Receipt, Flame, Activity, GitFork, Settings as SettingsIcon, ShieldCheck, X } from 'lucide-react';
import { NavigationTab } from '../types';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'chaos-lab', label: 'Chaos Lab', icon: Flame },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
  { id: 'processor-routing', label: 'Processor Routing', icon: GitFork },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, isOpen, onClose }) => {
  return (
    <>
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-slate-950 text-slate-300 shadow-[0_10px_40px_rgba(15,23,42,0.24)] transition-transform duration-200 lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-300">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight text-white">PaySure</div>
                <div className="-mt-0.5 text-[11px] text-slate-400">Reliability Platform</div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Navigation</div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    onClose();
                  }}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500/30',
                    isActive
                      ? 'bg-slate-800 text-white shadow-[inset_0_0_0_1px_rgba(45,212,191,0.2)]'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                  ].join(' ')}
                >
                  <Icon className={['h-4 w-4 shrink-0', isActive ? 'text-teal-300' : 'text-slate-400'].join(' ')} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-800/80 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Platform state</span>
              <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-300">Live</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
