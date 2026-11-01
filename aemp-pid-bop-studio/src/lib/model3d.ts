// ============================================================================
//  3D symbol models — pure helpers (no three.js, no DOM beyond atob/btoa).
//  A symbol can carry an optional binary glTF (.glb) model beside its 2D SVG.
//  Models live outside the SymbolDef (see model3dStore.ts) so the symbol
//  catalog rows stay small and the 2D path is untouched.
// ============================================================================
import { safeColor, sanitizeSvg } from './sanitizeSvg';

/** Largest .glb accepted (bytes). Keeps the shared table and memory sane. */
export const MAX_GLB_BYTES = 10 * 1024 * 1024;

const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian

/** Returns an error message, or null when the buffer looks like a valid GLB. */
export function validateGlb(buf: ArrayBuffer): string | null {
  if (buf.byteLength < 20) return 'The file is too small to be a GLB model.';
  if (buf.byteLength > MAX_GLB_BYTES) return `The model is larger than ${Math.round(MAX_GLB_BYTES / 1048576)} MB.`;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== GLB_MAGIC) return 'Not a binary glTF (.glb) file.';
  if (dv.getUint32(4, true) !== 2) return 'Only glTF 2.0 GLB files are supported.';
  if (dv.getUint32(8, true) > buf.byteLength) return 'The GLB file is truncated.';
  const ext = unsupportedGlbExtension(buf);
  if (ext) return `This model uses ${ext}, which is not supported. Re-export it without compression (no Draco / Meshopt / Basis).`;
  return null;
}

/** Extensions that need a decoder the strict CSP does not allow us to load. */
const UNSUPPORTED_EXT = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];

/** Name of the first required-but-unsupported glTF extension, or null. */
export function unsupportedGlbExtension(buf: ArrayBuffer): string | null {
  try {
    const dv = new DataView(buf);
    const len = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a || len <= 0 || 20 + len > buf.byteLength) return null; // not a JSON chunk
    // the spec pads the JSON chunk with spaces, but some exporters pad with NULs
    const text = new TextDecoder().decode(new Uint8Array(buf, 20, len)).replace(/\0+$/, '');
    const json = JSON.parse(text);
    const req: unknown = json?.extensionsRequired;
    if (!Array.isArray(req)) return null;
    return UNSUPPORTED_EXT.find((e) => req.includes(e)) ?? null;
  } catch {
    return null;
  }
}

/** ArrayBuffer → base64 (chunked so large models do not blow the call stack). */
export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** base64 → ArrayBuffer. */
export function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Minimal shape the flat 2.5D fallback needs from a SymbolDef. */
export interface FlatArt { svg: string; w: number; h: number; color: string }

/** A standalone <svg> document for a symbol, used to texture the flat fallback.
 *  The inner markup is re-sanitized and the colour passed through safeColor. */
export function symbolToSvgDocument(a: FlatArt, scale = 4): string {
  const w = Math.max(1, Math.round(a.w));
  const h = Math.max(1, Math.round(a.h));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}">` +
    `<g style="color:${safeColor(a.color)}">${sanitizeSvg(a.svg)}</g></svg>`;
}
