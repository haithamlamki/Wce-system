// ============================================================================
//  Data Entry — the Excel-like Rig/Hoist grid (workbook sheet parity).
//  Columns follow the sheet: Category (derived) · Description (dropdown) ·
//  On Contract · On Board (computed, read-only) · Premium · Class 2 · Class 3 ·
//  Scrap · Needs Insp · Damaged · To Repair · To Other Rig · From Rig ·
//  Rental Date · Contractually Less (computed) · Remarks.
//  Excel-style usability: arrow/Tab/Enter navigation, paste-from-Excel into
//  the numeric block, batch save (one submission), unsaved-change warning.
//  On Board is NOT editable (computed server-side; legacy import overrides
//  show as a badge). Invalid input is an error, never coerced to 0.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import {
  CATEGORY_LABEL, CATEGORY_ORDER,
  fetchCatalog, fetchLastSubmission, fetchUnitRecords, submitEntry,
  type CatalogItem, type EntryLineInput, type SubmissionInfo, type TubularCategory,
} from '../lib/records';
import { contractuallyLess, onBoardTotal, overrideVariance, parseClipboardBlock, parseQuantity } from '../lib/calc';

const QTY_FIELDS = [
  'onContract', 'premium', 'class2', 'class3', 'scrap',
  'needsInspection', 'damagedOnLocation', 'sendToRepair', 'toOtherRig', 'receiveFromRig',
] as const;
type QtyField = (typeof QTY_FIELDS)[number];

const QTY_LABEL: Record<QtyField, string> = {
  onContract: 'ON CONTRACT', premium: 'PREMIUM ●● White', class2: 'CLASS 2 ● Yellow',
  class3: 'CLASS 3 ● Orange', scrap: 'SCRAP ● Red', needsInspection: 'NEEDS INSP',
  damagedOnLocation: 'DAMAGED', sendToRepair: 'TO REPAIR', toOtherRig: 'TO OTHER RIG',
  receiveFromRig: 'FROM RIG',
};

interface DraftRow {
  key: string;
  recordId: string | null;
  category: TubularCategory;
  catalogItemId: string;
  qty: Record<QtyField, string>;
  rentalDate: string;
  remarks: string;
  onBoardOverride: number | null;
  dirty: boolean;
}

let keySeq = 0;
const newKey = () => `draft-${++keySeq}`;

const emptyQty = (): Record<QtyField, string> =>
  Object.fromEntries(QTY_FIELDS.map((f) => [f, ''])) as Record<QtyField, string>;

function qtyNum(row: DraftRow) {
  const n = (f: QtyField) => { const p = parseQuantity(row.qty[f]); return p.ok ? p.value : 0; };
  return {
    onContract: n('onContract'), premium: n('premium'), class2: n('class2'),
    class3: n('class3'), scrap: n('scrap'), needsInspection: n('needsInspection'),
  };
}

function rowErrors(row: DraftRow): string[] {
  const errs: string[] = [];
  if (!row.catalogItemId) errs.push('description required');
  for (const f of QTY_FIELDS) {
    const p = parseQuantity(row.qty[f]);
    if (!p.ok) errs.push(`${QTY_LABEL[f]}: ${p.error}`);
  }
  return errs;
}

const cellInput: React.CSSProperties = {
  width: '100%', minWidth: 52, border: 0, background: 'transparent', color: 'var(--ink)',
  font: '12.5px var(--mono)', textAlign: 'right', padding: '6px 7px', outline: 'none',
};
const td: React.CSSProperties = { border: '1px solid var(--line)', padding: 0 };
const tdRo: React.CSSProperties = { ...td, background: 'var(--sunk)', textAlign: 'right', padding: '6px 7px', font: '12.5px var(--mono)', color: 'var(--dim)' };

