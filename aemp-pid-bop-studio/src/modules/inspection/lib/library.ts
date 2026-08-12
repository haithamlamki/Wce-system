// ============================================================================
//  Library — storage-backed document explorer over the 'inspection-library'
//  bucket. Folders are storage prefixes.
// ============================================================================
import { supabase } from '../../../lib/supabase';

const BUCKET = 'inspection-library';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export interface LibraryEntry {
  name: string; isFolder: boolean; size: number; updatedAt: string;
}

export async function listLibrary(prefix: string): Promise<LibraryEntry[]> {
  const { data, error } = await need().storage.from(BUCKET)
    .list(prefix, { sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((e) => e.name !== '.emptyFolderPlaceholder')
    .map((e) => ({
      name: e.name,
      isFolder: e.id === null,                    // storage returns null id for prefixes
      size: (e.metadata?.size as number) ?? 0,
      updatedAt: (e.updated_at ?? '').slice(0, 10),
    }));
}

/** Storage folders are prefixes; a placeholder object makes one visible (guide §5.13). */
export async function createLibraryFolder(prefix: string, name: string): Promise<void> {
  const clean = name.trim().replace(/[\\/]+/g, '-');
  if (!clean) throw new Error('Folder name is required.');
  const path = `${prefix ? `${prefix}/` : ''}${clean}/.emptyFolderPlaceholder`;
  const { error } = await need().storage.from(BUCKET)
    .upload(path, new Blob([''], { type: 'text/plain' }), { upsert: true });
  if (error) throw new Error(error.message);
}

export async function uploadLibraryFile(prefix: string, file: File): Promise<void> {
  const path = prefix ? `${prefix}/${file.name}` : file.name;
  const { error } = await need().storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
}

export async function deleteLibraryFile(path: string): Promise<void> {
  const { error } = await need().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function libraryUrl(path: string): Promise<string> {
  const { data, error } = await need().storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
