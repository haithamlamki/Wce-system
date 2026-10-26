import { describe, expect, it } from 'vitest';
import { diffLinks, filterRecords, formatSize, groupDocuments, groupRecords,
  type PickerRecord, type SetDocument } from './sharedDocuments';

const doc = (id: string, category: string | null): SetDocument =>
  ({ id, fileName: `${id}.pdf`, size: 1, category, storagePath: `shared/x/${id}` });
const rec = (id: string, equipmentCategory: string | null, serialNumber: string | null = null): PickerRecord =>
  ({ id, serialNumber, equipmentType: 'BOP', equipmentPart: null, equipmentCategory });

describe('groupDocuments', () => {
  it('groups case-insensitively, sorts A→Z and puts "No category" last', () => {
    const g = groupDocuments([doc('a', 'OEM'), doc('b', null), doc('c', ' oem '), doc('d', 'Certs'), doc('e', '  ')]);
    expect(g.map((x) => x.category)).toEqual(['Certs', 'OEM', null]);
    expect(g[1].documents.map((d) => d.id)).toEqual(['a', 'c']);
    expect(g[2].documents.map((d) => d.id)).toEqual(['b', 'e']);
  });
});

describe('groupRecords / filterRecords', () => {
  it('groups by equipment category with an Uncategorized bucket', () => {
    const g = groupRecords([rec('1', 'Well Control Equipment'), rec('2', null), rec('3', 'Hoisting System')]);
    expect(g.map((x) => x.category)).toEqual(['Hoisting System', 'Uncategorized', 'Well Control Equipment']);
  });
  it('matches serial, type, part or category', () => {
    const rows = [rec('1', 'Hoisting System', 'SN-9'), rec('2', 'Well Control Equipment', 'X')];
    expect(filterRecords(rows, 'sn-9').map((r) => r.id)).toEqual(['1']);
    expect(filterRecords(rows, 'well').map((r) => r.id)).toEqual(['2']);
    expect(filterRecords(rows, '  ')).toHaveLength(2);
  });
});

describe('diffLinks', () => {
  it('returns links to add and remove', () => {
    expect(diffLinks(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
  });
});

describe('formatSize', () => {
  it('formats bytes like the reference', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
