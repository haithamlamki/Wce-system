-- ============================================================================
--  Inspection — allow the 8-year major frequency.
--  The source's Inspection Frequencies catalog offers 6 Months and 1, 2, 3, 4,
--  5, 8, 10, 12 Years for Major inspections; 0030 omitted 8 years (96 months)
--  and the Oct-2026 export holds 64 records on it.
-- ============================================================================
alter table public.insp_records drop constraint if exists insp_records_major_freq_months_check;
alter table public.insp_records add constraint insp_records_major_freq_months_check
  check (major_freq_months is null or major_freq_months = any (array[6, 12, 24, 36, 48, 60, 96, 120, 144]));
