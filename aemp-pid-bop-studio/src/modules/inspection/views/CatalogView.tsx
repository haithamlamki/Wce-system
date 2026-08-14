// ============================================================================
//  Equipment type detail — replicates the reference `/equipment/:id` page: a
//  summary block, a "Specifications" section listing the type's spec fields and
//  a "Parts & Components" section. All writes stay behind insp_manage_catalog.
// ============================================================================
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInspection } from '../state/InspectionContext';
import { deleteComponent, deletePart, saveComponent, savePart, saveType } from '../lib/catalog';
import { Card, EmptyState, PageHeader } from '../components/ui';
import Icon from '../components/Icon';
import { CATEGORY_LABELS } from '../types';

export default function CatalogView() {
  const { typeId } = useParams();
  const navigate = useNavigate();
  const { can, types, parts, components, refreshCatalog } = useInspection();
  const editable = can('insp_manage_catalog');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const type = types.find((t) => t.id === typeId) ?? null;
  const typeParts = parts.filter((p) => p.typeId === typeId);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await refreshCatalog(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!type) {
    return (
      <>
        <PageHeader title="Equipment" actions={
          <button type="button" className="insp-btn"
            onClick={() => navigate('/inspection/equipment')}>Back</button>
        } />
        <EmptyState title="Equipment type not found"
          desc="This equipment type does not exist or you do not have access to it." />
      </>
    );
  }

  const addSpec = () => {
    const name = window.prompt('Specification field name (e.g. Working Pressure (Psi))');
    if (!name?.trim()) return;
    void run(() => saveType({
      id: type.id, category: type.category, name: type.name,
      description: type.description, specFields: [...type.specFields, name.trim()],
    }));
  };

  const removeSpec = (name: string) => void run(() => saveType({
    id: type.id, category: type.category, name: type.name,
    description: type.description, specFields: type.specFields.filter((s) => s !== name),
  }));

  return (
    <>
      <PageHeader
        title={type.name}
        subtitle="Equipment"
        actions={(
          <>
            {editable && (
              <button type="button" className="insp-btn" disabled={busy} onClick={() => {
                const name = window.prompt('Part name');
                if (!name?.trim()) return;
                void run(() => savePart({
                  typeId: type.id, name: name.trim(), description: name.trim(),
                  position: typeParts.length + 1,
                }));
              }}>
                <Icon name="plus" /> Add part
              </button>
            )}
            <button type="button" className="insp-btn"
              onClick={() => navigate('/inspection/equipment')}>Back</button>
          </>
        )}
      />

      {err && (
        <div className="insp-card" style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--i-danger)' }} role="alert">
          {err}
        </div>
      )}

      <div className="insp-card" style={{ marginBottom: 14 }}>
        <dl className="insp-deflist">
          <div><dt>Equipment Type</dt><dd>{type.name}</dd></div>
          <div><dt>Category</dt><dd>{CATEGORY_LABELS[type.category]}</dd></div>
          <div><dt>Description</dt><dd>{type.description || '—'}</dd></div>
          {/* The reference also shows SAP Equipment # / SAP Asset #; insp_equipment_types
              has no SAP columns, so they are omitted rather than shown permanently empty. */}
        </dl>
      </div>

      <div className="insp-grid-2">
        <Card title="Specifications" extra={editable ? (
          <button type="button" className="insp-btn sm" disabled={busy} onClick={addSpec}>
            <Icon name="plus" /> Add
          </button>
        ) : undefined}>
          {type.specFields.length === 0 && (
            <EmptyState title="No specifications" desc="This equipment type defines no specification fields." />
          )}
          {type.specFields.length > 0 && (
            <ul className="insp-plainlist">
              {type.specFields.map((s) => (
                <li key={s}>
                  <span>{s}</span>
                  {editable && (
                    <button type="button" className="insp-iconbtn sm danger" title="Remove"
                      aria-label={`Remove ${s}`} disabled={busy}
                      onClick={() => removeSpec(s)}><Icon name="delete" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Parts & Components">
          {typeParts.length === 0 && (
            <EmptyState title="No parts" desc="This equipment type has no parts yet." />
          )}
          {typeParts.map((p) => {
            const kids = components.filter((c) => c.partId === p.id);
            return (
              <div key={p.id} className="insp-partblock">
                <div className="head">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="sub">{p.description || '—'}</div>
                  </div>
                  {editable && (
                    <div className="rowacts">
                      <button type="button" className="insp-btn sm" disabled={busy} onClick={() => {
                        const name = window.prompt(`Component name for "${p.name}"`);
                        if (!name?.trim()) return;
                        void run(() => saveComponent({
                          partId: p.id, name: name.trim(), description: name.trim(),
                          position: kids.length + 1,
                        }));
                      }}>Add component</button>
                      <button type="button" className="insp-iconbtn sm danger" title="Delete part"
                        aria-label={`Delete ${p.name}`} disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete part "${p.name}" and its components?`)) return;
                          void run(() => deletePart(p.id));
                        }}><Icon name="delete" /></button>
                    </div>
                  )}
                </div>
                {kids.length === 0 && <div className="none">No components.</div>}
                {kids.length > 0 && (
                  <ul className="insp-plainlist">
                    {kids.map((c) => (
                      <li key={c.id}>
                        <span>{c.name}</span>
                        {editable && (
                          <button type="button" className="insp-iconbtn sm danger" title="Remove"
                            aria-label={`Remove ${c.name}`} disabled={busy}
                            onClick={() => void run(() => deleteComponent(c.id))}>
                            <Icon name="delete" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}
