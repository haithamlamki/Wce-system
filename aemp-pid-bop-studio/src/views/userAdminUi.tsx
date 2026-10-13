// Shared styles + badges for the User Management pages (UsersView,
// UserAccountView). Visual language matches AccountView / Auth.tsx.
import type { ManagedUser } from '../lib/adminUsers';
import type { Role } from '../state/AuthContext';

export function isExpired(u: Pick<ManagedUser, 'accessExpiry'>): boolean {
  return !!u.accessExpiry && u.accessExpiry < new Date().toISOString().slice(0, 10);
}

export function RoleBadge({ role, superAdmin }: { role: Role; superAdmin?: boolean }) {
  const color = superAdmin ? 'var(--accent2)' : role === 'admin' ? 'var(--accent)' : role === 'manager' ? 'var(--green)' : 'var(--dim)';
  return <span style={{ ...badge, color, borderColor: color }}>{superAdmin ? 'super admin' : role}</span>;
}

export function StatusBadge({ user }: { user: ManagedUser }) {
  const [text, color] = !user.active ? ['Inactive', 'var(--red, #d33)']
    : isExpired(user) ? ['Expired', 'var(--amber)']
    : user.mustChangePassword ? ['Temp password', 'var(--amber)']
    : ['Active', 'var(--green)'];
  return <span style={{ ...badge, color, borderColor: color }}>{text}</span>;
}

export function SuperOnly() {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ ...card, maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Super Admin only</div>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>User Management is restricted to the Super Admin account.</div>
      </div>
    </div>
  );
}

export const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow)' };
export const field: React.CSSProperties = { display: 'grid', gap: 4 };
export const lbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600 };
export const inp: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontSize: 13 };
export const btn: React.CSSProperties = { border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '7px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-block' };
export const primaryBtn: React.CSSProperties = { ...btn, background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' };
const badge: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: '1px solid', textTransform: 'uppercase', whiteSpace: 'nowrap' };
