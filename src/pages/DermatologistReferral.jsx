import React, { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/supabase';
import {
  resetReferralId,
  setSearchLocation,
} from '../utils/referralTracking';
import { getTodayHoursLabel } from '../utils/clinicHours';
import ClinicDetailsModal from '../components/ClinicDetailsModal';
import AppointmentRequestModal from '../components/AppointmentRequestModal';
import SiteShell from '../components/SiteShell';
import { Icon } from '../components/Icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import './css/DermatologistReferral.css';

// "Use My Location" is hidden for now (UI only: the handler and error messages below are
// intact). Set to true to bring the button, its error help and the related copy back.
const SHOW_USE_MY_LOCATION = false;

const displayUrl = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

function ClinicCard({ clinic, onSelect, onBook }) {
  const todayHours = getTodayHoursLabel(clinic.opening_hours);
  const services = clinic.services || [];
  const shownServices = services.slice(0, 4);
  const extraCount = services.length - shownServices.length;
  const isSponsored = typeof clinic.priority_rank === 'number' && clinic.priority_rank > 0;
  const hasDistance = typeof clinic.distance_km === 'number';

  return (
    <li className={`rf-clinic${isSponsored ? ' is-sponsored' : ''}`}>
      {(isSponsored || hasDistance) && (
        <div className="rf-badges">
          {isSponsored && (
            <span className="rf-badge is-sponsored">
              <Icon name="star" size={14} /> Sponsored
            </span>
          )}
          {hasDistance && <span className="rf-badge">{clinic.distance_km.toFixed(1)} km Away</span>}
        </div>
      )}

      <h3 className="rf-clinic-name">{clinic.name}</h3>

      {clinic.primary_dermatologist && (
        <p className="rf-clinic-doctor">
          {clinic.primary_dermatologist.name}
          {clinic.primary_dermatologist.specialization && (
            <span> · {clinic.primary_dermatologist.specialization}</span>
          )}
        </p>
      )}

      <ul className="rf-facts">
        {(clinic.address || clinic.city) && (
          <li>
            <Icon name="pin" size={18} />
            <span>{[clinic.address, clinic.city].filter(Boolean).join(', ')}</span>
          </li>
        )}
        {todayHours && (
          <li>
            <Icon name="clock" size={18} />
            <span>{todayHours}</span>
          </li>
        )}
        {clinic.phone && (
          <li>
            <Icon name="phone" size={18} />
            <span>{clinic.phone}</span>
          </li>
        )}
        {clinic.website && (
          <li>
            <Icon name="globe" size={18} />
            <span className="rf-truncate">{displayUrl(clinic.website)}</span>
          </li>
        )}
      </ul>

      {shownServices.length > 0 && (
        <ul className="rf-chips" aria-label="Services">
          {shownServices.map((service) => (
            <li key={service} className="rf-chip">{service}</li>
          ))}
          {extraCount > 0 && <li className="rf-chip is-more">+{extraCount} More</li>}
        </ul>
      )}

      {/* Exactly two actions: View Details (opens the details modal) and
          Book Appointment (opens the request form). */}
      <div className="rf-clinic-actions">
        <button type="button" className="rf-btn slate" onClick={() => onSelect(clinic)}>
          View Details
        </button>
        <button type="button" className="rf-btn primary" onClick={() => onBook(clinic)}>
          Book Appointment
        </button>
      </div>
    </li>
  );
}

// What the visitor sees when "Use My Location" fails. Written for people who aren't
// comfortable with device settings: plain words for what's probably wrong, numbered
// steps for THEIR device (iPhone, Android, Windows, Mac) and browser, then what to do
// afterwards. The wording also follows the screen: "tap" / "phone" on a touch screen,
// "click" / "computer" with a mouse. Typing a ZIP/city is always offered as the fallback.
const TOUCH_QUERY = '(pointer: coarse)';
const SMALL_SCREEN_QUERY = '(max-width: 768px)';

function detectEnvironment() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;

  let platform = 'other';
  // iPadOS reports itself as a Mac, so tell it apart by its touch screen
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) platform = 'ios';
  else if (/Android/i.test(ua)) platform = 'android';
  else if (/Windows/i.test(ua)) platform = 'windows';
  else if (/Macintosh/i.test(ua)) platform = 'mac';

  let browser = 'other';
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) browser = 'edge';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'firefox';
  else if (/Chrome|CriOS/i.test(ua)) browser = 'chrome';
  else if (/Safari/i.test(ua)) browser = 'safari';

  return { platform, browser };
}

