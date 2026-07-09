import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from './exportCsv';

describe('csv export hardening', () => {
  it('neutralises leading formula characters (= + - @)', () => {
    expect(csvField('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@cmd')).toBe("'@cmd");
  });

  it('quotes fields containing commas/quotes/newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('plain values and numbers pass through', () => {
    expect(csvField('Rig 105')).toBe('Rig 105');
    expect(csvField(42)).toBe('42');
    expect(csvField(null)).toBe('');
  });

  it('builds CRLF rows with header', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a,b\r\n1,2');
  });
});
