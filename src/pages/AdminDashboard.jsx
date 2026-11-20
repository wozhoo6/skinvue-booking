import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell, { useAdmin } from '../components/admin/AdminShell';
import { Icon } from '../components/Icons';
import { isAdminKeyError } from '../lib/supabase';
import { countAdminPlaces } from '../lib/bookingApi';
import { useBookingRequests } from '../hooks/useBookingRequests';
import { ErrorNote, RequestsTable, ClinicSheet } from './AdminRequests';

/** Number of places in the clinic directory, or null while loading / on error. */
function useClinicCount() {
  const { adminKey, signOut } = useAdmin();
  const [count, setCount] = useState(null);
  useEffect(() => {
    let cancelled = false;
    countAdminPlaces(adminKey)
      .then((n) => !cancelled && setCount(n))
      .catch((err) => {
        if (cancelled) return;
        if (isAdminKeyError(err)) signOut();
        else setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [adminKey, signOut]);
  return count;
}

function DashboardContent() {
  // Latest five requests; counts and total cover every request.
  const { requests, total, counts, loading, error, changeStatus } = useBookingRequests({ pageSize: 5 });
  const clinicCount = useClinicCount();
  const [clinicFor, setClinicFor] = useState(null);

  const stats = [
    { label: 'New Requests', value: counts.new ?? 0, tone: 'is-accent' },
    { label: 'Contacting Clinic', value: counts.contacting_clinic ?? 0 },
    { label: 'Booked', value: counts.booked ?? 0 },
    { label: 'Total Requests', value: total },
  ];

  return (
    <>
      <ErrorNote message={error} />

      <section className="ad-stats" aria-label="Request totals">
        {stats.map((s) => (
          <div key={s.label} className={`ad-stat ${s.tone || ''}`}>
            <span className="ad-stat-value">{s.value}</span>
            <span className="ad-stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      <section className="ad-card ad-table-card">
        <div className="ad-card-head ad-card-head-pad">
          <h2>Latest Requests</h2>
          <Link to="/admin/requests" className="ad-text-link">
            View All <Icon name="arrow-right" size={16} />
          </Link>
        </div>
        <RequestsTable
          requests={requests}
          emptyText={loading ? 'Loading requests...' : 'No requests yet.'}
          onClinicClick={setClinicFor}
          onStatusChange={changeStatus}
        />
      </section>

      <section className="ad-links">
        <Link to="/admin/requests" className="ad-link-card is-dark">
          <span className="ad-link-icon"><Icon name="calendar" size={24} /></span>
          <span className="ad-link-text">
            <b>Appointment Requests</b>
            <span>Everyone who filled in the Book Appointment form. Filter, search and update status.</span>
          </span>
          <Icon name="arrow-right" size={22} />
        </Link>
        <Link to="/admin/clinics" className="ad-link-card">
          <span className="ad-link-icon"><Icon name="pin" size={24} /></span>
          <span className="ad-link-text">
            <b>Clinics</b>
            <span>
              {clinicCount != null
                ? `${clinicCount.toLocaleString('en-US')} ${clinicCount === 1 ? 'clinic' : 'clinics'} in the directory. `
                : ''}
              Pin clinics to the top of search and see referral reports.
            </span>
          </span>
          <Icon name="arrow-right" size={22} />
        </Link>
      </section>

      {clinicFor && <ClinicSheet request={clinicFor} onClose={() => setClinicFor(null)} />}
    </>
  );
}

function AdminDashboard() {
  return (
    <AdminShell title="Admin Dashboard" subtitle="Appointment requests and the clinic directory at a glance.">
      <DashboardContent />
    </AdminShell>
  );
}

export default AdminDashboard;
