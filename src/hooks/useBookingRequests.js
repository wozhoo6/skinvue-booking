import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '../components/admin/AdminShell';
import { isAdminKeyError } from '../lib/supabase';
import { listBookingRequests, setRequestStatus, REQUEST_PAGE_SIZE } from '../lib/bookingApi';

/**
 * One page of booking requests, filtered and sorted by the server.
 * Must be used inside <AdminShell> (it reads the admin key from it).
 *
 *   const { requests, total, counts, loading, error, changeStatus } =
 *     useBookingRequests({ status, query, sort, page });
 *
 * - `counts` is the per-status count for the current search (not the status
 *   tab), so every tab keeps its number while one is selected.
 * - A wrong or expired admin key signs the admin out (back to the key gate).
 * - changeStatus updates the row at once, saves it, then reloads so the
 *   counts and the sort order are right.
 */
export function useBookingRequests({
  status = '',
  query = '',
  sort = 'newest',
  page = 0,
  pageSize = REQUEST_PAGE_SIZE,
} = {}) {
  const { adminKey, signOut } = useAdmin();
  const [data, setData] = useState({ requests: [], total: 0, counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const latest = useRef(0); // ignore a slow response that a newer request has replaced

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  const handleError = useCallback(
    (err, fallback) => {
      if (isAdminKeyError(err)) {
        signOut();
        return;
      }
      setError(err?.message || fallback);
    },
    [signOut]
  );

  useEffect(() => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    listBookingRequests(adminKey, {
      status,
      query: query.trim(),
      sort,
      limit: pageSize,
      offset: page * pageSize,
    })
      .then((res) => {
        if (id !== latest.current) return;
        setData({
          requests: res?.requests || [],
          total: res?.total || 0,
          counts: res?.counts_by_status || {},
        });
      })
      .catch((err) => {
        if (id !== latest.current) return;
        handleError(err, 'Couldn’t load the requests.');
      })
      .finally(() => {
        if (id === latest.current) setLoading(false);
      });
  }, [adminKey, status, query, sort, page, pageSize, reloadTick, handleError]);

  const changeStatus = useCallback(
    async (requestId, newStatus) => {
      setData((d) => ({
        ...d,
        requests: d.requests.map((r) => (r.id === requestId ? { ...r, status: newStatus } : r)),
      }));
      try {
        await setRequestStatus(adminKey, requestId, newStatus);
      } catch (err) {
        handleError(err, 'Couldn’t save the status change.');
      }
      reload(); // on failure this puts the old status back
    },
    [adminKey, handleError, reload]
  );

  return {
    requests: data.requests,
    total: data.total,
    counts: data.counts,
    loading,
    error,
    changeStatus,
    reload,
  };
}
