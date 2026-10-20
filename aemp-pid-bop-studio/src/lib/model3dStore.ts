// ============================================================================
//  3D model store — one optional .glb per symbol key.
//  Two layers, both best-effort:
//    1. IndexedDB (this browser) — works offline, instant.
//    2. Supabase `symbol_models` (migration 0039) — shared company-wide so every
//       device sees the same models. When the table is absent or the user is
//       offline, everything silently falls back to layer 1.
//  Models are kept OUT of the `symbols` rows on purpose: the catalog is fetched
//  in full on every load and must stay small.
// ============================================================================
import { supabase } from './supabase';
import { base64ToBuffer, bufferToBase64 } from './model3d';

const DB_NAME = 'aemp.models3d';
const STORE = 'glb';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => { resolve(req.result as T); db.close(); };
        req.onerror = () => { resolve(null); db.close(); };
      } catch {
        resolve(null);
        db.close();
      }
    });
  });
}

/** Local layer ------------------------------------------------------------- */
export const getLocalModel = (key: string) => tx<ArrayBuffer | undefined>('readonly', (s) => s.get(key)).then((v) => v ?? null);
export const putLocalModel = (key: string, buf: ArrayBuffer) => tx('readwrite', (s) => s.put(buf, key)).then(() => undefined);
export const deleteLocalModel = (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined);
export const listLocalModelKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((k) => (k ?? []).map(String));

/** Remote layer (Supabase) -------------------------------------------------- */
let remoteMissing = false; // table absent → stop asking this session

async function remoteOk<T>(fn: () => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T | null> {
  if (!supabase || remoteMissing) return null;
  try {
    const { data, error } = await fn();
    if (error) {
      // 42P01 / PGRST205 = relation not found: migration 0039 not applied yet.
      if (error.code === '42P01' || error.code === 'PGRST205') remoteMissing = true;
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function listRemoteModelKeys(): Promise<string[]> {
  const rows = await remoteOk(() => supabase!.from('symbol_models').select('key'));
  return ((rows as Array<{ key: string }> | null) ?? []).map((r) => r.key);
}

export async function getRemoteModel(key: string): Promise<ArrayBuffer | null> {
  const row = await remoteOk(() => supabase!.from('symbol_models').select('glb_b64').eq('key', key).maybeSingle());
  const b64 = (row as { glb_b64?: string } | null)?.glb_b64;
  return b64 ? base64ToBuffer(b64) : null;
}

/** Returns true when the shared copy was written. */
export async function putRemoteModel(key: string, buf: ArrayBuffer): Promise<boolean> {
  const out = await remoteOk(() => supabase!.from('symbol_models').upsert({ key, glb_b64: bufferToBase64(buf), bytes: buf.byteLength }).select('key'));
  return out !== null;
}

export async function deleteRemoteModel(key: string): Promise<void> {
  await remoteOk(() => supabase!.from('symbol_models').delete().eq('key', key).select('key'));
}

/** Combined API ------------------------------------------------------------- */
/** Local first (instant/offline), then the shared copy — which is cached locally. */
export async function loadModel(key: string): Promise<ArrayBuffer | null> {
  const local = await getLocalModel(key);
  if (local) return local;
  const remote = await getRemoteModel(key);
  if (remote) await putLocalModel(key, remote);
  return remote;
}

/** Save locally, then try to share. `shared` is false when only this browser has it. */
export async function saveModel(key: string, buf: ArrayBuffer): Promise<{ shared: boolean }> {
  await putLocalModel(key, buf);
  return { shared: await putRemoteModel(key, buf) };
}

export async function removeModel(key: string): Promise<void> {
  await deleteLocalModel(key);
  await deleteRemoteModel(key);
}

/** Every key that has a model (local ∪ shared) — used to badge library cards. */
export async function listModelKeys(): Promise<Set<string>> {
  const [a, b] = await Promise.all([listLocalModelKeys(), listRemoteModelKeys()]);
  return new Set([...a, ...b]);
}
