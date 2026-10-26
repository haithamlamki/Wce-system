// ============================================================================
//  Sidebar navigation — replicates the reference system's sectioned sidebar
//  (MAIN / EQUIPMENT / ADMINISTRATION / ORGANIZATION), 256px, active item
//  tinted with the primary colour. See docs/inspection-reference-parity.md §1.
// ============================================================================
import { NavLink } from 'react-router-dom';
import type { InspectionPermission } from '../../lib/permissions';
import { useInspection } from '../../state/InspectionContext';
import Icon from '../Icon';
import type { IconName } from '../Icon';

interface Item { to: string; label: string; ico: IconName; perm: InspectionPermission; end?: boolean }

// Each item shows only to holders of the reference permission behind it.
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Main',
    items: [{ to: '/inspection', label: 'Dashboard', ico: 'dashboard', perm: 'dashboard:view', end: true }],
  },
  {
    title: 'Equipment',
    items: [
      { to: '/inspection/equipment', label: 'Equipment', ico: 'equipment', perm: 'equipment:view' },
      { to: '/inspection/records', label: 'Inspections', ico: 'inspections', perm: 'inspection:view' },
      { to: '/inspection/approvals', label: 'Approvals', ico: 'approvals', perm: 'inspection:approve' },
      { to: '/inspection/equipment-categories', label: 'Equipment Categories', ico: 'categories', perm: 'equipment-category:view' },
      { to: '/inspection/specifications', label: 'Specifications', ico: 'specifications', perm: 'specification:view' },
      { to: '/inspection/calibration', label: 'Calibration Register', ico: 'calibration', perm: 'calibration:view' },
      { to: '/inspection/pid', label: 'P&ID', ico: 'pid', perm: 'pid:view' },
      { to: '/inspection/library', label: 'Library', ico: 'library', perm: 'library:view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/inspection/users', label: 'Users', ico: 'users', perm: 'user:view' },
      { to: '/inspection/roles', label: 'Roles', ico: 'roles', perm: 'role:view' },
      { to: '/inspection/permissions', label: 'Permissions', ico: 'permissions', perm: 'role:view' },
      { to: '/inspection/scope-templates', label: 'Scope Templates', ico: 'scope-templates', perm: 'user:manage-access' },
      { to: '/inspection/admin/inspection-frequencies', label: 'Inspection Frequencies', ico: 'frequencies', perm: 'inspection-frequency:view' },
      { to: '/inspection/admin/audit-logs', label: 'Audit Logs', ico: 'audit-logs', perm: 'audit:view' },
      { to: '/inspection/admin/logs', label: 'App Logs', ico: 'app-logs', perm: 'log:view' },
      { to: '/inspection/release-log', label: 'Release Log', ico: 'release-log', perm: 'release-log:view' },
    ],
  },
  {
    title: 'Organization',
    items: [
      { to: '/inspection/companies', label: 'Companies', ico: 'companies', perm: 'company:view' },
      { to: '/inspection/vendor-companies', label: 'Vendor Companies', ico: 'vendor-companies', perm: 'vendor-company:view' },
      { to: '/inspection/units', label: 'Units', ico: 'units', perm: 'unit:view' },
    ],
  },
];

export default function InspectionSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useInspection();
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((it) => can(it.perm)) }))
    .filter((s) => s.items.length > 0);

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
