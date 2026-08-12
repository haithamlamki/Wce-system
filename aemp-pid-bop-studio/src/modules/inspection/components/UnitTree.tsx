// ============================================================================
//  Folder Structure tree (guide §5.5.4 / slide 7): Company → Drilling Rigs /
//  Hoists → Unit. Companies and units are derived from the visible records;
//  unit kind comes from the shared units catalog.
// ============================================================================
import { useMemo } from 'react';
import type { InspUnit, InspectionRecord } from '../types';

export interface TreeSel { company?: string; unit?: string }

const KIND_LABELS: Record<string, string> = { rig: 'Drilling Rigs', hoist: 'Hoists', other: 'Other Units' };

export default function UnitTree({ rows, units, sel, onSelect }: {
  rows: InspectionRecord[];
  units: InspUnit[];
  sel: TreeSel;
  onSelect: (sel: TreeSel) => void;
}) {
  const kindOf = useMemo(() => new Map(units.map((u) => [u.name, u.unitType])), [units]);
  const companies = useMemo(
    () => [...new Set(rows.map((r) => r.companyName ?? 'Unassigned'))].sort(), [rows]);
  const groupsOf = (co: string) => {
    const names = [...new Set(rows
      .filter((r) => (r.companyName ?? 'Unassigned') === co).map((r) => r.unitName))].sort();
    const grouped = new Map<string, string[]>();
    for (const n of names) {
      const kind = KIND_LABELS[kindOf.get(n) ?? 'other'] ?? 'Other Units';
      grouped.set(kind, [...(grouped.get(kind) ?? []), n]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  };

  return (
    <aside className="insp-tree">
      <button className={!sel.company ? 'active' : ''}
        onClick={() => onSelect({})}>All companies</button>
      {companies.map((co) => (
        <div key={co}>
          <button className={sel.company === co && !sel.unit ? 'active' : ''}
            onClick={() => onSelect({ company: co })}>▸ {co}</button>
          {sel.company === co && groupsOf(co).map(([kind, names]) => (
            <div key={kind}>
              <div style={{ padding: '3px 7px 1px 16px', fontSize: 10.5, color: 'var(--dim)',
                textTransform: 'uppercase', letterSpacing: '.05em' }}>{kind}</div>
              {names.map((u) => (
                <button key={u} style={{ paddingLeft: 28 }}
                  className={sel.unit === u ? 'active' : ''}
                  onClick={() => onSelect({ company: co, unit: u })}>{u}</button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}
