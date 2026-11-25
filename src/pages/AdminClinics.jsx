import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faSyncAlt,
  faChartLine,
  faListUl,
  faFileExport,
  faFilter,
  faClinicMedical,
  faChevronDown,
  faThumbtack,
  faSearch,
  faEyeSlash,
  faEye,
} from '@fortawesome/free-solid-svg-icons';
import AdminShell, { useAdmin } from '../components/admin/AdminShell';
import PlaceDetailsEditor, { PlaceDoctorsEditor } from '../components/admin/PlaceEditor';
import { rpc, isAdminKeyError } from '../lib/supabase';
import { setPlaceDisabled } from '../lib/placeAdminApi';
import { collectPages, csvOfPage, mergeById } from '../utils/paging';
import './css/AdminClinics.css';

// Options for the event-log "Event Type" filter — kept in sync with the
// interaction_type check on public.referral_interactions in Supabase.
const EVENT_TYPE_FILTER_OPTIONS = [
  ['', 'All event types'],
  ['CLINIC_VIEWED', 'Clinic Viewed'],
  ['PHONE_CLICKED', 'Phone Click'],
  ['WEBSITE_CLICKED', 'Website Click'],
  ['MAP_CLICKED', 'Map Click'],
  ['APPOINTMENT_CLICKED', 'Appointment Click'],
  ['BOOKING_REQUESTED', 'Booking Request'],
];

// Referral Performance and Referral Event Log each keep their own
// independent filter state (same shape, separate values) — filtering one
// tab never affects the other.
const EMPTY_PERFORMANCE_FILTERS = {
  clinicId: '',
  location: '',
  interactionType: '',
  dateFrom: '',
  dateTo: '',
};

const EMPTY_LOG_FILTERS = {
  clinicId: '',
  location: '',
  interactionType: '',
  dateFrom: '',
  dateTo: '',
};

// Human-readable labels for interaction_type codes, reusing the same list
// that already powers the Event Type filter dropdown so the two never drift.
const EVENT_TYPE_LABELS = Object.fromEntries(EVENT_TYPE_FILTER_OPTIONS.filter(([value]) => value));

// Supabase returns ISO timestamps with an offset ("...+00:00"). A value
// without any zone is treated as UTC rather than local time. Rendered in a
// friendlier, more scannable format than the raw string.
function formatLogTimestamp(value) {
  if (!value) return '—';
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const withZone = hasZone ? iso : `${iso}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

// Default view for the Referral Event Log tab: one card per clinic with a
// total + event-type breakdown, expandable to that clinic's individual
// events. The lightweight "Order by Date" toggle below switches to a flat,
// newest-first table instead — the backend already returns rows in that
// order, so no separate endpoint or extra fetch is needed for either view.
function groupInteractionsByClinic(interactions) {
  const groups = new Map();
  for (const row of interactions) {
    const key = row.clinic_id || `unknown:${row.clinic_name || 'Unknown clinic'}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        clinicName: row.clinic_name || 'Unknown clinic',
        clinicLocation: row.clinic_city || row.search_location || null,
        total: 0,
        byType: {},
        events: [],
      });
    }
    const group = groups.get(key);
    group.total += 1;
    group.byType[row.interaction_type] = (group.byType[row.interaction_type] || 0) + 1;
    group.events.push(row);
  }
  // Most-active clinics first — a reasonable, deterministic default that
  // surfaces where referral activity is actually happening.
  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
}

/**
 * MVP-only clinic management screen.
 *
 * There is no admin login yet. Every call here passes whatever key the user
 * types into the "Admin Key" field as p_admin_key to the Supabase admin
 * functions, which check it inside the database (private.require_admin) and
 * fail with "invalid admin key" otherwise. This is a deliberately temporary
 * shortcut, to be replaced by Supabase Auth admin accounts.
 *
 * Clinic data comes from the scraped import (Google), which always wins. An admin
 * can fill in what Google is missing (description, website, phone, hours, doctors:
 * components/admin/PlaceEditor.jsx) and set the pin (search priority, shown as
 * "Sponsored"), set per Google address.
 */

const CLINIC_PAGE_SIZE = 50;
// Referral Event Log: events fetched per request (the server allows up to 1000).
const LOG_PAGE_SIZE = 200;

// match_confidence from the Supabase admin functions: how surely a Google
// place belongs to the registered (NPI) clinic we would contact.
const MATCH_CONFIDENCE_LABELS = {
  address_verified: 'Address verified',
  name_match: 'Name match',
  needs_review: 'Needs review',
};

// "Missing" filter for the clinic list (admin_list_places p_missing) and the badge
// shown on a row for each thing that clinic still lacks.
const MISSING_FILTER_OPTIONS = [
  ['', 'All clinics'],
  ['any', 'Missing anything'],
  ['hours', 'No opening hours'],
  ['website', 'No website'],
  ['description', 'No description'],
  ['phone', 'No phone'],
  ['dermatologists', 'No dermatologists'],
];

const MISSING_BADGES = [
  ['has_hours', 'No hours'],
  ['has_website', 'No website'],
  ['has_description', 'No description'],
  ['has_phone', 'No phone'],
  ['has_dermatologists', 'No doctors'],
];

// Filter state -> admin function arguments (shared by summary, log, export).
function filterArgs(filters) {
  return {
    p_clinic_id: filters.clinicId,
    p_location: filters.location.trim(),
    p_interaction_type: filters.interactionType,
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
  };
}

