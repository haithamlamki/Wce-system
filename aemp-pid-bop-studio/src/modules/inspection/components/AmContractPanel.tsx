// ============================================================================
//  Annual Maintenance — contract terms. Each rig's contract decides how many
//  AM days are allowed (5, 7 or more), how the rig is paid while down (full
//  rate, a reduced rate or the breakdown rate, as % of the daily rate), what
//  days beyond the allowance earn, and the CAT IV cycle. New plans copy these
//  terms; a plan's own copy can then be adjusted (TermsFields).
// ============================================================================
import { useState } from 'react';
import { Card } from './ui';
import {
  AM_CURRENCIES, RATE_BASES, RATE_BASIS_LABEL, defaultRatePercent, nextCatIvYear,
  type AmContract, type AmCurrency, type AmTerms, type RateBasis,
} from '../lib/am';
import { saveContract } from '../lib/amApi';

const clamp = (v: string, min: number, max: number, int = false) => {
  const x = Number(v) || 0;
  return Math.max(min, Math.min(max, int ? Math.trunc(x) : x));
};

/** Allowed days / basis / rate % / over-run % / daily rate / currency. */
export function TermsFields({ value, onChange, disabled }: {
  value: AmTerms; onChange: (t: AmTerms) => void; disabled?: boolean;
}) {
  const set = (patch: Partial<AmTerms>) => onChange({ ...value, ...patch });
  return (
    <div className="insp-filterrow">
      <label className="fld"><span>AM days allowed</span>
        <input className="insp-input" type="number" min={0} max={90} style={{ width: 90 }} disabled={disabled}
          value={value.allowedDays} onChange={(e) => set({ allowedDays: clamp(e.target.value, 0, 90, true) })} />
      </label>
      <label className="fld"><span>Paid during AM</span>
        <select className="insp-input" disabled={disabled} value={value.rateBasis}
          onChange={(e) => { const b = e.target.value as RateBasis; set({ rateBasis: b, ratePercent: defaultRatePercent(b, value.ratePercent) }); }}>
          {RATE_BASES.map((b) => <option key={b} value={b}>{RATE_BASIS_LABEL[b]}</option>)}
        </select>
      </label>
      <label className="fld"><span>Rate % of daily</span>
        <input className="insp-input" type="number" min={0} max={100} style={{ width: 90 }}
          disabled={disabled || value.rateBasis === 'full'} value={value.ratePercent}
          onChange={(e) => set({ ratePercent: clamp(e.target.value, 0, 100) })} />
      </label>
      <label className="fld"><span>Over-run rate %</span>
        <input className="insp-input" type="number" min={0} max={100} style={{ width: 90 }} disabled={disabled}
          title="Paid for each day beyond the allowance (0 = zero rate)" value={value.overrunRatePercent}
          onChange={(e) => set({ overrunRatePercent: clamp(e.target.value, 0, 100) })} />
      </label>
      <label className="fld"><span>Daily rate</span>
        <input className="insp-input" type="number" min={0} style={{ width: 120 }} disabled={disabled}
          value={value.dailyRate ?? ''}
          onChange={(e) => set({ dailyRate: e.target.value.trim() === '' ? null : clamp(e.target.value, 0, 1e9) })} />
      </label>
      <label className="fld"><span>Currency</span>
        <select className="insp-input" disabled={disabled} value={value.currency}
          onChange={(e) => set({ currency: e.target.value as AmCurrency })}>
          {AM_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    </div>
  );
}

const toTerms = (c: AmContract): AmTerms => ({
  allowedDays: c.amDaysAllowed, rateBasis: c.rateBasis, ratePercent: c.ratePercent,
  overrunRatePercent: c.overrunRatePercent, dailyRate: c.dailyRate, currency: c.currency,
});

export default function AmContractPanel({ rigName, contract, editable, onClose, onSaved }: {
  rigName: string; contract: AmContract; editable: boolean; onClose: () => void; onSaved: () => Promise<void> | void;
}) {
  const [c, setC] = useState<AmContract>(contract);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = nextCatIvYear(c);

  const save = async () => {
    setBusy(true); setErr(null);
    try { await saveContract(c); await onSaved(); onClose(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <Card title={`Contract terms – ${rigName}`}
      extra={<button type="button" className="insp-iconbtn" aria-label="Close" onClick={onClose}>✕</button>}>
      <div className="insp-filterrow">
        <label className="fld"><span>Client</span>
          <input className="insp-input" maxLength={120} disabled={!editable} value={c.client}
            onChange={(e) => setC({ ...c, client: e.target.value })} /></label>
        <label className="fld"><span>Contract ref.</span>
          <input className="insp-input" maxLength={120} disabled={!editable} value={c.contractRef}
            onChange={(e) => setC({ ...c, contractRef: e.target.value })} /></label>
      </div>
      <TermsFields value={toTerms(c)} disabled={!editable} onChange={(t) => setC({ ...c,
        amDaysAllowed: t.allowedDays, rateBasis: t.rateBasis, ratePercent: t.ratePercent,
        overrunRatePercent: t.overrunRatePercent, dailyRate: t.dailyRate, currency: t.currency })} />
      <div className="insp-filterrow">
        <label className="fld"><span>CAT IV cycle (years)</span>
          <input className="insp-input" type="number" min={1} max={30} style={{ width: 90 }} disabled={!editable}
            value={c.catIvCycleYears} onChange={(e) => setC({ ...c, catIvCycleYears: clamp(e.target.value, 1, 30, true) })} /></label>
        <label className="fld"><span>Last CAT IV</span>
          <input className="insp-input" type="date" disabled={!editable} value={c.lastCatIvDate ?? ''}
            onChange={(e) => setC({ ...c, lastCatIvDate: e.target.value || null })} /></label>
        <div className="fld"><span>Next CAT IV due</span><b style={{ padding: '6px 0' }}>{next ?? '—'}</b></div>
      </div>
      <label className="fld" style={{ display: 'block' }}><span>Notes</span>
        <textarea className="insp-input" rows={2} maxLength={4000} style={{ width: '100%' }} disabled={!editable}
          value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} /></label>
      {err && <div style={{ color: 'var(--i-danger)', marginTop: 8 }}>{err}</div>}
      {editable && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="insp-btn primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save contract terms'}</button>
          <button type="button" className="insp-btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      )}
      <p style={{ color: 'var(--i-muted)', fontSize: 12, marginBottom: 0 }}>
        New plans copy these terms. Changing them here does not alter plans already created — adjust those on the plan page.
      </p>
    </Card>
  );
}
