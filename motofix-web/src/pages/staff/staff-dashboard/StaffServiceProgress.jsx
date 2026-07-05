import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ServiceProgressManager from '../../../components/ServiceProgressManager';

import {
  Banner,
  Section,
  StatCard,
  formatDateTime,
  formatTime,
  getCustomerName,
} from './StaffDashboardShared';

const ACTIVE_PROGRESS_STATUSES = [
  'confirmed',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
];

// Completed bookings are intentionally excluded from this module.
const VISIBLE_SERVICE_STATUSES = [
  ...ACTIVE_PROGRESS_STATUSES,
  'ready_for_pickup',
];

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[^\w\s@.+#:/()-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function formatStatus(value) {
  return String(value || 'confirmed').replace(/_/g, ' ');
}

function formatDate(value) {
  if (!value) return '—';

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);

    return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getMechanicName(booking) {
  const mechanic = booking?.mechanic || {};
  const name = `${mechanic.first_name || ''} ${mechanic.last_name || ''}`.trim();

  return name || 'Unassigned';
}

function getBookingServicesSummary(booking) {
  if (booking?.services_summary) return booking.services_summary;

  const serviceRows = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (serviceRows.length > 0) {
    return serviceRows
      .map((item) => item.service_name || item.services?.name || item.name)
      .filter(Boolean)
      .join(', ');
  }

  return booking?.services?.name || 'Service';
}

function getStatusTone(status) {
  const normalized = normalizeStatus(status);

  if (normalized === 'completed') {
    return 'border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-900';
  }

  if (normalized === 'ready_for_pickup') {
    return 'border-green-200 bg-green-50 dark:border-green-500/25 dark:bg-green-500/10';
  }

  return 'border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-900';
}

function PaginationControls({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  totalRows,
  startIndex,
  endIndex,
}) {
  if (totalRows === 0) return null;

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
        Showing {startIndex + 1}–{Math.min(endIndex, totalRows)} of {totalRows}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-700 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} rows
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          First
        </button>

        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          Prev
        </button>

        <span className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 dark:bg-dark-900 dark:text-gray-300">
          {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          Next
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          Last
        </button>
      </div>
    </div>
  );
}

function StaffServiceProgress() {
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedBooking, setExpandedBooking] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchServiceBookings();

    const bookingsChannel = supabase
      .channel('staff-service-progress-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => fetchServiceBookings(false)
      )
      .subscribe();

    const bookingServicesChannel = supabase
      .channel('staff-service-progress-booking-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_services',
        },
        () => fetchServiceBookings(false)
      )
      .subscribe();

    const progressChannel = supabase
      .channel('staff-service-progress-events')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_progress_events',
        },
        () => fetchServiceBookings(false)
      )
      .subscribe();

    const handleFocus = () => fetchServiceBookings(false);

    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(bookingServicesChannel);
      supabase.removeChannel(progressChannel);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  async function fetchServiceBookings(showLoader = true) {
    if (showLoader) setLoading(true);

    setError('');

    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select(
        `
        *,
        services(name, base_price, labor_cost, estimated_duration_minutes),
        booking_services(
          id,
          service_id,
          service_name,
          base_price,
          labor_cost,
          estimated_duration_minutes,
          quantity,
          services(name, base_price, labor_cost, estimated_duration_minutes)
        ),
        profiles!bookings_customer_id_fkey(first_name, last_name, phone, email, profile_photo_url),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `
      )
      .not('customer_id', 'is', null)
      .or('is_walkin.is.null,is_walkin.eq.false')
      .in('status', VISIBLE_SERVICE_STATUSES)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (fetchError) {
      setError(fetchError.message || 'Failed to load service progress bookings.');
      setBookings([]);
    } else {
      setBookings(data || []);
      setLastUpdated(new Date());
    }

    setLoading(false);
  }

  function handleSearchChange(event) {
    setSearch(sanitizeSearch(event.target.value));
  }

  function goToPage(nextPage, totalPages) {
    setPage(Math.min(Math.max(1, nextPage), totalPages));
  }

  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return bookings;

    return bookings.filter((booking) => {
      const haystack = [
        booking.id,
        getCustomerName(booking),
        booking.profiles?.email,
        booking.profiles?.phone,
        getBookingServicesSummary(booking),
        normalizeStatus(booking.status),
        booking.booking_date,
        booking.booking_time,
        getMechanicName(booking),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [bookings, search]);

  const activeCount = bookings.filter((booking) =>
    ACTIVE_PROGRESS_STATUSES.includes(normalizeStatus(booking.status))
  ).length;

  const readyCount = bookings.filter(
    (booking) => normalizeStatus(booking.status) === 'ready_for_pickup'
  ).length;

  const doneServicesLabel = 'Hidden';

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedBookings = filteredBookings.slice(startIndex, endIndex);

  if (loading) {
    return (
      <Section>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Loading service progress...
            </p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <div>
      {error && <Banner message={`Error: ${error}`} />}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Services" value={activeCount} icon="🔧" tone="primary" />
        <StatCard label="Ready for Pickup" value={readyCount} icon="✅" tone="green" />
        <StatCard label="Completed" value={doneServicesLabel} icon="🏁" tone="blue" />
        <StatCard
          label="Last Updated"
          value={lastUpdated ? formatDateTime(lastUpdated) : '—'}
          icon="🕒"
          tone="accent"
        />
      </div>

      <Section>
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Service Progress
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Update only active scheduled bookings. Completed bookings are hidden automatically.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => fetchServiceBookings(false)}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
            >
              Refresh
            </button>

            <div className="relative w-full lg:w-96">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search customer, service, status, mechanic, or booking ID..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-10 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-sm font-black text-gray-400 transition hover:text-gray-900 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-dark-700 dark:bg-dark-900/70">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              🔧
            </div>
            <p className="text-sm font-black text-gray-950 dark:text-white">
              No scheduled service progress records found
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Confirmed and active registered bookings will appear here. Completed bookings are hidden automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-2xl bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:text-gray-400 dark:ring-dark-700">
              Showing {filteredBookings.length} active matching booking
              {filteredBookings.length === 1 ? '' : 's'}.
            </div>

            <div className="grid gap-3">
              {paginatedBookings.map((booking) => {
                const isOpen = expandedBooking === booking.id;
                const mechanicName = getMechanicName(booking);
                const status = normalizeStatus(booking.status);

                return (
                  <article
                    key={booking.id}
                    className={`overflow-hidden rounded-3xl border ${getStatusTone(status)}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedBooking(isOpen ? null : booking.id)}
                      className="w-full p-4 text-left transition hover:bg-white dark:hover:bg-dark-800"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-gray-950 dark:text-white">
                            {getCustomerName(booking)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {getBookingServicesSummary(booking)} · {formatTime(booking.booking_time)} ·{' '}
                            {formatStatus(status)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                            Mechanic: {mechanicName}
                          </p>
                          <p className="mt-1 text-[11px] font-mono font-bold text-gray-400">
                            #{booking.id?.slice(0, 8).toUpperCase()}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-xs font-black text-primary-600 dark:text-primary-400">
                            {formatDate(booking.booking_date)}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                            {isOpen ? 'Hide progress ▲' : 'Update progress ▼'}
                          </p>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-200 p-4 dark:border-dark-700">
                        <ServiceProgressManager
                          booking={booking}
                          onUpdated={() => fetchServiceBookings(false)}
                          compact
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <PaginationControls
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalRows={filteredBookings.length}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={(nextPage) => goToPage(nextPage, totalPages)}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Section>
    </div>
  );
}

export default StaffServiceProgress;
