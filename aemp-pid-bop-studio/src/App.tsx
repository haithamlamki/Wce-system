import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ProjectProvider, useProject } from './state/ProjectContext';
import { AuthProvider, useAuth } from './state/AuthContext';
import { AccountChip, LoginScreen } from './components/Auth';
import { OnboardModal, ProjectChip } from './components/Onboarding';
import AssistantPanel from './components/AssistantPanel';
import CloudPanel from './components/CloudPanel';
import FileMenu from './components/FileMenu';
import PidFullView from './views/PidFullView';
import BopSchemeView from './views/BopSchemeView';
import RegisterView from './views/RegisterView';
import AccountView from './views/AccountView';
import DashboardView from './views/DashboardView';
import HelpView from './views/HelpView';

type ThemeMode = 'auto' | 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === 'auto'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}

const TABS = [
  { to: '/full', label: 'P&ID Full' },
  { to: '/bop', label: 'BOP Scheme' },
  { to: '/register', label: 'Equipment Sheet' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/account', label: 'Account' },
  { to: '/help', label: 'Help' },
];

function ModeToggle() {
  const { mode, setMode } = useProject();
  const { role } = useAuth();
  // FR-6: Field-role users cannot enter Admin edit. Offline/admin/manager may.
  const adminLocked = role === 'field';
  useEffect(() => { if (adminLocked && mode === 'admin') setMode('field'); }, [adminLocked, mode, setMode]);
  return (
    <div style={{ display: 'flex', background: 'var(--sunk)', border: '1px solid var(--line2)', borderRadius: 9, padding: 3, fontFamily: 'var(--disp)' }}>
      {(['admin', 'field'] as const).map((m) => {
        const locked = m === 'admin' && adminLocked;
        return (
          <button key={m} disabled={locked} onClick={() => !locked && setMode(m)}
            title={locked ? 'Field role cannot edit the master' : ''}
            style={{ border: 0, background: mode === m ? (m === 'admin' ? 'var(--accent2)' : 'var(--green)') : 'transparent', color: mode === m ? '#fff' : 'var(--dim)', padding: '6px 13px', borderRadius: 6, fontWeight: 600, fontSize: 12.5, cursor: locked ? 'not-allowed' : 'pointer', textTransform: 'capitalize', opacity: locked ? 0.4 : 1 }}>
            {m}
          </button>
        );
      })}
    </div>
  );
}

const hdrBtn: React.CSSProperties = { border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '7px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' };

/** Draft / Final badge so end users can see they're viewing a published sheet. */
function StatusChip() {
  const { project } = useProject();
  const st = project.status;
  if (!st) return null;
  const pub = st === 'published';
  return (
    <span title={pub && project.publishedAt ? `Published ${new Date(project.publishedAt).toLocaleString()}` : 'Draft (not yet published)'}
      style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line2)', background: pub ? 'color-mix(in srgb, var(--green) 16%, var(--panel))' : 'var(--sunk)', color: pub ? 'var(--green)' : 'var(--dim)' }}>
      {pub ? '● FINAL' : 'DRAFT'}
    </span>
  );
}

function CloudButton({ onOpen }: { onOpen: () => void }) {
  const { cloudEnabled } = useProject();
  if (!cloudEnabled) return null;
  return <button style={hdrBtn} onClick={onOpen} title="Cloud projects (Supabase)">☁ Cloud</button>;
}

function Shell({ theme, cycleTheme }: { theme: ThemeMode; cycleTheme: () => void }) {
  const [aiOpen, setAiOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  return (
    <>
      <header className="appbar">
        <div className="brand">
          <img className="logo" src="/brand/abraj-mark.png" alt="Abraj" />
          <div>
            <h1>P&amp;ID · BOP Studio</h1>
            <div className="sub">Abraj Energy Services</div>
          </div>
        </div>
        <ProjectChip />
        <StatusChip />
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <button style={{ ...hdrBtn, borderColor: aiOpen ? 'var(--accent)' : 'var(--line2)', color: aiOpen ? 'var(--accent)' : 'var(--ink)' }} onClick={() => setAiOpen((v) => !v)} title="AI assistant (preview)">✦ AI</button>
        <CloudButton onOpen={() => setCloudOpen(true)} />
        <FileMenu />
        <ModeToggle />
        <button className="tabs" onClick={cycleTheme} title={`Theme: ${theme}`} style={{ cursor: 'pointer' }}>
          <a>Theme: {theme}</a>
        </button>
        <AccountChip />
      </header>

      <main className="viewport">
        <Routes>
          <Route path="/" element={<Navigate to="/full" replace />} />
          <Route path="/full" element={<PidFullView />} />
          <Route path="/bop" element={<BopSchemeView />} />
          <Route path="/register" element={<RegisterView />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/account" element={<AccountView />} />
          <Route path="/help" element={<HelpView />} />
        </Routes>
      </main>
      <AssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      <CloudPanel open={cloudOpen} onClose={() => setCloudOpen(false)} />
      <OnboardModal />
    </>
  );
}

function Gate({ theme, cycleTheme }: { theme: ThemeMode; cycleTheme: () => void }) {
  const { enabled, loading, session } = useAuth();
  const [skipped, setSkipped] = useState(false);

  if (enabled && loading) {
    return <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--faint)' }}>Loading…</div>;
  }
  if (enabled && !session && !skipped) {
    return <LoginScreen onSkip={() => setSkipped(true)} />;
  }
  return (
    <ProjectProvider>
      <Shell theme={theme} cycleTheme={cycleTheme} />
    </ProjectProvider>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>('auto');

  useEffect(() => {
    applyTheme(theme);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => theme === 'auto' && applyTheme('auto');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const cycleTheme = () =>
    setTheme((t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'));

  return (
    <AuthProvider>
      <Gate theme={theme} cycleTheme={cycleTheme} />
    </AuthProvider>
  );
}
