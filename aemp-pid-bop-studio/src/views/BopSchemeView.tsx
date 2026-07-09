// ============================================================================
//  BOP Scheme — elevation stack-up (PRD §7.8, FR-31..35)
//  Scaled vertical elevation: datum → rotary table (RKB), components drawn to
//  scale by height with an elevation axis, top-of-stack and clearance-to-RT
//  dimension. Units convert m/ft. Hover shows details + inspection status.
// ============================================================================
import { useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { SECTION_NAMES, stackMetrics, toFeet, toMetres, type HoleSection } from '../lib/bop';
import { printBop } from '../lib/printExport';
import { safeColor } from '../lib/sanitizeSvg';
import { SYM, type SymbolKey } from '../lib/symbols';
import { STATUS_COLOR, STATUS_LABEL, statusOf } from '../lib/status';
import type { BopItem } from '../types';
import SvgMarkup from '../components/SvgMarkup';

const W = 520;
const H = 680;
const PAD_T = 36;
const PAD_B = 36;
const AXIS_X = 74;
const STACK_CX = 300;

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const m = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return m * pow;
}

export default function BopSchemeView() {
  const { project, refDate, buildBop, setProject } = useProject();
  const { bop } = project;
  const [hover, setHover] = useState<{ it: BopItem; x: number; y: number } | null>(null);
  const [section, setSection] = useState<HoleSection>('12.25');

  const m = stackMetrics(bop);
  const toUnit = (v: number) => (bop.unit === 'ft' ? toFeet(v) : v);
  const fromUnit = (v: number) => (bop.unit === 'ft' ? toMetres(v) : v);
  const fmt = (v: number) => toUnit(v).toFixed(2);
  const patchBop = (patch: Partial<typeof bop>) => setProject({ ...project, bop: { ...bop, ...patch } });

  // elevation range (metres, internal) → y pixels
  const top = Math.max(bop.rt, m.topOfStack);
  const range = Math.max(0.5, top - bop.datum);
  const head = range * 0.12;
  const drawMax = top + head;
  const drawMin = bop.datum - head * 0.5;
  const pxPerUnit = (H - PAD_T - PAD_B) / (drawMax - drawMin);
  const y = (elev: number) => PAD_T + (drawMax - elev) * pxPerUnit;

  // cumulative band elevations (item 0 sits on the datum) — main stack only
  let acc = bop.datum;
  const bands = bop.items.filter((it) => !it.side).map((it) => {
    const bottom = acc;
    const topE = acc + it.height;
    acc = topE;
    return { it, bottom, topE };
  });

  // side outlet branches (choke / kill) attach at the mud-cross outlet elevation
  const crossBand = bands.find((b) => b.it.type === 'cross') ?? bands[Math.floor(bands.length / 2)];
  const outletElev = crossBand ? (crossBand.bottom + crossBand.topE) / 2 : (bop.datum + m.topOfStack) / 2;
  const sideItems = bop.items.filter((it) => it.side);
  const sortBranch = (sd: 'choke' | 'kill') => sideItems.filter((it) => it.side === sd).sort((a, b) => (a.branchOrder ?? 0) - (b.branchOrder ?? 0));

  function Branch({ items, dir, label }: { items: BopItem[]; dir: 1 | -1; label: string }) {
    if (!items.length) return null;
    const oy = y(outletElev);
    const spacing = 66;
    const startX = STACK_CX + dir * 64;
    const endX = startX + dir * (items.length - 1) * spacing;
    return (
      <g>
        <line x1={STACK_CX} y1={oy} x2={endX} y2={oy} stroke="var(--line2)" strokeWidth={2} />
        <text x={endX + dir * 8} y={oy - 26} textAnchor={dir > 0 ? 'end' : 'start'} style={{ font: '600 9px var(--mono)', fill: 'var(--faint)' }}>{label}</text>
        {items.map((it, i) => {
          const s = SYM[it.type as SymbolKey];
          const sc = Math.min(42 / s.w, 36 / s.h);
          const cx = startX + dir * i * spacing;
          const dw = s.w * sc, dh = s.h * sc;
          const st = statusOf(it, refDate);
          return (
            <g key={it.id} onPointerMove={(e) => setHover({ it, x: e.clientX, y: e.clientY })} onPointerLeave={() => setHover(null)} style={{ cursor: 'default' }}>
              <circle cx={cx} cy={oy} r={3} fill="var(--line2)" />
              <SvgMarkup svg={s.svg} transform={`translate(${cx - dw / 2},${oy - dh - 6}) scale(${sc})`} style={{ color: safeColor(s.color) }} />
              <circle cx={cx + dw / 2 - 2} cy={oy - dh - 8} r={4} fill="var(--panel)" stroke={STATUS_COLOR[st]} strokeWidth={2} />
              <text x={cx} y={oy + 14} textAnchor="middle" style={{ font: '8.5px var(--mono)', fill: 'var(--ink)' }}>{it.tag}</text>
            </g>
          );
        })}
      </g>
    );
  }

  // axis ticks
  const step = niceStep((drawMax - drawMin) / 7);
  const ticks: number[] = [];
  for (let e = Math.ceil(drawMin / step) * step; e <= drawMax; e += step) ticks.push(+e.toFixed(6));

  const clearanceColor = m.clearanceToRT < 0 ? 'var(--red)' : 'var(--accent2)';

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, background: 'var(--sunk)', overflow: 'auto', display: 'grid', placeItems: 'center', position: 'relative' }}>
        {bop.items.length === 0 ? (
          <div className="placeholder">
            <strong>No stack yet</strong>
            Choose a hole section and AI-build the BOP stack-up.
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ maxHeight: '100%', padding: 16 }}
            onPointerLeave={() => setHover(null)}>
            {/* elevation axis */}
            <line x1={AXIS_X} y1={PAD_T} x2={AXIS_X} y2={H - PAD_B} stroke="var(--line2)" strokeWidth={1.5} />
            {ticks.map((e) => (
              <g key={e}>
                <line x1={AXIS_X - 5} y1={y(e)} x2={AXIS_X} y2={y(e)} stroke="var(--line2)" />
                <line x1={AXIS_X} y1={y(e)} x2={W - 24} y2={y(e)} stroke="var(--line)" strokeDasharray="2 5" />
                <text x={AXIS_X - 9} y={y(e) + 3.5} textAnchor="end" style={{ font: '10px var(--mono)', fill: 'var(--faint)' }}>{toUnit(e).toFixed(1)}</text>
              </g>
            ))}
            <text x={18} y={PAD_T - 14} style={{ font: '600 10px var(--mono)', fill: 'var(--dim)' }}>EL ({bop.unit})</text>

            {/* datum line */}
            <line x1={AXIS_X} y1={y(bop.datum)} x2={W - 24} y2={y(bop.datum)} stroke="var(--ink)" strokeWidth={1.5} />
            <text x={W - 24} y={y(bop.datum) - 5} textAnchor="end" style={{ font: '600 10px var(--mono)', fill: 'var(--ink)' }}>DATUM {fmt(bop.datum)}</text>

            {/* rotary table */}
            <line x1={AXIS_X} y1={y(bop.rt)} x2={W - 24} y2={y(bop.rt)} stroke="var(--accent2)" strokeWidth={1.8} strokeDasharray="7 4" />
            <text x={W - 24} y={y(bop.rt) - 5} textAnchor="end" style={{ font: '600 10px var(--mono)', fill: 'var(--accent2)' }}>RKB {fmt(bop.rt)}</text>

            {/* clearance-to-RT dimension */}
            {(() => {
              const xDim = STACK_CX + 120;
              const yTop = y(m.topOfStack);
              const yRt = y(bop.rt);
              return (
                <g>
                  <line x1={xDim} y1={yTop} x2={xDim} y2={yRt} stroke={clearanceColor} strokeWidth={1.3} />
                  <line x1={xDim - 4} y1={yTop} x2={xDim + 4} y2={yTop} stroke={clearanceColor} strokeWidth={1.3} />
                  <line x1={xDim - 4} y1={yRt} x2={xDim + 4} y2={yRt} stroke={clearanceColor} strokeWidth={1.3} />
                  <text x={xDim + 7} y={(yTop + yRt) / 2 + 3} style={{ font: '600 10px var(--mono)', fill: clearanceColor }}>
                    clr {fmt(m.clearanceToRT)} {bop.unit}
                  </text>
                </g>
              );
            })()}

            {/* stack components (to scale) */}
            {bands.map(({ it, bottom, topE }) => {
              const s = SYM[it.type as SymbolKey];
              const yT = y(topE);
              const bandH = (topE - bottom) * pxPerUnit;
              const scale = Math.min((bandH * 0.92) / s.h, 120 / s.w);
              const dw = s.w * scale;
              const dh = s.h * scale;
              const st = statusOf(it, refDate);
              return (
                <g key={it.id} onPointerMove={(e) => setHover({ it, x: e.clientX, y: e.clientY })}
                  onPointerLeave={() => setHover(null)} style={{ cursor: 'default' }}>
                  {/* status bar on the band */}
                  <rect x={STACK_CX - 66} y={yT} width={4} height={bandH} fill={STATUS_COLOR[st]} rx={2} />
                  <SvgMarkup svg={s.svg} transform={`translate(${STACK_CX - dw / 2},${yT + (bandH - dh) / 2}) scale(${scale})`}
                    style={{ color: safeColor(s.color) }} />
                  <text x={STACK_CX + 78} y={yT + bandH / 2 - 3} style={{ font: '600 11px var(--mono)', fill: 'var(--ink)' }}>{it.tag}</text>
                  <text x={STACK_CX + 78} y={yT + bandH / 2 + 11} style={{ font: '9.5px var(--body)', fill: 'var(--dim)' }}>{fmt(it.height)} {bop.unit}</text>
                </g>
              );
            })}

            {/* choke / kill side valve branches */}
            <Branch items={sortBranch('choke')} dir={1} label="CHOKE" />
            <Branch items={sortBranch('kill')} dir={-1} label="KILL" />

            {/* top-of-stack marker */}
            <line x1={STACK_CX - 70} y1={y(m.topOfStack)} x2={STACK_CX + 70} y2={y(m.topOfStack)} stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="3 3" />
          </svg>
        )}
      </div>

      <aside style={{ width: 330, flex: '0 0 auto', background: 'var(--panel)', borderLeft: '1px solid var(--line2)', padding: 16, overflowY: 'auto' }}>
        <Field label={`Datum (zero) elevation · ${bop.unit}`}>
          <input type="number" step={0.1} value={+toUnit(bop.datum).toFixed(2)} onChange={(e) => patchBop({ datum: fromUnit(+e.target.value) })} style={inp} />
        </Field>
        <Field label={`Rotary table (RKB) · ${bop.unit}`}>
          <input type="number" step={0.1} value={+toUnit(bop.rt).toFixed(2)} onChange={(e) => patchBop({ rt: fromUnit(+e.target.value) })} style={inp} />
        </Field>
        <Field label="Units">
          <select value={bop.unit} onChange={(e) => patchBop({ unit: e.target.value as 'm' | 'ft' })} style={inp}>
            <option value="m">metres</option>
            <option value="ft">feet</option>
          </select>
        </Field>

        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' }} />

        <Field label="Hole section">
          <select id="section" value={section} onChange={(e) => setSection(e.target.value as HoleSection)} style={inp}>
            {(Object.keys(SECTION_NAMES) as HoleSection[]).map((s) => (<option key={s} value={s}>{SECTION_NAMES[s]}</option>))}
          </select>
        </Field>
        <button style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '9px', fontWeight: 600, cursor: 'pointer' }}
          onClick={() => buildBop(section)}>
          AI-build BOP stack
        </button>
        {bop.items.length > 0 && (
          <button style={{ ...inp, width: '100%', cursor: 'pointer', fontWeight: 600, marginTop: 8 }}
            onClick={() => printBop(project)} title="Print / Save as PDF">⎙ Print / PDF</button>
        )}

        {bop.items.length > 0 && (
          <>
            <div style={{ marginTop: 16, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--dim)' }}>
              <Metric k="Stack height" v={`${fmt(m.total)} ${bop.unit}`} />
              <Metric k="Top of stack" v={`${fmt(m.topOfStack)} ${bop.unit}`} />
              <Metric k="Clearance to RT" v={`${fmt(m.clearanceToRT)} ${bop.unit}`} danger={m.clearanceToRT < 0} />
            </div>
            <div style={{ marginTop: 14 }}>
              {[...bop.items].reverse().map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  <span>{it.tag} · {it.description}</span>
                  <EditHeight value={+toUnit(it.height).toFixed(2)} unit={bop.unit}
                    onChange={(val) => setProject({ ...project, bop: { ...bop, items: bop.items.map((x) => x.id === it.id ? { ...x, height: fromUnit(val) } : x) } })} />
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      {hover && <BopTip it={hover.it} x={hover.x} y={hover.y} refDate={refDate} unitFmt={fmt} unit={bop.unit} />}
    </div>
  );
}

function EditHeight({ value, unit, onChange }: { value: number; unit: string; onChange: (v: number) => void }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="number" step={0.05} value={value} onChange={(e) => onChange(+e.target.value)}
        style={{ width: 64, background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '3px 6px', borderRadius: 5, fontFamily: 'var(--mono)', fontSize: 11.5 }} />
      <span style={{ color: 'var(--faint)' }}>{unit}</span>
    </span>
  );
}

function BopTip({ it, x, y, refDate, unitFmt, unit }: { it: BopItem; x: number; y: number; refDate: Date; unitFmt: (v: number) => string; unit: string }) {
  const st = statusOf(it, refDate);
  return (
    <div style={{ position: 'fixed', left: x + 16, top: y + 12, zIndex: 90, width: 230, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 11, boxShadow: 'var(--shadow)', overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13 }}>{it.tag} · {it.description}</div>
      <div style={{ padding: '8px 13px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 11.5, fontFamily: 'var(--mono)' }}>
        <span style={{ color: 'var(--faint)' }}>Height</span><span style={{ textAlign: 'right' }}>{unitFmt(it.height)} {unit}</span>
        <span style={{ color: 'var(--faint)' }}>Serial</span><span style={{ textAlign: 'right' }}>{it.serial || '—'}</span>
        <span style={{ color: 'var(--faint)' }}>Major due</span><span style={{ textAlign: 'right' }}>{it.maj_due || '—'}</span>
      </div>
      <div style={{ padding: '7px 13px', borderTop: '1px solid var(--line)', fontSize: 11, fontWeight: 600, color: STATUS_COLOR[st] }}>● {STATUS_LABEL[st]}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <label style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
function Metric({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span>{k}</span>
      <b style={{ color: danger ? 'var(--red)' : 'var(--ink)' }}>{v}</b>
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '8px 10px', borderRadius: 7, fontFamily: 'var(--mono)', fontSize: 12.5 };
