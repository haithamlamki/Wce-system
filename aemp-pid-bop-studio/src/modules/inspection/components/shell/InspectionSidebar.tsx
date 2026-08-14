// ============================================================================
//  Sidebar navigation — replicates the reference system's sectioned sidebar
//  (MAIN / EQUIPMENT / ADMINISTRATION / ORGANIZATION), 256px, active item
//  tinted with the primary colour. See docs/inspection-reference-parity.md §1.
// ============================================================================
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../../../state/AuthContext';
import { isPrivileged } from '../../lib/permissions';
import Icon from '../Icon';
import type { IconName } from '../Icon';

interface Item { to: string; label: string; ico: IconName; end?: boolean }

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Main',
    items: [{ to: '/inspection', label: 'Dashboard', ico: 'dashboard', end: true }],
  },
  {
    title: 'Equipment',
    items: [
      { to: '/inspection/equipment', label: 'Equipment', ico: 'equipment' },
      { to: '/inspection/records', label: 'Inspections', ico: 'inspections' },
      { to: '/inspection/approvals', label: 'Approvals', ico: 'approvals' },
      { to: '/inspection/shared-documents', label: 'Shared Documents', ico: 'shared-documents' },
      { to: '/inspection/equipment-categories', label: 'Equipment Categories', ico: 'categories' },
      { to: '/inspection/pid', label: 'P&ID', ico: 'pid' },
      { to: '/inspection/library', label: 'Library', ico: 'library' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/inspection/admin/inspection-frequencies', label: 'Inspection Frequencies', ico: 'frequencies' },
    ],
  },
  {
    title: 'Organization',
    items: [
      { to: '/inspection/companies', label: 'Companies', ico: 'companies' },
      { to: '/inspection/units', label: 'Units', ico: 'units' },
    ],
  },
];

export default function InspectionSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useAuth();

  const sections = SECTIONS.map((s) => {
    // The reference exposes user administration only to accounts holding the
    // permission; here the equivalent gate is the privileged role.
    if (s.title === 'Administration' && isPrivileged(role)) {
      return {
        ...s,
        items: [...s.items,
          { to: '/inspection/users', label: 'Security Management', ico: 'approvals' as IconName }],
      };
    }
    return s;
  });

  return (
    <aside className="insp-sidebar">
      <nav aria-label="Inspection sections">
        {sections.map((s) => (
          <div className="insp-navsec" key={s.title}>
            <h6>{s.title}</h6>
            {s.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
                className={({ isActive }) => `insp-navitem${isActive ? ' active' : ''}`}>
                <span className="ico"><Icon name={it.ico} /></span>
                {it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
