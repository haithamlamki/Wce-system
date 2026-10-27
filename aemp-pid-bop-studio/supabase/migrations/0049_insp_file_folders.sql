-- ============================================================================
--  0049 — Record file folders, like the reference (`/records/{id}/files`):
--  files sit in named folders. The six standard folders map onto
--  insp_files.kind; any other folder name (e.g. "MPI REPORT") is kept in
--  `folder` with kind = 'other'. source_id holds the reference file id so
--  the bulk copy can resume without duplicates.
-- ============================================================================
alter table public.insp_files add column if not exists folder text
  check (folder is null or char_length(folder) <= 255);
alter table public.insp_files add column if not exists source_id integer unique;
