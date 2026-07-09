// ============================================================================
//  Deterministic query assistant (approved decision: v1 has NO LLM).
//  Pure intent matcher + calculators over RLS-scoped records: every number in
//  an answer is computed from the caller's visible data — never estimated,
//  never fabricated. Unknown questions get an honest capability list.
// ============================================================================
import { aggregate, contractDelta, fleetUtilization, serviceable } from './calc';
import type { CatalogItem, TubularRecordRow } from './records';

export interface AssistantContext {
  records: TubularRecordRow[];
  catalog: CatalogItem[];
  unitNames: Map<string, string>; // unit_id -> name
}

export interface AssistantAnswer {
  text: string;
  /** Backing rows so the UI can show supporting records. */
  rows?: Array<{ unit: string; description: string; detail: string }>;
}

const qty = (r: TubularRecordRow) => ({
  onContract: r.onContract, premium: r.premium, class2: r.class2,
  class3: r.class3, scrap: r.scrap, needsInspection: r.needsInspection,
});

function findUnit(q: string, ctx: AssistantContext): { id: string; name: string } | null {
  const m = q.match(/\b(rig|hoist)\s*#?\s*(\d+)\b/i);
  if (!m) return null;
  const wanted = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  for (const [id, name] of ctx.unitNames) if (name === wanted) return { id, name };
  return null;
}

function unitSummary(unitId: string, name: string, ctx: AssistantContext): AssistantAnswer {
  const rows = ctx.records.filter((r) => r.unitId === unitId);
  if (!rows.length) return { text: `${name} has no tubular records.` };
  const t = aggregate(rows.map(qty));
  const catById = new Map(ctx.catalog.map((c) => [c.id, c]));
  const short = rows.filter((r) => r.contractDelta < 0);
  return {
    text: `${name}: ${t.rows} line(s) · on contract ${t.onContract} · on board ${t.onBoard} · serviceable (P+C2) ${t.serviceable}` +
      ` · scrap ${t.scrap} · needs inspection ${t.needsInspection}. ${short.length ? `${short.length} line(s) short of contract.` : 'No contract shortfalls.'}`,
    rows: short.map((r) => ({
      unit: name,
      description: catById.get(r.catalogItemId)?.description ?? '?',
      detail: `${r.contractDelta} vs contract ${r.onContract}`,
    })),
  };
}

export function answer(question: string, ctx: AssistantContext): AssistantAnswer {
  const q = question.toLowerCase().trim();
  const catById = new Map(ctx.catalog.map((c) => [c.id, c]));
  const name = (r: TubularRecordRow) => ctx.unitNames.get(r.unitId) ?? '?';
  const desc = (r: TubularRecordRow) => catById.get(r.catalogItemId)?.description ?? '?';

  if (!ctx.records.length) {
    return { text: 'No tubular data is visible to your account yet.' };
  }

  // compare two units
  const cmp = q.match(/compare\s+((?:rig|hoist)\s*\d+)\s+(?:and|with|vs\.?|to)\s+((?:rig|hoist)\s*\d+)/i);
  if (cmp) {
    const a = findUnit(cmp[1], ctx); const b = findUnit(cmp[2], ctx);
    if (!a || !b) return { text: 'I could not match both units — use names like "Rig 105" or "Hoist 2".' };
    const ta = aggregate(ctx.records.filter((r) => r.unitId === a.id).map(qty));
    const tb = aggregate(ctx.records.filter((r) => r.unitId === b.id).map(qty));
    return {
      text: `${a.name}: contract ${ta.onContract}, serviceable ${ta.serviceable}, scrap ${ta.scrap}. ` +
            `${b.name}: contract ${tb.onContract}, serviceable ${tb.serviceable}, scrap ${tb.scrap}.`,
    };
  }

  // specific unit detail
  const unit = findUnit(q, ctx);
  if (unit) return unitSummary(unit.id, unit.name, ctx);

  if (/short|deficit|below contract|missing/.test(q)) {
    const short = ctx.records.filter((r) => r.contractDelta < 0)
      .sort((x, y) => x.contractDelta - y.contractDelta);
    if (!short.length) return { text: 'No line is short of contract — serviceable stock covers every contracted quantity.' };
    return {
      text: `${short.length} line(s) are short of contract (serviceable = Premium + Class 2). Worst: ${name(short[0])} ${desc(short[0])} at ${short[0].contractDelta}.`,
      rows: short.slice(0, 10).map((r) => ({ unit: name(r), description: desc(r), detail: `${r.contractDelta} vs contract ${r.onContract}` })),
    };
  }

  if (/scrap/.test(q)) {
    const rows = ctx.records.filter((r) => r.scrap > 0);
    const total = rows.reduce((n, r) => n + r.scrap, 0);
    return {
      text: rows.length ? `${total} scrap joints across ${new Set(rows.map((r) => r.unitId)).size} unit(s).` : 'No scrap recorded.',
      rows: rows.slice(0, 10).map((r) => ({ unit: name(r), description: desc(r), detail: `${r.scrap} scrap` })),
    };
  }

  if (/inspect/.test(q)) {
    const rows = ctx.records.filter((r) => r.needsInspection > 0);
    const total = rows.reduce((n, r) => n + r.needsInspection, 0);
    return {
      text: rows.length ? `${total} joints flagged for inspection across ${new Set(rows.map((r) => r.unitId)).size} unit(s).` : 'Nothing is flagged for inspection.',
      rows: rows.slice(0, 10).map((r) => ({ unit: name(r), description: desc(r), detail: `${r.needsInspection} needs inspection` })),
    };
  }

  if (/surplus|extra|excess/.test(q)) {
    const rows = ctx.records.filter((r) => r.onContract > 0 && contractDelta(r) > 0)
      .sort((x, y) => contractDelta(y) - contractDelta(x));
    if (!rows.length) return { text: 'No contracted line holds surplus serviceable stock.' };
    return {
      text: `${rows.length} contracted line(s) hold surplus serviceable stock.`,
      rows: rows.slice(0, 10).map((r) => ({ unit: name(r), description: desc(r), detail: `+${contractDelta(r)} above contract` })),
    };
  }

  if (/utili[sz]ation|overview|summary|status|fleet/.test(q)) {
    const t = aggregate(ctx.records.map(qty));
    const util = fleetUtilization(t);
    const unitsWithData = new Set(ctx.records.map((r) => r.unitId)).size;
    return {
      text: `Fleet (${unitsWithData} unit(s) visible to you): on contract ${t.onContract} · on board ${t.onBoard} · ` +
        `serviceable ${t.serviceable} · class 3 ${t.class3} · scrap ${t.scrap} · needs inspection ${t.needsInspection}` +
        `${util != null ? ` · utilization ${util.toFixed(1)}%` : ''}.`,
    };
  }

  // description search
  const hit = ctx.catalog.find((c) => q.includes(c.description.toLowerCase().slice(0, 12)));
  if (hit) {
    const rows = ctx.records.filter((r) => r.catalogItemId === hit.id);
    const t = aggregate(rows.map(qty));
    return {
      text: `${hit.description}: on contract ${t.onContract}, serviceable ${t.serviceable}, on board ${t.onBoard} across ${new Set(rows.map((r) => r.unitId)).size} unit(s).`,
      rows: rows.map((r) => ({ unit: name(r), description: hit.description, detail: `P ${r.premium} · C2 ${r.class2} · serviceable ${serviceable(r)}` })),
    };
  }

  return {
    text: 'I answer from your live tubular data. Try: "fleet summary", "what is short of contract", ' +
      '"scrap", "needs inspection", "surplus", "Rig 105", or "compare Rig 105 and Rig 306".',
  };
}
