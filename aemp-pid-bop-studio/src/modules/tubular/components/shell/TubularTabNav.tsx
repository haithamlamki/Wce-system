// ============================================================================
//  Tubular tab nav — port of the prototype's .tabnav: numbered .tab buttons
//  with glyph icons. Routing via NavLink (same paths as before); the three
//  extra platform tabs (Master/Transfers/Import) continue the numbering.
//  Permission gating is unchanged (visibleTabs).
// ============================================================================
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../../../state/AuthContext';
import { useTubular } from '../../state/TubularContext';
import { visibleTabs } from '../../lib/permissions';

export default function TubularTabNav() {
  const { role } = useAuth();
  const { granted } = useTubular();
  const tabs = visibleTabs(role, granted);

  return (
    <nav className="tabnav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/tubular'}
          className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <span className="ico">{t.icon}</span>
          {t.label}
          <span className="num">/{t.num}</span>
        </NavLink>
      ))}
    </nav>
  );
}
