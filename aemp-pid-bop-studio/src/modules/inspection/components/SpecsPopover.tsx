import { useState } from 'react';
import type { InspectionRecord } from '../types';

/** ⓘ button that reveals the record's spec key/values (source system's Specs column). */
export default function SpecsPopover({ record }: { record: InspectionRecord }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(record.specs);
  if (entries.length === 0) return <span style={{ color: 'var(--dim)' }}>—</span>;
  return (
    <span style={{ position: 'relative' }}>
      <button className="insp-btn" style={{ padding: '2px 8px', borderRadius: 999 }}
        onClick={() => setOpen((v) => !v)} title="Equipment specification">ⓘ</button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, right: 0, top: 24, minWidth: 220,
          background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 8,
          padding: 10, boxShadow: '0 8px 22px rgba(0,0,0,.18)', textAlign: 'left' }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--dim)' }}>{k}</span><b>{v || '—'}</b>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
