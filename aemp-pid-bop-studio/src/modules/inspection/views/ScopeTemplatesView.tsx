// ============================================================================
//  Scope Templates (reference `/scope-templates`): named sets of Companies
//  (every unit of the company) and Units. A user sees the records of every
//  unit inside their active templates. Needs user:manage-access.
// ============================================================================
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import Icon from '../components/Icon';
import { Badge, EmptyState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { deleteScopeTemplate, fetchScopeTemplates, saveScopeTemplate,
  type ScopeItem, type ScopeTemplate } from '../lib/accessApi';

interface Draft { id?: string; name: string; description: string; isActive: boolean; items: ScopeItem[] }

export default function ScopeTemplatesView() {
  const { can, companies, units } = useInspection();
  const [rows, setRows] = useState<ScopeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    fetchScopeTemplates().then((r) => { setRows(r); setError(null); })
      .catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (!can('user:manage-access')) {
    return <EmptyState ico="⚿" title="No Access" desc="You need the user:manage-access permission." />;
  }

  const nameOf = (it: ScopeItem) => (it.scopeType === 'Company'
    ? companies.find((c) => c.id === it.refId)?.name : units.find((u) => u.id === it.refId)?.name) ?? '—';
  const has = (t: ScopeItem['scopeType'], id: string) => !!draft?.items.some((i) => i.scopeType === t && i.refId === id);
  const toggle = (t: ScopeItem['scopeType'], id: string) => setDraft((d) => d && ({
    ...d, items: has(t, id) ? d.items.filter((i) => !(i.scopeType === t && i.refId === id)) : [...d.items, { scopeType: t, refId: id }],
  }));

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { setError('Name is required'); return; }
    setBusy(true); setError(null);
    try { await saveScopeTemplate(draft, draft.items); setDraft(null); load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (t: ScopeTemplate) => {
    if (!window.confirm(`Delete scope template "${t.name}"? ${t.userCount} user(s) will lose this scope.`)) return;
    try { await deleteScopeTemplate(t.id); load(); } catch (e) { setError((e as Error).message); }
  };

  const columns: Column<ScopeTemplate>[] = [
    { key: 'name', field: 'name', header: 'Name', sortable: true, value: (r) => r.name },
    { key: 'description', header: 'Description', value: (r) => r.description },
    { key: 'items', header: 'Scope', value: (r) => r.items.map(nameOf).join(', '),
      render: (r) => r.items.map((i) => `${i.scopeType}: ${nameOf(i)}`).join(' · ') },
    { key: 'users', header: 'Users', align: 'right', sortable: true, value: (r) => r.userCount },
    { key: 'status', header: 'Status', value: (r) => (r.isActive ? 'Active' : 'Inactive'),
      render: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button type="button" className="insp-iconbtn" title="Edit scope template"
          onClick={() => setDraft({ id: r.id, name: r.name, description: r.description, isActive: r.isActive, items: [...r.items] })}>
          <Icon name="edit" /></button>
        <button type="button" className="insp-iconbtn danger" title="Delete scope template"
          onClick={() => remove(r)}><Icon name="delete" /></button>
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader title="Scope Templates"
        subtitle="Named sets of companies and units. A user sees records only inside their templates."
        actions={(
          <button type="button" className="insp-btn primary"
            onClick={() => setDraft({ name: '', description: '', isActive: true, items: [] })}>
            <Icon name="plus" /> New scope template</button>
        )} />

      {draft && (
        <div className="insp-card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{draft.id ? 'Edit scope template' : 'New scope template'}</h3>
          <div className="insp-form-grid">
            <div className="insp-field"><label htmlFor="st-name">Name</label>
              <input id="st-name" className="insp-input" value={draft.name} maxLength={150}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="insp-field"><label htmlFor="st-desc">Description</label>
              <input id="st-desc" className="insp-input" value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            Active
          </label>
          <h4 style={{ marginBottom: 6 }}>Companies <span style={{ color: 'var(--i-muted)', fontWeight: 400 }}>(all of the company's units)</span></h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {companies.map((c) => (
              <label key={c.id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}>
                <input type="checkbox" checked={has('Company', c.id)} onChange={() => toggle('Company', c.id)} />{c.name}
              </label>
            ))}
          </div>
          <h4 style={{ marginBottom: 6 }}>Units</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '4px 12px' }}>
            {units.map((u) => (
              <label key={u.id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}>
                <input type="checkbox" checked={has('Unit', u.id)} onChange={() => toggle('Unit', u.id)} />{u.name}
              </label>
            ))}
          </div>
          {error && <p style={{ color: 'var(--i-danger)', marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="insp-btn" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>
              {draft.id ? 'Save changes' : 'Create scope template'}</button>
          </div>
        </div>
      )}

      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={loading} error={draft ? null : error}
        searchPlaceholder="Search scope templates…" emptyTitle="No scope templates found." initialPageSize={50} />
    </>
  );
}
