import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getReferralId, getOrCreateSessionId, getSearchLocation } from '../utils/referralTracking';
import {
  submitBookingRequest,
  isRateLimitError,
  isNotFoundError,
  isInvalidInputError,
} from '../lib/bookingApi';
import {
  describeUnavailableDate,
  getBookableDates,
  getBookableEndTimesForDate,
  getBookableTimesForDate,
  hasOpeningHours,
  localDateString,
} from '../utils/clinicHours';
import { Icon } from './Icons';
import './AppointmentRequestModal.css';

const OPTION_LABELS = ['First Choice', 'Second Choice', 'Third Choice'];

// How far ahead the day dropdown reaches. The server itself accepts up to a year.
const BOOKING_WINDOW_DAYS = 60;

// One choice is a window on one day: from a start time to an end time.
const EMPTY_SLOT = { date: '', from: '', to: '' };

// These limits match submit_booking_request in Supabase, which re-checks them.
const NAME_MAX = 100;
const EMAIL_MAX = 254;

/** What the patient sees for a failed submit. */
function submitErrorMessage(err) {
  if (isRateLimitError(err)) return 'You’ve sent several requests already. Please try again later.';
  if (isNotFoundError(err)) return 'This clinic is no longer available. Please go back and choose another.';
  if (isInvalidInputError(err) && err.message) {
    // The server's messages are lowercase ("phone must have 10 to 15 digits").
    return `${err.message.charAt(0).toUpperCase()}${err.message.slice(1)}${/[.!?]$/.test(err.message) ? '' : '.'}`;
  }
  return 'We couldn’t send your request. Please try again.';
}

