/**
 * Booking-request calls to Supabase (see the wss-clinic-referrals repo,
 * migrations 20261106072012_booking_requests.sql and ..._booking_requests_sort.sql).
 *
 * Public:  submit_booking_request   the Book Appointment form
 * Admin:   admin_check              does this key work? (the admin login gate)
 *          admin_list_booking_requests / admin_set_request_status
 *          admin_list_places / admin_get_place   (the clinic sheet and counts)
 *
 * Every admin call takes the admin key as p_admin_key and fails with errcode
 * 28000 when it is wrong (see isAdminKeyError in ./supabase).
 */
import { rpc } from './supabase';

export const REQUEST_PAGE_SIZE = 50;

// The sheet counts a clinic's requests by status, so it needs all of them.
const MAX_LIST_LIMIT = 1000;

/** Postgres errcode raised by submit_booking_request's rate limit. */
export const isRateLimitError = (error) => error?.code === 'P0429';

/** Postgres errcode for a place that no longer exists or is closed. */
export const isNotFoundError = (error) => error?.code === 'P0002';

/** Postgres errcode for input the function rejected. Its message is readable. */
export const isInvalidInputError = (error) => error?.code === '22023';

export function submitBookingRequest({
  placeId,
  fullName,
  phone,
  email,
  preferredTimes,
  preferredTimesTo,
  referralId,
  sessionId,
  searchLocation,
  company,
}) {
  return rpc('submit_booking_request', {
    p_place_id: placeId,
    p_full_name: fullName,
    p_phone: phone,
    p_email: email,
    p_preferred_times: preferredTimes, // window starts: ['YYYY-MM-DDTHH:MM' x 3], in the visitor's order
    p_preferred_times_to: preferredTimesTo, // window ends, same order and day as the starts
    p_referral_id: referralId,
    p_session_id: sessionId,
    p_search_location: searchLocation,
    p_company: company, // honeypot
  });
}

export function adminCheck(adminKey) {
  return rpc('admin_check', { p_admin_key: adminKey });
}

/**
 * One page of requests plus counts per status.
 * Resolves to { requests, total, counts_by_status }.
 * `sort`: newest | oldest | soonest | patient | clinic | status.
 */
export function listBookingRequests(adminKey, { status, query, placeId, sort, limit, offset } = {}) {
  return rpc('admin_list_booking_requests', {
    p_admin_key: adminKey,
    p_status: status,
    p_query: query,
    p_place_id: placeId,
    p_sort: sort,
    p_limit: limit ?? REQUEST_PAGE_SIZE,
    p_offset: offset ?? 0,
  });
}

/** Every request for one clinic (for the clinic sheet's referral counts). */
export function listClinicRequests(adminKey, placeId) {
  return listBookingRequests(adminKey, { placeId, limit: MAX_LIST_LIMIT });
}

export function setRequestStatus(adminKey, requestId, status) {
  return rpc('admin_set_request_status', {
    p_admin_key: adminKey,
    p_request_id: requestId,
    p_status: status,
  });
}

/** One place with its address rows and doctors, or null when unknown. */
export function getAdminPlace(adminKey, placeId) {
  return rpc('admin_get_place', { p_admin_key: adminKey, p_place_id: placeId });
}

/** How many places are in the directory (a one-row page, only `total` is used). */
export async function countAdminPlaces(adminKey) {
  const data = await rpc('admin_list_places', { p_admin_key: adminKey, p_limit: 1 });
  return data?.total ?? 0;
}
