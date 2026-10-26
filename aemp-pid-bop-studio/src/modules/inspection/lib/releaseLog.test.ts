import { describe, expect, it } from 'vitest';
import { parseInline, parseReleaseLog } from './releaseLog';
import notes from '../content/release-log.md?raw';

describe('parseReleaseLog', () => {
  it('splits intro, releases, paragraphs and bullets with continuation lines', () => {
    const md = [
      '# Log', '', 'Intro line one', 'and two.', '', '---', '',
      '## 2026.10.18 — Fix', '', '- **One.** first', '  continued', '- Two', '', 'Closing para.',
      '## 2026.10.01 — Older', 'Text',
    ].join('\r\n');
    const r = parseReleaseLog(md);
    expect(r.intro).toEqual([{ kind: 'p', text: 'Intro line one and two.' }]);
    expect(r.releases.map((x) => x.title)).toEqual(['2026.10.18 — Fix', '2026.10.01 — Older']);
    expect(r.releases[0].blocks).toEqual([
      { kind: 'ul', items: ['**One.** first continued', 'Two'] },
      { kind: 'p', text: 'Closing para.' },
    ]);
  });

  it('parses the shipped release notes', () => {
    const r = parseReleaseLog(notes);
    expect(r.releases.length).toBeGreaterThanOrEqual(22);
    expect(r.releases[0].title).toMatch(/^\d{4}\.\d{2}\.\d{2} — /);
  });
});

describe('parseInline', () => {
  it('splits bold, italic and code runs', () => {
    expect(parseInline('a **b** *c* `d` e')).toEqual([
      { kind: 'text', text: 'a ' }, { kind: 'b', text: 'b' }, { kind: 'text', text: ' ' },
      { kind: 'i', text: 'c' }, { kind: 'text', text: ' ' }, { kind: 'code', text: 'd' }, { kind: 'text', text: ' e' },
    ]);
  });
});
