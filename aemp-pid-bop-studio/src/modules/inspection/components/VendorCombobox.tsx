// ============================================================================
//  Vendor company name input (reference vendor-company combobox): free text
//  with suggestions from Vendor Companies (prefix matches first, more load on
//  scroll) and a shield button that checks the exact name on API MyCerts.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Badge } from './ui';
import { useInspection } from '../state/InspectionContext';
import { fetchCertifications, searchVendors } from '../lib/vendorApi';
import { certState, unavailableMessage, type CertResult } from '../lib/vendors';

const PAGE = 20;

function CertCheck({ name }: { name: string }) {
  const { can } = useInspection();
  const [r, setR] = useState<CertResult | null>(null);
  useEffect(() => {
    let alive = true;
    setR(null);
    void fetchCertifications(name, 1, true).then((x) => { if (alive) setR(x); });
    return () => { alive = false; };
  }, [name]);

  if (!r) return <small style={{ color: 'var(--i-muted)' }}>Checking certification…</small>;
  if (!r.available) {
    const m = unavailableMessage(r.reason);
    return <small role="status" style={{ color: 'var(--i-muted)' }}><strong>{m.title}</strong> {m.body}</small>;
  }
  const s = certState(r.items);
  const stale = r.stale ? <small style={{ color: 'var(--i-muted)' }}> (saved result)</small> : null;
  if (s.state === 'valid') {
    return <small><Badge tone="success">Certified</Badge> {s.activeCount} active certification{s.activeCount === 1 ? '' : 's'} on MyCerts{stale}</small>;
  }
  if (s.state === 'lapsed') {
    return <small><Badge tone="danger">Not currently certified</Badge> {s.total} certification{s.total === 1 ? '' : 's'} on MyCerts, none active{stale}</small>;
  }
  return (
    <small style={{ color: 'var(--i-muted)' }}>
      No exact match. Enter the full registered name, or search on the{' '}
      {can('insp_vendor_view') ? <Link to="/inspection/vendor-companies">Vendor Companies</Link> : 'Vendor Companies'} screen.{stale}
    </small>
  );
}

export default function VendorCombobox({ id, value, onChange, ariaLabel, invalid, check = true }: {
  id?: string; value: string; onChange: (v: string) => void; ariaLabel?: string; invalid?: boolean; check?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const blurTimer = useRef<number | null>(null);

  // Suggestions follow what is typed, after a short pause.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const t = window.setTimeout(() => {
      searchVendors(value, PAGE, 0).then((rows) => {
        if (!alive) return;
        setItems(rows); setHasMore(rows.length === PAGE);
      }).catch(() => { if (alive) setItems([]); });
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [value, open]);

  const loadMore = async () => {
    const rows = await searchVendors(value, PAGE, items.length);
    setItems((x) => [...x, ...rows]); setHasMore(rows.length === PAGE);
  };

  useEffect(() => { setChecking(null); }, [value]);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input id={id} className="insp-input" aria-label={ariaLabel} aria-invalid={invalid} autoComplete="off"
          value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 150); }} style={{ flex: 1 }} />
        {check && value.trim().length >= 3 && (
          <button type="button" className="insp-iconbtn" title="Check certification on MyCerts"
            aria-label={`Check certification for ${value}`} onClick={() => setChecking(value.trim())}>
            <Icon name="kpi-compliance" /></button>
        )}
      </div>
      {open && items.length > 0 && (
        <ul role="listbox" className="insp-card" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%',
          margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: 224, overflowY: 'auto' }}
        onMouseEnter={() => { if (blurTimer.current) window.clearTimeout(blurTimer.current); }}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < 48) { setHasMore(false); void loadMore(); }
        }}>
          {items.map((v) => (
            <li key={v.id}>
              <button type="button" role="option" aria-selected={v.name === value}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}
                onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(v.name); setOpen(false); }}>
                {v.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {checking && <div style={{ marginTop: 4 }}><CertCheck name={checking} /></div>}
    </div>
  );
}
