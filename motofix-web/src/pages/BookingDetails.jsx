import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../lib/payments';
import RatingModal from '../components/RatingModal';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateString) {
  if (!dateString) return '—';

  const [year, month, day] = String(dateString).split('-').map(Number);

  if (!year || !month || !day) return dateString;

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSlot(slot) {
  if (!slot) return '—';

  const normalized = String(slot).slice(0, 5);
  const [h, m] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function getStatusLabel(status) {
  return String(status || 'pending')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  },
  confirmed: {
    label: 'Confirmed',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
  in_progress: {
    label: 'In Progress',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  inspection: {
    label: 'Inspection',
    classes:
      'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25',
  },
  repairing: {
    label: 'Repairing',
    classes:
      'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  },
  quality_check: {
    label: 'Quality Check',
    classes:
      'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/25',
  },
  ready_for_pickup: {
    label: 'Ready for Pickup',
    classes:
      'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
  },
  completed: {
    label: 'Completed',
    classes:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  },
  cancelled: {
    label: 'Cancelled',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  },
  rejected: {
    label: 'Rejected',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  },
  no_show: {
    label: 'No Show',
    classes:
      'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
  },
};

const DEFAULT_PROGRESS_BY_STATUS = {
  pending: 10,
  confirmed: 25,
  in_progress: 40,
  inspection: 50,
  repairing: 70,
  quality_check: 85,
  ready_for_pickup: 95,
  completed: 100,
  cancelled: 0,
  rejected: 0,
  no_show: 0,
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || {
    label: getStatusLabel(status),
    classes:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ring-1 ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm font-black text-gray-950 dark:text-white">
        {value || '—'}
      </p>
    </div>
  );
}

function SectionCard({ children, className = '' }) {
  return (
    <section
      className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800 ${className}`}
    >
      {children}
    </section>
  );
}

function getTimelineIcon(status) {
  const icons = {
    pending: '📝',
    confirmed: '✅',
    in_progress: '🔧',
    inspection: '🔍',
    repairing: '🛠️',
    quality_check: '☑️',
    ready_for_pickup: '🏁',
    completed: '🎉',
    cancelled: '✕',
    rejected: '⚠️',
    no_show: '🚫',
    note: '💬',
  };

  return icons[status] || '•';
}

function ServiceProgressTimeline({ events = [], bookingStatus }) {
  const latestEvent = events[events.length - 1];
  const currentProgress =
    Number(latestEvent?.progress_percent) ||
    DEFAULT_PROGRESS_BY_STATUS[bookingStatus] ||
    0;

  return (
    <SectionCard>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
            Service Progress Timeline
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Track the real-time progress of your motorcycle service.
          </p>
        </div>

        <div className="rounded-2xl bg-primary-50 px-4 py-2 text-center ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/25">
          <p className="text-[11px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
            Progress
          </p>
          <p className="text-lg font-black text-primary-700 dark:text-primary-300">
            {Math.max(0, Math.min(100, currentProgress))}%
          </p>
        </div>
      </div>

      <div className="mb-6 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-900">
        <div
          className="h-full rounded-full bg-primary-600 transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, currentProgress))}%` }}
        />
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-900/70">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/25">
            🕒
          </div>
          <p className="text-sm font-black text-gray-900 dark:text-white">
            No timeline updates yet
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Progress updates will appear here when the shop updates your booking status.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event, index) => {
            const isLast = index === events.length - 1;

            return (
              <div key={event.id || `${event.status}-${index}`} className="relative flex gap-4">
                {!isLast && (
                  <div className="absolute left-[22px] top-11 h-[calc(100%-18px)] w-0.5 bg-gray-200 dark:bg-dark-700" />
                )}

                <div
                  className={`relative z-10 grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl text-lg ring-1 ${
                    isLast
                      ? 'bg-primary-600 text-white ring-primary-600'
                      : 'bg-gray-50 text-gray-600 ring-gray-200 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700'
                  }`}
                >
                  {getTimelineIcon(event.status)}
                </div>

                <div
                  className={`min-w-0 flex-1 rounded-2xl border p-4 ${
                    isLast
                      ? 'border-primary-200 bg-primary-50 dark:border-primary-500/25 dark:bg-primary-500/10'
                      : 'border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-900/60'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-950 dark:text-white">
                        {event.title || getStatusLabel(event.status)}
                      </p>
                      {event.description && (
                        <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                          {event.description}
                        </p>
                      )}
                    </div>

                    <StatusBadge status={event.status} />
                  </div>

                  {event.photo_url && (
                    <a
                      href={event.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 block overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800"
                    >
                      <img
                        src={event.photo_url}
                        alt={event.title || 'Service progress'}
                        className="max-h-64 w-full object-cover"
                      />
                    </a>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>{formatDateTime(event.created_at)}</span>
                    <span>•</span>
                    <span>{Number(event.progress_percent) || 0}% complete</span>
                    {event.event_type && (
                      <>
                        <span>•</span>
                        <span className="capitalize">
                          {String(event.event_type).replace(/_/g, ' ')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export default function BookingDetails() {
  const params = useParams();
  const bookingId = params.bookingId || params.id;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [payments, setPayments] = useState([]);
  const [progressEvents, setProgressEvents] = useState([]);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [ratingBooking, setRatingBooking] = useState(null);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!user?.id || !bookingId) return;

    fetchBookingDetails();

    const bookingsChannel = supabase
      .channel(`booking-details-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        () => fetchBookingDetails(false)
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel(`booking-payments-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => fetchBookingDetails(false)
      )
      .subscribe();

    const progressChannel = supabase
      .channel(`service-progress-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_progress_events',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => fetchProgressEvents()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(progressChannel);
    };
  }, [user?.id, bookingId]);

  async function fetchProgressEvents() {
    if (!bookingId) return;

    const { data, error } = await supabase
      .from('service_progress_events')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Service progress timeline unavailable:', error.message);
      setProgressEvents([]);
      return;
    }

    setProgressEvents(data || []);
  }

  async function fetchBookingDetails(showLoader = true) {
    if (!user?.id || !bookingId) return;

    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('bookings')
      .select(
        `
        *,
        services(name, base_price, labor_cost, estimated_duration_minutes),
        profiles!bookings_mechanic_id_fkey(first_name, last_name, role, profile_photo_url)
      `
      )
      .eq('id', bookingId)
      .eq('customer_id', user.id)
      .single();

    if (error) {
      setBooking(null);
      setPayments([]);
      setProgressEvents([]);
      setFetchError(error.message || 'Booking not found.');
      setLoading(false);
      return;
    }

    setBooking(data);

    try {
      const bookingPayments = await fetchPaymentsFor({
        bookingIds: [bookingId],
      });

      setPayments(bookingPayments || []);
    } catch (paymentError) {
      console.warn('Failed to load booking payments:', paymentError);
      setPayments([]);
    }

    try {
      await fetchProgressEvents();
    } catch (progressError) {
      console.warn('Failed to load progress events:', progressError);
    }

    const { data: ratingData } = await supabase
      .from('mechanic_ratings')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('customer_id', user.id)
      .maybeSingle();

    setAlreadyRated(Boolean(ratingData));
    setLoading(false);
  }

  const serviceTotal = useMemo(() => {
    if (!booking) return 0;

    const savedTotal = Number(booking.total_amount);
    if (Number.isFinite(savedTotal) && savedTotal > 0) return savedTotal;

    return (
      (Number(booking.services?.base_price) || 0) +
      (Number(booking.services?.labor_cost) || 0)
    );
  }, [booking]);

  const paymentSummary = summarizePayments(payments || []) || {};
  const totalPaid = Number(paymentSummary.totalPaid) || 0;
  const balance = Math.max(serviceTotal - totalPaid, 0);

  const mechanicName = booking?.profiles
    ? `${booking.profiles.first_name || ''} ${booking.profiles.last_name || ''}`.trim()
    : 'Any available mechanic';

  const canRate = booking?.status === 'completed' && !alreadyRated;

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-6 py-10 text-gray-900 dark:bg-dark-900 dark:text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Loading booking details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (fetchError || !booking) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-6 py-10 text-gray-900 dark:bg-dark-900 dark:text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-red-50 text-4xl ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20">
              ⚠️
            </div>
            <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
              Booking not found
            </h1>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
              {fetchError ||
                'This booking may have been deleted or does not belong to your account.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/appointments')}
              className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700"
            >
              Back to Appointments
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            to="/appointments"
            className="inline-flex items-center gap-2 text-sm font-black text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
          >
            ← Back to My Appointments
          </Link>
        </div>

        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Appointment
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Booking Details
                </h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Booking #{booking.id?.slice(0, 8).toUpperCase()}
                </p>
              </div>

              <StatusBadge status={booking.status} />
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <main className="space-y-6">
            <ServiceProgressTimeline
              events={progressEvents}
              bookingStatus={booking.status}
            />

            <SectionCard>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                    Service Information
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                    {booking.services?.name || 'Service'}
                  </h2>
                </div>

                <StatusBadge status={booking.status} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailCard label="Date" value={formatDate(booking.booking_date)} />
                <DetailCard label="Time" value={formatSlot(booking.booking_time)} />
                <DetailCard label="Mechanic" value={mechanicName || 'Any available mechanic'} />
                <DetailCard
                  label="Duration"
                  value={
                    booking.services?.estimated_duration_minutes
                      ? `${booking.services.estimated_duration_minutes} minutes`
                      : '—'
                  }
                />
              </div>

              {booking.notes && (
                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Customer Notes
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                    {booking.notes}
                  </p>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                {booking.status === 'pending' && (
                  <Link
                    to={`/appointments/${booking.id}/manage`}
                    className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
                  >
                    Manage Reschedule / Cancel
                  </Link>
                )}

                {canRate && (
                  <button
                    type="button"
                    onClick={() => setRatingBooking(booking)}
                    className="rounded-2xl border border-primary-200 bg-primary-50 px-5 py-3 text-sm font-black text-primary-700 transition hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                  >
                    ★ Rate Mechanic
                  </button>
                )}

                {booking.status === 'completed' && alreadyRated && (
                  <span className="rounded-2xl bg-green-50 px-5 py-3 text-sm font-black text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25">
                    ✓ Rating submitted
                  </span>
                )}
              </div>
            </SectionCard>

            <SectionCard>
              <p className="mb-5 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                Payment History
              </p>

              {payments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-900/70 dark:text-gray-400">
                  No payment records yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-gray-950 dark:text-white">
                            {formatPeso(payment.amount)}
                          </p>
                          <p className="mt-1 text-xs capitalize text-gray-500 dark:text-gray-400">
                            {payment.payment_type || 'payment'}
                          </p>
                        </div>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
                          {payment.method || 'cash'}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(payment.created_at)}
                      </p>

                      {payment.notes && (
                        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                          {payment.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </main>

          <aside className="space-y-6">
            <SectionCard className="sticky top-24">
              <p className="mb-5 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                Payment Summary
              </p>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Service total</span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {formatPeso(serviceTotal)}
                  </span>
                </div>

                {booking.down_payment !== null &&
                  booking.down_payment !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Required down payment
                      </span>
                      <span className="font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(booking.down_payment)}
                      </span>
                    </div>
                  )}

                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total paid</span>
                  <span className="font-black text-green-600 dark:text-green-400">
                    {formatPeso(totalPaid)}
                  </span>
                </div>

                <div className="flex justify-between rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <span className="font-black text-gray-950 dark:text-white">
                    Balance
                  </span>
                  <span
                    className={`font-black ${
                      balance <= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatPeso(balance)}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-primary-100 bg-primary-50 p-4 text-xs leading-5 text-primary-700 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-300">
                Service progress updates are synced automatically when MotoFix updates your booking status.
              </div>
            </SectionCard>
          </aside>
        </div>

        {ratingBooking && (
          <RatingModal
            booking={ratingBooking}
            onClose={() => setRatingBooking(null)}
            onSubmitted={() => {
              setAlreadyRated(true);
              setRatingBooking(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
