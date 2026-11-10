// ============================================================================
//  Major Overhaul — rig details on the rig plan page (the HTML's rig info:
//  client, location, rig type, HP, currency, prepared by, report remarks).
//  Client comes from the unit, rig model / HP from the technical spec sheet
//  (single source of truth); location, currency, prepared-by and remarks are
//  MOH-specific (insp_moh_rig_meta, migration 0054).
// ============================================================================
import { useEffect, useState } from 'react';
import { Card } from './ui';
import { CURRENCIES, type Currency, type RigMeta } from '../lib/moh';
import { saveRigMeta } from '../lib/mohApi';
import { fetchUnitSpec, findValue } from '../lib/unitSpecs';

export interface RigSpecInfo { model: string; hp: string }

/** Rig model + HP rating from the unit's technical spec sheet (blank if none). */
export function useRigSpec(rigId: string): RigSpecInfo {
  const [info, setInfo] = useState<RigSpecInfo>({ model: '', hp: '' });
  useEffect(() => {
    let live = true;
    fetchUnitSpec(rigId)
      .then((r) => { if (live && r) setInfo({ model: findValue(r.spec, ['Rig Model']), hp: findValue(r.spec, ['HP Rating']) }); })
      .catch(() => { /* spec sheet is optional context */ });
    return () => { live = false; };
  }, [rigId]);
  return info;
}

export function RigInfoCard({ meta, client, spec, editable, onEdit }: {
  meta: RigMeta; client: string; spec: RigSpecInfo; editable: boolean; onEdit: () => void;
}) {
  const fields: [string, string][] = [
    ['Client', client], ['Location', meta.location], ['Rig type / model', spec.model], ['Rig HP', spec.hp],
    ['Budget currency', meta.currency], ['Prepared by', meta.preparedBy],
  ];
  return (
    <Card title="Rig details" extra={editable
      ? <button type="button" className="insp-btn moh-noprint" onClick={onEdit}>Edit details</button> : undefined}>
      <div className="moh-info">
        {fields.map(([k, v]) => <div key={k}><div className="k">{k}</div><div className="v">{v || '—'}</div></div>)}
      </div>
      {meta.remarks.trim() && <p style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}><b>Remarks:</b> {meta.remarks}</p>}
      <p className="moh-noprint" style={{ color: 'var(--i-muted)', fontSize: 11.5, margin: '10px 0 0' }}>
        Client comes from the unit record; rig type and HP from the rig&apos;s technical specification sheet.
      </p>
    </Card>
  );
}

export function RigMetaDrawer({ meta, rigName, onClose, onSaved }: {
  meta: RigMeta; rigName: string; onClose: () => void; onSaved: () => void;
}) {
  const [m, setM] = useState<RigMeta>(meta);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const text = (k: 'location' | 'preparedBy' | 'remarks') => (e: { target: { value: string } }) => setM({ ...m, [k]: e.target.value });

  const save = async () => {
    setBusy(true); setErr(null);
    try { await saveRigMeta(m); onSaved(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="insp-drawer" role="dialog" aria-label="Rig details">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Rig details</h3>
          <div style={{ color: 'var(--i-muted)', fontSize: 12, marginTop: 3 }}>{rigName}</div>
        </div>
        <button type="button" className="insp-iconbtn" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="insp-field"><label htmlFor="rm-loc">Location</label>
          <input id="rm-loc" className="insp-input" maxLength={120} value={m.location} onChange={text('location')} /></div>
        <div className="insp-field"><label htmlFor="rm-cur">Budget currency</label>
          <select id="rm-cur" className="insp-input" value={m.currency}
            onChange={(e) => setM({ ...m, currency: e.target.value as Currency })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div className="insp-field"><label htmlFor="rm-by">Prepared by</label>
          <input id="rm-by" className="insp-input" maxLength={120} value={m.preparedBy} onChange={text('preparedBy')} /></div>
        <div className="insp-field"><label htmlFor="rm-rem">Report remarks</label>
          <textarea id="rm-rem" className="insp-input" rows={4} maxLength={4000} value={m.remarks} onChange={text('remarks')} /></div>
      </div>
      {err && <div style={{ color: 'var(--i-danger)', marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>Save details</button>
        <button type="button" className="insp-btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