// Three admin sections, each fully self-contained: clinic list and pinning,
// referral performance by clinic (its own numbers/filters/export), and the
// raw referral event log (also its own numbers/filters/export).
const ADMIN_TABS = [
  { key: 'clinics', label: 'Clinic List', icon: faClinicMedical },
  { key: 'performance', label: 'Referral Performance', icon: faChartLine },
  { key: 'log', label: 'Referral Event Log', icon: faListUl },
];

function AdminClinicsContent() {
  // The key comes from <AdminShell>, which asks for it before this renders.
  const { adminKey, signOut } = useAdmin();
  const [activeTab, setActiveTab] = useState('clinics');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageIsError, setMessageIsError] = useState(false);

  // Clinic List tab: one page of places (searchable), the selected place's
  // detail, and the pin inputs keyed by address_id.
  const [clinics, setClinics] = useState([]);
  const [clinicTotal, setClinicTotal] = useState(0);
  const [clinicOffset, setClinicOffset] = useState(0);
  const [clinicSearch, setClinicSearch] = useState('');
  const [clinicMissing, setClinicMissing] = useState('');
  const [selectedClinicId, setSelectedClinicId] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [priorityInputs, setPriorityInputs] = useState({});
  const [savingAddressId, setSavingAddressId] = useState(null);
  const [togglingDisabled, setTogglingDisabled] = useState(false);

  // Clinics that have received referrals: the options of both tabs' Clinic
  // filter (a dropdown of every scraped place would be thousands long).
  const [referredClinics, setReferredClinics] = useState([]);

  // Referral Performance tab: its own filters, its own summary (totals +
  // by-clinic breakdown), its own export.
  const [performanceFilters, setPerformanceFilters] = useState(EMPTY_PERFORMANCE_FILTERS);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [performanceExporting, setPerformanceExporting] = useState(false);

  // Referral Event Log tab: its own filters, its own summary numbers
  // (logSummary, separate from `report` above), its own raw rows, its own
  // export.
  const [logFilters, setLogFilters] = useState(EMPTY_LOG_FILTERS);
  const [logSummary, setLogSummary] = useState(null);
  const [logSummaryLoading, setLogSummaryLoading] = useState(false);
  const [log, setLog] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logLoadingMore, setLogLoadingMore] = useState(false);
  // The filters the rows on screen were fetched with. "Load more" must page through THAT
  // search, even if the filter inputs have been edited since without pressing Apply.
  const logQueryRef = useRef(logFilters);
  // Bumped by every fresh load, so a late "load more" for an older search is ignored.
  const logRequestRef = useRef(0);
  const [exporting, setExporting] = useState(false);
  // 'clinic' (default) groups the log by clinic with per-clinic totals and
  // an expandable event list; 'date' shows the flat, newest-first table.
  const [logView, setLogView] = useState('clinic');
  const [expandedClinicKeys, setExpandedClinicKeys] = useState(() => new Set());

  const toggleClinicGroup = (key) => {
    setExpandedClinicKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showMessage = (text, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  // One place for turning a Supabase error into the banner text. A wrong or
  // expired key signs out, which puts the admin back at the key prompt.
  const errorText = (err, fallback) => {
    if (isAdminKeyError(err)) {
      signOut();
      return 'Invalid admin key.';
    }
    return err?.message || fallback;
  };

  // admin_list_places: one page, pinned first then by name.
  const fetchClinics = async ({ offset = clinicOffset, search = clinicSearch, missing = clinicMissing } = {}) => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const data = await rpc('admin_list_places', {
        p_admin_key: adminKey,
        p_search: search.trim(),
        p_limit: CLINIC_PAGE_SIZE,
        p_offset: offset,
        p_missing: missing || null,
      });
      setClinics(data?.clinics || []);
      setClinicTotal(data?.total || 0);
      setClinicOffset(offset);
    } catch (err) {
      showMessage(errorText(err, 'Failed to load clinics.'), true);
      setClinics([]);
      setClinicTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Unfiltered summary, used only for the clinic filter options.
  const fetchReferredClinics = async () => {
    if (!adminKey) return;
    try {
      const data = await fetchSummary(EMPTY_LOG_FILTERS);
      const options = (data?.by_clinic || []).map((c) => ({ id: c.clinic_id, name: c.clinic_name || c.clinic_id }));
      options.sort((a, b) => a.name.localeCompare(b.name));
      setReferredClinics(options);
    } catch (err) {
      // The banner already shows errors from the other loads; the dropdown just stays empty.
      setReferredClinics([]);
    }
  };

  // admin_referral_summary: the totals, plus the by-clinic rows, which the server pages
  // (up to 1000 clinics per call). Callers want the whole breakdown, so the later pages
  // are fetched and joined here; the totals come from the first page.
  const fetchSummary = async (filters) => {
    try {
      const { pages, complete } = await collectPages(
        (offset) =>
          rpc('admin_referral_summary', {
            p_admin_key: adminKey,
            ...filterArgs(filters),
            p_offset: offset > 0 ? offset : undefined,
          }),
        {
          count: (page) => page?.by_clinic?.length || 0,
          hasMore: (page) => page?.by_clinic_has_more === true,
        }
      );
      if (pages.length === 1) return pages[0];

      // A clinic can sit on the edge of two pages if events arrive between the calls.
      const byClinic = new Map();
      for (const page of pages) {
        for (const row of page.by_clinic || []) byClinic.set(row.clinic_id, row);
      }
      return { ...pages[0], by_clinic: [...byClinic.values()], by_clinic_has_more: !complete };
    } catch (err) {
      throw new Error(errorText(err, 'Failed to load referral totals.'));
    }
  };

  // Referral Performance tab: totals + per-clinic breakdown, filtered by
  // performanceFilters only.
  const fetchReport = async () => {
    if (!adminKey) return;
    setReportLoading(true);
    try {
      setReport(await fetchSummary(performanceFilters));
    } catch (err) {
      showMessage(err.message || 'Failed to reach the server.', true);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  // Referral Event Log tab's own numbers (Total Referral Events, Website/
  // Call/Appointment Clicks, etc.) — same summary endpoint as Performance,
  // but filtered by logFilters, independently of the Performance tab.
  const fetchLogSummary = async () => {
    if (!adminKey) return;
    setLogSummaryLoading(true);
    try {
      setLogSummary(await fetchSummary(logFilters));
    } catch (err) {
      showMessage(err.message || 'Failed to reach the server.', true);
      setLogSummary(null);
    } finally {
      setLogSummaryLoading(false);
    }
  };

  // First page of the log for the current filters. loadMoreLog adds the later pages.
  const fetchLog = async () => {
    if (!adminKey) return;
    const requestId = ++logRequestRef.current;
    const filters = logFilters;
    logQueryRef.current = filters;
    setLogLoading(true);
    setLogLoadingMore(false);
    try {
      const data = await rpc('admin_referral_log', {
        p_admin_key: adminKey,
        ...filterArgs(filters),
        p_limit: LOG_PAGE_SIZE,
      });
      if (requestId === logRequestRef.current) setLog(data);
    } catch (err) {
      if (requestId !== logRequestRef.current) return;
      showMessage(errorText(err, 'Failed to load the referral event log.'), true);
      setLog(null);
    } finally {
      if (requestId === logRequestRef.current) setLogLoading(false);
    }
  };

  // The next page of events for the filters already applied, added under the rows
  // already shown (skipping any that moved across the page edge).
  const loadMoreLog = async () => {
    if (!adminKey || !log || logLoading || logLoadingMore) return;
    const requestId = logRequestRef.current;
    setLogLoadingMore(true);
    try {
      const data = await rpc('admin_referral_log', {
        p_admin_key: adminKey,
        ...filterArgs(logQueryRef.current),
        p_limit: LOG_PAGE_SIZE,
        p_offset: log.interactions.length,
      });
      if (requestId !== logRequestRef.current) return; // filters were re-applied meanwhile
      setLog((prev) =>
        prev && {
          ...prev,
          total: data?.total ?? prev.total,
          interactions: mergeById(prev.interactions, data?.interactions || []),
        }
      );
    } catch (err) {
      if (requestId === logRequestRef.current) {
        showMessage(errorText(err, 'Failed to load more events.'), true);
      }
    } finally {
      if (requestId === logRequestRef.current) setLogLoadingMore(false);
    }
  };

  const applyPerformanceFilters = () => {
    fetchReport();
  };

  // Runs the log's own summary and its raw rows together, so "Apply
  // Filters" on the Referral Event Log tab updates both its numbers and its
  // table in one action.
  const applyLogFilters = () => {
    fetchLogSummary();
    fetchLog();
  };

  const csvCellValue = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const downloadCsvText = (filename, csvText) => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Referral Performance export: the by-clinic breakdown, respecting
  // whatever Performance-tab filters are currently selected (fetched fresh
  // at export time so it matches even if "Apply Filters" wasn't clicked
  // again after the last edit).
  const handleExportPerformanceCsv = async () => {
    if (!adminKey) return;
    setPerformanceExporting(true);
    try {
      const data = await fetchSummary(performanceFilters);
      const headers = [
        'Clinic',
        'Clinic ID',
        'Clinic Views',
        'Phone Clicks',
        'Website Clicks',
        'Appointment Clicks',
        'Map Clicks',
        'Total',
      ];
      const rows = (data.by_clinic || []).map((row) =>
        [
          row.clinic_name,
          row.clinic_id,
          row.CLINIC_VIEWED || 0,
          row.PHONE_CLICKED || 0,
          row.WEBSITE_CLICKED || 0,
          row.APPOINTMENT_CLICKED || 0,
          row.MAP_CLICKED || 0,
          row.total,
        ]
          .map(csvCellValue)
          .join(',')
      );
      downloadCsvText('referral_performance_by_clinic.csv', [headers.join(','), ...rows].join('\r\n'));
    } catch (err) {
      showMessage(err.message || 'Failed to export the report.', true);
    } finally {
      setPerformanceExporting(false);
    }
  };

  // Referral Event Log export: the raw, row-per-event CSV built by Supabase
  // (admin_referral_export_csv), respecting the Event Log-tab filters. The server returns
  // it in pages (header only on the first, every page ending in a line break), so the
  // pages are fetched in turn and joined into one file.
  const handleExportCsv = async () => {
    if (!adminKey) return;
    setExporting(true);
    try {
      const { pages, complete } = await collectPages(
        (offset) =>
          rpc('admin_referral_export_csv', {
            p_admin_key: adminKey,
            ...filterArgs(logFilters),
            p_offset: offset > 0 ? offset : undefined,
          }),
        {
          count: (page) => (typeof page === 'string' ? 0 : page?.count || 0),
          hasMore: (page) => page?.has_more === true,
        }
      );
      if (!complete) {
        // Better to say so than to hand over a file that looks complete but isn't.
        throw new Error('That export is too large to build here. Narrow the dates or the clinic and try again.');
      }
      downloadCsvText('referral_interactions.csv', pages.map(csvOfPage).join(''));
    } catch (err) {
      showMessage(errorText(err, 'Failed to export the CSV.'), true);
    } finally {
      setExporting(false);
    }
  };

  const loadAll = () => {
    fetchClinics({ offset: 0 });
    fetchReferredClinics();
    fetchReport();
    fetchLogSummary();
    fetchLog();
  };

  useEffect(() => {
    if (adminKey) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMissingFilter = (value) => {
    setClinicMissing(value);
    fetchClinics({ offset: 0, missing: value });
  };

  // After an edit: show the refreshed clinic, and update the list's "missing" badges.
  const handlePlaceChange = (updatedPlace) => {
    setSelectedPlace(updatedPlace);
    fetchClinics();
  };

  const handleClinicSearch = (e) => {
    e.preventDefault();
    fetchClinics({ offset: 0, search: clinicSearch });
  };

  // admin_get_place: clinic object + address rows (pin targets) +
  // registered NPI clinics (outreach) + every linked dermatologist.
  const loadPlace = async (placeId) => {
    setSelectedClinicId(placeId);
    setPlaceLoading(true);
    try {
      const place = await rpc('admin_get_place', { p_admin_key: adminKey, p_place_id: placeId });
      setSelectedPlace(place);
      setPriorityInputs(
        Object.fromEntries(
          (place?.addresses || []).map((a) => [a.address_id, a.priority_rank == null ? '' : String(a.priority_rank)])
        )
      );
    } catch (err) {
      showMessage(errorText(err, 'Failed to load the clinic.'), true);
      setSelectedPlace(null);
    } finally {
      setPlaceLoading(false);
    }
  };

  const handleSetPriority = async (addressId) => {
    const rank = parseInt(priorityInputs[addressId], 10);
    if (!Number.isInteger(rank) || rank < 1) {
      showMessage('Priority must be a whole number, 1 or higher (1 = shown first).', true);
      return;
    }
    setSavingAddressId(addressId);
    try {
      await rpc('admin_set_priority', { p_admin_key: adminKey, p_address_id: addressId, p_priority_rank: rank });
      showMessage(`Pinned with priority ${rank}.`);
      await Promise.all([loadPlace(selectedClinicId), fetchClinics()]);
    } catch (err) {
      showMessage(errorText(err, 'Failed to save the priority.'), true);
    } finally {
      setSavingAddressId(null);
    }
  };

  // admin_set_place_disabled: hides the place from the public site (or shows it again).
  // The function returns the refreshed place, so the detail panel is replaced directly.
  const handleToggleDisabled = async () => {
    if (!selectedPlace) return;
    const disable = !selectedPlace.is_disabled;
    if (
      disable &&
      !window.confirm(
        `Disable "${selectedPlace.name}"? It will no longer appear in search, nearby results, ` +
          'clinic pages or booking requests. You can enable it again at any time.'
      )
    ) {
      return;
    }
    setTogglingDisabled(true);
    try {
      const updated = await setPlaceDisabled(adminKey, selectedPlace.id, disable);
      setSelectedPlace(updated);
      showMessage(disable ? 'Clinic disabled. It is hidden from the public site.' : 'Clinic enabled. It is visible again.');
      fetchClinics();
    } catch (err) {
      showMessage(errorText(err, 'Failed to update the clinic.'), true);
    } finally {
      setTogglingDisabled(false);
    }
  };

  const handleClearPriority = async (addressId) => {
    setSavingAddressId(addressId);
    try {
      await rpc('admin_clear_priority', { p_admin_key: adminKey, p_address_id: addressId });
      showMessage('Pin removed.');
      await Promise.all([loadPlace(selectedClinicId), fetchClinics()]);
    } catch (err) {
      showMessage(errorText(err, 'Failed to remove the pin.'), true);
    } finally {
      setSavingAddressId(null);
    }
  };

  return (
    <div className="admin-clinics-container">
      <div className="admin-toolbar">
        <div className="admin-tabs" role="tablist" aria-label="Admin sections">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`admin-tab ${activeTab === tab.key ? 'admin-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <FontAwesomeIcon icon={tab.icon} /> {tab.label}
            </button>
          ))}
        </div>
        <button type="button" className="admin-refresh-btn" onClick={loadAll} disabled={loading}>
          <FontAwesomeIcon icon={faSyncAlt} spin={loading} /> Refresh
        </button>
      </div>

      {message && (
        <div className={`admin-message ${messageIsError ? 'admin-message-error' : 'admin-message-ok'}`}>
          {message}
        </div>
      )}

      {activeTab === 'clinics' && (
      <div className="admin-clinics-grid">
        <div className="admin-clinics-list-panel">
          <div className="admin-panel-header">
            <h2>Clinics ({clinicTotal})</h2>
          </div>
          <form className="admin-add-dermatologist-form" onSubmit={handleClinicSearch}>
            <input
              placeholder="Search name, city, address or ZIP"
              value={clinicSearch}
              onChange={(e) => setClinicSearch(e.target.value)}
            />
            <button type="submit" disabled={!adminKey || loading}>
              <FontAwesomeIcon icon={faSearch} /> Search
            </button>
          </form>
          <label className="pe-filter">
            Show
            <select value={clinicMissing} onChange={(e) => handleMissingFilter(e.target.value)} disabled={loading}>
              {MISSING_FILTER_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <ul className="admin-clinics-list">
            {clinics.map((clinic) => {
              const missing = MISSING_BADGES.filter(([flag]) => clinic[flag] === false);
              const isOpen = !clinic.business_status || !clinic.business_status.startsWith('CLOSED');
              return (
                <li
                  key={clinic.id}
                  className={`admin-clinic-row ${selectedClinicId === clinic.id ? 'admin-clinic-row-active' : ''} ${clinic.is_disabled ? 'admin-clinic-row-disabled' : ''}`}
                >
                  <button className="admin-clinic-row-select" onClick={() => loadPlace(clinic.id)}>
                    <span
                      className={`admin-status-dot admin-status-${isOpen ? 'active' : 'inactive'}`}
                      title={clinic.business_status || 'Status unknown'}
                    />
                    <span>
                      {clinic.name}
                      {clinic.is_disabled && (
                        <span className="admin-disabled-badge" title="Hidden from the public site">Disabled</span>
                      )}
                      {missing.length > 0 && (
                        <span className="pe-missing">
                          {missing.map(([flag, label]) => (
                            <span key={flag} className="pe-missing-badge">{label}</span>
                          ))}
                        </span>
                      )}
                    </span>
                    {clinic.priority_rank ? (
                      <span className="admin-priority-badge" title="Pinned (search priority)">
                        P{clinic.priority_rank}
                      </span>
                    ) : null}
                    <span className="admin-clinic-city">
                      {[clinic.city, clinic.zip].filter(Boolean).join(' ')}
                      {clinic.referral_count > 0 ? ` · ${clinic.referral_count} events` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
            {clinics.length === 0 && (
              <li className="admin-clinics-empty">
                {clinicMissing || clinicSearch.trim() ? 'No clinics match.' : 'No clinics loaded yet.'}
              </li>
            )}
          </ul>
          {clinicTotal > CLINIC_PAGE_SIZE && (
            <div className="admin-log-panel-actions">
              <button
                className="admin-new-btn"
                disabled={loading || clinicOffset === 0}
                onClick={() => fetchClinics({ offset: Math.max(0, clinicOffset - CLINIC_PAGE_SIZE) })}
              >
                Previous
              </button>
              <span className="admin-log-total">
                {clinicOffset + 1}–{Math.min(clinicOffset + CLINIC_PAGE_SIZE, clinicTotal)} of {clinicTotal}
              </span>
              <button
                className="admin-new-btn"
                disabled={loading || clinicOffset + CLINIC_PAGE_SIZE >= clinicTotal}
                onClick={() => fetchClinics({ offset: clinicOffset + CLINIC_PAGE_SIZE })}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="admin-clinic-form-panel">
          {!selectedClinicId && (
            <p className="admin-clinics-empty">
              Select a clinic to see its details, edit what Google is missing (description, website, phone,
              hours and dermatologists), and set its pin.
            </p>
          )}

          {selectedClinicId && placeLoading && !selectedPlace && <p className="admin-clinics-empty">Loading clinic...</p>}

          {selectedClinicId && selectedPlace && (
            <>
              <h2>
                {selectedPlace.name}
                {selectedPlace.is_disabled && <span className="admin-disabled-badge">Disabled</span>}
              </h2>
              <p className="admin-field-help">
                {selectedPlace.address}
                {selectedPlace.phone ? ` · ${selectedPlace.phone}` : ''}
                {selectedPlace.business_status ? ` · ${selectedPlace.business_status}` : ''}
              </p>
              {selectedPlace.website && (
                <p className="admin-field-help">
                  <a href={selectedPlace.website} target="_blank" rel="noopener noreferrer">
                    {selectedPlace.website}
                  </a>
                </p>
              )}

              <div className="admin-form-section">
                <h3 className="admin-form-section-title">
                  <FontAwesomeIcon icon={selectedPlace.is_disabled ? faEyeSlash : faEye} /> Public visibility
                </h3>
                <p className="admin-field-help">
                  {selectedPlace.is_disabled
                    ? 'This clinic is disabled: it is hidden from search, nearby results, clinic pages and booking requests. Pins, edits and referral history are kept.'
                    : 'This clinic is visible on the public site. Disable it to hide it everywhere without deleting anything.'}
                </p>
                <div className="admin-log-panel-actions">
                  <button
                    type="button"
                    className={selectedPlace.is_disabled ? 'admin-new-btn' : 'admin-log-clear-btn'}
                    disabled={togglingDisabled}
                    onClick={handleToggleDisabled}
                  >
                    <FontAwesomeIcon icon={selectedPlace.is_disabled ? faEye : faEyeSlash} />{' '}
                    {selectedPlace.is_disabled ? 'Enable clinic' : 'Disable clinic'}
                  </button>
                </div>
              </div>

              <div className="admin-form-section">
                <h3 className="admin-form-section-title">
                  <FontAwesomeIcon icon={faThumbtack} /> Search priority (Sponsored)
                </h3>
                <p className="admin-field-help">
                  Pinned clinics appear before others in search results and show a "Sponsored" badge.
                  1 = shown first, 2 = next, and so on. A clinic can have several Google address rows;
                  pinning any one of them pins the clinic.
                </p>
                {(selectedPlace.addresses || []).map((addr) => (
                  <div key={addr.address_id} className="admin-form-row-group">
                    <div className="admin-form-row">
                      <label>
                        Address #{addr.address_id}
                        {addr.priority_rank ? ` (pinned: ${addr.priority_rank})` : ''}
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Not pinned"
                        value={priorityInputs[addr.address_id] ?? ''}
                        onChange={(e) =>
                          setPriorityInputs({ ...priorityInputs, [addr.address_id]: e.target.value })
                        }
                      />
                    </div>
                    <div className="admin-form-row">
                      <label>&nbsp;</label>
                      <div className="admin-log-panel-actions">
                        <button
                          type="button"
                          className="admin-new-btn"
                          disabled={savingAddressId === addr.address_id}
                          onClick={() => handleSetPriority(addr.address_id)}
                        >
                          <FontAwesomeIcon icon={faSave} /> Pin
                        </button>
                        {addr.priority_rank ? (
                          <button
                            type="button"
                            className="admin-log-clear-btn"
                            disabled={savingAddressId === addr.address_id}
                            onClick={() => handleClearPriority(addr.address_id)}
                          >
                            Unpin
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <PlaceDetailsEditor
                key={selectedPlace.id}
                place={selectedPlace}
                adminKey={adminKey}
                onPlaceChange={handlePlaceChange}
                notify={showMessage}
                errorText={errorText}
              />

              <div className="admin-dermatologists-panel">
                <h3>
                  <FontAwesomeIcon icon={faClinicMedical} /> Registered clinics (for outreach)
                </h3>
                <ul className="admin-dermatologist-list">
                  {(selectedPlace.registered_clinics || []).map((rc) => (
                    <li key={rc.clinic_id}>
                      <strong>{rc.registered_name}</strong> — NPI {rc.npi}
                      {rc.registered_phone ? ` · ${rc.registered_phone}` : ''}
                      <br />
                      <span className="admin-clinic-city">
                        {[rc.registered_address, rc.registered_city, rc.registered_state, rc.registered_zip]
                          .filter(Boolean)
                          .join(', ')}{' '}
                        · {MATCH_CONFIDENCE_LABELS[rc.match_confidence] || rc.match_confidence}
                      </span>
                    </li>
                  ))}
                  {(selectedPlace.registered_clinics || []).length === 0 && (
                    <li className="admin-clinics-empty">No registered clinic linked.</li>
                  )}
                </ul>
              </div>

              <PlaceDoctorsEditor
                key={`doctors-${selectedPlace.id}`}
                place={selectedPlace}
                adminKey={adminKey}
                onPlaceChange={handlePlaceChange}
                notify={showMessage}
                errorText={errorText}
              />
            </>
          )}
        </div>
      </div>
      )}

      {activeTab === 'performance' && (
      <div className="admin-report-panel">
        <div className="admin-panel-header">
          <h2>
            <FontAwesomeIcon icon={faChartLine} /> Referral Performance
          </h2>
          <div className="admin-log-panel-actions">
            <button
              className="admin-new-btn"
              onClick={applyPerformanceFilters}
              disabled={!adminKey || reportLoading}
            >
              <FontAwesomeIcon icon={reportLoading ? faSyncAlt : faFilter} spin={reportLoading} /> Apply Filters
            </button>
            <button
              className="admin-new-btn"
              onClick={handleExportPerformanceCsv}
              disabled={!adminKey || performanceExporting}
            >
              <FontAwesomeIcon icon={performanceExporting ? faSyncAlt : faFileExport} spin={performanceExporting} />{' '}
              Export CSV
            </button>
          </div>
        </div>
        <p className="admin-report-subtext">
          Referral performance grouped by clinic — totals plus a breakdown by event type — built
          from the same referral event data as the Event Log tab. Filterable by clinic, location,
          event type, and date range; the export always matches whatever is currently filtered.
        </p>


        {adminKey && (
          <>
            {report && (
              <div className="admin-report-stats">
                <div className="admin-stat-tile admin-stat-tile-highlight">
                  <span className="admin-stat-value">{report.totals.total_events}</span>
                  <span className="admin-stat-label">Total Referral Events</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{report.totals.WEBSITE_CLICKED || 0}</span>
                  <span className="admin-stat-label">Website Clicks</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{report.totals.PHONE_CLICKED || 0}</span>
                  <span className="admin-stat-label">Call Clicks</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{report.totals.APPOINTMENT_CLICKED || 0}</span>
                  <span className="admin-stat-label">Appointment Clicks</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{report.totals.clinics_receiving_referrals}</span>
                  <span className="admin-stat-label">Clinics Receiving Referrals</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{report.totals.referrals_today}</span>
                  <span className="admin-stat-label">Referrals Today</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{report.totals.referrals_this_month}</span>
                  <span className="admin-stat-label">Referrals This Month</span>
                </div>
              </div>
            )}

            <div className="admin-log-filters">
              <div className="admin-form-row">
                <label>Clinic</label>
                <select
                  value={performanceFilters.clinicId}
                  onChange={(e) => setPerformanceFilters({ ...performanceFilters, clinicId: e.target.value })}
                >
                  <option value="">All clinics</option>
                  {referredClinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-form-row">
                <label>Location (city)</label>
                <input
                  placeholder="e.g. Los Angeles"
                  value={performanceFilters.location}
                  onChange={(e) => setPerformanceFilters({ ...performanceFilters, location: e.target.value })}
                />
              </div>
              <div className="admin-form-row">
                <label>Event Type</label>
                <select
                  value={performanceFilters.interactionType}
                  onChange={(e) =>
                    setPerformanceFilters({ ...performanceFilters, interactionType: e.target.value })
                  }
                >
                  {EVENT_TYPE_FILTER_OPTIONS.map(([value, label]) => (
                    <option key={value || 'all'} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-form-row">
                <label>From</label>
                <input
                  type="date"
                  value={performanceFilters.dateFrom}
                  onChange={(e) => setPerformanceFilters({ ...performanceFilters, dateFrom: e.target.value })}
                />
              </div>
              <div className="admin-form-row">
                <label>To</label>
                <input
                  type="date"
                  value={performanceFilters.dateTo}
                  onChange={(e) => setPerformanceFilters({ ...performanceFilters, dateTo: e.target.value })}
                />
              </div>
              <div className="admin-form-row admin-log-filters-clear">
                <label>&nbsp;</label>
                <button
                  type="button"
                  className="admin-log-clear-btn"
                  onClick={() => setPerformanceFilters(EMPTY_PERFORMANCE_FILTERS)}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="admin-report-table-wrap">
              <table className="admin-report-table">
                <thead>
                  <tr>
                    <th>Clinic</th>
                    <th>Views</th>
                    <th>Phone</th>
                    <th>Website</th>
                    <th>Appointment</th>
                    <th>Map</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.by_clinic || []).map((row) => (
                    <tr key={row.clinic_id}>
                      <td>{row.clinic_name}</td>
                      <td>{row.CLINIC_VIEWED || 0}</td>
                      <td>{row.PHONE_CLICKED || 0}</td>
                      <td>{row.WEBSITE_CLICKED || 0}</td>
                      <td>{row.APPOINTMENT_CLICKED || 0}</td>
                      <td>{row.MAP_CLICKED || 0}</td>
                      <td className="admin-report-total-cell">{row.total}</td>
                    </tr>
                  ))}
                  {(!report || report.by_clinic.length === 0) && (
                    <tr>
                      <td colSpan={7} className="admin-clinics-empty">
                        No clinic interactions match the current filters yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      )}

      {activeTab === 'log' && (
      <div className="admin-report-panel admin-log-panel">
        <div className="admin-panel-header">
          <h2>
            <FontAwesomeIcon icon={faListUl} /> Referral Event Log
          </h2>
          <div className="admin-log-panel-actions">
            <button
              className="admin-new-btn"
              onClick={applyLogFilters}
              disabled={!adminKey || logSummaryLoading || logLoading}
            >
              <FontAwesomeIcon
                icon={logSummaryLoading || logLoading ? faSyncAlt : faFilter}
                spin={logSummaryLoading || logLoading}
              />{' '}
              Apply Filters
            </button>
            <button className="admin-new-btn" onClick={handleExportCsv} disabled={!adminKey || exporting}>
              <FontAwesomeIcon icon={exporting ? faSyncAlt : faFileExport} spin={exporting} /> Export CSV
            </button>
          </div>
        </div>
        <p className="admin-report-subtext">
          Every recorded click/intent event — website visits, phone calls, and appointment
          requests — one row per event, plus summary totals for the current filters. Filterable by
          clinic and location (required); event type and date range narrow it further. The CSV
          export always matches whatever filters are applied here, not just what's on screen.
        </p>


        {adminKey && (
          <>
            <div className="admin-log-view-toggle" role="group" aria-label="Referral event log view">
              <button
                type="button"
                className={`admin-log-view-btn${logView === 'clinic' ? ' active' : ''}`}
                onClick={() => setLogView('clinic')}
              >
                Group by Clinic
              </button>
              <button
                type="button"
                className={`admin-log-view-btn${logView === 'date' ? ' active' : ''}`}
                onClick={() => setLogView('date')}
              >
                Order by Date
              </button>
            </div>

            {logSummary && (
              <div className="admin-report-stats">
                <div className="admin-stat-tile admin-stat-tile-highlight">
                  <span className="admin-stat-value">{logSummary.totals.total_events}</span>
                  <span className="admin-stat-label">Total Referral Events</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{logSummary.totals.WEBSITE_CLICKED || 0}</span>
                  <span className="admin-stat-label">Website Clicks</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{logSummary.totals.PHONE_CLICKED || 0}</span>
                  <span className="admin-stat-label">Call Clicks</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{logSummary.totals.APPOINTMENT_CLICKED || 0}</span>
                  <span className="admin-stat-label">Appointment Clicks</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{logSummary.totals.clinics_receiving_referrals}</span>
                  <span className="admin-stat-label">Clinics Receiving Referrals</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{logSummary.totals.referrals_today}</span>
                  <span className="admin-stat-label">Referrals Today</span>
                </div>
                <div className="admin-stat-tile">
                  <span className="admin-stat-value">{logSummary.totals.referrals_this_month}</span>
                  <span className="admin-stat-label">Referrals This Month</span>
                </div>
              </div>
            )}

            <div className="admin-log-filters">
              <div className="admin-form-row">
                <label>Clinic</label>
                <select
                  value={logFilters.clinicId}
                  onChange={(e) => setLogFilters({ ...logFilters, clinicId: e.target.value })}
                >
                  <option value="">All clinics</option>
                  {referredClinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-form-row">
                <label>Location (city)</label>
                <input
                  placeholder="e.g. Los Angeles"
                  value={logFilters.location}
                  onChange={(e) => setLogFilters({ ...logFilters, location: e.target.value })}
                />
              </div>
              <div className="admin-form-row">
                <label>Event Type</label>
                <select
                  value={logFilters.interactionType}
                  onChange={(e) => setLogFilters({ ...logFilters, interactionType: e.target.value })}
                >
                  {EVENT_TYPE_FILTER_OPTIONS.map(([value, label]) => (
                    <option key={value || 'all'} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-form-row">
                <label>From</label>
                <input
                  type="date"
                  value={logFilters.dateFrom}
                  onChange={(e) => setLogFilters({ ...logFilters, dateFrom: e.target.value })}
                />
              </div>
              <div className="admin-form-row">
                <label>To</label>
                <input
                  type="date"
                  value={logFilters.dateTo}
                  onChange={(e) => setLogFilters({ ...logFilters, dateTo: e.target.value })}
                />
              </div>
              <div className="admin-form-row admin-log-filters-clear">
                <label>&nbsp;</label>
                <button
                  type="button"
                  className="admin-log-clear-btn"
                  onClick={() => {
                    setLogFilters(EMPTY_LOG_FILTERS);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            {logView === 'clinic' ? (
              <div className="admin-log-grouped">
                {groupInteractionsByClinic(log?.interactions || []).map((group) => {
                  const isOpen = expandedClinicKeys.has(group.key);
                  return (
                    <div key={group.key} className="admin-log-clinic-group">
                      <button
                        type="button"
                        className="admin-log-clinic-group-header"
                        onClick={() => toggleClinicGroup(group.key)}
                        aria-expanded={isOpen}
                      >
                        <div className="admin-log-clinic-group-heading">
                          <span className="admin-log-clinic-group-name">{group.clinicName}</span>
                          {group.clinicLocation && (
                            <span className="admin-log-clinic-group-location">{group.clinicLocation}</span>
                          )}
                        </div>
                        <div className="admin-log-clinic-group-meta">
                          <span className="admin-log-clinic-group-total">
                            {group.total} event{group.total === 1 ? '' : 's'}
                          </span>
                          <FontAwesomeIcon
                            icon={faChevronDown}
                            className={`admin-log-chevron${isOpen ? ' open' : ''}`}
                          />
                        </div>
                      </button>

                      <div className="admin-log-clinic-group-breakdown">
                        {EVENT_TYPE_FILTER_OPTIONS.filter(([value]) => value && group.byType[value]).map(
                          ([value, label]) => (
                            <span key={value} className="admin-log-breakdown-pill">
                              {label}: {group.byType[value]}
                            </span>
                          )
                        )}
                      </div>

                      {isOpen && (
                        <div className="admin-report-table-wrap admin-log-clinic-group-table">
                          <table className="admin-report-table">
                            <thead>
                              <tr>
                                <th>Date/Time (UTC)</th>
                                <th>Event Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.events.map((row) => (
                                <tr key={row.id}>
                                  <td>{formatLogTimestamp(row.created_at)}</td>
                                  <td>{EVENT_TYPE_LABELS[row.interaction_type] || row.interaction_type}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!log || log.interactions.length === 0) && !logLoading && (
                  <p className="admin-clinics-empty">
                    No matching referral events yet. Try the referral flow on the website, or
                    adjust the filters above.
                  </p>
                )}
              </div>
            ) : (
              <div className="admin-report-table-wrap">
                <table className="admin-report-table">
                  <thead>
                    <tr>
                      <th>Date/Time (UTC)</th>
                      <th>Clinic</th>
                      <th>Location</th>
                      <th>Event Type</th>
                      <th>Match Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(log?.interactions || []).map((row) => (
                      <tr key={row.id}>
                        <td>{formatLogTimestamp(row.created_at)}</td>
                        <td>{row.clinic_name || '—'}</td>
                        <td>{row.clinic_city || row.search_location || '—'}</td>
                        <td>{EVENT_TYPE_LABELS[row.interaction_type] || row.interaction_type}</td>
                        <td>{MATCH_CONFIDENCE_LABELS[row.match_confidence] || row.match_confidence || '—'}</td>
                      </tr>
                    ))}
                    {(!log || log.interactions.length === 0) && !logLoading && (
                      <tr>
                        <td colSpan={5} className="admin-clinics-empty">
                          No matching referral events yet. Try the referral flow on the website, or
                          adjust the filters above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {log && (
              <div className="admin-log-panel-actions admin-log-more">
                <p className="admin-log-total">
                  Showing {log.interactions.length} of {log.total} matching event
                  {log.total === 1 ? '' : 's'}.
                  {logView === 'clinic' && log.interactions.length < log.total && (
                    <> The per-clinic counts above only include the events shown so far.</>
                  )}
                </p>
                {log.interactions.length < log.total && (
                  <button
                    type="button"
                    className="admin-new-btn"
                    disabled={logLoading || logLoadingMore}
                    onClick={loadMoreLog}
                  >
                    {logLoadingMore
                      ? 'Loading…'
                      : `Load ${Math.min(LOG_PAGE_SIZE, log.total - log.interactions.length)} more`}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

function AdminClinics() {
  return (
    <AdminShell title="Clinics" subtitle="Pin clinics to the top of search and see referral reports.">
      <AdminClinicsContent />
    </AdminShell>
  );
}

export default AdminClinics;
