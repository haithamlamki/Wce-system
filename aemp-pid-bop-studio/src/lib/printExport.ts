// ============================================================================
//  PDF / print export (PRD §10.3). Builds a self-contained SVG document for the
//  P&ID or the BOP elevation and opens the browser print dialog (→ Save as PDF).
//  No external deps. Colours are baked to concrete hex so the print window
//  renders correctly without the app's theme variables.
// ============================================================================
import type { Project } from '../types';
import { SYM, type SymbolKey } from './symbols';
import { box, innerTransform } from './geometry';
import { statusOf } from './status';
import { stackMetrics, toFeet } from './bop';

const STATUS_HEX: Record<string, string> = { ok: '#1f9d57', due: '#cf8a00', over: '#d8453d', untag: '#8d9dab' };
const esc = (s: string) => (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function header(project: Project, subtitle: string): string {
  const m = project.meta;
  return `<div class="hdr">
    <h1>${esc(m.title || 'HP WELL CONTROL EQUIPMENT')} — ${esc(subtitle)}</h1>
    <div class="meta">RIG ${esc(m.rig)} · ${esc(m.drawingNo || 'AEMP / HPWC P&ID')}<br>REF ${esc(m.date || '—')} · INSPECTOR ${esc(m.who || '—')}</div>
  </div>`;
}

/** Full P&ID as a bounded SVG (all nodes + piping + status rings + tags). */
export function buildPidSvg(project: Project, refDate: Date): string {
  const nodes = project.nodes;
  if (!nodes.length) return '<p style="padding:24px;color:#5a6b7b">No diagram to print — build or import a P&ID first.</p>';
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const n of nodes) {
    const b = box(n);
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + b.w); maxY = Math.max(maxY, n.y + b.h + 30);
  }
  for (const [x1, y1, x2, y2] of project.pipes) {
    minX = Math.min(minX, x1, x2); minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2); maxY = Math.max(maxY, y1, y2);
  }
  const pad = 40, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;

  const pipes = project.pipes
    .map(([x1, y1, x2, y2, c]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`)
    .join('');
  const nodesSvg = nodes.map((n) => {
    const s = SYM[n.type as SymbolKey];
    if (!s) return '';
    const { w: ew, h: eh } = box(n);
    const ring = STATUS_HEX[statusOf(n, refDate)];
    return `<g transform="translate(${n.x},${n.y})" style="color:${s.color}"${n.removed ? ' opacity="0.3"' : ''}>` +
      `<g transform="${innerTransform(n)}">${s.svg}</g>` +
      `<circle cx="${ew - 2}" cy="-2" r="5.5" fill="#fff" stroke="${ring}" stroke-width="2.5"/>` +
      `<text x="${ew / 2}" y="${eh + 15}" text-anchor="middle" style="font:600 11px monospace;fill:#1b2a38">${esc(n.tag || '—')}</text>` +
      `<text x="${ew / 2}" y="${eh + 26}" text-anchor="middle" style="font:9px sans-serif;fill:#5a6b7b">${esc((n.description || '').slice(0, 24))}</text>` +
      `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${w} ${h}" width="${w}" height="${h}">${pipes}${nodesSvg}</svg>`;
}

/** BOP elevation as a bounded SVG (to scale, with datum/RKB + clearance). */
export function buildBopSvg(project: Project): string {
  const { bop } = project;
  if (!bop.items.length) return '<p style="padding:24px;color:#5a6b7b">No BOP stack to print — build one first.</p>';
  const W = 460, H = 640, padT = 30, padB = 30, axisX = 70, cx = 250;
  const m = stackMetrics(bop);
  const top = Math.max(bop.rt, m.topOfStack);
  const range = Math.max(0.5, top - bop.datum);
  const head = range * 0.12, drawMax = top + head, drawMin = bop.datum - head * 0.5;
  const ppu = (H - padT - padB) / (drawMax - drawMin);
  const y = (e: number) => padT + (drawMax - e) * ppu;
  const conv = (v: number) => (bop.unit === 'ft' ? toFeet(v) : v).toFixed(2);

  let acc = bop.datum;
  const bands = bop.items.map((it) => { const b = acc; acc += it.height; return { it, b, t: acc }; });

  const items = bands.map(({ it, b, t }) => {
    const s = SYM[it.type as SymbolKey];
    const yT = y(t), bh = (t - b) * ppu, sc = Math.min((bh * 0.9) / s.h, 110 / s.w);
    const dw = s.w * sc, dh = s.h * sc;
    return `<g transform="translate(${cx - dw / 2},${yT + (bh - dh) / 2}) scale(${sc})" style="color:${s.color}">${s.svg}</g>` +
      `<text x="${cx + 78}" y="${yT + bh / 2}" style="font:600 11px monospace;fill:#1b2a38">${esc(it.tag)} (${conv(it.height)} ${bop.unit})</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <line x1="${axisX}" y1="${padT}" x2="${axisX}" y2="${H - padB}" stroke="#d2dbe4"/>
    <line x1="${axisX}" y1="${y(bop.datum)}" x2="${W - 16}" y2="${y(bop.datum)}" stroke="#1b2a38" stroke-width="1.5"/>
    <text x="${W - 16}" y="${y(bop.datum) - 4}" text-anchor="end" style="font:600 10px monospace;fill:#1b2a38">DATUM ${conv(bop.datum)}</text>
    <line x1="${axisX}" y1="${y(bop.rt)}" x2="${W - 16}" y2="${y(bop.rt)}" stroke="#1769b0" stroke-width="1.5" stroke-dasharray="7 4"/>
    <text x="${W - 16}" y="${y(bop.rt) - 4}" text-anchor="end" style="font:600 10px monospace;fill:#1769b0">RKB ${conv(bop.rt)}</text>
    ${items}
  </svg>`;
}

function openPrint(title: string, inner: string): void {
  const win = window.open('', '_blank');
  if (!win) { alert('Allow pop-ups for this site to print / export PDF.'); return; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      @page { size: A3 landscape; margin: 12mm; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #1b2a38; }
      .hdr { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 2px solid #1b2a38; margin-bottom: 12px; }
      .hdr h1 { font-size: 15px; margin: 0; letter-spacing: .4px; }
      .meta { font: 10px monospace; color: #5a6b7b; text-align: right; line-height: 1.5; }
      svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    </style></head><body>${inner}
    <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
    </body></html>`);
  win.document.close();
}

export function printPid(project: Project, refDate: Date): void {
  openPrint(`${project.meta.rig} — P&ID`, header(project, 'P&ID') + buildPidSvg(project, refDate));
}
export function printBop(project: Project): void {
  openPrint(`${project.meta.rig} — BOP Scheme`, header(project, 'BOP Stack-up') + buildBopSvg(project));
}
