// ============================================================================
//  Contracts — pixel-faithful port of the prototype's #view-cert: topbar with
//  summary chips + "+ New Contract", contract cards (head / req-tbl / notes /
//  Edit·Delete), add-edit modal with dynamic required-tubular rows, and the
//  collapsible unit-certificate generator producing the full .cert-doc with
//  Print and Download HTML. Backend unchanged: tubular_contracts CRUD via
//  RLS (drafts hard-delete; anything else archives), On Hand = serviceable.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { useTubular } from '../state/TubularContext';
import { useToast } from '../components/shell/Toast';
import { fetchCatalog, fetchVisibleRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';
import { aggregate, fleetStatus, serviceable } from '../lib/calc';
import { CERT_CSS } from '../lib/certCss';

interface Contract {
  id: string; unit_id: string; client: string; contract_ref: string;
  start_date: string | null; end_date: string | null; status: string; notes: string | null;
  updated_at: string;
}
interface Line { id: string; contract_id: string; catalog_item_id: string; quantity: number }
interface ReqDraft { key: number; catalogItemId: string; qty: string }

const qtyOf = (r: TubularRecordRow) => ({
  onContract: r.onContract, premium: r.premium, class2: r.class2,
  class3: r.class3, scrap: r.scrap, needsInspection: r.needsInspection,
});

function daysToEnd(c: Contract): number | null {
  if (!c.end_date) return null;
  return Math.floor((new Date(c.end_date).getTime() - Date.now()) / 86400000);
}

let reqSeq = 0;

export default function ContractsView() {
  const { fullName } = useAuth();
  const { units, hasPerm } = useTubular();
  const toast = useToast();
  const canManage = hasPerm('manage_contracts');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mRig, setMRig] = useState(''); const [mClient, setMClient] = useState('');
  const [mStart, setMStart] = useState(''); const [mEnd, setMEnd] = useState('');
  const [mNotes, setMNotes] = useState('');
  const [reqRows, setReqRows] = useState<ReqDraft[]>([]);
  // certificate
  const [certOpen, setCertOpen] = useState(false);
  const [cUnit, setCUnit] = useState(''); const [cDesc, setCDesc] = useState('');
  const [cert, setCert] = useState<null | ReturnType<typeof buildCertData>>(null);
  const certRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [c, l, cat, recs] = await Promise.all([
        supabase.from('tubular_contracts').select('*').order('updated_at', { ascending: false }),
        supabase.from('tubular_contract_lines').select('*'),
        fetchCatalog(), fetchVisibleRecords(),
      ]);
      setContracts((c.data ?? []) as Contract[]);
      setLines((l.data ?? []) as Line[]);
      setCatalog(cat); setRecords(recs);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitName = useCallback((id: string) => units.find((u) => u.id === id)?.name ?? '…', [units]);

  const servBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) {
      const k = `${r.unitId}|${r.catalogItemId}`;
      m.set(k, (m.get(k) ?? 0) + serviceable(r));
    }
    return m;
  }, [records]);

  const overallBadge = (c: Contract): { cls: string; label: string } => {
    const d = daysToEnd(c);
    if (c.status === 'expired' || (d != null && d < 0)) return { cls: 'short', label: 'EXPIRED' };
    if (c.status === 'archived') return { cls: 'nodata', label: 'ARCHIVED' };
    const cls = lines.filter((l) => l.contract_id === c.id);
    const anyShort = cls.some((l) => (servBy.get(`${c.unit_id}|${l.catalog_item_id}`) ?? 0) < l.quantity);
    if (anyShort) return { cls: 'short', label: 'ATTENTION' };
    if (d != null && d <= 30) return { cls: 'balanced', label: 'EXPIRING' };
    return { cls: 'surplus', label: 'COMPLIANT' };
  };

  const needsAttnCount = contracts.filter((c) => ['EXPIRED', 'ATTENTION', 'EXPIRING'].includes(overallBadge(c).label)).length;

  // ---- modal ------------------------------------------------------------------
  const openModal = (c?: Contract) => {
    setEditId(c?.id ?? null);
    setMRig(c?.unit_id ?? units[0]?.id ?? '');
    setMClient(c?.client ?? '');
    setMStart(c?.start_date ?? '');
    setMEnd(c?.end_date ?? '');
    setMNotes(c?.notes ?? '');
    setReqRows(c
      ? lines.filter((l) => l.contract_id === c.id).map((l) => ({ key: ++reqSeq, catalogItemId: l.catalog_item_id, qty: String(l.quantity) }))
      : [{ key: ++reqSeq, catalogItemId: '', qty: '' }]);
    setModalOpen(true);
  };

  const saveModal = async () => {
    if (!supabase) return;
    if (!mRig || !mClient.trim()) { toast('Rig and Client are required.', 'error'); return; }
    const items = reqRows
      .filter((r) => r.catalogItemId && /^[1-9]\d*$/.test(r.qty))
      .map((r) => ({ catalog_item_id: r.catalogItemId, quantity: Number(r.qty) }));
    try {
      let contractId = editId;
      if (editId) {
        const { error } = await supabase.from('tubular_contracts')
          .update({ unit_id: mRig, client: mClient, start_date: mStart || null, end_date: mEnd || null, notes: mNotes || null })
          .eq('id', editId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from('tubular_contracts')
          .insert({ unit_id: mRig, client: mClient, contract_ref: `${unitName(mRig)} / ${mClient}`, start_date: mStart || null, end_date: mEnd || null, notes: mNotes || null, status: 'active' })
          .select('id').single();
        if (error) throw new Error(error.message);
        contractId = data.id as string;
      }
      // replace lines (dedup by item — the table has a unique constraint)
      const dedup = new Map(items.map((i) => [i.catalog_item_id, i]));
      await supabase.from('tubular_contract_lines').delete().eq('contract_id', contractId!);
      if (dedup.size) {
        const { error } = await supabase.from('tubular_contract_lines')
          .insert([...dedup.values()].map((i) => ({ ...i, contract_id: contractId })));
        if (error) throw new Error(error.message);
      }
      toast(editId ? 'Contract updated.' : 'Contract created.', 'success');
      setModalOpen(false);
      await load();
    } catch (e) {
      toast(`Save failed. ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const deleteContract = async (c: Contract) => {
    if (!supabase) return;
    if (c.status === 'draft') {
      const { error } = await supabase.from('tubular_contracts').delete().eq('id', c.id);
      if (error) toast(`Delete failed. ${error.message}`, 'error');
      else toast('Draft contract deleted.', 'success');
    } else {
      const { error } = await supabase.from('tubular_contracts').update({ status: 'archived' }).eq('id', c.id);
      if (error) toast(`Archive failed. ${error.message}`, 'error');
      else toast('Contract archived — history is preserved (active contracts are never hard-deleted).', 'success');
    }
    await load();
  };

  // ---- certificate --------------------------------------------------------------
  function buildCertData(unitId: string, catalogItemId: string) {
    const unit = units.find((u) => u.id === unitId);
    const item = catById.get(catalogItemId);
    const rows = records.filter((r) => r.unitId === unitId && r.catalogItemId === catalogItemId);
    if (!unit || !item || rows.length === 0) return null;
    const t = aggregate(rows.map(qtyOf));
    const st = fleetStatus(t);
    const verdict = t.needsInspection > 0
      ? { cls: 'due', label: 'Inspection Due' }
      : st === 'short'
        ? { cls: 'fail', label: 'Non-Compliant' }
        : st === 'uncontracted' || st === 'no_data'
          ? { cls: 'unc', label: 'Uncontracted' }
          : { cls: 'pass', label: 'Compliant' };
    const movement = {
      damaged: rows.reduce((n, r) => n + r.damagedOnLocation, 0),
      repair: rows.reduce((n, r) => n + r.sendToRepair, 0),
      toOther: rows.reduce((n, r) => n + r.toOtherRig, 0),
      fromOther: rows.reduce((n, r) => n + r.receiveFromRig, 0),
      rental: rows.map((r) => r.rentalDate).find(Boolean) ?? null,
    };
    return {
      unit, item, t, verdict, movement,
      remarks: rows.map((r) => r.remarks).filter(Boolean).join(' · ') || '—',
      updated: rows.map((r) => r.updatedAt).sort().slice(-1)[0],
      number: `ATC-${unit.name.replace(/\s+/g, '')}-${item.position}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      issued: new Date().toLocaleDateString(),
    };
  }

  const generateCert = () => {
    const data = buildCertData(cUnit, cDesc);
    if (!data) { toast('No records exist for that unit + tubular combination.', 'error'); return; }
    setCert(data);
  };

  const downloadCert = () => {
    if (!certRef.current || !cert) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${cert.number}</title><style>${CERT_CSS}</style></head><body>${certRef.current.outerHTML}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${cert.number}.html`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <section className="view" id="view-cert">
        <div className="empty-cert"><div className="ico">▤</div><div className="title">Rig Contracts</div><div className="desc">Loading…</div></div>
      </section>
    );
  }

  return (
    <section className="view" id="view-cert">
      <div className="section-head">
        <div className="section-title">Rig Contracts</div>
        <div className="section-sub">Contract requirements, commitments &amp; compliance per rig</div>
      </div>

      <div className="contracts-topbar">
        <div className="contract-meta-row" id="contracts-summary">
          <span className="meta-chip">Total: <span className="v">{contracts.length}</span></span>
          <span className="meta-chip">Needs Attention: <span className="v">{needsAttnCount}</span></span>
        </div>
        {canManage && <button className="btn sm" id="contract-new-btn" onClick={() => openModal()}>+ New Contract</button>}
      </div>

      <div id="contracts-list">
        {contracts.length === 0 && (
          <div className="empty-cert">
            <div className="ico">▤</div>
            <div className="title">No Contracts Yet</div>
            <div className="desc">{canManage ? 'Create the first contract with “+ New Contract”.' : 'No contracts are visible to your account.'}</div>
          </div>
        )}
        {contracts.map((c) => {
          const badge = overallBadge(c);
          const d = daysToEnd(c);
          const cls = lines.filter((l) => l.contract_id === c.id);
          return (
            <div className="contract-card" key={c.id}>
              <div className="contract-head">
                <div>
                  <div className="rig">{unitName(c.unit_id)}</div>
                  <div className="client">{c.client}{c.contract_ref && c.contract_ref !== `${unitName(c.unit_id)} / ${c.client}` ? ` · ${c.contract_ref}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`st ${badge.cls}`}>{badge.label}</span>
                  <div className="period">
                    {c.start_date ?? '…'} → {c.end_date ?? '…'}
                    {d != null && (d >= 0 ? ` · ${d}d left` : ' · expired')}
                  </div>
                </div>
              </div>
              <table className="req-tbl">
                <thead>
                  <tr><th>Required Tubular</th><th className="mono">Committed Qty</th><th className="mono">On Hand</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {cls.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--text-3)' }}>No committed items.</td></tr>}
                  {cls.map((l) => {
                    const onHand = servBy.get(`${c.unit_id}|${l.catalog_item_id}`) ?? 0;
                    const st = onHand >= l.quantity ? { cls: 'surplus', label: 'OK' }
                      : onHand > 0 ? { cls: 'short', label: 'SHORT' } : { cls: 'nodata', label: 'MISSING' };
                    return (
                      <tr key={l.id}>
                        <td>{catById.get(l.catalog_item_id)?.description}</td>
                        <td className="qty-cell">{l.quantity.toLocaleString()}</td>
                        <td className="qty-cell">{onHand.toLocaleString()}</td>
                        <td><span className={`st ${st.cls}`}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {c.notes && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>{c.notes}</div>}
              {canManage && (
                <div className="contract-actions" style={{ marginTop: 12 }}>
                  <button className="btn-tr" onClick={() => openModal(c)}>Edit</button>
                  <button className="btn-tr danger" onClick={() => void deleteContract(c)}>
                    {c.status === 'draft' ? 'Delete' : 'Archive'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="form-card">
        <button className="collapse-toggle" id="cert-collapse-toggle" onClick={() => setCertOpen((v) => !v)}>
          <span>⎙ Generate Unit Certificate (utility)</span>
          <span id="cert-collapse-arrow">{certOpen ? '▴' : '▾'}</span>
        </button>
        <div className={`collapse-body${certOpen ? ' open' : ''}`} id="cert-collapse-body">
          <div className="unit-bar">
            <span className="lbl">Unit</span>
            <select id="c-unit" value={cUnit} onChange={(e) => { setCUnit(e.target.value); setCert(null); }}>
              <option value="">— unit —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <span className="lbl">Tubular</span>
            <select id="c-desc" value={cDesc} onChange={(e) => { setCDesc(e.target.value); setCert(null); }}>
              <option value="">— tubular —</option>
              {catalog.filter((x) => records.some((r) => r.unitId === cUnit && r.catalogItemId === x.id))
                .map((x) => <option key={x.id} value={x.id}>{x.description}</option>)}
            </select>
            <button className="btn sm" id="c-gen" disabled={!cUnit || !cDesc} onClick={generateCert}>Generate</button>
            <span className="spacer" />
            {cert && <button className="btn sm alt" id="c-print" onClick={() => window.print()}>⎙ Print</button>}
            {cert && <button className="btn sm alt" id="c-download" onClick={downloadCert}>⬇ Download HTML</button>}
          </div>
          <div id="cert-display">
            {!cert ? (
              <div className="empty-cert">
                <div className="ico">⌖</div>
                <div className="title">No Certificate Generated</div>
                <div className="desc">Choose a unit and tubular, then press Generate.</div>
              </div>
            ) : (
              <div className="cert-doc" id="cert-printable" ref={certRef}>
                <div className="cert-header">
                  <div className="cert-brand">
                    <div className="logo">
                      <div className="logo-mark">A</div>
                      <div className="logo-text">
                        <h2>Abraj Energy Services</h2>
                        <p>Tubular Asset Management · S.A.O.G</p>
                      </div>
                    </div>
                    <div className="bv-line">Muscat · Sultanate of Oman · abrajenergy.com</div>
                  </div>
                  <div className="cert-num">
                    <div className="lbl">Certificate No.</div>
                    <div className="val">{cert.number}</div>
                    <div className="lbl">Issued</div>
                    <div className="val">{cert.issued}</div>
                    <span className="qr" />
                  </div>
                </div>
                <div className="cert-title">
                  <h1>Tubular Inventory Certificate</h1>
                  <div className="sub">API RP 7G Classification Statement</div>
                  <div className="accent-line" />
                </div>
                <div className="cert-section">
                  <div className="cert-section-title">1 · Identification</div>
                  <div className="cert-grid">
                    <div className="cert-row"><span className="k">Unit</span><span className="v">{cert.unit.name}</span></div>
                    <div className="cert-row"><span className="k">Unit Type</span><span className="v">{cert.unit.unitType === 'hoist' ? 'Hoist' : 'Rig'}</span></div>
                    <div className="cert-row"><span className="k">Tubular</span><span className="v">{cert.item.description}</span></div>
                    <div className="cert-row"><span className="k">Category</span><span className="v">{cert.item.category.replace('_', ' ').toUpperCase()}</span></div>
                    <div className="cert-row"><span className="k">Unit of Measure</span><span className="v">Joints</span></div>
                    <div className="cert-row"><span className="k">Last Updated</span><span className="v">{new Date(cert.updated).toLocaleDateString()}</span></div>
                  </div>
                </div>
                <div className="cert-section">
                  <div className="cert-section-title">2 · Classification Breakdown</div>
                  <div className="cert-class-grid">
                    {([
                      ['premium', 'Premium', cert.t.premium, '≥80% wall'],
                      ['c2', 'Class 2', cert.t.class2, '≥70% wall'],
                      ['c3', 'Class 3', cert.t.class3, 'exceeds C2'],
                      ['scrap', 'Scrap', cert.t.scrap, 'not for service'],
                      ['needs', 'Needs Insp.', cert.t.needsInspection, 'flagged'],
                    ] as const).map(([cls, lbl, val, sub]) => (
                      <div key={cls} className={`cert-class-cell ${cls}`}>
                        <div className="lbl">{lbl}</div>
                        <div className="val">{val.toLocaleString()}</div>
                        <div className="unit">{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="cert-section">
                  <div className="cert-section-title">3 · Inventory Position</div>
                  <div className="cert-grid">
                    <div className="cert-row"><span className="k">On Contract</span><span className="v">{cert.t.onContract.toLocaleString()}</span></div>
                    <div className="cert-row"><span className="k">On-Board Total</span><span className="v">{cert.t.onBoard.toLocaleString()}</span></div>
                    <div className="cert-row"><span className="k">Serviceable (P+C2)</span><span className="v">{cert.t.serviceable.toLocaleString()}</span></div>
                    <div className="cert-row"><span className="k">Variance</span><span className="v">{(cert.t.serviceable - cert.t.onContract).toLocaleString()}</span></div>
                  </div>
                </div>
                {(cert.movement.damaged || cert.movement.repair || cert.movement.toOther || cert.movement.fromOther || cert.movement.rental) ? (
                  <div className="cert-section">
                    <div className="cert-section-title">4 · Movement, Repair &amp; Rental</div>
                    <div className="cert-grid">
                      <div className="cert-row"><span className="k">Damaged On Location</span><span className="v">{cert.movement.damaged}</span></div>
                      <div className="cert-row"><span className="k">Send to Repair</span><span className="v">{cert.movement.repair}</span></div>
                      <div className="cert-row"><span className="k">To Other Rig</span><span className="v">{cert.movement.toOther}</span></div>
                      <div className="cert-row"><span className="k">Receive From Rig</span><span className="v">{cert.movement.fromOther}</span></div>
                      {cert.movement.rental && <div className="cert-row"><span className="k">Rental Date</span><span className="v">{cert.movement.rental}</span></div>}
                    </div>
                  </div>
                ) : null}
                <div className="cert-section">
                  <div className="cert-section-title">5 · Remarks</div>
                  <div className="cert-remark">{cert.remarks}</div>
                </div>
                <div className="cert-section">
                  <div className={`cert-verdict ${cert.verdict.cls}`}>
                    <div className="lbl">Verdict</div>
                    <div className="val">{cert.verdict.label}</div>
                  </div>
                </div>
                <div className="cert-footer">
                  <div className="sig-block"><div className="line" /><div className="name">RIG SUPERVISOR</div><div className="role">{cert.unit.name}</div></div>
                  <div className="sig-block"><div className="line" /><div className="name">TUBULAR COORDINATOR</div><div className="role">Operations{fullName ? ` · ${fullName}` : ''}</div></div>
                  <div className="sig-block"><div className="line" /><div className="name">QA/QC AUTHORITY</div><div className="role">Abraj HSE</div></div>
                </div>
                <div className="cert-disclaimer">
                  This certificate reflects the live inventory records at the time of issue. Classification follows API RP 7G.
                  Always refer to the current edition of API RP 7G for official requirements.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="amap-modal-overlay" id="contract-modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="amap-modal-box" style={{ width: 'min(560px, 92vw)' }}>
            <h3 id="contract-modalTitle">{editId ? 'Edit Contract' : 'New Contract'}</h3>
            <div className="form-row">
              <div className="form-field">
                <label>Rig / Unit <span className="req">*</span></label>
                <select id="ct-rig" value={mRig} onChange={(e) => setMRig(e.target.value)}>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Client <span className="req">*</span></label>
                <input id="ct-client" placeholder="e.g. PDO, Occidental…" value={mClient} onChange={(e) => setMClient(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Start</label>
                <input id="ct-start" type="date" value={mStart} onChange={(e) => setMStart(e.target.value)} />
              </div>
              <div className="form-field">
                <label>End</label>
                <input id="ct-end" type="date" value={mEnd} onChange={(e) => setMEnd(e.target.value)} />
              </div>
            </div>
            <label className="amap-label">Required Tubulars (commitment)</label>
            <div id="ct-req-rows">
              {reqRows.map((r) => (
                <div className="req-row-form" key={r.key}>
                  <select className="ct-req-desc amap-select" style={{ marginBottom: 0 }} value={r.catalogItemId}
                    onChange={(e) => setReqRows((rows) => rows.map((x) => (x.key === r.key ? { ...x, catalogItemId: e.target.value } : x)))}>
                    <option value="">— tubular —</option>
                    {catalog.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.description}</option>)}
                  </select>
                  <input className="ct-req-qty amap-input" style={{ marginBottom: 0 }} placeholder="qty" inputMode="numeric" value={r.qty}
                    onChange={(e) => setReqRows((rows) => rows.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))} />
                  <button className="btn-tr danger" onClick={() => setReqRows((rows) => rows.filter((x) => x.key !== r.key))}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn-tr" id="ct-add-row" style={{ marginBottom: 12 }}
              onClick={() => setReqRows((rows) => [...rows, { key: ++reqSeq, catalogItemId: '', qty: '' }])}>+ Add Item</button>
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label>Notes</label>
              <textarea id="ct-notes" value={mNotes} onChange={(e) => setMNotes(e.target.value)} />
            </div>
            <div className="form-actions" style={{ marginTop: 0 }}>
              <button className="btn sm" id="ct-save" onClick={() => void saveModal()}>Save Contract</button>
              <button className="btn sm alt" id="ct-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
