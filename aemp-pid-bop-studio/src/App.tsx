import { Suspense, lazy, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { applyTheme, getThemeMode, setThemeMode, subscribeTheme } from './lib/theme';
import { ProjectProvider, useProject } from './state/ProjectContext';
import { AuthProvider, useAuth } from './state/AuthContext';
import { AccountChip, LoginScreen } from './components/Auth';
import { OnboardModal, ProjectChip } from './components/Onboarding';
import AssistantPanel from './components/AssistantPanel';
import ProjectManager from './components/ProjectManager';
import FileMenu from './components/FileMenu';
import PidFullView from './views/PidFullView';
import BopSchemeView from './views/BopSchemeView';
import RegisterView from './views/RegisterView';
import AccountView from './views/AccountView';
import DashboardView from './views/DashboardView';
import HelpView from './views/HelpView';
import HomeView from './views/HomeView';

// Tubular Fleet Management is code-split so the WCE bundle is unaffected.
const TubularModule = lazy(() => import('./modules/tubular/TubularModule'));

type ThemeMode = 'auto' | 'light' | 'dark';

const TABS = [
  { to: '/home', label: '⌂ Modules' },
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

function ProjectsButton({ onOpen }: { onOpen: () => void }) {
  const { cloudEnabled } = useProject();
  if (!cloudEnabled) return null;
  return <button style={hdrBtn} onClick={onOpen} title="Project Manager — units, diagrams & templates in one place">▤ Projects</button>;
}

function Shell({ theme, cycleTheme }: { theme: ThemeMode; cycleTheme: () => void }) {
  const [aiOpen, setAiOpen] = useState(false);
  const [pmOpen, setPmOpen] = useState(false);
  const { pathname } = useLocation();
  // The Tubular module renders its own full prototype shell (topbar + tabnav),
  // so the WCE appbar is hidden entirely there. On /home a minimal header
  // remains; WCE deep links (/full, /bop, …) are unchanged.
  const inTubular = pathname.startsWith('/tubular');
  const inWce = !inTubular && pathname !== '/home';
  return (
    <>
      {!inTubular && (
      <header className="appbar">
        <div className="brand">
          <img className="logo" src="/brand/abraj-mark.png" alt="Abraj" />
          <div>
            <h1>P&amp;ID · BOP Studio</h1>
            <div className="sub">Abraj Energy Services</div>
          </div>
        </div>
        {inWce && <ProjectChip />}
        {inWce && <StatusChip />}
        <nav className="tabs">
          {(inWce ? TABS : TABS.slice(0, 1)).map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        {inWce && <button style={{ ...hdrBtn, borderColor: aiOpen ? 'var(--accent)' : 'var(--line2)', color: aiOpen ? 'var(--accent)' : 'var(--ink)' }} onClick={() => setAiOpen((v) => !v)} title="AI assistant (preview)">✦ AI</button>}
        {inWce && <ProjectsButton onOpen={() => setPmOpen(true)} />}
        {inWce && <FileMenu />}
        {inWce && <ModeToggle />}
        <button className="tabs" onClick={cycleTheme} title={`Theme: ${theme}`} style={{ cursor: 'pointer' }}>
          <a>Theme: {theme}</a>
        </button>
        <AccountChip />
      </header>
      )}

      <main className="viewport">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomeView />} />
          <Route
            path="/tubular/*"
            element={
              <Suspense fallback={<div className="placeholder">Loading Tubular Fleet Management…</div>}>
                <TubularModule />
              </Suspense>
            }
          />
          <Route path="/full" element={<PidFullView />} />
          <Route path="/bop" element={<BopSchemeView />} />
          <Route path="/register" element={<RegisterView />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/account" element={<AccountView />} />
          <Route path="/help" element={<HelpView />} />
        </Routes>
      </main>
      <AssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      <ProjectManager open={pmOpen} onClose={() => setPmOpen(false)} />
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
  // Keying the provider on the user id force-remounts ALL project state when the
  // effective user changes (e.g. a different admin signs in on a shared browser),
  // so one admin's in-memory project/cloudId/version can never linger into
  // another admin's session and get saved to the wrong record.
  return (
    <ProjectProvider key={session?.user?.id ?? 'anon'}>
      <Shell theme={theme} cycleTheme={cycleTheme} />
    </ProjectProvider>
  );
}

export default function App() {
  // Theme is owned by the shared store (src/lib/theme.ts) so the Tubular
  // module's 3-button toggle and this header's cycle button stay in sync.
  const theme = useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);

  useEffect(() => { applyTheme(); }, []);

  const cycleTheme = () =>
    setThemeMode(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto');

  return (
    <AuthProvider>
      <Gate theme={theme} cycleTheme={cycleTheme} />
    </AuthProvider>
  );
}
