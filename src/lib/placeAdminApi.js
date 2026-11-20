/**
 * Admin edits for a clinic ("place"), kept apart from the scraped Google data.
 *
 * Google/scraped data always wins: a manual description, website, phone or set of
 * hours is only what patients see when Google has none. Every call here returns the
 * refreshed admin_get_place object, so the caller can replace its copy with it.
 * The admin key is checked inside each database function.
 */
import { rpc } from './supabase';

/**
 * Change description / website / phone. Only the keys present are changed;
 * null or '' clears that manual value.
 * @param {{description?: string|null, website?: string|null, phone?: string|null}} patch
 */
export function updatePlace(adminKey, placeId, patch) {
  return rpc('admin_update_place', { p_admin_key: adminKey, p_place_id: placeId, p_patch: patch });
}

/**
 * Replace the place's manual hours. `periods` is
 * [{ day_of_week: 1, open_time: '08:00', close_time: '17:00' }, ...] with 0 = Sunday.
 * A closed day has no entry; a lunch break is two entries; [] removes the manual hours.
 */
export function setPlaceHours(adminKey, placeId, periods) {
  return rpc('admin_set_place_hours', { p_admin_key: adminKey, p_place_id: placeId, p_periods: periods });
}

/** Add a doctor by name (npi is optional, 10 digits). */
export function linkDermatologist(adminKey, placeId, name, npi) {
  return rpc('admin_link_dermatologist', {
    p_admin_key: adminKey,
    p_place_id: placeId,
    p_name: name,
    p_npi: npi || null,
  });
}

/** Remove a manual doctor (linkId) or hide a scraped one (npi). Pass exactly one. */
export function unlinkDermatologist(adminKey, placeId, { npi, linkId }) {
  return rpc('admin_unlink_dermatologist', {
    p_admin_key: adminKey,
    p_place_id: placeId,
    p_npi: npi ?? null,
    p_link_id: linkId ?? null,
  });
}

/** Show a hidden scraped doctor again. */
export function unhideDermatologist(adminKey, placeId, npi) {
  return rpc('admin_unhide_dermatologist', { p_admin_key: adminKey, p_place_id: placeId, p_npi: npi });
}
