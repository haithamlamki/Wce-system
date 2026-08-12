// ============================================================================
//  Per-record documentation files — private bucket 'inspection-files',
//  metadata in insp_files (kind + optional certificate expiry feeding alerts).
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { FileKind, InspFile } from '../types';

const BUCKET = 'inspection-files';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export function mapFile(row: Record<string, unknown>): InspFile {
  return {
    id: String(row.id), recordId: String(row.record_id), kind: row.kind as FileKind,
    storagePath: String(row.storage_path), fileName: String(row.file_name),
    fileSize: Number(row.file_size ?? 0),
    expiryDate: (row.expiry_date as string) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function listFiles(recordId: string): Promise<InspFile[]> {
  const { data, error } = await need().from('insp_files')
    .select('*').eq('record_id', recordId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapFile);
}

/**
 * Latest file of each kind for a set of records (one query) — feeds the
 * dashboard's DOCUMENTATION column group. Map key: recordId.
 */
export async function listFileKindsFor(
  recordIds: string[],
): Promise<Map<string, Partial<Record<FileKind, InspFile>>>> {
  const out = new Map<string, Partial<Record<FileKind, InspFile>>>();
  if (recordIds.length === 0) return out;
  const { data, error } = await need().from('insp_files')
    .select('*').in('record_id', recordIds).order('created_at');
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const f = mapFile(row as Record<string, unknown>);
    const entry = out.get(f.recordId) ?? {};
    entry[f.kind] = f;                       // later rows win → latest per kind
    out.set(f.recordId, entry);
  }
  return out;
}

/** All files that carry an expiry date — the certificate-expiry alert feed. */
export async function listExpiringFiles(): Promise<InspFile[]> {
  const { data, error } = await need().from('insp_files')
    .select('*').not('expiry_date', 'is', null);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapFile);
}

export async function uploadFile(
  recordId: string, kind: FileKind, file: File, expiryDate: string | null,
): Promise<void> {
  const sb = need();
  const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
  const path = `records/${recordId}/${kind}/${Date.now()}-${safeName}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { error: dbErr } = await sb.from('insp_files').insert({
    record_id: recordId, kind, storage_path: path,
    file_name: file.name, file_size: file.size, expiry_date: expiryDate,
  });
  if (dbErr) {
    await sb.storage.from(BUCKET).remove([path]); // keep storage and metadata in sync
    throw new Error(dbErr.message);
  }
}

export async function deleteFile(f: InspFile): Promise<void> {
  const sb = need();
  const { error } = await sb.from('insp_files').delete().eq('id', f.id);
  if (error) throw new Error(error.message);
  await sb.storage.from(BUCKET).remove([f.storagePath]);
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await need().storage.from(BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
