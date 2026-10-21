// ============================================================================
//  Scope tree — the reference Inspections page's left panel:
//  Company → Hoists / Drilling Rigs → Unit. Built from the units register
//  (unit → company since migration 0040), not from loaded records, so it works
//  with server-side paging. A selection resolves to the unit ids it covers.
// ============================================================================
import { useMemo, useState } from 'react';
import Icon from './Icon';
import type { Company, InspUnit } from '../types';

type Group = 'hoist' | 'rig';
export interface ScopeSel { company?: string; group?: Group; unit?: string }
export interface ScopeCompany {
  id: string; name: string;
  groups: { key: Group; label: string; units: InspUnit[] }[];
}

const GROUPS: { key: Group; label: string }[] = [
  { key: 'hoist', label: 'Hoists' }, { key: 'rig', label: 'Drilling Rigs' },
];

export function buildScopeTree(units: InspUnit[], companies: Company[]): ScopeCompany[] {
  return [...companies]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id, name: c.name,
      groups: GROUPS.map((g) => ({
        ...g,
        units: units
          .filter((u) => u.companyId === c.id && (u.unitType === 'hoist' ? 'hoist' : 'rig') === g.key)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      })).filter((g) => g.units.length > 0),
    }))
    .filter((c) => c.groups.length > 0);
}

/** Comma-joined unit ids the selection covers; '' means the whole fleet. */
export function scopeUnitIds(tree: ScopeCompany[], sel: ScopeSel): string {
  if (sel.unit) return sel.unit;
  const co = tree.find((c) => c.id === sel.company);
  if (!co) return '';
  return co.groups.filter((g) => !sel.group || g.key === sel.group)
    .flatMap((g) => g.units.map((u) => u.id)).join(',');
}

export default function ScopeTree({ units, companies, sel, onSelect }: {
  units: InspUnit[]; companies: Company[]; sel: ScopeSel;
  onSelect: (sel: ScopeSel, unitIds: string) => void;
}) {
  const tree = useMemo(() => buildScopeTree(units, companies), [units, companies]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const pick = (s: ScopeSel) => onSelect(s, scopeUnitIds(tree, s));
  const is = (s: ScopeSel) => sel.company === s.company && sel.group === s.group && sel.unit === s.unit;

  if (tree.length === 0) return null;
  return (
    <aside className="insp-scope" aria-label="Scope">
      <button type="button" className={`insp-scope-node${is({}) ? ' active' : ''}`}
        onClick={() => pick({})}>Scope</button>
      {tree.map((c) => (
        <div key={c.id}>
          <div className="insp-scope-row">
            <button type="button" className="insp-scope-caret" aria-label={`Toggle ${c.name}`}
              onClick={() => toggle(c.id)}>
              <Icon name={open.has(c.id) ? 'band-collapse' : 'band-expand'} size={14} />
            </button>
            <button type="button" className={`insp-scope-node${is({ company: c.id }) ? ' active' : ''}`}
              onClick={() => pick({ company: c.id })}>
              <Icon name="companies" size={14} /> {c.name}
            </button>
          </div>
          {open.has(c.id) && c.groups.map((g) => {
            const gk = `${c.id}:${g.key}`;
            return (
              <div key={gk} style={{ paddingLeft: 16 }}>
                <div className="insp-scope-row">
                  <button type="button" className="insp-scope-caret" aria-label={`Toggle ${g.label}`}
                    onClick={() => toggle(gk)}>
                    <Icon name={open.has(gk) ? 'band-collapse' : 'band-expand'} size={14} />
                  </button>
                  <button type="button"
                    className={`insp-scope-node${is({ company: c.id, group: g.key }) ? ' active' : ''}`}
                    onClick={() => pick({ company: c.id, group: g.key })}>
                    <Icon name="library" size={14} /> {g.label}
                  </button>
                </div>
                {open.has(gk) && g.units.map((u) => (
                  <button key={u.id} type="button" style={{ marginLeft: 36 }}
                    className={`insp-scope-node${is({ company: c.id, group: g.key, unit: u.id }) ? ' active' : ''}`}
                    onClick={() => pick({ company: c.id, group: g.key, unit: u.id })}>
                    {u.name}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
