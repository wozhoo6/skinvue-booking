import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faUserDoctor, faSave } from '@fortawesome/free-solid-svg-icons';
import {
  linkDermatologist,
  setPlaceHours,
  unhideDermatologist,
  unlinkDermatologist,
  updatePlace,
} from '../../lib/placeAdminApi';
import {
  ALL_DAY_PERIOD,
  DEFAULT_PERIOD,
  EDITOR_DAYS,
  editorDaysToPeriods,
  endOptions,
  periodsToEditorDays,
  sameWeek,
  startOptions,
  validateEditorDays,
} from '../../utils/hoursEditor';
import './PlaceEditor.css';

/**
 * Manual details for a clinic whose Google data is missing or wrong.
 *
 * Google data always wins: what is entered here is only what patients see when Google
 * has no value for that field. Every field stays editable, and each one says which value
 * patients currently see. Props shared by both editors:
 *   place          admin_get_place() object
 *   adminKey       the shared admin key
 *   onPlaceChange  called with the refreshed place after every successful save
 *   notify         (text, isError) => shows the page banner
 *   errorText      (err, fallback) => banner text for an error (signs out on a bad key)
 */

const DESCRIPTION_MAX = 2000;
const WEBSITE_MAX = 500;

// Same rules as admin_update_place, so a bad value is caught before the round trip.
function textFieldError(field, value) {
  if (!value) return null;
  if (field === 'description' && value.length > DESCRIPTION_MAX) {
    return `Keep the description to ${DESCRIPTION_MAX} characters or fewer.`;
  }
  if (field === 'website' && (value.length > WEBSITE_MAX || !/^https?:\/\/\S+$/i.test(value))) {
    return 'Enter a full web address starting with http:// or https://.';
  }
  if (field === 'phone' && !/^[0-9+()xX. -]{7,30}$/.test(value)) {
    return 'Use 7 to 30 characters: digits, spaces and + ( ) - . x';
  }
  return null;
}

const TEXT_FIELDS = [
  { key: 'description', label: 'Description', multiline: true, placeholder: 'A short description of the clinic' },
  { key: 'website', label: 'Website', placeholder: 'https://example.com' },
  { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567' },
];

/** Who supplies the value patients see for one field. */
function fieldSource(place, field) {
  if (place.scraped?.[field]) return 'google';
  if (place.manual?.[field]) return 'manual';
  return 'none';
}

function SourceNote({ source, label }) {
  if (source === 'google') {
    return (
      <p className="pe-note">
        <span className="pe-tag is-google">Google</span> Google’s value is shown to patients. What you enter here is
        kept as a fallback.
      </p>
    );
  }
  if (source === 'manual') {
    return (
      <p className="pe-note">
        <span className="pe-tag is-manual">Manual</span> Patients see what you entered here.
      </p>
    );
  }
  return (
    <p className="pe-note">
      <span className="pe-tag">Empty</span> No {label.toLowerCase()} on file. Patients see nothing for this yet.
    </p>
  );
}

function TimeSelect({ value, options, onChange, label }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map(([v, text]) => (
        <option key={v} value={v}>{text}</option>
      ))}
    </select>
  );
}

