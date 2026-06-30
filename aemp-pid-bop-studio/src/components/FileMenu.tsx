// ============================================================================
//  File ▾ — one header dropdown combining Save / Open / Excel / Print / CSV,
//  plus the admin Draft/Publish workflow. Field (read-only) users see only the
//  export + print actions.
// ============================================================================
import { useRef, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { exportEquipmentCsv } from '../lib/exporters';
import { exportWorkbook } from '../lib/xlsxExport';
import { printPid, printBop } from '../lib/printExport';

export default function FileMenu() {
  const p = useProject();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const close = () => setOpen(false);
  const run = (fn: () => void | Promise<void>) => async () => {
    close();
    try { await fn(); } catch (e) { alert((e as Error).message); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button style={hdrBtn} onClick={() => setOpen((o) => !o)} title="File, export & publish">File ▾</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={close} />
          <div style={menu}>
            {p.canEdit && <>
              <Item label="Save project (.json)" onClick={run(() => p.saveProject())} />
              <Item label="Open project (.json)…" onClick={() => { close(); fileRef.current?.click(); }} />
              <Sep />
              {p.cloudEnabled && <>
                <Item label="☁ Save as draft" onClick={run(async () => { await p.saveAsDraft(); })} />
                <Item label="✓ Publish final sheet" accent onClick={run(async () => {
                  if (!confirm('Publish the final sheet? End users on this rig will see this version.')) return;
                  await p.publishFinal();
                  alert('Published ✓ — end users on this rig now see this final sheet.');
                })} />
              </>}
              <Sep />
            </>}
            <Item label="Export equipment CSV" onClick={run(() => exportEquipmentCsv(p.project, p.project.nodes, p.refDate))} />
            <Item label="Export Excel (P&ID + equipment)" onClick={run(() => exportWorkbook(p.project, p.refDate))} />
            <Sep />
            <Item label="Print P&ID (PDF)" onClick={run(() => printPid(p.project, p.refDate))} />
            <Item label="Print BOP (PDF)" onClick={run(() => printBop(p.project))} />
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) p.openProject(f).catch((err) => alert(`Could not open: ${err.message}`)); e.target.value = ''; }} />
    </div>
  );
}

function Item({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} style={{ ...item, ...(accent ? { color: 'var(--accent)', fontWeight: 700 } : {}) }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {label}
    </button>
  );
}
const Sep = () => <div style={{ height: 1, background: 'var(--line2)', margin: '4px 0' }} />;

const hdrBtn: React.CSSProperties = { border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '7px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const menu: React.CSSProperties = { position: 'absolute', top: '110%', left: 0, zIndex: 41, minWidth: 230, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, boxShadow: 'var(--shadow)', padding: 5 };
const item: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', color: 'var(--ink)', padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer' };
