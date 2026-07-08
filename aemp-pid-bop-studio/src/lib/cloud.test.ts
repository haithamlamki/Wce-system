// ============================================================================
//  Unit tests for saveProjectCloud ownership stamping (F4 / PR2).
//  Mocks the supabase client so no network / DB is needed. Asserts:
//    - a NEW project (no id) gets created_by stamped on the projects upsert;
//    - an UPDATE (id provided) leaves created_by untouched (no overwrite);
//    - the project_versions insert always carries created_by explicitly.
// ============================================================================
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types';

const getUserMock = vi.fn();
const singleMock = vi.fn();
const selectMock = vi.fn();
const upsertMock = vi.fn();
const insertMock = vi.fn();
const fromMock = vi.fn();

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

// Imported after the mock so `saveProjectCloud` sees the mocked `supabase`.
const { saveProjectCloud } = await import('./cloud');

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
