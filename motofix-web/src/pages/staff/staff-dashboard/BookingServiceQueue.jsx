// Place this file at:
// motofix-web/src/pages/staff/staff-dashboard/BookingServiceQueue.jsx

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { confirmAction } from '../../../components/ConfirmModal';

import {
  Banner,
  Section,
  StatCard,
  CustomerAvatar,
  ModulePaymentBadge,
  formatPeso,
  formatDateTime,
  formatTime,
  getCustomerName,
  calculateBookingTotal,
  getReservationFee,
  bookingRequiresReservationPayment,
  isReservationPaid,
} from './StaffDashboardShared';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const QUEUE_ACTIVE_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
  'ready_for_pickup',
];

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function formatStatus(value) {
  return String(value || 'pending')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9ñÑ@._+\-#:/\s]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function safeDisplay(value, fallback = '—') {
  const text = String(value || '').trim();
  return text || fallback;
}

function getMechanicName(booking) {
  const name = `${booking?.mechanic?.first_name || ''} ${booking?.mechanic?.last_name || ''}`.trim();
  return name || 'Any';
}

function getBookingServicesSummary(booking) {
  if (booking?.services_summary) return booking.services_summary;

  const selectedServices = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (selectedServices.length > 0) {
    return selectedServices
      .map((item) => item.service_name || item.name || item.services?.name)
      .filter(Boolean)
      .join(', ');
  }

  return booking?.services?.name || 'Service';
}

function getServiceCount(booking) {
  const selectedServices = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (selectedServices.length > 0) {
    return selectedServices.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  }

  return booking?.services?.name || booking?.services_summary ? 1 : 0;
}

async function insertQueueProgressEvent(booking) {
  if (!booking?.id || !booking?.customer_id) return;

  const payload = {
    booking_id: booking.id,
    customer_id: booking.customer_id,
    mechanic_id: booking.mechanic_id || null,
    service_id: booking.service_id || null,
    status: 'confirmed',
    title: 'Booking Confirmed',
    description: 'Booking was confirmed from the staff booking service queue.',
    progress_percent: 25,
    event_type: 'status_update',
  };

  const { error } = await supabase.from('service_progress_events').insert(payload);

  if (!error) return;

  await supabase.from('service_progress_events').insert({
    booking_id: booking.id,
    customer_id: booking.customer_id,
    status: 'confirmed',
    title: 'Booking Confirmed',
    description: 'Booking was confirmed from the staff booking service queue.',
    progress_percent: 25,
  });
}

