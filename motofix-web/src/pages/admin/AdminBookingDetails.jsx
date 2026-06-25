import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  const parts = String(value).split('-');

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);

    return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return new Date(value).toLocaleDateString('en-PH', {
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

function formatTime(time) {
  if (!time) return '—';

  const normalized = String(time).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function getCustomerName(booking) {
  const name = `${booking.profiles?.first_name || ''} ${
    booking.profiles?.last_name || ''
  }`.trim();

  return name || 'Unknown Customer';
}

function getMechanicName(booking) {
  const name = `${booking.mechanic?.first_name || ''} ${
    booking.mechanic?.last_name || ''
  }`.trim();

  return name || 'Unassigned';
}

function getServiceTotal(booking) {
  return (
    (Number(booking.services?.base_price) || 0) +
    (Number(booking.services?.labor_cost) || 0)
  );
}

const STATUS_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  in_progress:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  no_show:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${
        STATUS_STYLES[status] || STATUS_STYLES.pending
      }`}
    >
      {String(status || 'pending').replace('_', ' ')}
    </span>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-bold text-gray-950 dark:text-white">
        {value || '—'}
      </p>
    </div>
  );
}

export default function AdminBookingDetails() {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!bookingId) return;

    fetchBookingDetails();

    const bookingsChannel = supabase
      .channel(`admin-booking-details-${bookingId}`)
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
      .channel(`admin-booking-payments-${bookingId}`)
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
  }, [bookingId]);

  async function fetchBookingDetails(showLoader = true) {
    if (showLoader) setLoading(true);
    setFetchError('');

    const { data, error } = await supabase
      .from('bookings')
      .select(
        `
        *,
        services(name, base_price, labor_cost, estimated_duration_minutes),
        profiles!bookings_customer_id_fkey(first_name, last_name, email, phone),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `
      )
      .eq('id', bookingId)
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
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-5xl rounded-3xl border border-gray-200 bg-white p-8 text-center font-bold text-gray-500 shadow-sm dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
          Loading booking details...
        </div>
      </div>
    );
  }

  if (fetchError || !booking) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-5xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-500/30 dark:bg-dark-800">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-3 text-2xl font-black text-gray-950 dark:text-white">
            Booking not found
          </h1>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {fetchError || 'This booking may have been deleted.'}
          </p>
          <button
            onClick={() => navigate('/admin/bookings')}
            className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700"
          >
            Back to Admin Bookings
          </button>
        </div>
      </div>
    );
  }

  const total = getServiceTotal(booking);
  const { totalPaid } = summarizePayments(payments);
  const balance = Math.max(total - totalPaid, 0);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              to="/admin/bookings"
              className="text-sm font-black text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
            >
              ← Back to Manage Bookings
            </Link>

            <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">
              Admin Booking Details
            </h1>

            <p className="mt-1 break-all text-sm font-semibold text-gray-500 dark:text-gray-400">
              Appointment ID: {booking.id}
            </p>
          </div>

          <StatusBadge status={booking.status} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              Booking Information
            </p>

            <h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
              {booking.services?.name || 'No service selected'}
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <DetailCard label="Customer" value={getCustomerName(booking)} />
              <DetailCard label="Email" value={booking.profiles?.email} />
              <DetailCard label="Phone" value={booking.profiles?.phone} />
              <DetailCard label="Mechanic" value={getMechanicName(booking)} />
              <DetailCard label="Booking Date" value={formatDate(booking.booking_date)} />
              <DetailCard label="Booking Time" value={formatTime(booking.booking_time)} />
              <DetailCard
                label="Duration"
                value={
                  booking.services?.estimated_duration_minutes
                    ? `${booking.services.estimated_duration_minutes} minutes`
                    : '—'
                }
              />
              <DetailCard label="Created At" value={formatDateTime(booking.created_at)} />
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

            {booking.status === 'no_show' && (
              <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
                No-show penalty: {formatPeso(booking.penalty_amount)}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Payment Summary
              </p>

              <div className="mt-5 space-y-3">
                <DetailCard label="Booking Total" value={formatPeso(total)} />
                <DetailCard label="Total Paid" value={formatPeso(totalPaid)} />
                <DetailCard label="Balance" value={formatPeso(balance)} />
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
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}