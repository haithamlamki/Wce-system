// ============================================================================
//  Release Log parser (reference `/release-log`): turns the release-notes
//  markdown into sections of paragraphs and bullet lists. Supports exactly
//  what the notes use — `## ` release headings, `- ` bullets with indented
//  continuation lines, `---` rules, and inline **bold**, *italic*, `code`.
// ============================================================================

export type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };
export interface Release { title: string; blocks: Block[] }
export type Inline = { kind: 'text' | 'b' | 'i' | 'code'; text: string };

function toBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') });
    if (list) out.push({ kind: 'ul', items: list });
    para = []; list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim() === '---') { flush(); continue; }
    if (line.startsWith('- ')) {
      if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; }
      (list ??= []).push(line.slice(2).trim());
    } else if (list && /^\s/.test(line)) {
      list[list.length - 1] += ' ' + line.trim();
    } else {
      if (list) { out.push({ kind: 'ul', items: list }); list = null; }
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

/** Splits the notes into the intro (before the first release) and the releases, newest first. */
export function parseReleaseLog(md: string): { intro: Block[]; releases: Release[] } {
  const lines = md.replace(/\r\n/g, '\n').split('\n').filter((l) => !l.startsWith('# '));
  const intro: string[] = [];
  const releases: { title: string; lines: string[] }[] = [];
  for (const l of lines) {
    if (l.startsWith('## ')) releases.push({ title: l.slice(3).trim(), lines: [] });
    else if (releases.length) releases[releases.length - 1].lines.push(l);
    else intro.push(l);
  }
  return { intro: toBlocks(intro), releases: releases.map((r) => ({ title: r.title, blocks: toBlocks(r.lines) })) };
}

/** Inline markup → typed runs (rendered as React nodes, never as HTML). */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'b', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] });
    else out.push({ kind: 'i', text: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}
