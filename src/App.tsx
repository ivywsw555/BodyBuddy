import { useEffect, useState } from 'react';
import { useStore } from './store';
import { TodayPage } from './pages/Today';
import { PlanPage } from './pages/Plan';
import { PoolPage } from './pages/Pool';
import { ProgressPage } from './pages/Progress';
import { LibraryPage } from './pages/Library';
import { SettingsPage } from './pages/Settings';

const TABS = [
  { id: 'today', icon: '🔥', label: '今天', Page: TodayPage },
  { id: 'plan', icon: '📋', label: '计划', Page: PlanPage },
  { id: 'pool', icon: '💰', label: '押金', Page: PoolPage },
  { id: 'progress', icon: '📈', label: '进度', Page: ProgressPage },
  { id: 'library', icon: '📚', label: '动作库', Page: LibraryPage },
  { id: 'settings', icon: '⚙️', label: '设置', Page: SettingsPage },
] as const;

type TabId = (typeof TABS)[number]['id'];

function tabFromHash(): TabId {
  const h = location.hash.slice(1);
  return (TABS.find((t) => t.id === h)?.id ?? 'today') as TabId;
}

export function App() {
  const { state, update, saveError } = useStore();
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const pendingCount = (memberId: string) => {
    const supervised = new Set(state.members.filter((m) => m.supervisorId === memberId).map((m) => m.id));
    return (
      state.logs.filter((l) => supervised.has(l.memberId) && l.status === 'pending').length +
      state.leaves.filter((l) => supervised.has(l.memberId) && l.status === 'pending').length
    );
  };

  const Page = TABS.find((t) => t.id === tab)!.Page;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BodyBuddy</span>
        <div className="who">
          {state.members.map((m) => {
            const n = pendingCount(m.id);
            return (
              <button
                key={m.id}
                className={`who-btn ${m.id === state.activeMemberId ? 'active' : ''}`}
                onClick={() => update((s) => void (s.activeMemberId = m.id))}
              >
                {m.avatar} {m.name}
                {n > 0 && <span className="badge">{n}</span>}
              </button>
            );
          })}
        </div>
      </header>
      {saveError && <div className="save-error">{saveError}</div>}
      <main>
        <Page />
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={`tab ${tab === t.id ? 'active' : ''}`}>
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
