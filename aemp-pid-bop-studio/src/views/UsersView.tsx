// User Management (migration 0038) — Super Admin only. Lists every account,
// creates new users with a chosen role and initial password, and links each
// row to its account page (/users/:id) for editing and password resets.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type Role } from '../state/AuthContext';
import { createManagedUser, listManagedUsers, ROLES, validateNewUser, type ManagedUser } from '../lib/adminUsers';
import { btn, card, field, inp, lbl, primaryBtn, RoleBadge, StatusBadge, SuperOnly } from './userAdminUi';

const EMPTY = { email: '', fullName: '', password: '', role: 'field' as Role, mustChange: true };

export default function UsersView() {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [nu, setNu] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const reload = () => {
    listManagedUsers().then(setUsers).catch((e) => setErr((e as Error).message));
  };
  useEffect(() => { if (isSuperAdmin) reload(); }, [isSuperAdmin]);

  if (!isSuperAdmin) return <SuperOnly />;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateNewUser(nu.email, nu.password);
    if (invalid) { setFormErr(invalid); return; }
    setBusy(true); setFormErr(null);
    try {
      const id = await createManagedUser(nu);
      setNu(EMPTY); setShowCreate(false);
      navigate(`/users/${id}`);
    } catch (e2) { setFormErr((e2 as Error).message); }
    finally { setBusy(false); }
  };

  const needle = q.trim().toLowerCase();
  const list = (users ?? []).filter((u) => !needle
    || u.fullName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    || u.role.includes(needle));

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22 }}>User Management</div>
          <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>Create accounts, assign roles and reset passwords.</div>
        </div>
        <div style={{ flex: 1 }} />
        <input style={{ ...inp, width: 240 }} placeholder="Search name, email or role…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button style={primaryBtn} onClick={() => { setShowCreate((v) => !v); setFormErr(null); }}>
          {showCreate ? 'Close' : '+ New User'}
        </button>
      </div>

      {showCreate && (
        <form style={{ ...card, marginBottom: 16 }} onSubmit={create}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Create user</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={field}><span style={lbl}>Email *</span>
              <input style={inp} type="email" required value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></label>
            <label style={field}><span style={lbl}>Full name</span>
              <input style={inp} value={nu.fullName} onChange={(e) => setNu({ ...nu, fullName: e.target.value })} /></label>
            <label style={field}><span style={lbl}>Role *</span>
              <select style={inp} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select></label>
            <label style={field}><span style={lbl}>Initial password * (min 8)</span>
              <input style={inp} type="text" autoComplete="new-password" required value={nu.password}
                onChange={(e) => setNu({ ...nu, password: e.target.value })} /></label>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, marginTop: 12 }}>
            <input type="checkbox" checked={nu.mustChange} onChange={(e) => setNu({ ...nu, mustChange: e.target.checked })} />
            Require a new password at first sign-in
          </label>
          {formErr && <div style={{ color: 'var(--amber)', fontSize: 12.5, marginTop: 10 }}>{formErr}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={primaryBtn} disabled={busy} type="submit">{busy ? 'Creating…' : 'Create user'}</button>
            <button style={btn} type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      {err && <div style={{ color: 'var(--amber)', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {['Name', 'Email', 'Role', 'Status', 'Last sign-in', ''].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {users === null && !err && <tr><td colSpan={6} style={{ ...td, color: 'var(--faint)' }}>Loading…</td></tr>}
            {users !== null && list.length === 0 && <tr><td colSpan={6} style={{ ...td, color: 'var(--faint)' }}>No users found.</td></tr>}
            {list.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={td}><Link to={`/users/${u.id}`} style={{ color: 'var(--ink)', fontWeight: 600 }}>{u.fullName || '—'}</Link></td>
                <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 12 }}>{u.email}</td>
                <td style={td}><RoleBadge role={u.role} superAdmin={u.isSuperAdmin} /></td>
                <td style={td}><StatusBadge user={u} /></td>
                <td style={{ ...td, color: 'var(--dim)', fontSize: 12 }}>{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : 'Never'}</td>
                <td style={{ ...td, textAlign: 'right' }}><Link to={`/users/${u.id}`} style={{ ...btn, textDecoration: 'none' }}>Manage ▸</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };
