// ============================================================================
//  Tubular topbar — port of the prototype header: brand mark, title/subtitle,
//  tb-info meta columns, 3-button theme toggle, status pill. Necessary
//  platform controls (Modules link, notifications, account) are rendered as
//  native-styled elements so the design stays coherent.
// ============================================================================
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { getThemeMode, setThemeMode, subscribeTheme, type ThemeMode } from '../../../../lib/theme';
import { useAuth } from '../../../../state/AuthContext';
import { useTubular } from '../../state/TubularContext';
import { supabase } from '../../../../lib/supabase';
import NotificationsBell from '../NotificationsBell';

const THEME_CHOICES: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'light', label: '☀ Light' },
  { mode: 'dark', label: '☾ Dark' },
  { mode: 'auto', label: '◐ Auto' },
];

export default function TubularTopbar() {
  const { fullName, role, signOut, session } = useAuth();
  const { units } = useTubular();
  const themeMode = useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
  const [lastSync, setLastSync] = useState('—');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('tubular_submissions')
        .select('submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.submitted_at) {
        setLastSync(new Date(data.submitted_at).toLocaleString());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">A</div>
        <div className="brand-text">
          <h1>Abraj Tubular Inventory</h1>
          <div className="sub">
            Fleet Management · <span className="accent">{units.length || 29} Units</span> · Sultanate of Oman
          </div>
        </div>
      </div>
      <div className="topbar-meta">
        <div className="tb-info">
          <span className="lbl">Standard</span>
          <span className="val">API RP 7G</span>
        </div>
        <div className="tb-info">
          <span className="lbl">Last Sync</span>
          <span className="val" id="tb-last">{lastSync}</span>
        </div>
        <div className="tb-info">
          <span className="lbl">User</span>
          <span className="val">{fullName || 'Operations'}{role ? ` · ${role}` : ''}</span>
        </div>
        <div className="tb-info">
          <span className="lbl">Platform</span>
          <span className="val"><Link to="/home">⌂ Modules</Link></span>
        </div>
        <div className="theme-toggle" id="theme-toggle">
          {THEME_CHOICES.map((c) => (
            <button key={c.mode} data-theme-choice={c.mode}
              className={themeMode === c.mode ? 'active' : ''}
              onClick={() => setThemeMode(c.mode)}>
              {c.label}
            </button>
          ))}
        </div>
        <NotificationsBell />
        <div className="status-pill" title={session ? 'Connected to the cloud database' : 'Not signed in'}
          role={session ? undefined : 'button'}
          onClick={session ? () => void signOut() : undefined}
          style={session ? { cursor: 'pointer' } : undefined}>
          <span className="dot" />
          <span className="txt">{session ? 'System Online' : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
}
