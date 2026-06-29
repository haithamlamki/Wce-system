import { describe, expect, it } from 'vitest';
import { applyMap, autoMap } from './importMap';

describe('autoMap', () => {
  it('detects fields from common header aliases', () => {
    const map = autoMap(['tag', 'type', 'serial', 'system', 'rwp']);
    expect(map.tag).toBe('tag');
    expect(map.type).toBe('type');
    expect(map.serial).toBe('serial');
    expect(map.section).toBe('system');
    expect(map.rwp).toBe('rwp');
  });

  it('leaves unknown fields unmapped', () => {
    const map = autoMap(['foo', 'bar']);
    expect(map.tag).toBeUndefined();
  });
});

describe('applyMap', () => {
  const map = { tag: 'tag', type: 'type', serial: 'serial', section: 'system' };

  it('maps rows to component fields', () => {
    const [row] = applyMap([{ tag: 'V1', type: 'gate', serial: 'S1', system: 'Valves' }], map);
    expect(row.tag).toBe('V1');
    expect(row.type).toBe('gate');
    expect(row.serial).toBe('S1');
    expect(row.section).toBe('Valves');
  });

  it('drops an unrecognised symbol type to undefined', () => {
    const [row] = applyMap([{ tag: 'V1', type: 'frobnicator', serial: '', system: '' }], map);
    expect(row.type).toBeUndefined();
  });

  it('filters out empty rows', () => {
    const rows = applyMap([{ tag: '', type: '', serial: '', system: '' }], map);
    expect(rows).toHaveLength(0);
  });
});
