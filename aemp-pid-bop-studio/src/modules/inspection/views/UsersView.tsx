// ============================================================================
//  Security Management → User List (guide §5.14). Admin only: create users,
//  set identity (first/last/phone/roles), role, deactivate / access expiry,
//  grant insp_* permissions and the Configure Access matrix — per unit Full
//  Access or a subset of equipment systems (reference User Edit page).
// ============================================================================
import { useEffect, useState } from 'react';
import { useAuth } from '../../../state/AuthContext';
import { useInspection } from '../state/InspectionContext';
import { isPrivileged, INSPECTION_PERMISSIONS, type InspectionPermission } from '../lib/permissions';
import { createUser, listUsers, listUserGrants, saveInspPermissions, saveUserUnitAccess,
  updateUserProfile, type UnitAccess, type UserAccount } from '../lib/users';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types';
import { EmptyState } from '../components/ui';

const PERM_LABELS: Record<InspectionPermission, string> = {
  insp_view: 'View module',
  insp_data_entry: 'Data Entry (add / edit / delete records)',
  insp_upload: 'Data Upload (Excel import)',
  insp_approve: 'Approval',
  insp_manage_catalog: 'Manage Equipment Components',
  insp_manage_files: 'Manage files & library',
  insp_export: 'Export data',
};

