// ============================================================================
//  Security Management → User List (guide §5.14). Admin only: create users,
//  set role, deactivate / set access expiry (vendor accounts), grant insp_*
//  permissions and assign the units each user may see.
// ============================================================================
import { useEffect, useState } from 'react';
import { useAuth } from '../../../state/AuthContext';
import { useInspection } from '../state/InspectionContext';
import { isPrivileged, INSPECTION_PERMISSIONS, type InspectionPermission } from '../lib/permissions';
import { createUser, listUsers, listUserGrants, saveInspPermissions, saveUserUnits,
  updateUserProfile, type UserAccount } from '../lib/users';
import { EmptyState } from '../InspectionModule';

const PERM_LABELS: Record<InspectionPermission, string> = {
  insp_view: 'View module',
  insp_data_entry: 'Data Entry (add / edit / delete records)',
  insp_upload: 'Data Upload (Excel import)',
  insp_approve: 'Approval',
  insp_manage_catalog: 'Manage Equipment Components',
  insp_manage_files: 'Manage files & library',
  insp_export: 'Export data',
};

export default function UsersView() {
  const { role } = useAuth();
  const { units } = useInspection();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [nu, setNu] = useState({ email: '', password: '', fullName: '' });

  // editor
  const [sel, setSel] = useState<UserAccount | null>(null);
  const [grants, setGrants] = useState<{ permissions: string[]; unitIds: string[] } | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [unitSel, setUnitSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState({ role: 'field', active: true, expiry: '' });

  const reload = () => {
    listUsers().then(setUsers).catch((e) => setErr((e as Error).message));
  };
  useEffect(reload, []);

  const openUser = async (u: UserAccount) => {
    setSel(u); setGrants(null);
    setEdit({ role: u.role, active: u.active, expiry: u.accessExpiry ?? '' });
    try {
      const g = await listUserGrants(u.id);
      setGrants(g);
      setPerms(new Set(g.permissions.filter((p) => (INSPECTION_PERMISSIONS as readonly string[]).includes(p))));
      setUnitSel(new Set(g.unitIds));
    } catch (e) { setErr((e as Error).message); }
  };

  const saveUser = async () => {
    if (!sel || !grants) return;
    setBusy(true); setErr(null);
    try {
      await updateUserProfile(sel.id, {
        role: edit.role, active: edit.active, access_expiry: edit.expiry || null,
      });
      await saveInspPermissions(sel.id, grants.permissions, [...perms]);
      await saveUserUnits(sel.id, [...unitSel]);
      alert('User saved.');
      setSel(null); reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const doCreate = async () => {
    if (!nu.email.trim() || nu.password.length < 8) {
      alert('Email and a password of at least 8 characters are required.'); return;
    }
    setBusy(true); setErr(null);
    try {
      const { needsConfirmation } = await createUser(nu.email.trim(), nu.password, nu.fullName.trim());
      alert(needsConfirmation
        ? 'User created — they must confirm their email before the first login.'
        : 'User created.');
      setNu({ email: '', password: '', fullName: '' });
      setShowCreate(false); reload();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!isPrivileged(role)) {
    return <EmptyState ico="⚿" title="Administrators only"
      desc="Security Management requires the admin or manager role." />;
  }

  const list = users.filter((u) => !q
    || u.fullName.toLowerCase().includes(q.toLowerCase())
    || u.email.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="insp-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>Security Management — Users</h2>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>
          Accounts, roles, unit access and time-limited (vendor) logins.
        </span>
        <div style={{ flex: 1 }} />
        <input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '6px 9px', background: 'var(--panel)', color: 'var(--ink)' }} />
        <button className="insp-btn primary" onClick={() => setShowCreate((v) => !v)}>+ New User</button>
      </div>

      {err && <div style={{ color: '#d33', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}

      {showCreate && (
        <div className="insp-card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Create User</h3>
          <div className="insp-form-grid">
            <div className="insp-field"><label>Email *</label>
              <input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></div>
            <div className="insp-field"><label>Initial password * (min 8 chars)</label>
              <input type="text" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></div>
            <div className="insp-field"><label>Full name</label>
              <input value={nu.fullName} onChange={(e) => setNu({ ...nu, fullName: e.target.value })} /></div>
          </div>
          <div className="insp-toolbar" style={{ marginTop: 10 }}>
            <button className="insp-btn primary" disabled={busy} onClick={doCreate}>Create</button>
            <button className="insp-btn" onClick={() => setShowCreate(false)}>Cancel</button>
            <span style={{ color: 'var(--dim)', fontSize: 11.5 }}>
              After creating, open the user below to set role, permissions and units. Share the initial
              password securely and ask them to change it after the first login.
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div className="insp-table-wrap" style={{ flex: 1 }}>
          <table className="insp-table" style={{ minWidth: 560 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Expiry</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} style={sel?.id === u.id ? { outline: '2px solid var(--accent)' } : {}}>
                  <td>{u.fullName || '—'}</td><td>{u.email}</td><td>{u.role}</td>
                  <td>{u.active
                    ? <span className="insp-rag compliant">Active</span>
                    : <span className="insp-rag overdue">Inactive</span>}</td>
                  <td>{u.accessExpiry ?? '—'}</td>
                  <td><button className="insp-btn" onClick={() => openUser(u)}>✎ Edit</button></td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--dim)' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {sel && (
          <div className="insp-card" style={{ flex: 1, minWidth: 380 }}>
            <h3 style={{ marginTop: 0 }}>Edit User — {sel.fullName || sel.email}</h3>
            {!grants && <div style={{ color: 'var(--dim)', fontSize: 12.5 }}>Loading grants…</div>}
            {grants && (<>
              <div className="insp-form-grid">
                <div className="insp-field"><label>Role</label>
                  <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                    <option value="field">field</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                  </select></div>
                <div className="insp-field"><label>Active</label>
                  <select value={edit.active ? 'yes' : 'no'}
                    onChange={(e) => setEdit({ ...edit, active: e.target.value === 'yes' })}>
                    <option value="yes">Active — can log in</option>
                    <option value="no">Inactive — blocked immediately</option>
                  </select></div>
                <div className="insp-field"><label>Access expiry (blank = permanent)</label>
                  <input type="date" value={edit.expiry}
                    onChange={(e) => setEdit({ ...edit, expiry: e.target.value })} /></div>
              </div>

              <div className="insp-field" style={{ marginTop: 12 }}>
                <label>Inspection permissions</label>
                {(INSPECTION_PERMISSIONS as readonly InspectionPermission[]).map((p) => (
                  <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, textTransform: 'none', fontWeight: 400 }}>
                    <input type="checkbox" checked={perms.has(p)}
                      onChange={() => setPerms((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; })} />
                    {PERM_LABELS[p]} <code style={{ color: 'var(--dim)' }}>{p}</code>
                  </label>
                ))}
                <span style={{ color: 'var(--dim)', fontSize: 11 }}>
                  Admin and manager roles hold every permission implicitly. Other modules' grants are preserved.
                </span>
              </div>

              <div className="insp-field" style={{ marginTop: 12 }}>
                <label>Unit access ({unitSel.size === 0 ? 'none — user sees no records' : `${unitSel.size} unit(s)`})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {units.map((u) => (
                    <button key={u.id} className="insp-btn"
                      style={unitSel.has(u.id) ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
                      onClick={() => setUnitSel((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}>
                      {u.name}
                    </button>
                  ))}
                </div>
                <span style={{ color: 'var(--dim)', fontSize: 11 }}>
                  Unit access is shared with the Tubular module (same assignment table).
                </span>
              </div>

              <div className="insp-toolbar" style={{ marginTop: 14 }}>
                <button className="insp-btn primary" disabled={busy} onClick={saveUser}>💾 Save User</button>
                <button className="insp-btn" onClick={() => setSel(null)}>Cancel</button>
              </div>
            </>)}
          </div>
        )}
      </div>
    </div>
  );
}
