/**
 * Minimal Supabase client for the clinic-referral feature.
 *
 * Every call goes to a Postgres function (RPC) exposed by the Supabase REST
 * API, e.g. POST {VITE_SUPABASE_URL}/rest/v1/rpc/search_places. The functions
 * live in the wss-clinic-referrals repo (supabase/migrations/2026110500000{8,9,10}_*.sql).
 *
 * Only the publishable (anon) key is used here. It is safe to ship to the
 * browser: tables are locked by RLS and anon can only execute the API
 * functions. Never put the secret / service_role key in the frontend.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export class RpcError extends Error {
  constructor(message, { code = null, status = 0 } = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = code; // Postgres SQLSTATE, e.g. '22023' bad input, 'P0002' not found, '28000' bad admin key
    this.status = status;
  }
}

/** True when the error came from a wrong or missing admin key. */
export const isAdminKeyError = (error) => error?.code === '28000';

/**
 * Calls a Postgres function and returns its JSON result.
 * Arguments that are null, undefined or '' are left out, so the function's
 * own defaults apply.
 *
 * @param {string} fn        function name, e.g. 'search_places'
 * @param {object} [args]    named arguments, e.g. { p_location: '77030' }
 * @param {object} [options] { keepalive } lets a tracking call finish while the page navigates away
 */
export async function rpc(fn, args = {}, { keepalive = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new RpcError('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }

  const body = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new RpcError(data?.message || `Request to ${fn} failed (${res.status})`, {
      code: data?.code ?? null,
      status: res.status,
    });
  }
  return data;
}

/** Public URL of a Supabase Edge Function, e.g. functionUrl('clinic-redirect'). */
export function functionUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}
