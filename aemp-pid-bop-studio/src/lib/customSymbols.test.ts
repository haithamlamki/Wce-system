import { describe, expect, it } from 'vitest';
import { mergeCustomSymbols, newCustomKey, serializeShapes } from './customSymbols';
import { SYM, SYM_ORDER, type DrawShape } from './symbols';

describe('serializeShapes', () => {
  it('serialises a rectangle (normalising negative size)', () => {
    const s: DrawShape = { type: 'rect', x: 10, y: 10, w: -10, h: 5, stroke: '#f00', fill: '#0f0', sw: 2 };
    expect(serializeShapes([s])).toBe('<rect x="0" y="10" width="10" height="5" fill="#0f0" stroke="#f00" stroke-width="2"/>');
  });
  it('honours no-fill', () => {
    const s: DrawShape = { type: 'ellipse', x: 0, y: 0, w: 20, h: 10, stroke: '#000', fill: 'none', sw: 1 };
    expect(serializeShapes([s])).toContain('fill="none"');
    expect(serializeShapes([s])).toContain('<ellipse');
  });
  it('serialises a polygon from points', () => {
    const s: DrawShape = { type: 'poly', points: [[0, 0], [10, 0], [5, 8]], stroke: '#000', fill: '#fff', sw: 1 };
    expect(serializeShapes([s])).toBe('<polygon points="0,0 10,0 5,8" fill="#fff" stroke="#000" stroke-width="1"/>');
  });
});

describe('newCustomKey', () => {
  it('returns a fresh key not present in the map', () => {
    const k = newCustomKey({});
    expect(k).toMatch(/^custom_/);
    expect(newCustomKey({ [k]: 1 })).not.toBe(k);
  });
});

describe('mergeCustomSymbols', () => {
  it('registers a custom symbol into SYM and its category into SYM_ORDER', () => {
    mergeCustomSymbols({ test_widget: { name: 'Test Widget', cat: 'Custom', w: 40, h: 30, color: '#123456', svg: '<rect/>' } });
    expect(SYM.test_widget).toBeTruthy();
    expect(SYM.test_widget.custom).toBe(true);
    expect(SYM_ORDER).toContain('Custom');
  });

  it('sanitizes a malicious svg payload on ingest (F1)', () => {
    const malicious = '<rect width="10" height="10" onload="alert(1)"/><script>alert(1)</script><image href="x" onerror="alert(1)"/>';
    mergeCustomSymbols({ evil_widget: { name: 'Evil Widget', cat: 'Custom', w: 40, h: 30, color: '#123456', svg: malicious } });
    const stored = SYM.evil_widget.svg;
    expect(stored).not.toContain('<script');
    expect(stored).not.toMatch(/on\w+\s*=/i);
    expect(stored).not.toContain('javascript:');
  });
});

describe('serializeShapes — malicious color ingest (F1)', () => {
  it('falls back unsafe fill/stroke values to a safe color instead of passing them through', () => {
    const s: DrawShape = {
      type: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      // attempted attribute-breakout / javascript: URI payloads
      fill: '"><script>alert(1)</script>',
      stroke: 'url(javascript:alert(1))',
      sw: 1,
    };
    const out = serializeShapes([s]);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('fill="currentColor"');
    expect(out).toContain('stroke="currentColor"');
  });
});