function validate(form, openingHours, dateValues) {
  const errors = {};
  const name = form.fullName.trim().split(/\s+/).join(' ');
  if (name.length < 2 || name.length > NAME_MAX) errors.fullName = 'Please enter your full name.';
  const digits = form.phone.replace(/\D/g, '');
  if (!/^[0-9+\-().\s]+$/.test(form.phone.trim()) || digits.length < 10 || digits.length > 15) {
    errors.phone = 'Please enter a valid phone number.';
  }
  if (form.email.trim().length > EMAIL_MAX || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  const seen = new Set();
  form.slots.forEach((slot, i) => {
    if (!slot.date || !slot.from || !slot.to) {
      errors[`slot${i}`] = 'Choose a day, a start time and an end time.';
    } else if (
      !dateValues.has(slot.date) ||
      !getBookableTimesForDate(openingHours, slot.date).some(([value]) => value === slot.from) ||
      !getBookableEndTimesForDate(openingHours, slot.date, slot.from).some(([value]) => value === slot.to)
    ) {
      errors[`slot${i}`] = 'This time isn’t available. Please choose another.';
    } else {
      const key = `${slot.date}T${slot.from}`;
      if (seen.has(key)) errors[`slot${i}`] = 'This repeats another choice.';
      seen.add(key);
    }
  });
  return errors;
}

/**
 * "Book Appointment" form. The patient leaves their contact details and three
 * preferred date/times; the WSS team then contacts the clinic and books on
 * their behalf (tracked in /admin/requests). Same sheet frame as the clinic
 * details modal: bottom sheet on phones, centered dialog on larger screens.
 */
function AppointmentRequestModal({ clinic, onClose }) {
  // The day and time choices come from the clinic's opening hours (clinic.opening_hours
  // from the API). With no hours on file, every weekday 8:00 AM - 6:00 PM is offered.
  const openingHours = clinic.opening_hours;
  const hoursKnown = hasOpeningHours(openingHours);
  const dateValues = useMemo(
    () => new Set(getBookableDates(openingHours, BOOKING_WINDOW_DAYS).map((d) => d.value)),
    [openingHours]
  );
  // The date picker can't grey out closed days, so it only bounds the range; a closed
  // day gets an explanation instead (describeUnavailableDate) and no times to pick.
  const minDate = useMemo(() => localDateString(new Date()), []);
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + BOOKING_WINDOW_DAYS - 1);
    return localDateString(d);
  }, []);

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    slots: [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT],
    company: '', // honeypot, never shown
  });
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [result, setResult] = useState(null);
  const closeRef = useRef(null);
  const nameRef = useRef(null);

  const errors = validate(form, openingHours, dateValues);
  const showError = (key) => touched && errors[key];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    nameRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setSlot = (index, key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({
      ...f,
      slots: f.slots.map((slot, i) => {
        if (i !== index) return slot;
        const next = { ...slot, [key]: value };
        // A new day can have different hours: drop a start that no longer fits.
        if (key === 'date' && !getBookableTimesForDate(openingHours, value).some(([t]) => t === next.from)) {
          next.from = '';
        }
        // The end must stay valid for the day and start; drop it when it doesn't.
        if (
          (key === 'date' || key === 'from') &&
          !getBookableEndTimesForDate(openingHours, next.date, next.from).some(([t]) => t === next.to)
        ) {
          next.to = '';
        }
        return next;
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const data = await submitBookingRequest({
        placeId: clinic.id,
        fullName: form.fullName.trim().split(/\s+/).join(' '),
        phone: form.phone.trim(),
        email: form.email.trim(),
        preferredTimes: form.slots.map((s) => `${s.date}T${s.from}`),
        preferredTimesTo: form.slots.map((s) => `${s.date}T${s.to}`),
        referralId: getReferralId() || undefined,
        sessionId: getOrCreateSessionId() || undefined,
        searchLocation: getSearchLocation() || undefined,
        company: form.company || undefined,
      });
      setResult(data);
    } catch (err) {
      setServerError(submitErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="ar-overlay" onClick={onClose}>
      <div
        className="ar-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ar-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="ar-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>

        {result ? (
          <div className="ar-success">
            <span className="ar-success-icon"><Icon name="check" size={30} /></span>
            <h2 id="ar-title" className="ar-title">Request Sent</h2>
            <p className="ar-lede">
              Thank you. Our team will contact <b>{clinic.name}</b> to book one of your times, then
              call or email you to confirm.
            </p>
            <p className="ar-ref">
              Reference <b>{result.reference}</b>
            </p>
            <button type="button" className="ar-btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="ar-form" onSubmit={handleSubmit} noValidate>
            <div className="ar-header">
              <span className="ar-badge"><Icon name="calendar" size={14} /> Book Appointment</span>
              <h2 id="ar-title" className="ar-title">{clinic.name}</h2>
              <p className="ar-lede">
                Tell us how to reach you and when you’re free. We’ll book with the clinic for you.
              </p>
            </div>

            <div className="ar-body">
              <fieldset className="ar-card">
                <legend className="ar-card-title">Your Details</legend>

                <label className="ar-field">
                  <span>Full Name</span>
                  <input
                    ref={nameRef}
                    type="text"
                    autoComplete="name"
                    maxLength={NAME_MAX}
                    value={form.fullName}
                    onChange={setField('fullName')}
                    aria-invalid={Boolean(showError('fullName'))}
                    placeholder="e.g. Maria Santos"
                  />
                  {showError('fullName') && <em>{errors.fullName}</em>}
                </label>

                <div className="ar-row">
                  <label className="ar-field">
                    <span>Phone Number</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={setField('phone')}
                      aria-invalid={Boolean(showError('phone'))}
                      placeholder="(555) 123-4567"
                    />
                    {showError('phone') && <em>{errors.phone}</em>}
                  </label>

                  <label className="ar-field">
                    <span>Email</span>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      maxLength={EMAIL_MAX}
                      value={form.email}
                      onChange={setField('email')}
                      aria-invalid={Boolean(showError('email'))}
                      placeholder="you@example.com"
                    />
                    {showError('email') && <em>{errors.email}</em>}
                  </label>
                </div>

                {/* honeypot: hidden from people, filled by bots */}
                <input
                  className="ar-hp"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={form.company}
                  onChange={setField('company')}
                />
              </fieldset>

              <fieldset className="ar-card">
                <legend className="ar-card-title">Preferred Dates &amp; Times</legend>
                <p className="ar-hint">
                  Pick three options, each a day with a time window. The clinic will confirm the one that’s available.{' '}
                  {hoursKnown
                    ? 'Only the clinic’s open days and hours are shown.'
                    : 'This clinic hasn’t listed its hours, so weekdays are shown.'}
                </p>

                {form.slots.map((slot, i) => {
                  const fromOptions = getBookableTimesForDate(openingHours, slot.date);
                  const toOptions = getBookableEndTimesForDate(openingHours, slot.date, slot.from);
                  // A closed or out-of-range day is flagged as soon as it's picked.
                  const dateProblem = describeUnavailableDate(openingHours, slot.date, BOOKING_WINDOW_DAYS);
                  return (
                    <div key={OPTION_LABELS[i]} className="ar-slot">
                      <span className="ar-slot-label">
                        <span className="ar-slot-num">{i + 1}</span>
                        {OPTION_LABELS[i]}
                      </span>
                      <div className="ar-slot-inputs">
                        <input
                          className="ar-slot-day"
                          type="date"
                          min={minDate}
                          max={maxDate}
                          value={slot.date}
                          onChange={setSlot(i, 'date')}
                          aria-label={`${OPTION_LABELS[i]} day`}
                          aria-invalid={Boolean(dateProblem || showError(`slot${i}`))}
                        />
                        <select
                          value={slot.from}
                          onChange={setSlot(i, 'from')}
                          disabled={!slot.date || Boolean(dateProblem)}
                          aria-label={`${OPTION_LABELS[i]} from time`}
                          aria-invalid={Boolean(showError(`slot${i}`))}
                        >
                          <option value="">From</option>
                          {fromOptions.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <select
                          value={slot.to}
                          onChange={setSlot(i, 'to')}
                          disabled={!slot.from}
                          aria-label={`${OPTION_LABELS[i]} to time`}
                          aria-invalid={Boolean(showError(`slot${i}`))}
                        >
                          <option value="">To</option>
                          {toOptions.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      {(dateProblem || showError(`slot${i}`)) && (
                        <em className="ar-slot-error">{dateProblem || errors[`slot${i}`]}</em>
                      )}
                    </div>
                  );
                })}
              </fieldset>

              {serverError && (
                <p className="ar-alert" role="alert">
                  <Icon name="alert" size={18} />
                  <span>{serverError}</span>
                </p>
              )}
            </div>

            <div className="ar-footer">
              <button type="submit" className="ar-btn primary" disabled={submitting} aria-busy={submitting}>
                {submitting ? (
                  <>
                    <span className="ar-spinner" aria-hidden="true" /> Sending...
                  </>
                ) : (
                  'Send Request'
                )}
              </button>
              <p className="ar-privacy">
                Your details are only shared with this clinic to book your visit.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

export default AppointmentRequestModal;
