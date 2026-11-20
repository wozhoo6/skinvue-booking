import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import AdminShell, {
  useAdmin,
  formatWindow,
  formatTimestamp,
  REQUEST_STATUSES,
  STATUS_LABELS,
  StatusSelect,
} from '../components/admin/AdminShell';
import { Icon } from '../components/Icons';
import { isAdminKeyError } from '../lib/supabase';
import { getAdminPlace, listClinicRequests, REQUEST_PAGE_SIZE } from '../lib/bookingApi';
import { useBookingRequests } from '../hooks/useBookingRequests';
import { WEEK_DAYS, formatDayPeriods, hasOpeningHours } from '../utils/clinicHours';

const FREE_REFERRALS = 3;

// The keys are what admin_list_booking_requests accepts as p_sort.
const SORTS = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'soonest', label: 'Soonest First Choice' },
  { key: 'patient', label: 'Patient A–Z' },
  { key: 'clinic', label: 'Clinic A–Z' },
  { key: 'status', label: 'Status' },
];

/** Error banner shared by the admin request pages. */
export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <p className="ad-alert" role="alert">
      <Icon name="alert" size={18} /> <span>{message}</span>
    </p>
  );
}

/** Clinic details sheet, opened by clicking a clinic in the requests table. */
export function ClinicSheet({ request, onClose }) {
  const { adminKey, signOut } = useAdmin();
  // clinic: undefined while loading, null when it isn't in the directory.
  const [clinic, setClinic] = useState(undefined);
  // This clinic's requests: { total, counts_by_status, requests }
  const [own, setOwn] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setClinic(undefined);
    setOwn(null);
    setLoadError(null);
    Promise.all([getAdminPlace(adminKey, request.clinic_id), listClinicRequests(adminKey, request.clinic_id)])
      .then(([place, requests]) => {
        if (cancelled) return;
        setClinic(place || null);
        setOwn(requests);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isAdminKeyError(err)) {
          signOut();
          return;
        }
        setClinic(null);
        setLoadError(err?.message || 'Couldn’t load this clinic.');
      });
    return () => {
      cancelled = true;
    };
  }, [adminKey, request.clinic_id, signOut]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const name = clinic?.name || request.clinic_name;
  const byStatus = own?.counts_by_status || {};
  const attended = byStatus.attended || 0;
  const freeLeft = Math.max(0, FREE_REFERRALS - attended);
  const isSponsored = typeof clinic?.priority_rank === 'number' && clinic.priority_rank > 0;
  // Scraped places carry Google's business_status; anything CLOSED_* is inactive.
  const isActive = clinic ? !clinic.business_status || !clinic.business_status.startsWith('CLOSED') : false;
  const hours = hasOpeningHours(clinic?.opening_hours) ? clinic.opening_hours : null;

  return createPortal(
    <div className="ad-sheet-overlay" onClick={onClose}>
      <div
        className="ad-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ad-clinic-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ad-sheet-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>

        <div className="ad-sheet-head">
          <div className="ad-badges">
            <span className="ad-chip">Clinic Details</span>
            {clinic && (
              <span className={`ad-chip ${isActive ? 'is-good' : 'is-bad'}`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            )}
            {isSponsored && <span className="ad-chip is-accent">Sponsored · P{clinic.priority_rank}</span>}
          </div>
          <h2 id="ad-clinic-title">{name}</h2>
          {clinic?.city && <p className="ad-muted">{clinic.city}</p>}
        </div>

        <div className="ad-sheet-body">
          {clinic?.description && <p className="ad-clinic-desc">{clinic.description}</p>}
          {clinic === undefined && <p className="ad-empty">Loading clinic...</p>}
          {clinic === null && (
            <p className="ad-alert" role="alert">
              <Icon name="alert" size={18} />
              <span>{loadError || 'This clinic isn’t in the directory, so only its requests are shown.'}</span>
            </p>
          )}

          <section className="ad-detail-section ad-referrals">
            <h3>Referrals</h3>
            <div className="ad-mini-stats">
              <span><b>{own ? own.total : '–'}</b> Requests</span>
              <span><b>{own ? byStatus.booked || 0 : '–'}</b> Booked</span>
              <span><b>{own ? attended : '–'}</b> Attended</span>
              <span className={own && freeLeft === 0 ? 'is-warn' : ''}>
                <b>{own ? freeLeft : '–'}</b> Free Left
              </span>
            </div>
            <p className="ad-hint">
              {FREE_REFERRALS} free referrals per clinic, counted when a patient attends; after that,
              referrals are billable.
            </p>
            {own?.requests?.length > 0 && (
              <ul className="ad-clinic-requests">
                {own.requests.map((r) => (
                  <li key={r.id}>
                    <span>{r.full_name}</span>
                    <span className={`ad-status is-${r.status}`}>{STATUS_LABELS[r.status] || r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {clinic && (clinic.phone || clinic.website) && (
            <div className="ad-detail-grid ad-detail-section">
              {clinic.phone && (
                <a className="ad-contact" href={`tel:${clinic.phone}`}>
                  <Icon name="phone" size={18} />
                  <span><small>Phone</small>{clinic.phone}</span>
                </a>
              )}
              {clinic.website && (
                <a className="ad-contact" href={clinic.website} target="_blank" rel="noopener noreferrer">
                  <Icon name="globe" size={18} />
                  <span><small>Website</small>{clinic.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                </a>
              )}
            </div>
          )}

          {clinic && (clinic.address || clinic.city) && (
            <section className="ad-detail-section">
              <h3>Location</h3>
              <p className="ad-detail-value">{[clinic.address, clinic.city].filter(Boolean).join(', ')}</p>
            </section>
          )}

          {clinic?.booking_url && (
            <section className="ad-detail-section">
              <h3>Online Booking</h3>
              <a className="ad-text-link" href={clinic.booking_url} target="_blank" rel="noopener noreferrer">
                Open the clinic’s booking page <Icon name="external" size={16} />
              </a>
            </section>
          )}

          {clinic?.services?.length > 0 && (
            <section className="ad-detail-section">
              <h3>Services</h3>
              <ul className="ad-chips">
                {clinic.services.map((s) => (
                  <li key={s} className="ad-chip">{s}</li>
                ))}
              </ul>
            </section>
          )}

          {hours && (
            <section className="ad-detail-section">
              <h3>Opening Hours</h3>
              <ul className="ad-hours">
                {WEEK_DAYS.map(([key, label]) => (
                  <li key={key}>
                    <span>{label}</span>
                    <span>{formatDayPeriods(hours, key).join(', ') || 'Closed'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="ad-sheet-foot">
          <button type="button" className="ad-btn ghost" onClick={onClose}>
            Close
          </button>
          <Link to="/admin/clinics" className="ad-btn primary">
            Edit in Clinics
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Requests table with a status dropdown on every row. Clicking a clinic
    opens its details (onClinicClick); a status change calls onStatusChange(id, status). */
export function RequestsTable({ requests, emptyText = 'No requests yet.', onClinicClick, onStatusChange }) {
  if (requests.length === 0) return <p className="ad-empty">{emptyText}</p>;
  return (
    <div className="ad-table" role="table" aria-label="Appointment requests">
      <div className="ad-tr ad-th" role="row">
        <span role="columnheader">Patient</span>
        <span role="columnheader">Contact</span>
        <span role="columnheader">Clinic</span>
        <span role="columnheader">Preferred Times</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Received</span>
      </div>
      {requests.map((r) => (
        <div key={r.id} className="ad-tr ad-row" role="row">
          <span role="cell" className="ad-td-patient">
            <b>{r.full_name}</b>
            <small>{r.reference}</small>
          </span>
          <span role="cell" className="ad-td-contact">
            <a href={`tel:${r.phone}`}>{r.phone}</a>
            <small><a href={`mailto:${r.email}`}>{r.email}</a></small>
          </span>
          <span role="cell" className="ad-td-clinic">
            {onClinicClick ? (
              <button type="button" className="ad-clinic-link" onClick={() => onClinicClick(r)}>
                {r.clinic_name}
              </button>
            ) : (
              r.clinic_name
            )}
          </span>
          <span role="cell" className="ad-td-slot">
            <ol className="ad-times" aria-label="Preferred dates and times">
              {r.preferred_times.map((slot, i) => (
                <li key={slot} className={i === 0 ? 'is-first' : undefined}>
                  <span className="ad-times-num">{i + 1}</span>
                  {formatWindow(slot, r.preferred_windows?.[i]?.to)}
                </li>
              ))}
            </ol>
          </span>
          <span role="cell" className="ad-td-status">
            <StatusSelect
              value={r.status}
              label={`Status for ${r.full_name}`}
              onChange={(status) => onStatusChange(r.id, status)}
            />
          </span>
          <span role="cell" className="ad-td-date ad-muted">{formatTimestamp(r.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function RequestsContent() {
  const [clinicFor, setClinicFor] = useState(null);
  const [status, setStatus] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState(''); // queryInput, once typing pauses
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);

  const { requests, total, counts, loading, error, changeStatus } = useBookingRequests({
    status,
    query,
    sort,
    page,
  });

  // Search the server once typing pauses, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // A status change can empty the last page: step back to the last one with rows.
  const pageCount = Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE));
  useEffect(() => {
    if (!loading && page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [loading, page, pageCount]);

  const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const filters = [
    { key: '', label: 'All', count: allCount },
    ...REQUEST_STATUSES.map((s) => ({ ...s, count: counts[s.key] || 0 })),
  ];

  const pickStatus = (key) => {
    setStatus(key);
    setPage(0);
  };

  const emptyText = loading
    ? 'Loading requests...'
    : status || query
      ? 'No requests match these filters.'
      : 'No requests yet.';

  return (
    <>
      <ErrorNote message={error} />

      <div className="ad-toolbar">
        <div className="ad-pills" role="tablist" aria-label="Filter by status">
          {filters.map((f) => (
            <button
              key={f.key || 'all'}
              type="button"
              role="tab"
              aria-selected={status === f.key}
              className={`ad-pill${status === f.key ? ' is-active' : ''}`}
              onClick={() => pickStatus(f.key)}
            >
              {f.label}
              <span className="ad-pill-count">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="ad-toolbar-right">
          <label className="ad-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search Requests"
              aria-label="Search requests"
            />
          </label>
          <label className="ad-sort">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
              aria-label="Sort requests"
            >
              {SORTS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="ad-card ad-table-card">
        <RequestsTable
          requests={requests}
          emptyText={emptyText}
          onClinicClick={setClinicFor}
          onStatusChange={changeStatus}
        />
        {total > REQUEST_PAGE_SIZE && (
          <div className="ad-pager">
            <button type="button" className="ad-btn ghost" disabled={loading || page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="ad-muted">
              {page * REQUEST_PAGE_SIZE + 1}–{Math.min((page + 1) * REQUEST_PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              className="ad-btn ghost"
              disabled={loading || page + 1 >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>

      {clinicFor && <ClinicSheet request={clinicFor} onClose={() => setClinicFor(null)} />}
    </>
  );
}

function AdminRequests() {
  return (
    <AdminShell
      title="Appointment Requests"
      subtitle="People who asked us to book a dermatologist. Change a request’s status as it moves along."
    >
      <RequestsContent />
    </AdminShell>
  );
}

export default AdminRequests;
