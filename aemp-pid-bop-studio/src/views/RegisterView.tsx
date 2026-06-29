// Equipment Sheet (register) — PRD §7.6, FR-24..28.
// Fully wired to the extracted status engine + project state to prove the
// modules work end-to-end. Search / filter / sort + summary counters + CSV.
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/ProjectContext';
import { useAuth } from '../state/AuthContext';
import { STATUS_COLOR, STATUS_LABEL, statusOf, summarize } from '../lib/status';
import { SYM, type SymbolKey } from '../lib/symbols';
import { parseCsv, pick } from '../lib/csv';
import { parseXlsx } from '../lib/xlsx';
import { replaceRigEquipment, type EquipmentInput } from '../lib/cloud';
import ImportDialog, { type DupMode } from '../components/ImportDialog';
import type { MappedRow } from '../lib/importMap';
import type { Component, InspectionStatus } from '../types';

const nz = (v: string) => (v && v.trim() ? v : null);

export default function RegisterView() {
  const { project, refDate, importAEMP, addComponents, updateNode, requestFocus } = useProject();
  const { enabled: cloudEnabled, role, rig } = useAuth();
  const navigate = useNavigate();
  const [importData, setImportData] = useState<{ rows: Record<string, string>[]; headers: string[] } | null>(null);
  const existingTags = useMemo(() => new Set(project.nodes.map((n) => n.tag).filter(Boolean)), [project.nodes]);

  // FR-27: jump from a register row to the item on the diagram
  function viewOnDiagram(id: string) {
    requestFocus(id);
    navigate('/full');
  }
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | InspectionStatus>('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cloudFileRef = useRef<HTMLInputElement | null>(null);
  const canPushCloud = cloudEnabled && role === 'admin';

  function csvToEquipment(rows: Record<string, string>[]): EquipmentInput[] {
    return rows.map((r) => ({
      tag: nz(pick(r, 'tag')),
      type: nz(pick(r, 'type', 'symbol').toLowerCase()),
      section: nz(pick(r, 'system', 'section')),
      description: nz(pick(r, 'description', 'desc')),
      rwp: nz(pick(r, 'rwp')),
      size: nz(pick(r, 'size')),
      manufacturer: nz(pick(r, 'manufacturer', 'mfr')),
      serial: nz(pick(r, 'serial', 'sn')),
      int_last: nz(pick(r, 'int_last', 'intermediate last')),
      int_due: nz(pick(r, 'int_due', 'intermediate due')),
      maj_last: nz(pick(r, 'maj_last', 'major last')),
      maj_due: nz(pick(r, 'maj_due', 'major due')),
    }));
  }

  async function onPushCloud(file: File) {
    const targetRig = rig || project.meta.rig;
    if (!confirm(`Replace the shared "${targetRig}" equipment register in AEMP/Supabase with this CSV? This overwrites that rig's rows.`)) return;
    try {
      const rows = csvToEquipment(parseCsv(await file.text()));
      const n = await replaceRigEquipment(targetRig, rows);
      alert(`Pushed ${n} rows to the "${targetRig}" register. Use “Import from AEMP” to pull them in.`);
    } catch (e) {
      alert(`Cloud push failed: ${(e as Error).message}`);
    }
  }

  // Parse a CSV/XLSX file, then open the column-mapping dialog (report §5).
  async function onPickImport(file: File) {
    try {
      const rows = file.name.toLowerCase().endsWith('.xlsx')
        ? await parseXlsx(await file.arrayBuffer())
        : parseCsv(await file.text());
      if (!rows.length) { alert('No rows found in that file.'); return; }
      const headers = Object.keys(rows[0]);
      setImportData({ rows, headers });
    } catch (e) {
      alert(`Could not read file: ${(e as Error).message}`);
    }
  }

  // Apply the mapped rows with duplicate-tag handling (skip / overwrite / rename).
  function onApplyImport(mapped: MappedRow[], dup: DupMode) {
    setImportData(null);
    const tagToId = new Map(project.nodes.filter((n) => n.tag).map((n) => [n.tag, n.id]));
    let added = 0, updated = 0, skipped = 0;
    if (dup === 'overwrite') {
      const toAdd: MappedRow[] = [];
      for (const r of mapped) {
        const id = r.tag ? tagToId.get(r.tag) : undefined;
        if (id) { updateNode(id, r as Partial<Component>); updated++; }
        else toAdd.push(r);
      }
      added = addComponents(toAdd);
    } else if (dup === 'rename') {
      const used = new Set(existingTags);
      const renamed = mapped.map((r) => {
        if (!r.tag || !used.has(r.tag)) { if (r.tag) used.add(r.tag); return r; }
        let t = r.tag, i = 2;
        while (used.has(t)) t = `${r.tag}-${i++}`;
        used.add(t);
        return { ...r, tag: t };
      });
      added = addComponents(renamed);
    } else {
      const fresh = mapped.filter((r) => !r.tag || !existingTags.has(r.tag));
      skipped = mapped.length - fresh.length;
      added = addComponents(fresh);
    }
    alert(`Imported: ${added} added${updated ? `, ${updated} updated` : ''}${skipped ? `, ${skipped} skipped` : ''}.`);
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return project.nodes
      .map((n) => ({ n, status: statusOf(n, refDate) }))
      .filter(({ n, status }) => {
        if (statusFilter && status !== statusFilter) return false;
        if (!needle) return true;
        return [n.tag, n.description, n.serial].some((v) => (v || '').toLowerCase().includes(needle));
      });
  }, [project.nodes, q, statusFilter, refDate]);

  const counts = useMemo(() => summarize(project.nodes, refDate), [project.nodes, refDate]);

  function exportCsv() {
    const head = ['tag', 'description', 'system', 'rwp', 'size', 'manufacturer', 'serial', 'int_due', 'maj_due', 'status', 'removed'];
    const lines = [head.join(',')];
    for (const { n, status } of rows) {
      lines.push(
        [n.tag, n.description, n.section, n.rwp, n.size, n.manufacturer, n.serial, n.int_due, n.maj_due, STATUS_LABEL[status], n.removed ? 'removed' : 'installed']
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.meta.rig.replace(/\s+/g, '_')}_register.csv`;
    a.click();
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
        <Counter n={counts.total} label="Components" />
        <Counter n={counts.ok} label="In Date" color="var(--green)" />
        <Counter n={counts.due} label="Due Soon" color="var(--amber)" />
        <Counter n={counts.over} label="Overdue" color="var(--red)" />
        <Counter n={counts.untag} label="Untagged" color="var(--faint)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="Search tag, desc, serial…" value={q} onChange={(e) => setQ(e.target.value)} style={inp} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InspectionStatus | '')} style={inp}>
          <option value="">All status</option>
          <option value="over">Overdue</option>
          <option value="due">Due soon</option>
          <option value="ok">In date</option>
          <option value="untag">Untagged</option>
        </select>
        <span className="spacer" style={{ flex: 1 }} />
        <button style={btn} onClick={() => importAEMP()}>Import from AEMP</button>
        <button style={btn} onClick={() => fileRef.current?.click()}>Import CSV/XLSX</button>
        <button style={btn} onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        {canPushCloud && (
          <button style={{ ...btn, borderColor: 'var(--accent2)', color: 'var(--accent2)' }} onClick={() => cloudFileRef.current?.click()}
            title="Admin: replace this rig's shared equipment register from a CSV">Push CSV → Cloud</button>
        )}
        <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImport(f); e.target.value = ''; }} />
        <input ref={cloudFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPushCloud(f); e.target.value = ''; }} />
      </div>

      {rows.length === 0 ? (
        <div className="placeholder">
          <strong>No equipment yet</strong>
          Import from AEMP (offline cache) or build the master P&amp;ID to populate the register.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 12 }}>
          <thead>
            <tr>
              {['Tag', 'Symbol', 'Description', 'System', 'RWP', 'Size', 'Serial', 'Int due', 'Maj due', 'Status', ''].map((h, i) => (
                <th key={h || `c${i}`} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ n, status }) => (
              <tr key={n.id} style={{ opacity: n.removed ? 0.4 : 1 }}>
                <td style={td}>{n.tag || '—'}</td>
                <td style={td}>{SYM[n.type as SymbolKey]?.name ?? n.type}</td>
                <td style={td}>{n.description}</td>
                <td style={td}>{n.section}</td>
                <td style={td}>{n.rwp}</td>
                <td style={td}>{n.size}</td>
                <td style={td}>{n.serial}</td>
                <td style={td}>{n.int_due || '—'}</td>
                <td style={td}>{n.maj_due || '—'}</td>
                <td style={{ ...td, color: STATUS_COLOR[status], fontWeight: 600 }}>{STATUS_LABEL[status]}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button style={viewBtn} title="Show this item on the diagram" onClick={() => viewOnDiagram(n.id)}>view ▸</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {importData && (
        <ImportDialog
          rows={importData.rows}
          headers={importData.headers}
          existingTags={existingTags}
          onCancel={() => setImportData(null)}
          onApply={onApplyImport}
        />
      )}
    </div>
  );
}

function Counter({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: '10px 16px', minWidth: 92 }}>
      <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 700, color: color ?? 'var(--ink)' }}>{n}</div>
      <div style={{ fontSize: 11, color: 'var(--faint)' }}>{label}</div>
    </div>
  );
}

const inp: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontFamily: 'var(--mono)', fontSize: 12.5 };
const btn: React.CSSProperties = { ...inp, cursor: 'pointer', fontWeight: 600 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--line2)', color: 'var(--faint)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--bg)' };
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--line)' };
const viewBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--line2)', color: 'var(--accent)', padding: '3px 8px', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
