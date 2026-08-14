// ============================================================================
//  Rows and total for a server-paged inspection list.
//
//  The two are fetched separately on purpose. Measured in the browser against
//  production data: a page of rows costs ~235 ms, while the exact count over the
//  same view costs ~1.3 s — roughly 85% of the page's load time. Paying that on
//  every page click is waste, because paging cannot change how many rows match.
//
//  So the count is cached against the identity of the RESULT SET (countKey:
//  every row-restricting filter plus the caller's identity) rather than against
//  the query. Paging, page size and sort order reuse it; changing a filter, the
//  search, or the user recomputes it. Mutations invalidate it through refresh().
//
//  The count stays authoritative — it is Postgres's exact count, never a
//  planner estimate, because this is compliance data and the number shown has to
//  be true. The cache lives in component state, so it cannot outlive the view.
//
//  SECURITY: the count is a fact about what ONE user may see. `scopeId` (the
//  authenticated user id) is part of the cache key so a cached total can never
//  be shown across authorization scopes. RLS remains authoritative regardless —
//  both queries read `insp_records_expanded`, which is `security_invoker`, so
//  Postgres applies the calling user's policies to the rows and to the count.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { countKey, fetchRecordsCount, fetchRecordsRows } from '../lib/records';
import type { ListQuery } from '../lib/records';
import type { InspectionRecord } from '../types';

export interface RecordList {
  rows: InspectionRecord[];
  /** Exact count for the current filters, from Postgres. */
  total: number;
  loading: boolean;
  error: string | null;
  /** Refetch rows AND the count. For manual refresh and after mutations. */
  refresh: () => void;
}

/**
 * @param query   Must be referentially stable while its values are unchanged
 *                (memoize it) — it is the effect's dependency.
 * @param scopeId Authenticated user id; part of the count cache key.
 */
export function useRecordList(query: ListQuery, scopeId: string): RecordList {
  const [rows, setRows] = useState<InspectionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which result set the cached `total` describes. null = must recount.
  const countedKey = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    countedKey.current = null;
    setNonce((n) => n + 1);
  }, []);

  const key = countKey(query, scopeId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // A count is only requested when the result set actually changed. When it
    // has not, the second promise resolves immediately and no query is sent.
    const needCount = countedKey.current !== key;
    Promise.all([
      fetchRecordsRows(query),
      needCount ? fetchRecordsCount(query) : Promise.resolve(null),
    ])
      .then(([nextRows, nextCount]) => {
        if (!alive) return;
        setRows(nextRows);
        if (nextCount !== null) {
          setTotal(nextCount);
          countedKey.current = key;
        }
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        // A failed count must not leave a wrong number on screen looking valid.
        countedKey.current = null;
        setError((e as Error).message);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, key, nonce]);

  return { rows, total, loading, error, refresh };
}