export default function DataEntryView() {
  const { units, hasPerm } = useTubular();
  const entryUnits = units; // RLS + RPC re-verify; UI shows assigned units only
  const [unitId, setUnitId] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [archive, setArchive] = useState<string[]>([]);
  const [lastSub, setLastSub] = useState<SubmissionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => { if (!unitId && entryUnits.length) setUnitId(entryUnits[0].id); }, [entryUnits, unitId]);

  const load = useCallback(async (uid: string) => {
    setLoading(true); setError('');
    try {
      const [cat, recs, sub] = await Promise.all([
        catalog.length ? Promise.resolve(catalog) : fetchCatalog(),
        fetchUnitRecords(uid),
        fetchLastSubmission(uid),
      ]);
      setCatalog(cat);
      const byId = new Map(cat.map((c) => [c.id, c]));
      setRows(recs.map((r) => ({
        key: r.id, recordId: r.id,
        category: byId.get(r.catalogItemId)?.category ?? 'drill_pipe',
        catalogItemId: r.catalogItemId,
        qty: Object.fromEntries(QTY_FIELDS.map((f) => [f, String(r[f] ?? 0)])) as Record<QtyField, string>,
        rentalDate: r.rentalDate ?? '', remarks: r.remarks ?? '',
        onBoardOverride: r.onBoardOverride, dirty: false,
      })));
      setArchive([]);
      setLastSub(sub);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [catalog]);

  useEffect(() => { if (unitId) void load(unitId); }, [unitId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = rows.some((r) => r.dirty) || archive.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const grouped = useMemo(() => CATEGORY_ORDER.map((cat) => ({
    cat, items: rows.filter((r) => r.category === cat && !archive.includes(r.key)),
  })), [rows, archive]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const patch = (key: string, fn: (r: DraftRow) => DraftRow) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...fn(r), dirty: true } : r)));

  const addRow = (cat: TubularCategory) =>
    setRows((rs) => [...rs, {
      key: newKey(), recordId: null, category: cat, catalogItemId: '',
      qty: emptyQty(), rentalDate: '', remarks: '', onBoardOverride: null, dirty: true,
    }]);

  const removeRow = (row: DraftRow) => {
    if (row.recordId) setArchive((a) => [...a, row.key]);
    else setRows((rs) => rs.filter((r) => r.key !== row.key));
  };

  // ---- keyboard navigation (roving focus over data-r / data-c cells) --------
  const moveFocus = useCallback((rIdx: number, cIdx: number) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-r="${rIdx}"][data-c="${cIdx}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  const onGridKey = (e: React.KeyboardEvent, rIdx: number, cIdx: number) => {
    const nav: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [1, 0],
    };
    if (e.key in nav && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      moveFocus(rIdx + nav[e.key][0], cIdx);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target instanceof HTMLInputElement) {
      const input = e.target;
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if ((e.key === 'ArrowLeft' && atStart) || (e.key === 'ArrowRight' && atEnd)) {
        e.preventDefault();
        moveFocus(rIdx, cIdx + (e.key === 'ArrowLeft' ? -1 : 1));
      }
    }
  };

  // ---- paste an Excel block across the numeric columns ----------------------
  const onPaste = (e: React.ClipboardEvent, rowKey: string, startField: QtyField) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return; // single-cell paste: default behavior
    e.preventDefault();
    const block = parseClipboardBlock(text);
    const startRow = flat.findIndex((r) => r.key === rowKey);
    const startCol = QTY_FIELDS.indexOf(startField);
    const problems: string[] = [];
    block.forEach((cells, dr) => cells.forEach((cell, dc) => {
      if (cell === '') return;
      const p = parseQuantity(cell);
      if (!p.ok) problems.push(`row ${dr + 1}, col ${dc + 1}: ${p.error}`);
    }));
    if (problems.length) {
      setError(`Paste rejected — fix these cells in Excel and retry: ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? '…' : ''}`);
      return;
    }
    setError('');
    setRows((rs) => {
      const next = [...rs];
      block.forEach((cells, dr) => {
        const target = flat[startRow + dr];
        if (!target) return; // beyond the last row: ignored (no silent row creation)
        const i = next.findIndex((r) => r.key === target.key);
        const qty = { ...next[i].qty };
        cells.forEach((cell, dc) => {
          const f = QTY_FIELDS[startCol + dc];
          if (f) qty[f] = cell;
        });
        next[i] = { ...next[i], qty, dirty: true };
      });
      return next;
    });
  };

  const save = async () => {
    const bad = flat.map((r) => ({ r, errs: rowErrors(r) })).filter((x) => x.errs.length);
    if (bad.length) {
      setError(`Cannot save — ${bad.length} row(s) invalid. First: ${bad[0].errs[0]}`);
      return;
    }
    setSaving(true); setError('');
    try {
      const lines: EntryLineInput[] = flat.map((r, i) => ({
        id: r.recordId,
        catalog_item_id: r.catalogItemId,
        position: i + 1,
        on_contract: qtyNum(r).onContract,
        premium: qtyNum(r).premium,
        class2: qtyNum(r).class2,
        class3: qtyNum(r).class3,
        scrap: qtyNum(r).scrap,
        needs_inspection: qtyNum(r).needsInspection,
        damaged_on_location: (parseQuantity(r.qty.damagedOnLocation) as { value: number }).value,
        send_to_repair: (parseQuantity(r.qty.sendToRepair) as { value: number }).value,
        to_other_rig: (parseQuantity(r.qty.toOtherRig) as { value: number }).value,
        receive_from_rig: (parseQuantity(r.qty.receiveFromRig) as { value: number }).value,
        rental_date: r.rentalDate || null,
        remarks: r.remarks || null,
      }));
      const archiveIds = rows.filter((r) => archive.includes(r.key) && r.recordId).map((r) => r.recordId as string);
      await submitEntry({ unitId, entryDate, lines, archiveIds });
      setSavedAt(new Date().toLocaleTimeString());
      await load(unitId); // reload = adopt server ids + recompute generated cols
    } catch (e) {
      setError(`Save failed — nothing was stored. ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!hasPerm('data_entry')) {
    return <div className="placeholder"><strong>Data Entry</strong>You do not have the data-entry permission.</div>;
  }
  if (!entryUnits.length) {
    return <div className="placeholder"><strong>Data Entry</strong>No Rig/Hoist is assigned to your account. Ask an administrator for a unit assignment.</div>;
  }

  let rIdx = -1;
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontFamily: 'var(--disp)', fontWeight: 600 }}>
          Rig / Hoist{' '}
          <select value={unitId} disabled={dirty}
            title={dirty ? 'Save or discard changes before switching units' : ''}
            onChange={(e) => setUnitId(e.target.value)}
            style={{ background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px' }}>
            {entryUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label style={{ fontFamily: 'var(--disp)', fontWeight: 600 }}>
          Date of Update{' '}
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
            style={{ background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 8px' }} />
        </label>
        <span style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>Unit: Joints</span>
        <div className="spacer" style={{ flex: 1 }} />
        {lastSub && (
          <span style={{ color: 'var(--faint)', fontSize: 12 }}>
            Last saved {new Date(lastSub.submittedAt).toLocaleString()} ({lastSub.source})
          </span>
        )}
        {savedAt && <span style={{ color: 'var(--green)', fontSize: 12 }}>✔ Saved {savedAt}</span>}
        {dirty && <span style={{ color: 'var(--amber)', fontSize: 12, fontWeight: 600 }}>● Unsaved changes</span>}
        <button onClick={() => void load(unitId)} disabled={saving}
          style={{ border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '7px 12px', borderRadius: 7, cursor: 'pointer' }}>
          Discard
        </button>
        <button onClick={() => void save()} disabled={saving || loading || !dirty}
          style={{ border: 0, background: 'var(--accent)', color: '#fff', padding: '7px 16px', borderRadius: 7, fontWeight: 700, cursor: 'pointer', opacity: saving || !dirty ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save sheet'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ border: '1px solid var(--red)', color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 8%, var(--panel))', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="placeholder">Loading sheet…</div>
      ) : (
        <table ref={tableRef} style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)', fontSize: 12.5 }}>
          <thead>
            <tr style={{ font: '10.5px var(--mono)', color: 'var(--dim)' }}>
              {['TUBULAR DESCRIPTION', ...QTY_FIELDS.slice(0, 1).map((f) => QTY_LABEL[f]), 'ON BOARD', ...QTY_FIELDS.slice(1).map((f) => QTY_LABEL[f]), 'RENTAL DATE', 'CONTRACT-UALLY LESS', 'REMARKS', ''].map((h, i) => (
                <th key={i} style={{ border: '1px solid var(--line2)', background: 'var(--sunk)', padding: '7px 6px', textAlign: i === 0 ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ cat, items }) => {
              const header = (
                <tr key={`h-${cat}`}>
                  <td colSpan={16} style={{ background: 'var(--panel2)', border: '1px solid var(--line2)', padding: '6px 10px', fontFamily: 'var(--disp)', fontWeight: 700, letterSpacing: 0.6 }}>
                    ◆ {CATEGORY_LABEL[cat]}
                    <button onClick={() => addRow(cat)}
                      style={{ marginLeft: 12, border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--accent)', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}>
                      + row
                    </button>
                  </td>
                </tr>
              );
              const body = items.map((row) => {
                rIdx += 1;
                const r = rIdx;
                const nums = qtyNum(row);
                const hasDesc = !!row.catalogItemId;
                const variance = overrideVariance(nums, row.onBoardOverride);
                const errs = row.dirty ? rowErrors(row) : [];
                return (
                  <tr key={row.key} style={errs.length ? { outline: '1px solid var(--red)' } : undefined}>
                    <td style={{ ...td, minWidth: 230 }}>
                      <select value={row.catalogItemId} data-r={r} data-c={0}
                        onKeyDown={(e) => onGridKey(e, r, 0)}
                        onChange={(e) => patch(row.key, (x) => ({ ...x, catalogItemId: e.target.value }))}
                        style={{ ...cellInput, textAlign: 'left', fontFamily: 'var(--body)' }}>
                        <option value="">— select —</option>
                        {catalog.filter((c) => c.category === cat && c.active).map((c) => (
                          <option key={c.id} value={c.id}>{c.description}</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <input value={row.qty.onContract} data-r={r} data-c={1} inputMode="numeric"
                        onKeyDown={(e) => onGridKey(e, r, 1)}
                        onPaste={(e) => onPaste(e, row.key, 'onContract')}
                        onChange={(e) => patch(row.key, (x) => ({ ...x, qty: { ...x.qty, onContract: e.target.value } }))}
                        style={cellInput} />
                    </td>
                    <td style={tdRo} title={variance != null ? `Reported total ${row.onBoardOverride} differs from class sum by ${variance > 0 ? '+' : ''}${variance} (legacy import)` : 'Computed: Premium + Class 2 + Class 3 + Scrap'}>
                      {onBoardTotal(nums)}{variance != null && <span style={{ color: 'var(--amber)' }}> ⚑{row.onBoardOverride}</span>}
                    </td>
                    {QTY_FIELDS.slice(1).map((f, i) => (
                      <td key={f} style={td}>
                        <input value={row.qty[f]} data-r={r} data-c={i + 2} inputMode="numeric"
                          onKeyDown={(e) => onGridKey(e, r, i + 2)}
                          onPaste={(e) => onPaste(e, row.key, f)}
                          onChange={(e) => patch(row.key, (x) => ({ ...x, qty: { ...x.qty, [f]: e.target.value } }))}
                          style={cellInput} />
                      </td>
                    ))}
                    <td style={td}>
                      <input type="date" value={row.rentalDate} data-r={r} data-c={11}
                        onKeyDown={(e) => onGridKey(e, r, 11)}
                        onChange={(e) => patch(row.key, (x) => ({ ...x, rentalDate: e.target.value }))}
                        style={{ ...cellInput, textAlign: 'left', width: 130 }} />
                    </td>
                    <td style={{ ...tdRo, color: contractuallyLess(nums, hasDesc) === 'OK' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {contractuallyLess(nums, hasDesc)}
                    </td>
                    <td style={{ ...td, minWidth: 120 }}>
                      <input value={row.remarks} data-r={r} data-c={12}
                        onKeyDown={(e) => onGridKey(e, r, 12)}
                        onChange={(e) => patch(row.key, (x) => ({ ...x, remarks: e.target.value }))}
                        style={{ ...cellInput, textAlign: 'left', fontFamily: 'var(--body)' }} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button title="Remove row (archived on save — never hard-deleted)" onClick={() => removeRow(row)}
                        style={{ border: 0, background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                );
              });
              return [header, ...body];
            })}
          </tbody>
        </table>
      )}
      {archive.length > 0 && (
        <div style={{ color: 'var(--amber)', fontSize: 12, marginTop: 8 }}>
          {archive.length} row(s) will be archived on save.
        </div>
      )}
    </div>
  );
}
