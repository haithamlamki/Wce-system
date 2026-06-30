import { readFileSync, writeFileSync } from 'node:fs';
const SRC = process.argv[2];
const j = JSON.parse(readFileSync(SRC, 'utf8'));
delete j.flange; // already in the library (Flange / DSA)
const keys = Object.keys(j);
const out = `// AUTO-GENERATED from Rig103_symbols.json (custom symbols built for Rig 103).
// Merged into the shared SYM library as built-ins (see symbols.ts). 'flange'
// omitted (already present as 'Flange / DSA').
type Sym = { name: string; cat: string; w: number; h: number; color: string; svg: string };
export const RIG103_SYMBOLS: Record<string, Sym> = ${JSON.stringify(j)};
`;
writeFileSync('src/lib/data/rig103-symbols.ts', out);
const bytes = Buffer.byteLength(out);
console.log('wrote', keys.length, 'symbols,', (bytes/1024).toFixed(0)+'KB');
console.log('keys:', keys.join(', '));
const cats = [...new Set(keys.map(k=>j[k].cat))];
console.log('categories:', cats.join(' | '));
