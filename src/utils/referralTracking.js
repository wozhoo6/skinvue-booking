/**
 * Referral / interaction tracking for the "Find a Dermatologist Near You" flow.
 *
 * Every id managed here is an anonymous, client-generated correlation key —
 * none of them are tied to a login, and none of them carry AI screening
 * results, images, or any other medical data. They exist purely so referral
 * interactions can be grouped and counted (e.g. "how many people who viewed
 * Clinic X went on to click its phone number"), which is what the MVP's
 * referral-tracking requirement is for.
 *
 * Tracking calls are fire-and-forget: a failed or slow tracking request must
 * never block or break the referral UI, so every function here swallows its
 * own errors.
 */
import { rpc, functionUrl } from '../lib/supabase';

const SESSION_ID_KEY = 'wss_session_id';
const SCREENING_ID_KEY = 'wss_screening_id';
const SCREENING_ID_TIMESTAMP_KEY = 'wss_screening_id_timestamp';
const REFERRAL_ID_KEY = 'wss_referral_id';
const SEARCH_LOCATION_KEY = 'wss_search_location';

// Mirrors the existing 30-minute TTL already used for the captured
// assessment image in sessionStorage (see ResultsPage1.jsx).
const SCREENING_ID_TTL_MS = 30 * 60 * 1000;

function generateId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Anonymous id for this browser, persisted across visits in localStorage.
 * Not tied to any account or login — there isn't one in this app.
 */
export function getOrCreateSessionId() {
  try {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch (error) {
    return null;
  }
}

/**
 * Opaque id created once per completed screening so referral events can be
 * grouped together, without the server ever storing (or even seeing) the
 * actual screening result or photo. Expires after 30 minutes to match the
 * existing captured-image lifetime.
 */
export function getOrCreateScreeningId() {
  try {
    const existing = sessionStorage.getItem(SCREENING_ID_KEY);
    const timestamp = sessionStorage.getItem(SCREENING_ID_TIMESTAMP_KEY);
    if (existing && timestamp && Date.now() - parseInt(timestamp, 10) < SCREENING_ID_TTL_MS) {
      return existing;
    }
    const id = generateId();
    sessionStorage.setItem(SCREENING_ID_KEY, id);
    sessionStorage.setItem(SCREENING_ID_TIMESTAMP_KEY, Date.now().toString());
    return id;
  } catch (error) {
    return null;
  }
}

/** The REF-YYYY-###### id shared by every interaction within one referral visit, if minted yet. */
export function getReferralId() {
  try {
    return sessionStorage.getItem(REFERRAL_ID_KEY);
  } catch (error) {
    return null;
  }
}

function setReferralId(id) {
  try {
    sessionStorage.setItem(REFERRAL_ID_KEY, id);
  } catch (error) {
    // ignore — worst case, the next event mints a new referral_id
  }
}

/** Clears the current referral_id so a fresh visit to the referral flow starts a new one. */
export function resetReferralId() {
  try {
    sessionStorage.removeItem(REFERRAL_ID_KEY);
  } catch (error) {
    // ignore
  }
}

/**
 * The ZIP/city text the user last searched with, cached so every referral
 * interaction recorded during this visit (views, clicks, redirects) can
 * automatically include search/location context without threading it
 * through every call site by hand.
 */
export function getSearchLocation() {
  try {
    return sessionStorage.getItem(SEARCH_LOCATION_KEY);
  } catch (error) {
    return null;
  }
}

export function setSearchLocation(location) {
  try {
    if (location) {
      sessionStorage.setItem(SEARCH_LOCATION_KEY, location);
    } else {
      sessionStorage.removeItem(SEARCH_LOCATION_KEY);
    }
  } catch (error) {
    // ignore — worst case, search_location is just omitted from events
  }
}

/**
 * Records one referral interaction event. On the very first call in a visit
 * (no referral_id cached yet), the server mints one (REF-YYYY-######) and we
 * cache it so every later interaction in this same referral flow reuses it.
 *
 * `clinicId` is the clinic's Google place_id (the `id` of every clinic object
 * returned by Supabase). Calls the `track_referral_interaction` function.
 *
 * Never throws — a tracking failure must not interrupt the user's flow.
 */
export async function trackReferralInteraction({
  interactionType,
  clinicId = null,
  metadata = null,
  source = 'ai_screening_results',
}) {
  try {
    const data = await rpc(
      'track_referral_interaction',
      {
        p_interaction_type: interactionType,
        p_place_id: clinicId,
        p_referral_id: getReferralId(),
        p_screening_id: getOrCreateScreeningId(),
        p_session_id: getOrCreateSessionId(),
        p_source: source,
        p_metadata: metadata,
        p_search_location: getSearchLocation(),
      },
      // A phone tap opens the dialer right away; keepalive lets the request finish anyway.
      { keepalive: true }
    );

    if (data?.referral_id) {
      setReferralId(data.referral_id);
    }
    return data;
  } catch (error) {
    console.warn('Referral tracking request failed (non-blocking):', error);
    return null;
  }
}

/**
 * Builds the URL of the `clinic-redirect` Supabase Edge Function:
 * GET {VITE_SUPABASE_URL}/functions/v1/clinic-redirect?place_id=...&type=...
 *
 * The function records the click event (WEBSITE_CLICKED or
 * APPOINTMENT_CLICKED) and then issues a 302 to the clinic's website
 * (appointment falls back to the website). Using this URL directly as an
 * <a href> means the click is tracked reliably by the server itself rather
 * than racing a client-side fetch() against the browser's own navigation.
 *
 * @param {string} clinicId  the clinic's place_id
 * @param {'website'|'appointment'} type
 */
export function getClinicRedirectUrl(clinicId, type) {
  const params = new URLSearchParams();
  params.set('place_id', clinicId);
  params.set('type', type);

  const referralId = getReferralId();
  if (referralId) params.set('referral_id', referralId);

  const sessionId = getOrCreateSessionId();
  if (sessionId) params.set('session_id', sessionId);

  const screeningId = getOrCreateScreeningId();
  if (screeningId) params.set('screening_id', screeningId);

  const searchLocation = getSearchLocation();
  if (searchLocation) params.set('search_location', searchLocation);

  return `${functionUrl('clinic-redirect')}?${params.toString()}`;
}

/**
 * Where "Book Appointment" sends the patient for a clinic, used by both the
 * clinic card and the details modal so they always agree:
 *   1. the clinic's own booking page (booking_url), through the tracked
 *      redirect route;
 *   2. otherwise its website, through the same tracked redirect;
 *   3. otherwise a phone call (tracked as PHONE_CLICKED).
 * Returns null when the clinic has none of these.
 *
 * @returns {{ kind: 'appointment'|'website'|'phone', href: string, external: boolean, onClick?: Function } | null}
 */
export function getBookingAction(clinic) {
  if (!clinic) return null;
  if (clinic.booking_url) {
    return { kind: 'appointment', href: getClinicRedirectUrl(clinic.id, 'appointment'), external: true };
  }
  if (clinic.website) {
    return { kind: 'website', href: getClinicRedirectUrl(clinic.id, 'website'), external: true };
  }
  if (clinic.phone) {
    return {
      kind: 'phone',
      href: `tel:${clinic.phone}`,
      external: false,
      onClick: () => trackReferralInteraction({ interactionType: 'PHONE_CLICKED', clinicId: clinic.id }),
    };
  }
  return null;
}