function HoursEditor({ place, adminKey, onPlaceChange, notify, errorText }) {
  const initial = periodsToEditorDays(place.manual?.hours);
  const [week, setWeek] = useState(initial.days);
  const [clipped, setClipped] = useState(initial.clipped);
  const [saved, setSaved] = useState(initial.days);
  const [busy, setBusy] = useState(false);
  const [showError, setShowError] = useState(false);

  const problem = validateEditorDays(week);
  const dirty = !sameWeek(week, saved);
  const hasManual = (place.manual?.hours || []).length > 0;

  const setDay = (key, periods) => setWeek((w) => ({ ...w, [key]: periods }));
  const setPeriod = (key, index, field, value) =>
    setDay(key, week[key].map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  const addPeriod = (key) => {
    const last = week[key][week[key].length - 1];
    const open = last ? last.close : DEFAULT_PERIOD.open;
    setDay(key, [...week[key], { open, close: open < '17:00' ? '17:00' : '24:00' }]);
  };
  const removePeriod = (key, index) => setDay(key, week[key].filter((_, i) => i !== index));
  const copyMondayToWeekdays = () =>
    setWeek((w) => ({
      ...w,
      Tue: w.Mon.map((p) => ({ ...p })),
      Wed: w.Mon.map((p) => ({ ...p })),
      Thu: w.Mon.map((p) => ({ ...p })),
      Fri: w.Mon.map((p) => ({ ...p })),
    }));

  const save = async (periods, okText) => {
    setBusy(true);
    try {
      const updated = await setPlaceHours(adminKey, place.id, periods);
      const next = periodsToEditorDays(updated?.manual?.hours);
      setWeek(next.days);
      setSaved(next.days);
      setClipped(next.clipped);
      setShowError(false);
      onPlaceChange(updated);
      notify(okText);
    } catch (err) {
      notify(errorText(err, 'Failed to save the hours.'), true);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    setShowError(true);
    if (problem) return;
    save(editorDaysToPeriods(week), 'Hours saved.');
  };

  const handleRemove = () => {
    if (!window.confirm('Remove the manual hours for this clinic?')) return;
    save([], 'Manual hours removed.');
  };

  let sourceNote;
  if (place.hours_source === 'google') {
    sourceNote = (
      <>
        <span className="pe-tag is-google">Google</span> Google’s hours are shown to patients. Hours entered here are
        kept as a fallback.
      </>
    );
  } else if (place.hours_source === 'manual') {
    sourceNote = (
      <>
        <span className="pe-tag is-manual">Manual</span> Patients see these hours.
      </>
    );
  } else {
    sourceNote = (
      <>
        <span className="pe-tag">Empty</span> No hours on file. Patients see that the clinic hasn’t listed its hours,
        and booking offers weekdays 8 AM to 6 PM.
      </>
    );
  }

  return (
    <div className="pe-block">
      <h4 className="pe-block-title">Opening hours</h4>
      <p className="pe-note">{sourceNote}</p>
      {clipped && (
        <p className="pe-warn">
          Some saved hours run past midnight. This editor can’t show that, so they appear here ending at midnight.
        </p>
      )}

      <div className="pe-hours">
        {EDITOR_DAYS.map(([key, , label]) => {
          const periods = week[key];
          const open = periods.length > 0;
          return (
            <div key={key} className="pe-day">
              <label className="pe-day-toggle">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) => setDay(key, e.target.checked ? [{ ...DEFAULT_PERIOD }] : [])}
                />
                <span>{label}</span>
              </label>

              {open ? (
                <div className="pe-periods">
                  {periods.map((p, i) => (
                    <div key={i} className="pe-period">
                      <TimeSelect
                        value={p.open}
                        options={startOptions(p.open)}
                        onChange={(v) => setPeriod(key, i, 'open', v)}
                        label={`${label} opens`}
                      />
                      <span aria-hidden="true">to</span>
                      <TimeSelect
                        value={p.close}
                        options={endOptions(p.close)}
                        onChange={(v) => setPeriod(key, i, 'close', v)}
                        label={`${label} closes`}
                      />
                      {periods.length > 1 && (
                        <button
                          type="button"
                          className="pe-link is-danger"
                          onClick={() => removePeriod(key, i)}
                          aria-label={`Remove this ${label} period`}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="pe-period-actions">
                    <button
                      type="button"
                      className="pe-link"
                      onClick={() => addPeriod(key)}
                      disabled={periods[periods.length - 1].close >= '24:00'}
                    >
                      + Split shift
                    </button>
                    <button type="button" className="pe-link" onClick={() => setDay(key, [{ ...ALL_DAY_PERIOD }])}>
                      Open 24 hours
                    </button>
                  </div>
                </div>
              ) : (
                <span className="pe-closed">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      {showError && problem && <p className="pe-error" role="alert">{problem}</p>}

      <div className="pe-actions">
        <button type="button" className="admin-new-btn" onClick={handleSave} disabled={busy || !dirty}>
          <FontAwesomeIcon icon={faSave} /> {busy ? 'Saving...' : 'Save hours'}
        </button>
        <button type="button" className="admin-log-clear-btn pe-btn-inline" onClick={copyMondayToWeekdays} disabled={busy}>
          Copy Monday to Tue–Fri
        </button>
        {hasManual && (
          <button type="button" className="admin-log-clear-btn pe-btn-inline" onClick={handleRemove} disabled={busy}>
            Remove manual hours
          </button>
        )}
      </div>
    </div>
  );
}

/** Description, website, phone and hours. */
export default function PlaceDetailsEditor({ place, adminKey, onPlaceChange, notify, errorText }) {
  const manualValue = (p, field) => p.manual?.[field] || '';
  const [values, setValues] = useState(() =>
    Object.fromEntries(TEXT_FIELDS.map(({ key }) => [key, manualValue(place, key)]))
  );
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const trimmed = (key) => values[key].trim();
  const errors = Object.fromEntries(TEXT_FIELDS.map(({ key }) => [key, textFieldError(key, trimmed(key))]));
  const changedKeys = TEXT_FIELDS.map(({ key }) => key).filter((key) => trimmed(key) !== manualValue(place, key));

  const handleSave = async (e) => {
    e.preventDefault();
    setShowErrors(true);
    if (changedKeys.some((key) => errors[key])) return;
    setSaving(true);
    try {
      // Only the fields that changed; an empty value clears that manual value.
      const patch = Object.fromEntries(changedKeys.map((key) => [key, trimmed(key) || null]));
      const updated = await updatePlace(adminKey, place.id, patch);
      setValues(Object.fromEntries(TEXT_FIELDS.map(({ key }) => [key, manualValue(updated, key)])));
      setShowErrors(false);
      onPlaceChange(updated);
      notify('Clinic details saved.');
    } catch (err) {
      notify(errorText(err, 'Failed to save the clinic details.'), true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-form-section pe-section">
      <h3 className="admin-form-section-title">
        <FontAwesomeIcon icon={faPenToSquare} /> Edit details
      </h3>
      <p className="admin-field-help">
        Fill in what Google doesn’t have. Google’s data always takes priority; anything you enter is only shown to
        patients when Google has nothing for that field.
      </p>

      <form onSubmit={handleSave} noValidate>
        {TEXT_FIELDS.map(({ key, label, multiline, placeholder }) => (
          <div key={key} className="pe-block admin-form-row">
            <label htmlFor={`pe-${key}`}>{label}</label>
            {multiline ? (
              <textarea
                id={`pe-${key}`}
                rows={4}
                value={values[key]}
                placeholder={placeholder}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            ) : (
              <input
                id={`pe-${key}`}
                type={key === 'phone' ? 'tel' : 'url'}
                value={values[key]}
                placeholder={placeholder}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            )}
            {multiline && (
              <span className="pe-count">{values[key].trim().length} / {DESCRIPTION_MAX}</span>
            )}
            {showErrors && errors[key] && <p className="pe-error" role="alert">{errors[key]}</p>}
            <SourceNote source={fieldSource(place, key)} label={label} />
            {place.scraped?.[key] && (
              <p className="pe-google-value">
                Google: {key === 'website' ? (
                  <a href={place.scraped[key]} target="_blank" rel="noopener noreferrer">{place.scraped[key]}</a>
                ) : place.scraped[key]}
              </p>
            )}
          </div>
        ))}

        <div className="pe-actions">
          <button type="submit" className="admin-new-btn" disabled={saving || changedKeys.length === 0}>
            <FontAwesomeIcon icon={faSave} /> {saving ? 'Saving...' : 'Save details'}
          </button>
        </div>
      </form>

      <HoursEditor
        place={place}
        adminKey={adminKey}
        onPlaceChange={onPlaceChange}
        notify={notify}
        errorText={errorText}
      />
    </div>
  );
}

/** The dermatologists shown for a clinic: add by hand, remove manual ones, hide registry ones. */
export function PlaceDoctorsEditor({ place, adminKey, onPlaceChange, notify, errorText }) {
  const [name, setName] = useState('');
  const [npi, setNpi] = useState('');
  const [busyKey, setBusyKey] = useState(null);

  const doctors = place.dermatologists || [];
  const hidden = place.hidden_dermatologists || [];
  const npiProblem = npi.trim() && !/^\d{10}$/.test(npi.trim()) ? 'An NPI is 10 digits.' : null;

  const run = async (key, action, okText, failText) => {
    setBusyKey(key);
    try {
      const updated = await action();
      onPlaceChange(updated);
      notify(okText);
      return true;
    } catch (err) {
      notify(errorText(err, failText), true);
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || npiProblem) return;
    const ok = await run(
      'add',
      () => linkDermatologist(adminKey, place.id, name.trim(), npi.trim()),
      'Dermatologist added.',
      'Failed to add the dermatologist.'
    );
    if (ok) {
      setName('');
      setNpi('');
    }
  };

  const handleRemove = (doctor) => {
    const manual = doctor.source === 'manual';
    const question = manual
      ? `Remove ${doctor.name} from this clinic?`
      : `Hide ${doctor.name} from this clinic? You can restore them afterwards.`;
    if (!window.confirm(question)) return;
    run(
      `rm-${doctor.id}`,
      () => unlinkDermatologist(adminKey, place.id, manual ? { linkId: doctor.link_id } : { npi: doctor.npi }),
      manual ? 'Dermatologist removed.' : 'Dermatologist hidden.',
      'Failed to update the dermatologist.'
    );
  };

  const handleRestore = (doctor) =>
    run(
      `show-${doctor.npi}`,
      () => unhideDermatologist(adminKey, place.id, doctor.npi),
      'Dermatologist restored.',
      'Failed to restore the dermatologist.'
    );

  return (
    <div className="admin-dermatologists-panel">
      <h3>
        <FontAwesomeIcon icon={faUserDoctor} /> Dermatologists
      </h3>
      <ul className="admin-dermatologist-list">
        {doctors.map((doctor) => (
          <li key={doctor.id} className="pe-doctor">
            <span className="pe-doctor-info">
              <strong>{doctor.name}</strong>
              <span className="admin-clinic-city pe-doctor-meta">
                {doctor.npi ? `NPI ${doctor.npi}` : 'No NPI'}
                {doctor.source === 'manual' ? ' · Added by an admin' : ` · Registry, ${doctor.confidence} confidence`}
                {doctor.confidence !== 'high' ? ' · hidden from the public page' : ''}
              </span>
            </span>
            <button
              type="button"
              className="pe-link is-danger"
              onClick={() => handleRemove(doctor)}
              disabled={busyKey === `rm-${doctor.id}`}
            >
              {doctor.source === 'manual' ? 'Remove' : 'Hide'}
            </button>
          </li>
        ))}
        {doctors.length === 0 && <li className="admin-clinics-empty">No dermatologists linked.</li>}
      </ul>

      {hidden.length > 0 && (
        <>
          <p className="admin-field-help">Hidden from this clinic</p>
          <ul className="admin-dermatologist-list">
            {hidden.map((doctor) => (
              <li key={doctor.npi} className="pe-doctor">
                <span className="pe-doctor-info">
                  <strong>{doctor.name || 'Unknown name'}</strong>
                  <span className="admin-clinic-city pe-doctor-meta">NPI {doctor.npi}</span>
                </span>
                <button
                  type="button"
                  className="pe-link"
                  onClick={() => handleRestore(doctor)}
                  disabled={busyKey === `show-${doctor.npi}`}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <form className="admin-add-dermatologist-form" onSubmit={handleAdd}>
        <input
          placeholder="Doctor’s name"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          aria-label="Doctor’s name"
        />
        <input
          placeholder="NPI (optional, 10 digits)"
          value={npi}
          inputMode="numeric"
          maxLength={10}
          onChange={(e) => setNpi(e.target.value)}
          aria-label="NPI (optional)"
        />
        <button type="submit" disabled={busyKey === 'add' || !name.trim() || Boolean(npiProblem)}>
          Add doctor
        </button>
      </form>
      {npiProblem && <p className="pe-error" role="alert">{npiProblem}</p>}
    </div>
  );
}