function turnOnLocationSteps({ platform, isMobile }) {
  switch (platform) {
    case 'ios':
      return [
        'Open the Settings app on your iPhone.',
        'Tap “Privacy & Security”, then tap “Location Services”.',
        'Make sure “Location Services” is switched on (the switch is green).',
        'Scroll down, tap your browser (for example Safari or Chrome), and choose “While Using the App”.',
      ];
    case 'android':
      return [
        'Swipe down from the very top of your screen. If you only see a small bar, swipe down again (or use two fingers) to open all the quick settings.',
        'Tap the “Location” button (it looks like a map pin) so it turns on. Can’t find it? Open Settings, tap “Location”, and switch “Use location” on.',
        'Make sure Chrome is allowed to use it: in Settings, tap “Apps”, tap “Chrome”, tap “Permissions”, then tap “Location” and choose “Allow only while using the app”. Switch on “Use precise location” if you see it.',
      ];
    case 'windows':
      return [
        'Open the Start menu and choose “Settings”.',
        'Click “Privacy & security” (on older Windows, “Privacy”), then click “Location”.',
        'Switch “Location services” on, and make sure your browser is allowed to use location.',
      ];
    case 'mac':
      return [
        'Click the Apple menu at the top left of your screen and choose “System Settings”.',
        'Click “Privacy & Security”, then click “Location Services”.',
        'Switch “Location Services” on, and make sure your browser (Safari, Chrome, etc.) is switched on in the list.',
      ];
    default:
      return isMobile
        ? [
            'Turn on Location (GPS) in your phone’s settings.',
            'Make sure your browser is allowed to use your location.',
          ]
        : [
            'Turn on location services in your computer’s settings.',
            'Make sure your browser is allowed to use your location.',
          ];
  }
}

function allowSiteSteps({ platform, browser }) {
  if (platform === 'ios') {
    return browser === 'safari'
      ? [
          'In Safari, tap the “AA” icon at the left of the web address.',
          'Tap “Website Settings”, then tap “Location”.',
          'Choose “Allow”.',
        ]
      : [
          'Open the Settings app on your iPhone and scroll down to your browser (for example Chrome).',
          'Tap your browser, then tap “Location”.',
          'Choose “While Using the App”.',
        ];
  }
  if (platform === 'android') {
    return [
      'In Chrome, tap the icon at the left of the web address (a lock or two small sliders).',
      'Tap “Permissions”, then switch “Location” on (or choose “Allow”).',
      'Still not working? Chrome itself may be blocked on your phone. Open Settings, tap “Apps”, tap “Chrome”, tap “Permissions”, then tap “Location” and choose “Allow only while using the app”.',
    ];
  }
  if (browser === 'firefox') {
    return [
      'Click the small permissions icon at the left of the web address.',
      'Find “Access your location”. If it says “Blocked”, click the “X” next to it to remove the block.',
    ];
  }
  if (browser === 'safari') {
    return [
      'In the menu at the top of your screen, click “Safari”, then “Settings for This Website”.',
      'Set “Location” to “Allow”.',
    ];
  }
  // Chrome, Edge and anything similar
  return [
    'Click the icon at the left of the web address (a lock or two small sliders).',
    'Find “Location” and set it to “Allow”. If you don’t see it, click “Site settings” first.',
  ];
}

function buildLocationError(kind, { isTouch, isSmallScreen }) {
  const { platform, browser } = detectEnvironment();
  const isMobile = platform === 'ios' || platform === 'android' || (isSmallScreen && isTouch);
  const tap = isTouch ? 'tap' : 'click';
  const device = isMobile ? 'phone' : 'computer';
  const ctx = { platform, browser, isMobile };

  const tryAgain = `Come back to this page and ${tap} “Use My Location” again. If nothing changes, refresh the page first.`;

  const messages = {
    denied: {
      title: 'This website isn’t allowed to use your location',
      intro: `Your ${device} asked for permission earlier and the answer was “Block” (or it was dismissed). You can change that:`,
      steps: [...allowSiteSteps(ctx), tryAgain],
    },
    timeout: {
      title: 'Finding your location is taking too long',
      intro: isMobile
        ? 'This usually means a weak signal. Please try this:'
        : 'Computers estimate location from nearby Wi-Fi, which can be slow. Please try this:',
      steps: isMobile
        ? [
            'Check that Location (GPS) is switched on in your phone’s settings.',
            'Step near a window or go outside. GPS works best with a clear view of the sky.',
            'Make sure Airplane Mode is off and you have a Wi-Fi or mobile data connection.',
            tryAgain,
          ]
        : [
            'Make sure your computer is connected to Wi-Fi or the internet.',
            'Check that location services are switched on in your computer’s settings.',
            tryAgain,
          ],
    },
    unsupported: {
      title: 'Your browser can’t share your location',
      intro: 'That’s okay, you can still find clinics near you:',
      steps: [
        'Type your ZIP code, city or a clinic name in the box below.',
        `${isTouch ? 'Tap' : 'Click'} the magnifying glass button to search.`,
        'Or open this page in Safari, Chrome, Edge or Firefox and try “Use My Location” again.',
      ],
    },
    unavailable: {
      title: 'We can’t see your location yet',
      intro: isMobile
        ? 'Location (GPS) is probably switched off on your phone, so we can’t find clinics near you. Here’s how to turn it on:'
        : 'Location services are probably switched off on your computer, or your browser isn’t allowed to use them, so we can’t find clinics near you. Here’s how to turn them on:',
      steps: [...turnOnLocationSteps(ctx), tryAgain],
    },
  };

  return {
    ...(messages[kind] || messages.unavailable),
    fallback: `You can also type your ZIP code, city or a clinic name in the box below and ${tap} the magnifying glass.`,
  };
}

