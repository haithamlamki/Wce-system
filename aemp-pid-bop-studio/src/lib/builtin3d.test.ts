import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBuiltin3d } from './builtin3d';
import { BUILTIN_3D_KEYS, hasBuiltin3d } from './builtin3dKeys';
import { SYM } from './symbols';

describe('built-in 3D models', () => {
  it('every listed key is a real symbol and builds a finite, non-empty model', () => {
    for (const key of BUILTIN_3D_KEYS) {
      expect(SYM[key], `${key} must exist in SYM`).toBeTruthy();
      const obj = buildBuiltin3d(key);
      expect(obj, key).not.toBeNull();
      const box = new THREE.Box3().setFromObject(obj!);
      const size = box.getSize(new THREE.Vector3());
      for (const v of [size.x, size.y, size.z]) { expect(Number.isFinite(v), `${key} size`).toBe(true); expect(v, `${key} size`).toBeGreaterThan(0.05); }
    }
  });
  it('symbols without a model return null and are not flagged', () => {
    expect(buildBuiltin3d('kelly')).toBeNull();
    expect(hasBuiltin3d('kelly')).toBe(false);
    expect(hasBuiltin3d('annular')).toBe(true);
  });
  it('each build owns its materials (disposing one model cannot affect another)', () => {
    const a = buildBuiltin3d('gate')!; const b = buildBuiltin3d('gate')!;
    const mat = (o: THREE.Object3D) => { let m: THREE.Material | null = null; o.traverse((c) => { if (!m && (c as THREE.Mesh).isMesh) m = (c as THREE.Mesh).material as THREE.Material; }); return m; };
    expect(mat(a)).not.toBe(mat(b));
  });
});
