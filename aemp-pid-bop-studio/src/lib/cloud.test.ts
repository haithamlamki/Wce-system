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
const {
  saveProjectCloud, SaveConflictError, replaceRigEquipment, renameUnit,
  listUnitTree, saveTemplateGuarded,
} = await import('./cloud');

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

describe('saveProjectCloud (guarded RPC — optimistic lock, 0026)', () => {
  it('routes an UPDATE through save_project_guarded with the expected version + note, returning id+version', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'row-1', version: 4 }], error: null });
    const res = await saveProjectCloud(baseProject, 'row-1', 3, 'a note');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('save_project_guarded');
    expect(args.p_id).toBe('row-1');
    expect(args.p_expected_version).toBe(3);
    expect(args.p_rig).toBe('Rig A');
    expect(args.p_note).toBe('a note');
    expect(args.p_data).toBe(baseProject);
    expect(res).toEqual({ id: 'row-1', version: 4 });
    // no direct table writes — the whole save is one server-side transaction
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('passes null id/version for a brand-new project (INSERT path)', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'new-id', version: 1 }], error: null });
    const res = await saveProjectCloud(baseProject);
    const args = rpcMock.mock.calls[0][1];
    expect(args.p_id).toBeNull();
    expect(args.p_expected_version).toBeNull();
    expect(res).toEqual({ id: 'new-id', version: 1 });
  });

  it('throws SaveConflictError when the row changed since load (SQLSTATE 40001)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '40001', message: 'save_conflict' } });
    await expect(saveProjectCloud(baseProject, 'row-1', 2)).rejects.toBeInstanceOf(SaveConflictError);
    expect(fromMock).not.toHaveBeenCalled(); // never overwrites
  });

  it('falls back to the legacy upsert when the guard RPC is not deployed (pre-0026)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_project_guarded' } });
    const res = await saveProjectCloud(baseProject, undefined, undefined, 'a note');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0].created_by).toBe('user-123'); // new row still stamped
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0].note).toBe('a note');
    expect(res).toEqual({ id: 'new-id', version: 0 });
  });

  it('propagates a non-conflict RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'not_authorized' } });
    await expect(saveProjectCloud(baseProject, 'row-1', 2)).rejects.toThrow('not_authorized');
  });

  it('returns null and never calls supabase when offline (no client configured)', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    const { saveProjectCloud: saveOffline } = await import('./cloud');
    const result = await saveOffline(baseProject);
    expect(result).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('Project Manager tree + template save (Phase 2)', () => {
  it('listUnitTree calls the list_unit_tree RPC and returns the tree', async () => {
    const tree = [{ id: 'u1', name: 'Rig 103', diagrams: [], templates: [] }];
    rpcMock.mockResolvedValue({ data: tree, error: null });
    const res = await listUnitTree();
    expect(rpcMock).toHaveBeenCalledWith('list_unit_tree');
    expect(res).toEqual(tree);
  });

  it('saveTemplateGuarded passes unit/name/version and returns id+version', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'tpl-1', version: 3 }], error: null });
    const res = await saveTemplateGuarded('tpl-1', 2, 'u1', 'Startup', baseProject);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('save_template_guarded');
    expect(args).toMatchObject({ p_id: 'tpl-1', p_expected_version: 2, p_unit_id: 'u1', p_name: 'Startup' });
    expect(res).toEqual({ id: 'tpl-1', version: 3 });
  });

  it('saveTemplateGuarded throws SaveConflictError on a stale template save', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '40001', message: 'save_conflict' } });
    await expect(saveTemplateGuarded('tpl-1', 1, 'u1', 'Startup', baseProject)).rejects.toBeInstanceOf(SaveConflictError);
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
