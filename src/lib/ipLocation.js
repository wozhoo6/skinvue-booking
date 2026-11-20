/**
 * Approximate location from the visitor's IP address, so the clinic page can show
 * nearby clinics on load without the browser's location permission prompt.
 *
 * The lookup runs in the `detect-location` Supabase Edge Function (it holds the
 * ipgeolocation.io key). It answers { located: true, city, region, lat, lng }, or
 * { located: false } whenever it has nothing usable. An IP only gives a city-level
 * guess, so callers should search a wider radius than for GPS and let people correct it.
 */
import { functionUrl } from './supabase';

const CACHE_KEY = 'wss_approx_location';
const TIMEOUT_MS = 4000;

/** Validates the function's JSON. Returns { city, region, lat, lng } or null. */
export function normalizeLocation(data) {
  if (!data || data.located !== true) return null;
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return { city: text(data.city), region: text(data.region), lat, lng };
}

/** "Houston, TX", or just the city or region, or "your area" when we only have coordinates. */
export function placeLabel(place) {
  return [place?.city, place?.region].filter(Boolean).join(', ') || 'your area';
}

function readCache() {
  try {
    return normalizeLocation({ located: true, ...JSON.parse(sessionStorage.getItem(CACHE_KEY)) });
  } catch {
    return null;
  }
}

function writeCache(place) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(place));
  } catch {
    // private window or blocked storage: it only means we ask again next time
  }
}

// Dev only: pretend to be at this IP (needs ALLOW_IP_OVERRIDE=true on the local function).
// Lets you try the page from outside the area the clinic data covers.
const devFakeIp = () => (import.meta.env.DEV && import.meta.env.VITE_DEV_FAKE_IP) || '';

/**
 * Resolves to { city, region, lat, lng } or null. Never throws: any failure (no network,
 * timeout, daily limit, unknown IP) just means the page works as it did before, with
 * search and "Use My Exact Location". A good answer is kept for the browser tab's session
 * so a refresh does not use another lookup.
 */
export async function detectApproxLocation() {
  if (!import.meta.env.VITE_SUPABASE_URL) return null;

  const fakeIp = devFakeIp();
  if (!fakeIp) {
    const cached = readCache();
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = functionUrl('detect-location') + (fakeIp ? `?ip=${encodeURIComponent(fakeIp)}` : '');
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const place = normalizeLocation(await res.json());
    if (place && !fakeIp) writeCache(place);
    return place;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
