import { useEffect, useState } from 'react';
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

  const [year, month, day] = dateString.split('-').map(Number);

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

  const normalized = slot.slice(0, 5);
  const [h, m] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
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
  no_show: {
    label: 'No Show',
    classes:
      'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ring-1 ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-gray-950 dark:text-white">
        {value || '—'}
      </p>
    </div>
  );
}

export default function BookingDetails() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [payments, setPayments] = useState([]);
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

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [user?.id, bookingId]);

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
        profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `
      )
      .eq('id', bookingId)
      .eq('customer_id', user.id)
      .single();

    if (error) {
      setBooking(null);
      setPayments([]);
      setFetchError(error.message || 'Booking not found.');
      setLoading(false);
      return;
    }

    setBooking(data);

    const bookingPayments = await fetchPaymentsFor({
      bookingIds: [bookingId],
    });

    setPayments(bookingPayments || []);

    const { data: ratingData } = await supabase
      .from('mechanic_ratings')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('customer_id', user.id)
      .maybeSingle();

    setAlreadyRated(Boolean(ratingData));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-4xl rounded-3xl border border-gray-200 bg-white p-8 text-center font-bold text-gray-500 shadow-sm dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
          Loading booking details...
        </div>
      </div>
    );
  }

  if (fetchError || !booking) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-500/30 dark:bg-dark-800">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-3 text-2xl font-black text-gray-950 dark:text-white">
            Booking not found
          </h1>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {fetchError || 'This booking may have been deleted or does not belong to your account.'}
          </p>
          <button
            onClick={() => navigate('/appointments')}
            className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700"
          >
            Back to Appointments
          </button>
        </div>
      </div>
    );
  }

  const serviceTotal =
    (Number(booking.services?.base_price) || 0) +
    (Number(booking.services?.labor_cost) || 0);

  const { totalPaid } = summarizePayments(payments);
  const balance = Math.max(serviceTotal - totalPaid, 0);

  const mechanicName = booking.profiles
    ? `${booking.profiles.first_name} ${booking.profiles.last_name}`
    : 'Any available mechanic';

  const canRate = booking.status === 'completed' && !alreadyRated;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              to="/appointments"
              className="text-sm font-black text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
            >
              ← Back to My Appointments
            </Link>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">
              Booking Details
            </h1>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
              Booking #{booking.id?.slice(0, 8).toUpperCase()}
            </p>
          </div>

          <StatusBadge status={booking.status} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Service Information
              </p>
              <h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                {booking.services?.name || 'Service'}
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DetailCard label="Date" value={formatDate(booking.booking_date)} />
              <DetailCard label="Time" value={formatSlot(booking.booking_time)} />
              <DetailCard label="Assigned Mechanic" value={mechanicName} />
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
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Customer Notes
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-700 dark:text-gray-300">
                  {booking.notes}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {booking.status === 'pending' && (
                <Link
                  to="/appointments"
                  className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-center text-sm font-black text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                >
                  Manage Reschedule / Cancel
                </Link>
              )}

              {canRate && (
                <button
                  onClick={() => setRatingBooking(booking)}
                  className="rounded-2xl border border-primary-200 bg-primary-50 px-5 py-3 text-sm font-black text-primary-700 transition hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                >
                  ★ Rate Mechanic
                </button>
              )}

              {booking.status === 'completed' && alreadyRated && (
                <span className="rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-center text-sm font-black text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                  ✓ Rating submitted
                </span>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Payment Summary
              </p>

              <div className="mt-5 space-y-3">
                <DetailCard label="Estimated Total" value={formatPeso(serviceTotal)} />
                <DetailCard label="Total Paid" value={formatPeso(totalPaid)} />
                <DetailCard label="Balance" value={formatPeso(balance)} />
                {booking.down_payment !== null && booking.down_payment !== undefined && (
                  <DetailCard label="Required Down Payment" value={formatPeso(booking.down_payment)} />
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Payment History
              </p>

              <div className="mt-5 space-y-3">
                {payments.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:bg-dark-900/70 dark:text-gray-400">
                    No payment records yet.
                  </p>
                ) : (
                  payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-gray-950 dark:text-white">
                          {formatPeso(payment.amount)}
                        </p>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
                          {payment.payment_type || 'payment'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {payment.method || 'cash'} • {formatDateTime(payment.created_at)}
                      </p>
                      {payment.notes && (
                        <p className="mt-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                          {payment.notes}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
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
  );
}