import { describe, expect, it } from 'vitest';
import { safeColor, sanitizeSvg } from './sanitizeSvg';
import { SYM } from './symbols';

describe('sanitizeSvg', () => {
  it('returns "" for empty/nullish input', () => {
    expect(sanitizeSvg('')).toBe('');
    expect(sanitizeSvg(undefined)).toBe('');
    expect(sanitizeSvg(null)).toBe('');
  });

  it('strips a <script> tag embedded in the svg', () => {
    const out = sanitizeSvg('<rect x="0" y="0" width="10" height="10"/><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<rect');
  });

  it('strips onload / onclick event-handler attributes', () => {
    const out1 = sanitizeSvg('<rect width="10" height="10" onload="alert(1)"/>');
    expect(out1).not.toContain('onload');
    expect(out1).not.toContain('alert(1)');
    const out2 = sanitizeSvg('<circle cx="5" cy="5" r="5" onclick="alert(1)"/>');
    expect(out2).not.toContain('onclick');
    expect(out2).not.toContain('alert(1)');
  });

  it('strips <image href="javascript:...">', () => {
    const out = sanitizeSvg('<image href="javascript:alert(1)" x="0" y="0" width="10" height="10"/>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('strips <a xlink:href="javascript:...">', () => {
    const out = sanitizeSvg('<a xlink:href="javascript:alert(1)"><rect width="10" height="10"/></a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).not.toContain('<a ');
    expect(out).not.toContain('href=');
  });

  it('preserves legitimate geometry elements and attributes', () => {
    const src =
      '<g transform="translate(1,2)">' +
      '<path d="M0,0 L10,10" stroke-width="2"/>' +
      '<rect x="1" y="2" width="10" height="20"/>' +
      '<circle cx="5" cy="5" r="4"/>' +
      '<polyline points="0,0 1,1 2,2"/>' +
      '</g>';
    const out = sanitizeSvg(src);
    expect(out).toContain('<path');
    expect(out).toContain('d="M0,0 L10,10"');
    expect(out).toContain('stroke-width="2"');
    expect(out).toContain('<rect');
    expect(out).toContain('x="1"');
    expect(out).toContain('y="2"');
    expect(out).toContain('width="10"');
    expect(out).toContain('height="20"');
    expect(out).toContain('<circle');
    expect(out).toContain('cx="5"');
    expect(out).toContain('cy="5"');
    expect(out).toContain('r="4"');
    expect(out).toContain('<polyline');
    expect(out).toContain('points="0,0 1,1 2,2"');
    expect(out).toContain('<g');
    expect(out).toContain('transform="translate(1,2)"');
  });

  it('leaves the built-in symbol set unchanged — same markup once reparsed by the DOM', () => {
    // DOMPurify's serializer always emits explicit closing tags (`<rect ...></rect>`)
    // instead of self-closing ones (`<rect .../>`); that's a pure serialization
    // difference (verified below by reparsing the *original* markup the same way)
    // with zero effect on the rendered art, so we compare DOM-normalised markup
    // rather than raw bytes.
    const normalize = (svg: string) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.innerHTML = svg;
      return el.innerHTML;
    };
    for (const [key, def] of Object.entries(SYM)) {
      expect(sanitizeSvg(def.svg), `symbol "${key}" changed after sanitization`).toBe(normalize(def.svg));
    }
  });
});

describe('safeColor', () => {
  it('accepts short and long hex', () => {
    expect(safeColor('#f00')).toBe('#f00');
    expect(safeColor('#ff0000')).toBe('#ff0000');
  });

  it('accepts 8-digit hex (with alpha)', () => {
    expect(safeColor('#ff0000ff')).toBe('#ff0000ff');
  });

  it('accepts rgb()/rgba()', () => {
    expect(safeColor('rgb(1,2,3)')).toBe('rgb(1,2,3)');
    expect(safeColor('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
  });

  it('accepts CSS custom properties', () => {
    expect(safeColor('var(--red)')).toBe('var(--red)');
  });

  it('accepts "none" (used for no-fill shapes)', () => {
    expect(safeColor('none')).toBe('none');
  });

  it('rejects expression(), url(javascript:...) and injected markup, falling back to currentColor', () => {
    expect(safeColor('expression(1)')).toBe('currentColor');
    expect(safeColor('url(javascript:1)')).toBe('currentColor');
    expect(safeColor('"><script>alert(1)</script>')).toBe('currentColor');
  });

  it('falls back to currentColor for undefined', () => {
    expect(safeColor(undefined)).toBe('currentColor');
  });
});
