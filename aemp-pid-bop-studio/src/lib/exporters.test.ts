import { describe, expect, it } from 'vitest';
import { buildEquipmentCsv, fileBase } from './exporters';
import type { Component, Project } from '../types';

function node(overrides: Partial<Component> = {}): Component {
  return {
    id: 'n1', type: 'gate_valve', x: 0, y: 0,
    tag: '', description: '', section: '', rwp: '', size: '',
    manufacturer: '', serial: '', int_due: '', maj_due: '', removed: false,
    ...overrides,
  } as Component;
}

describe('buildEquipmentCsv — formula-injection guard', () => {
  const refDate = new Date('2026-01-01');

  function firstDataRow(nodes: Component[]): string {
    return buildEquipmentCsv(nodes, refDate).split('\n')[1];
  }

  it('prefixes a leading quote for =, +, -, @, tab and CR triggers', () => {
    expect(firstDataRow([node({ tag: '=SUM(A1)' })])).toContain('"\'=SUM(A1)"');
    expect(firstDataRow([node({ tag: '+A1' })])).toContain('"\'+A1"');
    expect(firstDataRow([node({ tag: "-cmd|'/c'" })])).toContain("\"'-cmd|'/c'\"");
    expect(firstDataRow([node({ tag: '@x' })])).toContain('"\'@x"');
    expect(firstDataRow([node({ tag: '\tx' })])).toContain('"\'\tx"');
    expect(firstDataRow([node({ tag: '\rx' })])).toContain('"\'\rx"');
  });

  it('does not quote-prefix plain negative/positive numeric strings', () => {
    expect(firstDataRow([node({ tag: '-5' })])).toContain('"-5"');
    expect(firstDataRow([node({ tag: '+3' })])).toContain('"+3"');
    expect(firstDataRow([node({ tag: '-5.2' })])).toContain('"-5.2"');
  });

  it('leaves normal text untouched', () => {
    expect(firstDataRow([node({ tag: 'Gate valve' })])).toContain('"Gate valve"');
    expect(firstDataRow([node({ tag: 'V-101' })])).toContain('"V-101"');
  });

  it('still escapes embedded double-quotes', () => {
    expect(firstDataRow([node({ tag: 'he said "hi"' })])).toContain('"he said ""hi"""');
  });

  it('keeps the header row intact', () => {
    const head = buildEquipmentCsv([], refDate).split('\n')[0];
    expect(head).toBe('tag,description,system,rwp,size,manufacturer,serial,int_due,maj_due,status,on_rig');
  });
});

describe('fileBase', () => {
  it('replaces whitespace with underscores', () => {
    expect(fileBase({ meta: { rig: 'Rig 103 Alpha' } } as Project)).toBe('Rig_103_Alpha');
  });
});
