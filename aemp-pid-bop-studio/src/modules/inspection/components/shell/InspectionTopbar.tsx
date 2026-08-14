// ============================================================================
//  Topbar — replicates the reference system's 56px bar: sidebar toggle, ABRAJ
//  mark + "Equipment Master Pro" wordmark, then notification bell, dark-mode
//  toggle and the avatar chip. See docs/inspection-reference-parity.md §1.
// ============================================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../state/AuthContext';
import NotificationsSlot from '../NotificationsSlot';
import Icon from '../Icon';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function InspectionTopbar({ onToggleNav, dark, onToggleDark }: {
  onToggleNav: () => void;
  dark: boolean;
  onToggleDark: () => void;
}) {
  const { fullName, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const name = fullName || 'Account';

  return (
    <header className="insp-topbar">
      <button type="button" className="insp-iconbtn" onClick={onToggleNav}
        aria-label="Toggle navigation"><Icon name="panel-left" /></button>
      <div className="brand">
        <img src="/brand/abraj-mark.png" alt="Abraj" />
        <span className="word">Equipment Master Pro</span>
      </div>
      <div className="spacer" />
      <NotificationsSlot />
      <button type="button" className="insp-iconbtn" onClick={onToggleDark}
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-pressed={dark}><Icon name={dark ? 'sun' : 'moon'} /></button>
      <div className="insp-rel">
        <button type="button" className="insp-avatar" onClick={() => setMenu((m) => !m)}
          aria-expanded={menu} aria-haspopup="menu">
          <span className="ini" aria-hidden="true">{initials(name)}</span>
          <span className="nm">{name}</span>
        </button>
        {menu && (
          <div className="insp-popover" role="menu" style={{ minWidth: 190 }}>
            <Link className="insp-navitem" role="menuitem" to="/inspection/password"
              onClick={() => setMenu(false)}>Change password</Link>
            <Link className="insp-navitem" role="menuitem" to="/home"
              onClick={() => setMenu(false)}>All modules</Link>
            <button type="button" className="insp-navitem" role="menuitem"
              onClick={() => { setMenu(false); void signOut(); }}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
