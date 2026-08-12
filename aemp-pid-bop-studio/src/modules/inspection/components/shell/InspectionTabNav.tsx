import { NavLink } from 'react-router-dom';
import { useAuth } from '../../../../state/AuthContext';
import { isPrivileged } from '../../lib/permissions';

const TABS = [
  { to: '/inspection', label: 'Dashboard', end: true },
  { to: '/inspection/records', label: 'Equipment Inspection', end: false },
  { to: '/inspection/catalog', label: 'Equipment Components', end: false },
  { to: '/inspection/metrics', label: 'Inspection Metrics', end: false },
  { to: '/inspection/library', label: 'Library', end: false },
];

export default function InspectionTabNav() {
  const { role } = useAuth();
  const tabs = isPrivileged(role)
    ? [...TABS, { to: '/inspection/users', label: 'Security Management', end: false }]
    : TABS;
  return (
    <nav className="insp-tabnav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
