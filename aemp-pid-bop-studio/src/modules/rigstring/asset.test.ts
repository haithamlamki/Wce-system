// @vitest-environment node
// Guards the verbatim prototype asset. The Rig String Builder module embeds
// public/rig-string-builder.html unchanged; these checks catch a missing,
// truncated, or accidentally re-encoded copy.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ASSET_PATH = fileURLToPath(
  new URL('../../../public/rig-string-builder.html', import.meta.url),
);

describe('rig-string-builder.html static asset', () => {
  const html = () => readFileSync(ASSET_PATH, 'utf8');

  it('exists and is the full prototype (not truncated)', () => {
    const t = html();
    expect(t.length).toBeGreaterThan(50_000);
    expect(t.trimStart().startsWith('<!doctype html>')).toBe(true);
    expect(t.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('keeps the prototype title and all nine tabs', () => {
    const t = html();
    expect(t).toContain('<title>Rig String Builder — BHA · Pipe Tally · Ton-Mile</title>');
    for (const tab of ['bha', 'pipe', 'tm', 'daily', 'rot', 'pumps', 'trip', 'kill', 'form']) {
      expect(t).toContain(`data-tab="${tab}"`);
    }
  });

  it('keeps the self-contained engine (script + seed intact)', () => {
    const t = html();
    expect(t).toContain('"use strict"');
    expect(t).toContain('function killCompute()');
    expect(t).toContain("renderWell();seed();setTab('bha');renderSummary();");
  });

  it('is byte-identical to the approved prototype (sha256 pinned)', () => {
    const digest = createHash('sha256').update(readFileSync(ASSET_PATH)).digest('hex');
    expect(digest).toBe('047690f89f7b0a3c8e7e8bcb0b8d6a0bc6e7b78ccc32b6a9b143bcd73f4ab3a1');

    const buf = readFileSync(ASSET_PATH);
    const openTag = Buffer.from('<script>');
    const closeTag = Buffer.from('</script>');
    const openIdx = buf.indexOf(openTag);
    const closeIdx = buf.indexOf(closeTag, openIdx);
    const script = buf.subarray(openIdx + openTag.length, closeIdx);
    const cspHash = createHash('sha256').update(script).digest('base64');
    expect(`'sha256-${cspHash}'`).toBe("'sha256-5i0bMjH5a5CPe6R360h++03OVyYU5PlaPShEs8gQOfU='");
  });
});