// "Book a Derma" lands here: search by location, or by ZIP, city or clinic name; results as
// cards, and a details sheet (ClinicDetailsModal) on top of the same page.
function DermatologistReferral() {
  const hasInitialized = useRef(false);

  const [locating, setLocating] = useState(false);
  // Which kind of location failure to explain ('unavailable' | 'denied' | 'timeout' |
  // 'unsupported'), or null. The wording is built at render time so it follows the
  // current screen (rotate the phone, resize the window) without another search.
  const [locationError, setLocationError] = useState(null);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isSmallScreen = useMediaQuery(SMALL_SCREEN_QUERY);
  const locationMessage = locationError
    ? buildLocationError(locationError, { isTouch, isSmallScreen })
    : null;
  const [locationQuery, setLocationQuery] = useState('');

  const [clinics, setClinics] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [resultsLabel, setResultsLabel] = useState('');

  // { id, distanceKm } of the clinic currently shown in the details modal,
  // or null when the modal is closed. Kept as page state (not a route) so
  // opening/closing it never disturbs the search box or results above.
  const [selectedClinic, setSelectedClinic] = useState(null);

  // Clinic the Book Appointment form is open for ({ id, name }), or null.
  const [bookingClinic, setBookingClinic] = useState(null);

  useEffect(() => {
    // A fresh visit to this page starts a new referral; the referral_id gets
    // minted lazily by the server on whichever interaction (clinic viewed,
    // phone clicked, etc.) happens first — page loads themselves are not
    // tracked as an event.
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    resetReferralId();
  }, []);

  // fn/args: a Supabase function ('nearby_places' or 'search_places') and its
  // arguments. Both return { clinics, count }.
  const runSearch = (fn, args, label) => {
    setResultsLoading(true);
    setResultsError(null);
    setHasSearched(true);
    setResultsLabel(label);

    rpc(fn, args)
      .then((data) => setClinics(data?.clinics || []))
      .catch(() => {
        setClinics([]);
        setResultsError('We couldn’t load nearby clinics right now. Please try again in a moment. TRY TURNINF');
      })
      .finally(() => setResultsLoading(false));
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('unsupported');
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        setSearchLocation(null); // no text query to associate with a geolocation-based search
        runSearch(
          'nearby_places',
          { p_lat: latitude, p_lng: longitude, p_radius_km: 25 },
          'Near Your Location'
        );
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('denied');
        } else if (error.code === error.TIMEOUT) {
          setLocationError('timeout');
        } else {
          setLocationError('unavailable');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  const handleLocationSearch = (event) => {
    event?.preventDefault();
    const trimmed = locationQuery.trim();
    if (!trimmed) return;
    setLocationQuery(trimmed);
    setSearchLocation(trimmed);
    runSearch('search_places', { p_location: trimmed }, `Results for “${trimmed}”`);
  };

  const showList = hasSearched && !resultsLoading && !resultsError && clinics.length > 0;

  return (
    <SiteShell>
      <div className="rf-page">
        <h1 className="mp-greeting rf-greeting">
          Find a Dermatologist
          <span>Near You</span>
        </h1>
        <p className="rf-lede">
          Search by ZIP code, city or clinic name
          {SHOW_USE_MY_LOCATION ? ', or use your location.' : '.'}
        </p>

        <div className="rf-layout">
          <aside className="rf-card rf-search" aria-label="Search for clinics">
            {SHOW_USE_MY_LOCATION && (
              <>
                <button
                  type="button"
                  className="rf-btn primary"
                  onClick={handleShareLocation}
                  disabled={locating}
                  aria-busy={locating}
                >
                  {locating ? (
                    <>
                      <span className="rf-spinner is-light" aria-hidden="true" /> Finding You...
                </>
              ) : (
                <>
                  <Icon name="locate" size={20} /> Use My Location
                </>
              )}
            </button>

            {locationMessage && (
              <div className="rf-alert" role="alert">
                <Icon name="alert" size={24} />
                <div className="rf-alert-body">
                  <strong className="rf-alert-title">{locationMessage.title}</strong>
                  <p className="rf-alert-intro">{locationMessage.intro}</p>
                  <ol className="rf-alert-steps">
                    {locationMessage.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="rf-alert-fallback">
                    <strong>No problem if this doesn’t work.</strong> {locationMessage.fallback}
                  </p>
                </div>
              </div>
            )}

            <div className="rf-divider"><span>Or</span></div>
              </>
            )}

            <form className="rf-field" onSubmit={handleLocationSearch}>
              <label htmlFor="rf-location-input">ZIP Code, City or Clinic Name</label>
              <div className="rf-input-row">
                <input
                  id="rf-location-input"
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  enterKeyHint="search"
                  placeholder="e.g. 90210, Los Angeles or clinic name"
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                />
                <button
                  type="submit"
                  className="rf-search-btn"
                  disabled={!locationQuery.trim()}
                  aria-label="Search clinics"
                >
                  <Icon name="search" size={20} />
                </button>
              </div>
            </form>

            {SHOW_USE_MY_LOCATION && (
              <p className="rf-note">Your location is only used to find nearby clinics. It isn’t stored.</p>
            )}
          </aside>

          <section className="rf-results" aria-labelledby="rf-results-title" aria-live="polite">
            <div className="rf-results-head">
              <h2 id="rf-results-title" className="rf-section-title">
                {hasSearched ? 'Dermatology Clinics' : 'Clinics'}
              </h2>
              {hasSearched && resultsLabel && (
                <p className="rf-results-label">
                  {resultsLabel}
                  {showList && (
                    <span className="rf-count">
                      {clinics.length} {clinics.length === 1 ? 'Clinic' : 'Clinics'}
                    </span>
                  )}
                </p>
              )}
            </div>

            {!hasSearched && (
              <div className="rf-card rf-state">
                <span className="rf-state-icon"><Icon name="search" size={24} /></span>
                <p>
                  Search by ZIP code, city or clinic name
                  {SHOW_USE_MY_LOCATION ? ', or use your location,' : ''} to see dermatology clinics.
                </p>
              </div>
            )}

            {hasSearched && resultsLoading && (
              <div className="rf-card rf-state" role="status">
                <span className="rf-state-icon"><span className="rf-spinner" aria-hidden="true" /></span>
                <p>Finding Clinics...</p>
              </div>
            )}

            {hasSearched && !resultsLoading && resultsError && (
              <div className="rf-card rf-state">
                <span className="rf-state-icon is-warning"><Icon name="alert" size={24} /></span>
                <p>{resultsError}</p>
              </div>
            )}

            {hasSearched && !resultsLoading && !resultsError && clinics.length === 0 && (
              <div className="rf-card rf-state">
                <span className="rf-state-icon"><Icon name="consult" size={24} /></span>
                <p>
                  We couldn’t find a clinic matching that search. Try a different ZIP code, city or
                  clinic name, or check back soon as we add more.
                </p>
              </div>
            )}

            {showList && (
              <ul className="rf-list">
                {clinics.map((clinic) => (
                  <ClinicCard
                    key={clinic.id}
                    clinic={clinic}
                    onSelect={(c) => setSelectedClinic({ id: c.id, distanceKm: c.distance_km ?? null })}
                    onBook={(c) => setBookingClinic({ id: c.id, name: c.name, opening_hours: c.opening_hours })}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="rf-privacy">
          Book Appointment sends your request to our team, who book with the clinic for you and
          confirm by phone or email.
        </p>
      </div>

      {selectedClinic && (
        <ClinicDetailsModal
          clinicId={selectedClinic.id}
          distanceKm={selectedClinic.distanceKm}
          onClose={() => setSelectedClinic(null)}
          onBook={(c) => {
            setSelectedClinic(null);
            setBookingClinic({ id: c.id, name: c.name, opening_hours: c.opening_hours });
          }}
        />
      )}

      {bookingClinic && (
        <AppointmentRequestModal clinic={bookingClinic} onClose={() => setBookingClinic(null)} />
      )}
    </SiteShell>
  );
}

export default DermatologistReferral;
