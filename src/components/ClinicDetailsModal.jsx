import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { rpc } from '../lib/supabase';
import { trackReferralInteraction } from '../utils/referralTracking';
import { DAY_KEYS, WEEK_DAYS, formatDayPeriods, hasOpeningHours } from '../utils/clinicHours';
import { Icon } from './Icons';
import './ClinicDetailsModal.css';

const TODAY_KEY = DAY_KEYS[new Date().getDay()];

/**
 * "View details" opens this sheet in place of navigating to a separate page
 * (Phase 1 requirement). The search/results page underneath is never
 * unmounted, so closing it — via the X button, clicking the backdrop, or
 * Escape — leaves the user exactly where they were, with their search and
 * results intact. Styled like the photo sheet (GuidelinesModal): a bottom
 * sheet on phones, a centered dialog on larger screens.
 */
function ClinicDetailsModal({ clinicId, distanceKm, onClose, onBook }) {
  const hasTrackedView = useRef(null);
  const closeRef = useRef(null);

  const [clinic, setClinic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setClinic(null);
    setLoading(true);
    setError(null);

    // get_place returns null for an unknown or closed clinic.
    rpc('get_place', { p_place_id: clinicId })
      .then((data) => {
        if (!data) throw new Error('not_found');
        setClinic(data);
        if (hasTrackedView.current !== clinicId) {
          hasTrackedView.current = clinicId;
          trackReferralInteraction({ interactionType: 'CLINIC_VIEWED', clinicId });
        }
      })
      .catch((err) => {
        setError(
          err.message === 'not_found'
            ? 'This clinic could not be found. It may no longer be listed.'
            : 'We couldn’t load this clinic’s details right now. Please try again in a moment.'
        );
      })
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleMapClick = () => {
    trackReferralInteraction({ interactionType: 'MAP_CLICKED', clinicId });
  };

  const handlePhoneClick = () => {
    trackReferralInteraction({ interactionType: 'PHONE_CLICKED', clinicId });
  };

  // The link opens clinic.website directly; this records the click alongside it.
  const handleWebsiteClick = () => {
    trackReferralInteraction({ interactionType: 'WEBSITE_CLICKED', clinicId });
  };

  // The map is address-first: a clinic's verified street address is more
  // reliable and more human-readable than raw coordinates, and no Google Maps
  // API key is configured for this project, so a plain "maps?q=" embed/search
  // URL (no key required) is the simplest solution that still works well.
  // Latitude/longitude only steps in as a last resort for the rare clinic
  // that has neither an address nor a city on file.
  const mapQuery = clinic?.address
    ? [clinic.address, clinic.city].filter(Boolean).join(', ')
    : clinic?.city
    ? clinic.city
    : clinic?.latitude != null && clinic?.longitude != null
    ? `${clinic.latitude},${clinic.longitude}`
    : null;

  const mapEmbedUrl = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`
    : null;

  const openMapsUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;

  // Two actions, Book Appointment first: it opens the request form (the page
  // swaps this modal for AppointmentRequestModal), then Visit Website.
  const showWebsite = Boolean(clinic?.website);
  const isSponsored = typeof clinic?.priority_rank === 'number' && clinic.priority_rank > 0;
  // opening_hours is {} when Google has no hours: unknown, not closed.
  const hasHours = hasOpeningHours(clinic?.opening_hours);
  // Closed days (no open period) are left out of the list.
  const openDays = hasHours
    ? WEEK_DAYS.map(([key, label]) => ({ key, label, periods: formatDayPeriods(clinic.opening_hours, key) }))
        .filter((day) => day.periods.length > 0)
    : [];
  const description = typeof clinic?.description === 'string' ? clinic.description.trim() : '';

  return createPortal(
    <div className="cd-overlay" onClick={onClose}>
      <div
        className="cd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cd-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="cd-close"
          onClick={onClose}
          aria-label="Close clinic details"
        >
          <Icon name="close" />
        </button>

        <div className="cd-header">
          <div className="cd-badges">
            <span className="cd-badge is-step">Clinic Details</span>
            {isSponsored && (
              <span className="cd-badge is-sponsored">
                <Icon name="star" size={14} /> Sponsored
              </span>
            )}
            {typeof distanceKm === 'number' && <span className="cd-badge">{distanceKm.toFixed(1)} km Away</span>}
          </div>
          <h2 id="cd-title" className="cd-title">{clinic?.name || 'Clinic Details'}</h2>
          {description && <p className="cd-subtitle">{description}</p>}
        </div>

        <div className="cd-body">
          {loading && (
            <div className="cd-state" role="status">
              <span className="cd-spinner" aria-hidden="true" />
              <p>Loading Clinic Details...</p>
            </div>
          )}

          {!loading && error && (
            <div className="cd-state">
              <span className="cd-state-icon"><Icon name="alert" size={24} /></span>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && clinic && (
            <>
              {(onBook || showWebsite) && (
                <div className="cd-actions">
                  {onBook && (
                    <button type="button" className="cd-btn primary" onClick={() => onBook(clinic)}>
                      <Icon name="calendar" size={20} /> Book Appointment
                    </button>
                  )}
                  {showWebsite && (
                    <a
                      className={`cd-btn ${onBook || clinic.phone ? 'slate' : 'primary'}`}
                      href={clinic.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleWebsiteClick}
                    >
                      <Icon name="globe" size={20} /> Visit website
                    </a>
                  )}
                </div>
              )}

              {clinic.dermatologists?.length > 0 && (
                <section className="cd-section">
                  <h3 className="cd-section-title">
                    {clinic.dermatologists.length === 1 ? 'Dermatologist' : 'Dermatologists'}
                  </h3>
                  <ul className="cd-doctors">
                    {clinic.dermatologists.map((derm) => (
                      <li key={derm.id} className="cd-doctor">
                        <span className="cd-doctor-icon"><Icon name="user" size={20} /></span>
                        <div>
                          <p className="cd-doctor-name">{derm.name}</p>
                          {derm.specialization && <p className="cd-doctor-role">{derm.specialization}</p>}
                          {derm.profile_bio && <p className="cd-doctor-bio">{derm.profile_bio}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {clinic.services?.length > 0 && (
                <section className="cd-section">
                  <h3 className="cd-section-title">Services</h3>
                  <ul className="cd-chips">
                    {clinic.services.map((service) => (
                      <li key={service} className="cd-chip">{service}</li>
                    ))}
                  </ul>
                </section>
              )}

              {(clinic.address || clinic.city) && (
                <section className="cd-section">
                  <h3 className="cd-section-title">Location</h3>
                  <div className="cd-card cd-location">
                    <p className="cd-address">
                      <Icon name="pin" size={18} />
                      <span>{[clinic.address, clinic.city].filter(Boolean).join(', ')}</span>
                    </p>
                    {clinic.phone && (
                      <p className="cd-address cd-phone">
                        <Icon name="phone" size={18} />
                        <a href={`tel:${clinic.phone}`} onClick={handlePhoneClick}>{clinic.phone}</a>
                      </p>
                    )}
                    {mapEmbedUrl && (
                      <div className="cd-map">
                        <iframe
                          title={`Map showing ${clinic.name}`}
                          src={mapEmbedUrl}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    )}
                    {openMapsUrl && (
                      <a
                        className="cd-link"
                        href={openMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleMapClick}
                      >
                        Open in Google Maps <Icon name="external" size={16} />
                      </a>
                    )}
                  </div>
                </section>
              )}

              <section className="cd-section">
                <h3 className="cd-section-title">Opening Hours</h3>
                {hasHours ? (
                  <ul className="cd-card cd-hours">
                    {openDays.map(({ key, label, periods }) => (
                      <li key={key} className={key === TODAY_KEY ? 'is-today' : undefined}>
                        <span>{label}{key === TODAY_KEY && <em>Today</em>}</span>
                        <span>
                          {periods.map((period, i) => (
                            <React.Fragment key={period}>
                              {i > 0 && <br />}
                              {period}
                            </React.Fragment>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cd-card cd-empty">
                    This clinic hasn’t listed its hours. Please contact the clinic to confirm when it’s open.
                  </p>
                )}
              </section>

              <p className="cd-privacy">
                Book Appointment sends your request to our team, who book with the clinic for you and
                confirm by phone or email.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ClinicDetailsModal;
