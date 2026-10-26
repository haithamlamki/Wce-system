// ============================================================================
//  One role (reference `/roles/:id`, `/new`, `/:id/edit`): name, description
//  and the permission matrix — one row per resource, one box per action.
//  Name edits need role:update; the matrix needs role:manage-permissions.
// ============================================================================
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, EmptyState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { fetchRoles, saveRole, type InspRole } from '../lib/accessApi';
import { INSPECTION_PERMISSIONS, PERMISSION_RESOURCES, permissionsOf } from '../lib/permissions';

export default function RoleView() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { can } = useInspection();
  const editing = !id || pathname.endsWith('/edit');
  const back = () => navigate('/inspection/roles');

  const [role, setRole] = useState<InspRole | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchRoles().then((all) => {
      const r = all.find((x) => x.id === id);
      if (!r) { setError('Role not found.'); return; }
      setRole(r); setName(r.name); setDescription(r.description); setKeys(new Set(r.permissions));
    }).catch((e: Error) => setError(e.message));
  }, [id]);

  if (!can('role:view')) return <EmptyState ico="⚿" title="No Access" desc="You need the role:view permission." />;
  if (id && !role) {
    return error ? <EmptyState ico="⚠" title="Failed to load role" desc={error} />
      : <EmptyState ico="◌" title="Loading" desc="Loading the role…" />;
  }
  const canEditInfo = id ? can('role:update') : can('role:create');
  const canEditKeys = editing && (id ? can('role:manage-permissions') : can('role:create'));
  if (editing && !canEditInfo && !canEditKeys) {
    return <EmptyState ico="⚿" title="No Access" desc="You cannot edit roles." />;
  }

  const toggle = (k: string) => setKeys((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleResource = (r: string) => setKeys((s) => {
    const n = new Set(s); const all = permissionsOf(r);
    const on = all.every((k) => n.has(k));
    for (const k of all) { if (on) n.delete(k); else n.add(k); }
    return n;
  });

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setBusy(true); setError(null);
    try {
      const rid = await saveRole({ id, name, description }, canEditKeys ? [...keys] : null, role?.permissions ?? []);
      navigate(`/inspection/roles/${rid}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title={role?.name ?? 'New role'} subtitle="Roles"
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={back}>Back</button>
            {!editing && (can('role:update') || can('role:manage-permissions')) && (
              <button type="button" className="insp-btn primary" onClick={() => navigate(`/inspection/roles/${id}/edit`)}>Edit</button>
            )}
          </>
        )} />

      <div className="insp-card" style={{ marginBottom: 12 }}>
        {editing && canEditInfo ? (
          <div className="insp-form-grid">
            <div className="insp-field"><label htmlFor="role-name">Name</label>
              <input id="role-name" className="insp-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></div>
            <div className="insp-field"><label htmlFor="role-desc">Description</label>
              <input id="role-desc" className="insp-input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>
        ) : (
          <dl style={{ display: 'grid', gridTemplateColumns: '10rem 1fr', rowGap: 8, margin: 0 }}>
            <dt style={{ color: 'var(--i-muted)' }}>Name</dt>
            <dd style={{ margin: 0 }}>{name} {role?.isSystemRole && <Badge tone="info">System</Badge>}</dd>
            <dt style={{ color: 'var(--i-muted)' }}>Description</dt><dd style={{ margin: 0 }}>{description || '—'}</dd>
            <dt style={{ color: 'var(--i-muted)' }}>Users</dt><dd style={{ margin: 0 }}>{role?.userCount ?? 0}</dd>
          </dl>
        )}
      </div>

      <div className="insp-card">
        <h3 style={{ marginTop: 0 }}>Permissions <span style={{ color: 'var(--i-muted)', fontWeight: 400, fontSize: 13 }}>
          {keys.size} of {INSPECTION_PERMISSIONS.length}</span></h3>
        <table className="insp-table">
          <thead><tr><th style={{ width: 200 }}>Resource</th><th>Actions</th></tr></thead>
          <tbody>
            {PERMISSION_RESOURCES.map((r) => {
              const all = permissionsOf(r);
              return (
                <tr key={r}>
                  <td>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
                      {canEditKeys && <input type="checkbox" checked={all.every((k) => keys.has(k))}
                        onChange={() => toggleResource(r)} aria-label={`All ${r} actions`} />}
                      {r}
                    </label>
                  </td>
                  <td style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                    {all.map((k) => {
                      const action = k.slice(r.length + 1);
                      return canEditKeys ? (
                        <label key={k} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}>
                          <input type="checkbox" checked={keys.has(k)} onChange={() => toggle(k)} />{action}
                        </label>
                      ) : (
                        <Badge key={k} tone={keys.has(k) ? 'success' : 'neutral'}>{keys.has(k) ? '✓ ' : ''}{action}</Badge>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {error && <p style={{ color: 'var(--i-danger)', marginTop: 8 }}>{error}</p>}
        {editing && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="insp-btn" onClick={back}>Cancel</button>
            <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>
              {id ? 'Save changes' : 'Create role'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
