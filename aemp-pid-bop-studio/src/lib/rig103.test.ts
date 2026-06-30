import { describe, expect, it } from 'vitest';
import { RIG103_EQUIPMENT, RIG103_TEMPLATE } from './data/rig103-equipment';
import { SYM } from './symbols';
import { buildFromRegister, rigData } from './aemp';

describe('Rig 103 dataset (extracted from Excel)', () => {
  it('has 131 equipment rows + matching placements', () => {
    expect(RIG103_EQUIPMENT.length).toBe(131);
    expect(RIG103_TEMPLATE.length).toBe(131);
  });
  it('maps every placement to a real library symbol', () => {
    expect(RIG103_TEMPLATE.every((t) => !!SYM[t.type])).toBe(true);
  });
  it('uses the new symbols added for this rig', () => {
    const types = new Set(RIG103_TEMPLATE.map((t) => t.type));
    for (const k of ['flange', 'dampener', 'gooseneck', 'teststump']) expect(types.has(k)).toBe(true);
  });
  it('converts inspection date serials to ISO yyyy-mm-dd', () => {
    const dated = RIG103_EQUIPMENT.find((e) => e.int_due);
    expect(dated?.int_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('tags items with their P&ID number', () => {
    expect(RIG103_EQUIPMENT.some((e) => e.tag === '38' && /annular/i.test(e.description))).toBe(true);
  });
  it('builds the Rig 103 master 1:1 from the register (no piping, per-item data kept)', () => {
    const d = rigData('Rig 103');
    expect(d.byRegister).toBe(true);
    const { nodes, pipes } = buildFromRegister(d.register, d.template);
    expect(nodes.length).toBe(131);
    expect(pipes.length).toBe(0);
    // each item keeps its OWN section/rwp (no tag-graft collision on blank tags)
    const annular = nodes.find((n) => n.tag === '38')!;
    expect(annular.section).toBe('BOP, KILL AND CHOKE LINE');
    expect(annular.rwp).toBe('5000');
    // untagged items aren't all collapsed onto one register entry's data
    const sections = new Set(nodes.map((n) => n.section));
    expect(sections.size).toBeGreaterThanOrEqual(6);
  });
});
