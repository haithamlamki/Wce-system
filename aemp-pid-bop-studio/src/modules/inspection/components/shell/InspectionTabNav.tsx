import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/inspection', label: 'Dashboard', end: true },
  { to: '/inspection/records', label: 'Equipment Inspection', end: false },
  { to: '/inspection/catalog', label: 'Equipment Components', end: false },
  { to: '/inspection/metrics', label: 'Inspection Metrics', end: false },
  { to: '/inspection/library', label: 'Library', end: false },
];

export default function InspectionTabNav() {
  return (
    <nav className="insp-tabnav">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
