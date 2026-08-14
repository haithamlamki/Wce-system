// ============================================================================
//  Display formatting shared by the inspection views. The reference system
//  renders dates as `17 Jul 2025`; dates stay ISO `YYYY-MM-DD` everywhere else.
// ============================================================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2025-07-17` (or an ISO timestamp) → `17 Jul 2025`; nullish → `—`. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Bytes → `1.2 MB`, matching the reference's file listings. */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}
