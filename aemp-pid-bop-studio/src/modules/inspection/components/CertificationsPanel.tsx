// ============================================================================
//  "Certifications (API MyCerts)" panel (reference vendor company pages):
//  read-only listings grouped per MyCerts company. On a saved vendor it looks
//  up the exact name (toggle "Include similar names"); on the New form it is a
//  search box with "Use this name" to copy the registered name into the form.
// ============================================================================
import { useEffect, useState } from 'react';
import { Badge } from './ui';
import { fetchCertifications } from '../lib/vendorApi';
import {
  groupByCompany, placeLine, statusTone, unavailableMessage, type CertItem, type CertResult,
} from '../lib/vendors';

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtStamp = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'earlier');

export default function CertificationsPanel({ companyName, searchable = false, onPickName }: {
  companyName: string; searchable?: boolean; onPickName?: (name: string) => void;
}) {
  const [typed, setTyped] = useState(companyName);
  const [query, setQuery] = useState(companyName);
  const [similar, setSimilar] = useState(false);
  const [pages, setPages] = useState<CertResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  // The search box waits for typing to pause before asking MyCerts.
  useEffect(() => {
    if (!searchable) { setQuery(companyName); return undefined; }
    const t = window.setTimeout(() => setQuery(typed), 400);
    return () => window.clearTimeout(t);
  }, [typed, searchable, companyName]);

  const name = query.trim();
  const exact = !searchable && !similar;

  useEffect(() => {
    setPages([]);
    if (name.length < 3) return undefined;
    let alive = true;
    setBusy(true);
    fetchCertifications(name, 1, exact)
      .then((r) => { if (alive) setPages([r]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [name, exact, nonce]);

  const more = async () => {
    setBusy(true);
    try { const r = await fetchCertifications(name, pages.length + 1, exact); setPages((p) => [...p, r]); }
    finally { setBusy(false); }
  };

  const first = pages[0];
  const items: CertItem[] = pages.flatMap((p) => p.items);
  const last = pages[pages.length - 1];
  const canMore = !!last && last.available && !last.stale && items.length < last.totalCount && last.items.length > 0;
  const down = first && !first.available;
  const msg = unavailableMessage(first?.reason ?? null);

  return (
    <section className="insp-card" aria-label="Company certifications" style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 14, margin: 0 }}>Certifications (API MyCerts)</h2>
      <p style={{ color: 'var(--i-muted)', fontSize: 12, margin: '2px 0 10px' }}>Read-only. Shown as published by API MyCerts.</p>

      {!searchable && name.length >= 3 && (
        <button type="button" className="insp-btn" style={{ fontSize: 12, marginBottom: 8 }} onClick={() => setSimilar((s) => !s)}>
          {similar ? 'Show only this company' : 'Include similar names'}
        </button>
      )}
      {searchable && (
        <input className="insp-input" aria-label="Search certifications by company name" placeholder="Search by company name…"
          value={typed} onChange={(e) => setTyped(e.target.value)} style={{ marginBottom: 10 }} />
      )}

      {name.length < 3 ? (
        <p style={{ color: 'var(--i-muted)' }}>{searchable ? 'Type at least 3 letters of the company name to search.' : 'No company name to look up.'}</p>
      ) : busy && !first ? (
        <p style={{ color: 'var(--i-muted)' }}>Looking up certifications…</p>
      ) : down ? (
        <div role="status" className="insp-card" style={{ borderColor: 'var(--i-warning)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}><strong>{msg.title}</strong><div style={{ color: 'var(--i-muted)' }}>{msg.body}</div></div>
          <button type="button" className="insp-btn" disabled={busy} onClick={() => setNonce((n) => n + 1)}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--i-muted)' }}>No certifications found for {exact ? 'the exact name ' : ''}“{name}”.</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {first?.stale && (
            <p role="status" style={{ fontSize: 12, color: 'var(--i-muted)' }}>
              MyCerts can't be reached right now, so this is the last saved result (from {fmtStamp(first.asOf)}).
            </p>
          )}
          {groupByCompany(items).map((g) => (
            <div key={g[0].companyId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <strong>{g[0].companyName}</strong>
                  {placeLine(g[0]) && <div style={{ fontSize: 12, color: 'var(--i-muted)' }}>{placeLine(g[0])}</div>}
                </div>
                {searchable && onPickName && (
                  <button type="button" className="insp-btn" onClick={() => onPickName(g[0].companyName)}>Use this name</button>
                )}
              </div>
              <table className="insp-table" style={{ marginTop: 6 }}>
                <thead><tr><th>Certification</th><th>Number</th><th>Status</th><th>Status date</th></tr></thead>
                <tbody>
                  {g.map((c) => (
                    <tr key={`${c.companyId}-${c.program}-${c.certificationNumber}`}>
                      <td>{c.program ?? '—'}</td>
                      <td>{c.certificationNumber || '—'}</td>
                      <td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                      <td>{fmtDate(c.statusChangedOn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {last && last.totalCount > items.length && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: 'var(--i-muted)' }}>Showing {items.length} of {last.totalCount} certifications.</small>
              {canMore && <button type="button" className="insp-btn" disabled={busy} onClick={more}>Show more</button>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