/** unitId → categories (null = Full Access); absence = no access to the unit. */
type AccessMap = Map<string, string[] | null>;

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
  const [grants, setGrants] = useState<{ permissions: string[]; unitAccess: UnitAccess[] } | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [access, setAccess] = useState<AccessMap>(new Map());
  const [edit, setEdit] = useState({
    role: 'field', active: true, expiry: '',
    firstName: '', lastName: '', phone: '', jobRoles: [] as string[],
  });
  const [roleInput, setRoleInput] = useState('');

  const reload = () => {
    listUsers().then(setUsers).catch((e) => setErr((e as Error).message));
  };
  useEffect(reload, []);

  const openUser = async (u: UserAccount) => {
    setSel(u); setGrants(null);
    setEdit({
      role: u.role, active: u.active, expiry: u.accessExpiry ?? '',
      firstName: u.firstName, lastName: u.lastName, phone: u.phone, jobRoles: [...u.jobRoles],
    });
    try {
      const g = await listUserGrants(u.id);
      setGrants(g);
      setPerms(new Set(g.permissions.filter((p) => (INSPECTION_PERMISSIONS as readonly string[]).includes(p))));
      setAccess(new Map(g.unitAccess.map((a) => [a.unitId, a.categories])));
    } catch (e) { setErr((e as Error).message); }
  };

  const saveUser = async () => {
    if (!sel || !grants) return;
    setBusy(true); setErr(null);
    try {
      const fullName = `${edit.firstName} ${edit.lastName}`.trim() || sel.fullName;
      await updateUserProfile(sel.id, {
        role: edit.role, active: edit.active, access_expiry: edit.expiry || null,
        first_name: edit.firstName, last_name: edit.lastName, phone: edit.phone,
        job_roles: edit.jobRoles, full_name: fullName,
      });
      await saveInspPermissions(sel.id, grants.permissions, [...perms]);
      await saveUserUnitAccess(sel.id,
        [...access.entries()].map(([unitId, categories]) => ({ unitId, categories })));
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

  // ---- Configure Access matrix helpers -------------------------------------
  const toggleUnitFull = (unitId: string) => setAccess((m) => {
    const n = new Map(m);
    if (!n.has(unitId)) n.set(unitId, null);            // no access → full access
    else if (n.get(unitId) === null) n.delete(unitId);  // full access → no access
    else n.set(unitId, null);                           // partial → full access
    return n;
  });
  const toggleUnitCategory = (unitId: string, cat: string) => setAccess((m) => {
    const n = new Map(m);
    const cur = n.get(unitId);
    const list = cur === null ? [...CATEGORY_ORDER] : [...(cur ?? [])];
    const idx = list.indexOf(cat as typeof CATEGORY_ORDER[number]);
    if (idx >= 0) list.splice(idx, 1); else list.push(cat as typeof CATEGORY_ORDER[number]);
    if (list.length === 0) n.delete(unitId);
    else if (list.length === CATEGORY_ORDER.length) n.set(unitId, null);
    else n.set(unitId, list);
    return n;
  });
  const grantAllFull = () => setAccess(new Map(units.map((u) => [u.id, null])));

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
        <span style={{ color: 'var(--i-muted)', fontSize: 12 }}>
          Accounts, roles, unit access and time-limited (vendor) logins.
        </span>
        <div style={{ flex: 1 }} />
        <input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ border: '1px solid var(--i-border)', borderRadius: 6, padding: '6px 9px', background: 'var(--i-surface)', color: 'var(--i-fg)' }} />
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
            <span style={{ color: 'var(--i-muted)', fontSize: 11.5 }}>
              After creating, open the user below to set role, permissions and units. Share the initial
              password securely and ask them to change it after the first login.
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="insp-table-wrap" style={{ flex: 1, minWidth: 480 }}>
          <table className="insp-table" style={{ minWidth: 560 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Roles</th><th>Role</th><th>Status</th><th>Expiry</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} style={sel?.id === u.id ? { outline: '2px solid var(--i-brand)' } : {}}>
                  <td>{u.fullName || '—'}</td><td>{u.email}</td><td>{u.phone || '—'}</td>
                  <td>{u.jobRoles.join(', ') || '—'}</td><td>{u.role}</td>
                  <td>{u.active
                    ? <span className="insp-rag compliant">Active</span>
                    : <span className="insp-rag overdue">Inactive</span>}</td>
                  <td>{u.accessExpiry ?? '—'}</td>
                  <td><button className="insp-btn" onClick={() => openUser(u)}>✎ Edit</button></td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--i-muted)' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {sel && (
          <div className="insp-card" style={{ flex: 1.4, minWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Edit User — {sel.fullName || sel.email}</h3>
            {!grants && <div style={{ color: 'var(--i-muted)', fontSize: 12.5 }}>Loading grants…</div>}
            {grants && (<>
              <div className="insp-form-grid">
                <div className="insp-field"><label>First Name</label>
                  <input value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></div>
                <div className="insp-field"><label>Last Name</label>
                  <input value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></div>
                <div className="insp-field"><label>Phone Number</label>
                  <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
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
                <label>Roles (job titles)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {edit.jobRoles.map((r) => (
                    <span key={r} className="insp-rag unknown">{r}
                      <button style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}
                        onClick={() => setEdit({ ...edit, jobRoles: edit.jobRoles.filter((x) => x !== r) })}>×</button>
                    </span>
                  ))}
                  <input placeholder="e.g. Drilling Superintendent — Enter to add" value={roleInput}
                    style={{ minWidth: 220 }}
                    onChange={(e) => setRoleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && roleInput.trim()) {
                        if (!edit.jobRoles.includes(roleInput.trim())) {
                          setEdit({ ...edit, jobRoles: [...edit.jobRoles, roleInput.trim()] });
                        }
                        setRoleInput('');
                      }
                    }} />
                </div>
              </div>

              <div className="insp-field" style={{ marginTop: 12 }}>
                <label>Inspection permissions</label>
                {(INSPECTION_PERMISSIONS as readonly InspectionPermission[]).map((p) => (
                  <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, textTransform: 'none', fontWeight: 400 }}>
                    <input type="checkbox" checked={perms.has(p)}
                      onChange={() => setPerms((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; })} />
                    {PERM_LABELS[p]} <code style={{ color: 'var(--i-muted)' }}>{p}</code>
                  </label>
                ))}
                <span style={{ color: 'var(--i-muted)', fontSize: 11 }}>
                  Admin and manager roles hold every permission implicitly. Other modules' grants are preserved.
                </span>
              </div>

              <div className="insp-field" style={{ marginTop: 12 }}>
                <label>
                  Configure Access ({access.size === 0 ? 'no units — user sees no records' : `${access.size} unit(s)`})
                </label>
                <div className="insp-toolbar" style={{ marginBottom: 6 }}>
                  <button className="insp-btn" onClick={grantAllFull}>Full Access (all units)</button>
                  <button className="insp-btn" onClick={() => setAccess(new Map())}>Clear all</button>
                </div>
                <div className="insp-access-grid">
                  {units.map((u) => {
                    const cur = access.get(u.id);
                    const hasUnit = access.has(u.id);
                    return (
                      <div key={u.id} className="insp-card" style={{ padding: 8 }}>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, fontWeight: 700, textTransform: 'none' }}>
                          <input type="checkbox" checked={hasUnit && cur === null}
                            onChange={() => toggleUnitFull(u.id)} />
                          {u.name} <span style={{ color: 'var(--i-muted)', fontWeight: 400 }}>Full Access</span>
                        </label>
                        <div style={{ marginTop: 4, display: 'grid', gap: 2 }}>
                          {CATEGORY_ORDER.map((c) => (
                            <label key={c} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, textTransform: 'none', fontWeight: 400 }}>
                              <input type="checkbox"
                                checked={hasUnit && (cur === null || (cur ?? []).includes(c))}
                                onChange={() => toggleUnitCategory(u.id, c)} />
                              {CATEGORY_LABELS[c]}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <span style={{ color: 'var(--i-muted)', fontSize: 11 }}>
                  Unit access is shared with the Tubular module (same assignment table); the system
                  checkboxes scope which equipment categories this user sees inside each unit.
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
