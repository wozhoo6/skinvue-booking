/**
 * Helpers for the paged Supabase functions.
 *
 * nearby_places and search_places take p_limit / p_offset and answer
 * { clinics, count, total, limit, offset, has_more } (migrations 20261114000001/2).
 * admin_referral_log answers { total, interactions } with the same p_limit / p_offset.
 */

/** Clinics per page on the public search. Matches the functions' default. */
export const CLINIC_PAGE_SIZE = 20;

/**
 * p_limit / p_offset for one page. The first page leaves p_offset out, so it also works
 * against the older functions that don't have that argument yet (the rpc() helper drops
 * undefined values); only "show more" needs the paged versions.
 */
export function pageParams(offset = 0, limit = CLINIC_PAGE_SIZE) {
  return { p_limit: limit, p_offset: offset > 0 ? offset : undefined };
}

/**
 * Reads one page of a clinic search. `total` falls back to the page size when the
 * function is the older one that doesn't report it. An empty page never claims there is
 * more, so "show more" can't get stuck on an offset past the end.
 */
export function readPage(data) {
  const clinics = Array.isArray(data?.clinics) ? data.clinics : [];
  const total = Number.isFinite(data?.total) ? data.total : clinics.length;
  return { clinics, total, hasMore: data?.has_more === true && clinics.length > 0 };
}

/**
 * Appends a later page, skipping rows already shown. Results are ordered by a stable key
 * but data can change between requests (a new event, a clinic edit), so the same row can
 * show up at the edge of two pages.
 */
export function mergeById(current, incoming) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

/**
 * Fetches a paged call page after page, for places that need everything (an export, a
 * per-clinic table) rather than one screenful.
 *
 *   fetchPage(offset)  -> one page of the server's answer (offset is 0 for the first)
 *   count(page)        -> how many rows that page holds (the next offset advances by it)
 *   hasMore(page)      -> the server's has_more flag
 *
 * Stops when the server says there is no more, or a page comes back empty (so an offset
 * past the end can't loop). `complete` is false only when maxPages ran out first, so the
 * caller can say the result is cut short instead of presenting it as everything.
 */
export async function collectPages(fetchPage, { count, hasMore, maxPages = 100 }) {
  const pages = [];
  let offset = 0;
  let complete = false;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(offset);
    pages.push(page);
    const rows = count(page);
    offset += rows;
    if (rows === 0 || !hasMore(page)) {
      complete = true;
      break;
    }
  }
  return { pages, complete };
}

/**
 * The CSV text of one admin_referral_export_csv page. The function now answers
 * { csv, count, total, limit, offset, has_more } (header row only on offset 0, every page
 * ending in CRLF, so pages simply concatenate); the older version answered the CSV itself
 * as a string, which is accepted too.
 */
export function csvOfPage(page) {
  if (typeof page === 'string') return page;
  return typeof page?.csv === 'string' ? page.csv : '';
}

/** "20 of 96 Clinics" while more are waiting, otherwise "5 Clinics" / "1 Clinic". */
export function countLabel(shown, total) {
  if (total > shown) return `${shown} of ${total} Clinics`;
  return `${shown} ${shown === 1 ? 'Clinic' : 'Clinics'}`;
}
