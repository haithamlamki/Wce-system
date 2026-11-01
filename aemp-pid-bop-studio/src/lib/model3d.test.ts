import { describe, expect, it } from 'vitest';
import { base64ToBuffer, bufferToBase64, MAX_GLB_BYTES, symbolToSvgDocument, validateGlb } from './model3d';

function glb(len = 32, version = 2, declared = len): ArrayBuffer {
  const buf = new ArrayBuffer(len);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, version, true);
  dv.setUint32(8, declared, true);
  return buf;
}

describe('validateGlb', () => {
  it('accepts a well-formed header', () => {
    expect(validateGlb(glb())).toBeNull();
  });
  it('rejects tiny, wrong-magic, wrong-version, truncated and oversized files', () => {
    expect(validateGlb(new ArrayBuffer(4))).toMatch(/too small/);
    expect(validateGlb(new ArrayBuffer(64))).toMatch(/Not a binary glTF/);
    expect(validateGlb(glb(32, 1))).toMatch(/glTF 2\.0/);
    expect(validateGlb(glb(32, 2, 999))).toMatch(/truncated/);
    expect(validateGlb(new ArrayBuffer(MAX_GLB_BYTES + 1))).toMatch(/larger than/);
  });
});

function glbWithJson(json: object): ArrayBuffer {
  const body = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(body.length / 4) * 4;
  const buf = new ArrayBuffer(20 + padded);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, buf.byteLength, true);
  dv.setUint32(12, padded, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(body);
  return buf;
}

describe('compressed GLB detection', () => {
  it('rejects Draco / Meshopt models with a helpful message', () => {
    expect(validateGlb(glbWithJson({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'] }))).toMatch(/not supported/);
    expect(validateGlb(glbWithJson({ asset: { version: '2.0' }, extensionsRequired: ['EXT_meshopt_compression'] }))).toMatch(/Meshopt/);
  });
  it('accepts a plain GLB and ignores optional extensions', () => {
    expect(validateGlb(glbWithJson({ asset: { version: '2.0' } }))).toBeNull();
    expect(validateGlb(glbWithJson({ asset: { version: '2.0' }, extensionsUsed: ['KHR_draco_mesh_compression'] }))).toBeNull();
  });
});

describe('base64 round trip', () => {
  it('survives a buffer bigger than one chunk', () => {
    const src = new Uint8Array(70000).map((_, i) => i % 251);
    const back = new Uint8Array(base64ToBuffer(bufferToBase64(src.buffer)));
    expect(back.length).toBe(src.length);
    expect(back[0]).toBe(src[0]);
    expect(back[69999]).toBe(src[69999]);
  });
});

describe('symbolToSvgDocument', () => {
  it('wraps sanitized markup with the symbol colour and a viewBox', () => {
    const doc = symbolToSvgDocument({ svg: '<rect width="4" height="4"/><script>alert(1)</script>', w: 40, h: 30, color: '#abc' });
    expect(doc).toContain('viewBox="0 0 40 30"');
    expect(doc).toContain('color:#abc');
    expect(doc).not.toContain('script');
  });
  it('neutralises a hostile colour', () => {
    const doc = symbolToSvgDocument({ svg: '<rect/>', w: 10, h: 10, color: 'red;}</g><script>x</script>' });
    expect(doc).not.toContain('<script');
  });
});
