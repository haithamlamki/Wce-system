import { describe, expect, it } from 'vitest';
import { MAX_DRAWING_CHARS, MAX_IMPORT_ROWS, parseDrawing } from './layoutImport';

describe('parseDrawing', () => {
  it('throws a clean parse error on malformed JSON, not a raw SyntaxError', () => {
    let caught: unknown;
    try {
      parseDrawing('{ bad');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Could not parse the drawing — invalid JSON or unrecognised format.');
    expect(caught).not.toBeInstanceOf(SyntaxError);
  });

  it('parses a valid { template, pipes } JSON layout', () => {
    const json = JSON.stringify({
      template: [{ type: 'gate', tag: 'V1', name: 'Valve 1', x: 10, y: 20, rot: 90 }],
      pipes: [[0, 0, 10, 10, 'red']],
    });
    const { template, pipes, source } = parseDrawing(json);
    expect(source).toBe('json');
    expect(template).toEqual([{ type: 'gate', tag: 'V1', name: 'Valve 1', x: 10, y: 20, rot: 90 }]);
    expect(pipes).toEqual([[0, 0, 10, 10, 'red']]);
  });

  it('clamps an out-of-range coordinate and coerces a non-numeric one to 0', () => {
    const json = JSON.stringify({
      template: [{ type: 'gate', tag: 'V1', x: 1e9, y: 'abc', rot: 999 }],
    });
    const { template } = parseDrawing(json);
    expect(template[0].x).toBe(100000);
    expect(template[0].y).toBe(0);
    expect(template[0].rot).toBe(360);
  });

  it('still parses an embedded `const TEMPLATE = [...]` HTML document', () => {
    const html = `
      <html><script>
        const TEMPLATE = [{"type":"gate","tag":"V1","x":5,"y":5,"rot":0}];
        const PIPES = [];
      </script></html>
    `;
    const { template, pipes, source } = parseDrawing(html);
    expect(source).toBe('embedded-arrays');
    expect(template).toEqual([{ type: 'gate', tag: 'V1', name: '', x: 5, y: 5, rot: 0 }]);
    expect(pipes).toEqual([]);
  });

  it('throws when the template array exceeds the import cap', () => {
    const tmpl = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ type: 'gate', tag: `V${i}`, x: 0, y: 0, rot: 0 }));
    const json = JSON.stringify({ template: tmpl, pipes: [] });
    expect(() => parseDrawing(json)).toThrow(`Drawing has too many items (max ${MAX_IMPORT_ROWS}).`);
  });

  it('throws a clean size error for a drawing over the char cap', () => {
    const big = 'x'.repeat(MAX_DRAWING_CHARS + 1);
    expect(() => parseDrawing(big)).toThrow('Drawing file too large.');
  });
});
