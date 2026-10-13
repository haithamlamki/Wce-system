// Per-user account page (/users/:id) — Super Admin only. Edit name, role,
// active state and access expiry, and set a new password for the user.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, type Role } from '../state/AuthContext';
import { listManagedUsers, resetManagedPassword, ROLES, updateManagedUser, validatePassword,
  type ManagedUser } from '../lib/adminUsers';
import { btn, card, field, inp, lbl, primaryBtn, RoleBadge, StatusBadge, SuperOnly } from './userAdminUi';

export default function UserAccountView() {
  const { id } = useParams<{ id: string }>();
  const { isSuperAdmin, user: me, updatePassword } = useAuth();
  const [u, setU] = useState<ManagedUser | null | undefined>(undefined); // undefined = loading, null = not found
  const [err, setErr] = useState<string | null>(null);

  const [edit, setEdit] = useState({ fullName: '', role: 'field' as Role, active: true, expiry: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [pw, setPw] = useState({ password: '', confirm: '', mustChange: true });
  const [resetting, setResetting] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const found = (await listManagedUsers()).find((x) => x.id === id) ?? null;
      setU(found);
      if (found) setEdit({ fullName: found.fullName, role: found.role, active: found.active, expiry: found.accessExpiry ?? '' });
    } catch (e) { setErr((e as Error).message); setU(null); }
  }, [id]);
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  if (!isSuperAdmin) return <SuperOnly />;
  if (u === undefined) return <div className="placeholder">Loading user…</div>;
  if (u === null) {
    return (
      <div style={{ padding: 24 }}>
        <Link to="/users" style={{ color: 'var(--accent)' }}>← All users</Link>
        <div style={{ marginTop: 12, color: 'var(--amber)' }}>{err ?? 'User not found.'}</div>
      </div>
    );
  }

  const self = u.id === me?.id;
  // A super admin's own role / status / expiry are locked (also enforced by profiles_guard).
  const locked = self && u.isSuperAdmin;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveMsg(null);
    try {
      await updateManagedUser(u.id, locked
        ? { full_name: edit.fullName.trim() }
        : { full_name: edit.fullName.trim(), role: edit.role, active: edit.active, access_expiry: edit.expiry || null });
      setSaveMsg('Saved ✓');
      await load();
    } catch (e2) { setSaveMsg((e2 as Error).message); }
    finally { setSaving(false); }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validatePassword(pw.password, pw.confirm);
    if (invalid) { setPwMsg(invalid); return; }
    if (!self && !confirm(`Set a new password for ${u.email}? They will be signed out of every device.`)) return;
    setResetting(true); setPwMsg(null);
    try {
      // Your own password goes through the normal auth flow so your session stays valid.
      if (self) await updatePassword(pw.password);
      else await resetManagedPassword(u.id, pw.password, pw.mustChange);
      setPw({ password: '', confirm: '', mustChange: true });
      setPwMsg(self ? 'Your password was changed ✓'
        : `Password reset ✓ — share it with the user securely${pw.mustChange ? '; they must change it at next sign-in' : ''}.`);
      await load();
    } catch (e2) { setPwMsg((e2 as Error).message); }
    finally { setResetting(false); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <Link to="/users" style={{ color: 'var(--accent)', fontSize: 13 }}>← All users</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 18px' }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22 }}>{u.fullName || u.email}{self ? ' (you)' : ''}</div>
        <RoleBadge role={u.role} superAdmin={u.isSuperAdmin} />
        <StatusBadge user={u} />
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <form style={{ ...card, flex: '1 1 340px', display: 'grid', gap: 12 }} onSubmit={save}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16 }}>Account</div>
          <label style={field}><span style={lbl}>Email</span>
            <input style={{ ...inp, opacity: 0.7 }} value={u.email} readOnly /></label>
          <label style={field}><span style={lbl}>Full name</span>
            <input style={inp} value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></label>
          <label style={field}><span style={lbl}>Role</span>
            <select style={inp} disabled={locked} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></label>
          <label style={field}><span style={lbl}>Status</span>
            <select style={inp} disabled={locked} value={edit.active ? 'yes' : 'no'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'yes' })}>
              <option value="yes">Active — can sign in</option>
              <option value="no">Inactive — blocked</option>
            </select></label>
          <label style={field}><span style={lbl}>Access expiry (blank = permanent)</span>
            <input style={inp} type="date" disabled={locked} value={edit.expiry} onChange={(e) => setEdit({ ...edit, expiry: e.target.value })} /></label>
          {locked && <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>You can’t change your own role, status or expiry as Super Admin.</div>}
          {saveMsg && <div style={{ fontSize: 12.5, color: saveMsg.startsWith('Saved') ? 'var(--green)' : 'var(--amber)' }}>{saveMsg}</div>}
          <div><button style={primaryBtn} disabled={saving} type="submit">{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>

        <form style={{ ...card, flex: '1 1 300px', display: 'grid', gap: 12 }} onSubmit={reset}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16 }}>Reset password</div>
          <label style={field}><span style={lbl}>New password (min 8)</span>
            <input style={inp} type="text" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></label>
          <label style={field}><span style={lbl}>Confirm password</span>
            <input style={inp} type="text" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          {!self && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
              <input type="checkbox" checked={pw.mustChange} onChange={(e) => setPw({ ...pw, mustChange: e.target.checked })} />
              Require a new password at next sign-in
            </label>
          )}
          {pwMsg && <div style={{ fontSize: 12.5, color: pwMsg.includes('✓') ? 'var(--green)' : 'var(--amber)' }}>{pwMsg}</div>}
          <div><button style={btn} disabled={resetting} type="submit">{resetting ? 'Resetting…' : 'Set new password'}</button></div>
        </form>

        <div style={{ ...card, flex: '1 1 240px', fontSize: 12.5, display: 'grid', gap: 8 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16 }}>Activity</div>
          <Row k="Created" v={u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'} />
          <Row k="Last sign-in" v={u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : 'Never'} />
          <Row k="Rig" v={u.rig || '—'} />
          <Row k="Temp password" v={u.mustChangePassword ? 'Yes — must change' : 'No'} />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
      <span style={{ color: 'var(--faint)' }}>{k}</span><span>{v}</span>
    </div>
  );
}
