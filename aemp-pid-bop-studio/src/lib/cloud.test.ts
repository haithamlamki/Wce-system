// ============================================================================
//  Unit tests for saveProjectCloud ownership stamping (F4 / PR2) and the
//  transactional cloud RPCs (F12 / PR6). Mocks the supabase client so no
//  network / DB is needed. Asserts:
//    - a NEW project (no id) gets created_by stamped on the projects upsert;
//    - an UPDATE (id provided) leaves created_by untouched (no overwrite);
//    - the project_versions insert always carries created_by explicitly;
//    - replaceRigEquipment / renameUnit call the `replace_rig_equipment` /
//      `rename_unit` RPCs (migration 0012) with the right args and propagate
//      RPC errors — no more direct delete/insert or multi-statement re-key.
// ============================================================================
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types';

const getUserMock = vi.fn();
const singleMock = vi.fn();
const selectMock = vi.fn();
const upsertMock = vi.fn();
const insertMock = vi.fn();
const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

// Imported after the mock so `saveProjectCloud` sees the mocked `supabase`.
const { saveProjectCloud, replaceRigEquipment, renameUnit } = await import('./cloud');

const baseProject = {
  meta: { rig: 'Rig A', date: '2026-01-01', who: 'Alice' },
  revision: 2,
} as unknown as Project;

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  singleMock.mockResolvedValue({ data: { id: 'new-id' }, error: null });
  selectMock.mockReturnValue({ single: singleMock });
  upsertMock.mockReturnValue({ select: selectMock });
  insertMock.mockResolvedValue({ error: null });
  rpcMock.mockResolvedValue({ data: null, error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === 'projects') return { upsert: upsertMock };
    if (table === 'project_versions') return { insert: insertMock };
    throw new Error(`unexpected table: ${table}`);
  });
});

describe('saveProjectCloud ownership stamping', () => {
  it('stamps created_by on the projects upsert for a NEW project (no id)', async () => {
    await saveProjectCloud(baseProject);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const row = upsertMock.mock.calls[0][0];
    expect(row.created_by).toBe('user-123');
    expect(row.id).toBeUndefined();
  });

  it('does NOT set created_by on the projects upsert when updating (id provided)', async () => {
    await saveProjectCloud(baseProject, 'existing-id');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const row = upsertMock.mock.calls[0][0];
    expect(row.id).toBe('existing-id');
    expect('created_by' in row).toBe(false);
  });

  it('stamps created_by on the project_versions insert', async () => {
    await saveProjectCloud(baseProject, undefined, 'a note');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const versionRow = insertMock.mock.calls[0][0];
    expect(versionRow.created_by).toBe('user-123');
    expect(versionRow.project_id).toBe('new-id');
    expect(versionRow.note).toBe('a note');
  });

  it('returns null and never calls supabase when offline (no client configured)', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    const { saveProjectCloud: saveOffline } = await import('./cloud');
    const result = await saveOffline(baseProject);
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('replaceRigEquipment (F12 — transactional RPC, PR6)', () => {
  const rows = [
    { tag: 'V-1', type: 'gate', section: 'BOP', description: 'Gate valve', rwp: null,
      size: null, manufacturer: null, serial: null, int_last: null, int_due: null,
      maj_last: null, maj_due: null },
  ];

  it('calls the replace_rig_equipment RPC with { p_rig, p_rows } instead of delete+insert', async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    const n = await replaceRigEquipment('Rig 305', rows);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('replace_rig_equipment', { p_rig: 'Rig 305', p_rows: rows });
    expect(n).toBe(1);
    // no direct table access — the whole op is one server-side transaction
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('falls back to rows.length when the RPC returns no count', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const n = await replaceRigEquipment('Rig 305', rows);
    expect(n).toBe(rows.length);
  });

  it('propagates an RPC error (e.g. 42501 not authorized) instead of swallowing it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not authorized' } });
    await expect(replaceRigEquipment('Rig 305', rows)).rejects.toThrow('not authorized');
  });

  it('throws when Supabase is not configured, without calling rpc', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    const { replaceRigEquipment: replaceOffline } = await import('./cloud');
    await expect(replaceOffline('Rig 305', rows)).rejects.toThrow('Cloud not configured');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('renameUnit (F12 — transactional RPC, PR6)', () => {
  it('calls the rename_unit RPC with { p_old, p_new } instead of separate per-table updates', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await renameUnit('Rig 305', 'Rig 306');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('rename_unit', { p_old: 'Rig 305', p_new: 'Rig 306' });
    // no direct multi-table access — the whole re-key is one server-side transaction
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('propagates an RPC error (e.g. 42501 not authorized) instead of swallowing it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not authorized' } });
    await expect(renameUnit('Rig 305', 'Rig 306')).rejects.toThrow('not authorized');
  });

  it('throws when Supabase is not configured, without calling rpc', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    const { renameUnit: renameOffline } = await import('./cloud');
    await expect(renameOffline('Rig 305', 'Rig 306')).rejects.toThrow('Cloud not configured');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