export default function BookingServiceQueue() {
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchQueue();

    const channel = supabase
      .channel('staff-booking-service-queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => fetchQueue(false)
      )
      .subscribe();

    const servicesChannel = supabase
      .channel('staff-booking-service-queue-services')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_services' },
        () => fetchQueue(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(servicesChannel);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, bookings.length]);

  async function fetchQueue(showLoader = true) {
    if (showLoader) setLoading(true);
    if (!showLoader) setRefreshing(true);

    setError('');

    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select(
        `
        *,
        services(name, base_price, labor_cost, estimated_duration_minutes),
        booking_services(id, service_id, service_name, base_price, labor_cost, estimated_duration_minutes, quantity),
        profiles!bookings_customer_id_fkey(first_name, last_name, phone, email, profile_photo_url),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `
      )
      .or('is_walkin.is.null,is_walkin.eq.false')
      .in('status', QUEUE_ACTIVE_STATUSES)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (fetchError) {
      setError(fetchError.message || 'Failed to load booking queue.');
      setBookings([]);
    } else {
      setBookings(data || []);
      setLastUpdated(new Date());
    }

    setLoading(false);
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    const query = sanitizeSearch(search).trim().toLowerCase();

    if (!query) return bookings;

    return bookings.filter((booking) => {
      const haystack = [
        booking.id,
        getCustomerName(booking),
        booking.profiles?.phone,
        booking.profiles?.email,
        getBookingServicesSummary(booking),
        getMechanicName(booking),
        booking.status,
        booking.payment_status,
        booking.booking_date,
        booking.booking_time,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [bookings, search]);

  const pendingConfirmationCount = bookings.filter(
    (booking) => normalizeStatus(booking.status) === 'pending'
  ).length;

  const paidPendingCount = bookings.filter((booking) => {
    const status = normalizeStatus(booking.status);
    return status === 'pending' && isReservationPaid(booking);
  }).length;

  const confirmedCount = bookings.filter(
    (booking) => normalizeStatus(booking.status) === 'confirmed'
  ).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const paginatedBookings = filtered.slice(startIndex, endIndex);

  function goToPage(nextPage) {
    setPage(Math.min(Math.max(1, nextPage), totalPages));
  }

  function handleSearchChange(event) {
    setSearch(sanitizeSearch(event.target.value));
  }

  function canConfirmBooking(booking) {
    const status = normalizeStatus(booking.status);

    if (status !== 'pending') return false;

    if (!bookingRequiresReservationPayment(booking)) return true;

    return isReservationPaid(booking);
  }

  async function confirmBooking(booking) {
    if (!booking?.id || confirmingId) return;

    if (!canConfirmBooking(booking)) {
      setError('This booking cannot be confirmed until the reservation payment is paid or verified.');
      return;
    }

    const total = calculateBookingTotal(booking);
    const services = getBookingServicesSummary(booking);
    const confirmed = await confirmAction(
      `Confirm this scheduled booking?\n\nCustomer: ${getCustomerName(booking)}\nService(s): ${services}\nSchedule: ${safeDisplay(booking.booking_date)} ${formatTime(booking.booking_time)}\nTotal: ${formatPeso(total)}\n\nThis will move the booking to confirmed/service progress.`
    );

    if (!confirmed) return;

    setError('');
    setConfirmingId(booking.id);

    try {
      const now = new Date().toISOString();
      const { data: authData } = await supabase.auth.getUser();
      const staffId = authData?.user?.id || null;

      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          updated_at: now,
        })
        .eq('id', booking.id);

      if (updateError) throw updateError;

      await insertQueueProgressEvent(booking);

      await supabase.from('audit_logs').insert({
        action: 'CONFIRM_BOOKING_FROM_STAFF_QUEUE',
        entity: 'bookings',
        entity_id: booking.id,
        performed_by: staffId,
        details: {
          customer_name: getCustomerName(booking),
          service_name: services,
          service_count: getServiceCount(booking),
          booking_date: booking.booking_date || null,
          booking_time: booking.booking_time || null,
          payment_status: booking.payment_status || null,
          total_amount: total,
          confirmed_at: now,
        },
      });

      await fetchQueue(false);
    } catch (err) {
      setError(err.message || 'Failed to confirm booking.');
    } finally {
      setConfirmingId(null);
    }
  }

  if (loading) {
    return (
      <Section>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Loading booking queue...
            </p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <div>
      {error && <Banner message={`Error: ${error}`} />}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Scheduled Bookings" value={bookings.length} icon="📅" tone="primary" />
        <StatCard label="Pending Confirmation" value={pendingConfirmationCount} icon="🔔" tone="yellow" />
        <StatCard label="Paid Pending" value={paidPendingCount} icon="✅" tone="green" />
        <StatCard label="Confirmed" value={confirmedCount} icon="📋" tone="accent" />
      </div>

      <Section>
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                Booking Service Queue
              </p>

              {pendingConfirmationCount > 0 && (
                <span className="rounded-full bg-yellow-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                  {pendingConfirmationCount} pending
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Scheduled customer appointments only. Mobile bookings may also appear in Payment Verification until payment is settled.
            </p>
            {lastUpdated && (
              <p className="mt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                Last updated: {formatDateTime(lastUpdated)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full lg:w-96">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search customer, status, service, mechanic, or booking ID..."
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

            <button
              type="button"
              onClick={() => fetchQueue(false)}
              disabled={refreshing}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:text-gray-300"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-dark-700 dark:bg-dark-900/70">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              📅
            </div>
            <p className="text-sm font-black text-gray-950 dark:text-white">
              No scheduled bookings in queue
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Pending mobile bookings, unpaid reservations, and confirmed customer appointments will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Showing {startIndex + 1}–{endIndex} of {filtered.length} booking(s)
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} rows
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => goToPage(1)}
                  disabled={safePage === 1}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  First
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage === 1}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  Prev
                </button>

                <span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-gray-700 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
                  {safePage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage === totalPages}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(totalPages)}
                  disabled={safePage === totalPages}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  Last
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {paginatedBookings.map((booking) => {
                const status = normalizeStatus(booking.status);
                const canConfirm = canConfirmBooking(booking);
                const needsPayment =
                  status === 'pending' &&
                  bookingRequiresReservationPayment(booking) &&
                  !isReservationPaid(booking);
                const isPending = status === 'pending';
                const servicesSummary = getBookingServicesSummary(booking);
                const reservationFee = getReservationFee(booking);

                return (
                  <article
                    key={booking.id}
                    className={`rounded-3xl border p-4 ${
                      isPending
                        ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-500/25 dark:bg-yellow-500/10'
                        : 'border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-900'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <CustomerAvatar profile={booking.profiles} />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-gray-950 dark:text-white">
                          {getCustomerName(booking)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {servicesSummary} · {safeDisplay(booking.booking_date)} · {formatTime(booking.booking_time)}
                        </p>
                        <p className="mt-1 text-[11px] font-mono font-bold text-gray-400">
                          #{booking.id?.slice(0, 8).toUpperCase()}
                        </p>
                      </div>

                      <ModulePaymentBadge status={booking.payment_status} />
                    </div>

                    <div className="mt-4 grid gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white p-3 dark:bg-dark-800">
                        <p className="text-[10px] font-black uppercase text-gray-400">Status</p>
                        <p className="mt-1 font-black">{formatStatus(booking.status)}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3 dark:bg-dark-800">
                        <p className="text-[10px] font-black uppercase text-gray-400">Total</p>
                        <p className="mt-1 font-black text-accent-600 dark:text-accent-400">
                          {formatPeso(calculateBookingTotal(booking))}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-3 dark:bg-dark-800">
                        <p className="text-[10px] font-black uppercase text-gray-400">Mechanic</p>
                        <p className="mt-1 font-black">{getMechanicName(booking)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {canConfirm ? (
                          <span className="text-green-700 dark:text-green-300">
                            Ready to confirm. Reservation payment is settled.
                          </span>
                        ) : needsPayment ? (
                          <span className="text-yellow-700 dark:text-yellow-300">
                            Waiting for reservation payment verification. Fee: {formatPeso(reservationFee)}
                          </span>
                        ) : status === 'confirmed' ? (
                          <span className="text-green-700 dark:text-green-300">
                            Already confirmed. This will appear in Service Progress.
                          </span>
                        ) : (
                          <span>Current status: {formatStatus(booking.status)}</span>
                        )}
                      </div>

                      {isPending && (
                        <button
                          type="button"
                          onClick={() => confirmBooking(booking)}
                          disabled={!canConfirm || confirmingId === booking.id}
                          className="rounded-2xl bg-green-600 px-4 py-3 text-xs font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-dark-700 dark:disabled:text-gray-400"
                        >
                          {confirmingId === booking.id ? 'Confirming...' : 'Confirm Booking'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
