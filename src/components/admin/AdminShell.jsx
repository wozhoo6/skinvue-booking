import React, { createContext, useCallback, useContext, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { isAdminKeyError } from '../../lib/supabase';
import { adminCheck } from '../../lib/bookingApi';
import { Icon, LogoMark } from '../Icons';
import './admin.css';

const ADMIN_KEY_STORAGE = 'wss_admin_key';

const AdminContext = createContext(null);

/** { adminKey, signOut } for pages inside <AdminShell>. Pass adminKey as p_admin_key to the admin RPCs. */
export function useAdmin() {
  return useContext(AdminContext);
}

function readStoredKey() {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

// Shared admin formatting helpers -------------------------------------------

// Request statuses, in the order a referral moves through them (matches the
// presentation's tracking slide).
export const REQUEST_STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'contacting_clinic', label: 'Contacting Clinic' },
  { key: 'booked', label: 'Booked' },
  { key: 'attended', label: 'Attended' },
  { key: 'no_show', label: 'No Show' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'closed', label: 'Closed' },
];

export const STATUS_LABELS = Object.fromEntries(REQUEST_STATUSES.map((s) => [s.key, s.label]));

/** Colour-coded status dropdown (the colour follows the chosen status). */
export function StatusSelect({ value, onChange, label = 'Status' }) {
  return (
    <span className={`ad-status-select is-${value}`}>
      <select
        value={value}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
      >
        {REQUEST_STATUSES.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>
    </span>
  );
}

/** '2026-11-12T14:30' (patient-local, no zone) → 'Thu, Nov 12 · 2:30 PM' */
export function formatSlot(slot) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(slot || '');
  if (!match) return slot || '';
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d);
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const hour = ((h + 11) % 12) + 1;
  return `${day} · ${hour}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * A request window: '2026-11-12T14:30' + '2026-11-12T16:00' → 'Thu, Nov 12 · 2:30 PM – 4:00 PM'.
 * Requests made before end times existed have no `to`, so only the start shows.
 */
export function formatWindow(from, to) {
  const start = formatSlot(from);
  const endMatch = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})$/.exec(to || '');
  if (!endMatch) return start;
  const h = Number(endMatch[1]);
  return `${start} – ${((h + 11) % 12) + 1}:${endMatch[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** ISO timestamp → 'Nov 6, 2026, 9:41 AM' in the viewer's time zone. */
export function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Admin key gate ------------------------------------------------------------

function AdminKeyGate({ onUnlock }) {
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setChecking(true);
    setError(null);
    try {
      // admin_check raises errcode 28000 unless the key matches the one set
      // in the database (private.set_admin_key).
      await adminCheck(trimmed);
      onUnlock(trimmed);
    } catch (err) {
      if (isAdminKeyError(err)) setError('That admin key isn’t valid.');
      else if (err?.name === 'RpcError') setError(err.message);
      else setError('Couldn’t reach the server.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="ad-gate">
      <form className="ad-gate-card" onSubmit={handleSubmit}>
        <span className="ad-gate-logo"><LogoMark /></span>
        <h1>Admin Dashboard</h1>
        <p>Enter your admin API key to continue.</p>

        <label className="ad-field">
          <span>Admin API Key</span>
          <div className="ad-input-icon">
            <Icon name="key" size={18} />
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your key"
              aria-invalid={Boolean(error)}
            />
          </div>
        </label>

        {error && (
          <p className="ad-alert" role="alert">
            <Icon name="alert" size={18} /> <span>{error}</span>
          </p>
        )}

        <button type="submit" className="ad-btn primary block" disabled={!key.trim() || checking}>
          {checking ? 'Checking...' : 'Continue'}
        </button>
        <Link to="/" className="ad-gate-back">Back to skinvue</Link>
      </form>
    </div>
  );
}

// Layout ----------------------------------------------------------------------

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/admin/requests', label: 'Requests', icon: 'calendar' },
  { to: '/admin/clinics', label: 'Clinics', icon: 'pin' },
];

/**
 * Every /admin page renders inside this. Nothing on the page (not even the
 * nav) shows until a valid admin key is entered; the key is kept for this
 * browser tab only (sessionStorage) and checked by the server on every call.
 */
function AdminShell({ title, subtitle, actions, children }) {
  const [adminKey, setAdminKey] = useState(readStoredKey);

  const unlock = (key) => {
    try {
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    } catch {
      // private mode: the key just won't survive a reload
    }
    setAdminKey(key);
  };

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    } catch {
      // ignore
    }
    setAdminKey('');
  }, []);

  if (!adminKey) return <AdminKeyGate onUnlock={unlock} />;

  const value = { adminKey, signOut };

  return (
    <AdminContext.Provider value={value}>
      <div className="ad-shell">
        <header className="ad-topbar">
          <div className="ad-topbar-inner">
            <Link to="/admin" className="ad-brand">
              <LogoMark />
              <span>skinvue <em>Admin</em></span>
            </Link>
            <nav className="ad-nav" aria-label="Admin">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `ad-nav-link${isActive ? ' is-active' : ''}`}
                >
                  <Icon name={item.icon} size={18} /> {item.label}
                </NavLink>
              ))}
            </nav>
            <button type="button" className="ad-signout" onClick={signOut}>
              Sign Out
            </button>
          </div>
        </header>

        <main className="ad-main">
          {(title || actions) && (
            <div className="ad-page-head">
              <div>
                {title && <h1 className="ad-page-title">{title}</h1>}
                {subtitle && <p className="ad-page-subtitle">{subtitle}</p>}
              </div>
              {actions && <div className="ad-page-actions">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}

export default AdminShell;
