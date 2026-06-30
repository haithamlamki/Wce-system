// ============================================================================
//  Symbol Drawer — vector editor to draw a new custom symbol (rect / ellipse /
//  line / polygon), ported from the prototype's drawer. Saves into the project's
//  custom-symbol library via ProjectContext.
// ============================================================================
import { useReducer, useRef, useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { SYM, type DrawShape } from '../lib/symbols';
import { allCategories, serializeShapes } from '../lib/customSymbols';

type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'poly';
const CW = 440, CH = 330;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function SymbolDrawer({ editKey, onClose, onSaved }: { editKey?: string | null; onClose: () => void; onSaved: () => void }) {
  const { project, addCustomSymbol, updateCustomSymbol } = useProject();
  // When editing, prefer a project override; fall back to the built-in def so
  // built-in symbols can be edited too (their artwork is kept unless redrawn).
  const editing = editKey ? (project.customSymbols?.[editKey] ?? SYM[editKey]) : undefined;

  const shapesRef = useRef<DrawShape[]>(editing?.shapes ? JSON.parse(JSON.stringify(editing.shapes)) : []);
  const selRef = useRef(-1);
  const polyRef = useRef<DrawShape | null>(null);
  const dragRef = useRef<{ mode?: 'new'; start?: { x: number; y: number }; last?: { x: number; y: number } } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [, redraw] = useReducer((x) => x + 1, 0);

  const [tool, setTool] = useState<Tool>(editing ? 'select' : 'rect');
  const [stroke, setStroke] = useState(editing?.color || '#cf3a30');
  const [fill, setFill] = useState('#e9685b');
  const [nofill, setNofill] = useState(false);
  const [sw, setSw] = useState(2.4);
  const [W, setW] = useState(editing?.w || 100);
  const [H, setH] = useState(editing?.h || 70);
  const [name, setName] = useState(editing?.name || '');
  const [cat, setCat] = useState(editing?.cat || 'Custom');
  const [color, setColor] = useState(editing?.color || '#cf3a30');

  const Z = Math.max(0.5, Math.min((CW - 26) / W, (CH - 26) / H));
  const ox = (CW - W * Z) / 2;
  const oy = (CH - H * Z) / 2;

  const toLocal = (e: React.MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: clamp(Math.round((e.clientX - r.left - ox) / Z), 0, W), y: clamp(Math.round((e.clientY - r.top - oy) / Z), 0, H) };
  };
  const hit = (pt: { x: number; y: number }) => {
    const sh = shapesRef.current;
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i];
      let x, y, w, h;
      if (s.type === 'poly') {
        const xs = s.points!.map((p) => p[0]), ys = s.points!.map((p) => p[1]);
        x = Math.min(...xs); y = Math.min(...ys); w = Math.max(...xs) - x; h = Math.max(...ys) - y;
      } else { x = Math.min(s.x!, s.x! + s.w!); y = Math.min(s.y!, s.y! + s.h!); w = Math.abs(s.w!); h = Math.abs(s.h!); }
      if (pt.x >= x - 2 && pt.x <= x + w + 2 && pt.y >= y - 2 && pt.y <= y + h + 2) return i;
    }
    return -1;
  };

  function onDown(e: React.MouseEvent) {
    const pt = toLocal(e);
    if (tool === 'select') { const i = hit(pt); selRef.current = i; dragRef.current = i >= 0 ? { last: pt } : null; redraw(); return; }
    if (tool === 'poly') {
      if (!polyRef.current) polyRef.current = { type: 'poly', points: [[pt.x, pt.y]], stroke, fill: nofill ? 'none' : fill, sw };
      else polyRef.current.points!.push([pt.x, pt.y]);
      redraw(); return;
    }
    const sh: DrawShape = { type: tool, x: pt.x, y: pt.y, w: 0, h: 0, stroke, fill: nofill ? 'none' : fill, sw };
    shapesRef.current.push(sh);
    selRef.current = shapesRef.current.length - 1;
    dragRef.current = { mode: 'new', start: pt };
    redraw();
  }
  function onMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    const pt = toLocal(e);
    const sel = selRef.current;
    if (d.mode === 'new') { const s = shapesRef.current[sel]; s.w = pt.x - d.start!.x; s.h = pt.y - d.start!.y; redraw(); }
    else if (sel >= 0 && d.last) {
      const dx = pt.x - d.last.x, dy = pt.y - d.last.y; const s = shapesRef.current[sel];
      if (s.type === 'poly') s.points = s.points!.map((p) => [p[0] + dx, p[1] + dy]); else { s.x! += dx; s.y! += dy; }
      d.last = pt; redraw();
    }
  }
  function onUp() {
    const d = dragRef.current;
    if (d?.mode === 'new') { const s = shapesRef.current[selRef.current]; if (Math.abs(s.w!) < 2 && Math.abs(s.h!) < 2) { shapesRef.current.splice(selRef.current, 1); selRef.current = -1; } }
    dragRef.current = null; redraw();
  }
  function onDbl() { if (polyRef.current) { if (polyRef.current.points!.length >= 3) shapesRef.current.push(polyRef.current); polyRef.current = null; redraw(); } }

  function delSel() { if (selRef.current >= 0) { shapesRef.current.splice(selRef.current, 1); selRef.current = -1; redraw(); } }
  function applyToSel(patch: Partial<DrawShape>) { if (selRef.current >= 0) { Object.assign(shapesRef.current[selRef.current], patch); redraw(); } }

  function save() {
    const had = shapesRef.current.length > 0;
    const svg = had ? serializeShapes(shapesRef.current) : editing?.svg;
    if (!svg) { alert('Draw at least one shape.'); return; }
    const def = { name: name.trim() || 'Custom symbol', cat: cat.trim() || 'Custom', w: +W || 100, h: +H || 70, color, svg, shapes: had ? shapesRef.current : editing?.shapes };
    if (editKey) updateCustomSymbol(editKey, def); else addCustomSymbol(def);
    onSaved();
  }

  const TOOLS: Array<[Tool | 'del', string]> = [['select', '⬉'], ['rect', '▭'], ['ellipse', '◯'], ['line', '╱'], ['poly', '⬠'], ['del', '🗑']];

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18 }}>{editKey ? 'Edit symbol' : 'Symbol drawer'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={ghost} onClick={onClose}>Cancel</button>
            <button style={primary} onClick={save}>Save symbol</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 190px', gap: 14 }}>
          {/* tools + style */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TOOLS.map(([t, icon]) => (
              <button key={t} style={{ ...toolBtn, ...(t !== 'del' && tool === t ? toolOn : {}) }}
                onClick={() => (t === 'del' ? delSel() : setTool(t))}>{icon}</button>
            ))}
            <Row label="Stroke"><input type="color" value={stroke} onChange={(e) => { setStroke(e.target.value); applyToSel({ stroke: e.target.value }); }} /></Row>
            <Row label="Fill"><input type="color" value={fill} onChange={(e) => { setFill(e.target.value); applyToSel({ fill: nofill ? 'none' : e.target.value }); }} /></Row>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
              <input type="checkbox" checked={nofill} onChange={(e) => { setNofill(e.target.checked); applyToSel({ fill: e.target.checked ? 'none' : fill }); }} /> no fill
            </label>
            <div style={{ fontSize: 11.5 }}>Stroke w.</div>
            <input type="range" min={0.5} max={6} step={0.1} value={sw} onChange={(e) => { setSw(+e.target.value); applyToSel({ sw: +e.target.value }); }} />
          </div>

          {/* canvas */}
          <svg ref={svgRef} width={CW} height={CH} style={{ background: 'var(--sunk)', borderRadius: 8, cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onDoubleClick={onDbl}>
            <rect x={ox} y={oy} width={W * Z} height={H * Z} fill="var(--panel)" stroke="var(--line2)" />
            {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => i * 10).map((gx) => (
              <line key={`x${gx}`} x1={ox + gx * Z} y1={oy} x2={ox + gx * Z} y2={oy + H * Z} stroke="var(--line)" strokeWidth={1} />
            ))}
            {Array.from({ length: Math.floor(H / 10) + 1 }, (_, i) => i * 10).map((gy) => (
              <line key={`y${gy}`} x1={ox} y1={oy + gy * Z} x2={ox + W * Z} y2={oy + gy * Z} stroke="var(--line)" strokeWidth={1} />
            ))}
            {shapesRef.current.map((s, i) => renderShape(s, i === selRef.current, Z, ox, oy, i))}
            {polyRef.current && renderShape(polyRef.current, false, Z, ox, oy, -1)}
            {polyRef.current?.points!.map((p, i) => <circle key={`p${i}`} cx={ox + p[0] * Z} cy={oy + p[1] * Z} r={3} fill="var(--accent)" />)}
          </svg>

          {/* identity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Name"><input style={inp} placeholder="My valve" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Category">
              <input style={inp} list="dr-cats" value={cat} onChange={(e) => setCat(e.target.value)} />
              <datalist id="dr-cats">{allCategories().map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Width"><input style={inp} type="number" value={W} onChange={(e) => setW(+e.target.value)} /></Field>
              <Field label="Height"><input style={inp} type="number" value={H} onChange={(e) => setH(+e.target.value)} /></Field>
            </div>
            <Field label="Identity color"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: '100%' }} /></Field>
            <div style={{ fontSize: 11, color: 'var(--faint)', lineHeight: 1.6 }}>
              Drag for rectangle / ellipse / line. For a polygon, click points then double-click to close. Use Select to move or delete a shape.
              {editKey && !editing?.shapes && (
                <> This symbol has no editable shapes — change its name / size / colour here, draw new shapes to replace the artwork, or use <b>Upload</b> in the library to swap in an SVG.</>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderShape(s: DrawShape, sel: boolean, Z: number, ox: number, oy: number, key: number) {
  const f = s.fill === 'none' ? 'none' : s.fill;
  const sw = s.sw * Z;
  let el: React.ReactNode = null, bb: [number, number, number, number] | null = null;
  if (s.type === 'rect') {
    const x = ox + Math.min(s.x!, s.x! + s.w!) * Z, y = oy + Math.min(s.y!, s.y! + s.h!) * Z, w = Math.abs(s.w!) * Z, h = Math.abs(s.h!) * Z;
    el = <rect x={x} y={y} width={w} height={h} fill={f} stroke={s.stroke} strokeWidth={sw} />; bb = [x, y, w, h];
  } else if (s.type === 'ellipse') {
    const cx = ox + (s.x! + s.w! / 2) * Z, cy = oy + (s.y! + s.h! / 2) * Z, rx = Math.abs(s.w! / 2) * Z, ry = Math.abs(s.h! / 2) * Z;
    el = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={f} stroke={s.stroke} strokeWidth={sw} />; bb = [cx - rx, cy - ry, rx * 2, ry * 2];
  } else if (s.type === 'line') {
    const x1 = ox + s.x! * Z, y1 = oy + s.y! * Z, x2 = ox + (s.x! + s.w!) * Z, y2 = oy + (s.y! + s.h!) * Z;
    el = <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={s.stroke} strokeWidth={sw} />; bb = [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
  } else if (s.type === 'poly') {
    const pts = s.points!.map((p) => (ox + p[0] * Z) + ',' + (oy + p[1] * Z)).join(' ');
    const xs = s.points!.map((p) => ox + p[0] * Z), ys = s.points!.map((p) => oy + p[1] * Z);
    el = <polygon points={pts} fill={f} stroke={s.stroke} strokeWidth={sw} />; bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  }
  return (
    <g key={key}>
      {el}
      {sel && bb && <rect x={bb[0] - 3} y={bb[1] - 3} width={bb[2] + 6} height={bb[3] + 6} fill="none" stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="4 3" />}
    </g>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={lbl}>{label}</label>{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, marginTop: 4 }}><span>{label}</span>{children}</div>;
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: '#0008', display: 'grid', placeItems: 'center', zIndex: 110 };
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: 20, width: 'min(860px, 96vw)' };
const toolBtn: React.CSSProperties = { padding: '8px 0', background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 7, cursor: 'pointer', fontSize: 15, color: 'var(--ink)' };
const toolOn: React.CSSProperties = { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
const lbl: React.CSSProperties = { display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontSize: 12.5 };
const primary: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const ghost: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
