import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const STATUS_OPTIONS = [
  'pending',
  'confirmed',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
  'ready_for_pickup',
  'completed',
  'cancelled',
  'rejected',
  'no_show',
];

const STATUS_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  in_progress:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  inspection:
    'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25',
  repairing:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  quality_check:
    'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/25',
  ready_for_pickup:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  rejected:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  no_show:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
};

const PAYMENT_STYLES = {
  paid:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  unpaid:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  checkout_created:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  pending_payment:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  pending_verification:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  failed:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  expired:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
  cancelled:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  refunded:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
};

const MAX_SEARCH_LENGTH = 80;

function sanitizeText(value, options = {}) {
  const { max = 160, fallback = '' } = options;

  const cleaned = String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

  return cleaned || fallback;
}

function sanitizeSearchInput(value) {
  return sanitizeText(value, { max: MAX_SEARCH_LENGTH });
}

function normalizeStatus(value, fallback = 'pending') {
  const normalized = sanitizeText(value, { max: 40 }).toLowerCase();

  return STATUS_OPTIONS.includes(normalized) ? normalized : fallback;
}

function normalizePaymentStatus(value) {
  const normalized = sanitizeText(value, { max: 40 }).toLowerCase();

  return PAYMENT_STYLES[normalized] ? normalized : 'unpaid';
}

function sanitizeBookingId(value) {
  return sanitizeText(value, { max: 80 });
}

function safeMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) return 0;
  return amount;
}

function safePositiveInteger(value, fallback = 1, max = 999) {
  const number = parseInt(value, 10);

  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, max);
}

function formatPeso(value) {
  const amount = safeMoney(value);

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  const parts = String(value).split('-');
  let parsedDate;

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    parsedDate = new Date(year, month - 1, day);
  } else {
    parsedDate = new Date(value);
  }

  if (Number.isNaN(parsedDate.getTime())) return '—';

  return parsedDate.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return '—';

  return parsedDate.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(time) {
  if (!time) return '—';

  const normalized = sanitizeText(time, { max: 8 }).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return '—';

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m.padStart(2, '0')} ${ampm}`;
}

function formatLabel(value) {
  return sanitizeText(value || 'pending', { max: 60, fallback: 'pending' })
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCustomerName(booking) {
  const profile = booking?.profiles || booking?.customer || {};
  const firstName = sanitizeText(profile.first_name, { max: 60 });
  const lastName = sanitizeText(profile.last_name, { max: 60 });
  const phone = sanitizeText(profile.phone, { max: 40 });
  const email = sanitizeText(profile.email, { max: 120 });
  const name = `${firstName} ${lastName}`.trim();

  if (name) return name;
  if (phone) return `Customer ${phone}`;
  if (email) return email;

  return 'Customer';
}

function getCustomerContact(booking) {
  const profile = booking?.profiles || booking?.customer || {};
  const phone = sanitizeText(profile.phone, { max: 40 });
  const email = sanitizeText(profile.email, { max: 120 });

  return phone || email || '—';
}

function getMechanicName(booking) {
  const mechanic = booking?.mechanic || {};
  const firstName = sanitizeText(mechanic.first_name, { max: 60 });
  const lastName = sanitizeText(mechanic.last_name, { max: 60 });
  const name = `${firstName} ${lastName}`.trim();

  return name || 'Unassigned';
}

function getBookingServiceRows(booking) {
  const rows = Array.isArray(booking?.booking_services) ? booking.booking_services : [];

  if (rows.length > 0) {
    return rows.map((row) => ({
      ...row,
      service_name: sanitizeText(row.service_name || row.services?.name || 'Service', {
        max: 120,
        fallback: 'Service',
      }),
      base_price: safeMoney(row.base_price ?? row.services?.base_price ?? 0),
      labor_cost: safeMoney(row.labor_cost ?? row.services?.labor_cost ?? 0),
      estimated_duration_minutes: safePositiveInteger(
        row.estimated_duration_minutes ?? row.services?.estimated_duration_minutes ?? 30,
        30,
        1440
      ),
      quantity: safePositiveInteger(row.quantity, 1, 99),
    }));
  }

  if (booking?.services_summary && String(booking.services_summary).includes(',')) {
    return String(booking.services_summary)
      .split(',')
      .map((name, index) => ({
        id: `summary-${index}`,
        service_name: sanitizeText(name, { max: 120 }),
        base_price: 0,
        labor_cost: 0,
        estimated_duration_minutes: 30,
        quantity: 1,
        summary_only: true,
      }))
      .filter((row) => row.service_name);
  }

  if (booking?.services?.name || booking?.services_summary) {
    return [
      {
        id: booking?.service_id || 'single-service',
        service_name: sanitizeText(
          booking.services_summary || booking.services?.name || 'Service',
          { max: 120, fallback: 'Service' }
        ),
        base_price: safeMoney(booking?.services?.base_price),
        labor_cost: safeMoney(booking?.services?.labor_cost),
        estimated_duration_minutes: safePositiveInteger(
          booking?.services?.estimated_duration_minutes,
          30,
          1440
        ),
        quantity: 1,
      },
    ];
  }

  return [];
}

function getServiceNames(booking) {
  const rows = getBookingServiceRows(booking);

  if (rows.length > 0) {
    return rows
      .map((row) => sanitizeText(row.service_name, { max: 120 }))
      .filter(Boolean)
      .join(', ');
  }

  return sanitizeText(booking?.services_summary || booking?.services?.name || 'No service selected', {
    max: 180,
    fallback: 'No service selected',
  });
}

function getServiceCount(booking) {
  const rows = getBookingServiceRows(booking);

  if (rows.length > 0) {
    return rows.reduce((sum, row) => sum + safePositiveInteger(row.quantity, 1, 99), 0);
  }

  return booking?.service_id ? 1 : 0;
}

function getServiceDuration(booking) {
  const rows = getBookingServiceRows(booking);

  if (rows.length > 0) {
    return rows.reduce(
      (sum, row) =>
        sum +
        (safePositiveInteger(row.estimated_duration_minutes, 30, 1440) *
          safePositiveInteger(row.quantity, 1, 99)),
      0
    );
  }

  return safePositiveInteger(booking?.services?.estimated_duration_minutes, 30, 1440);
}

function getServiceLineTotal(row) {
  const quantity = safePositiveInteger(row?.quantity, 1, 99);

  return (safeMoney(row?.base_price) + safeMoney(row?.labor_cost)) * quantity;
}

function getBookingTotal(booking) {
  const totalAmount = safeMoney(booking?.total_amount);
  if (totalAmount > 0) return totalAmount;

  const serviceTotal = safeMoney(booking?.service_total);
  if (serviceTotal > 0) return serviceTotal;

  const rows = getBookingServiceRows(booking);
  const computedTotal = rows.reduce((sum, row) => sum + getServiceLineTotal(row), 0);

  if (computedTotal > 0) return computedTotal;

  return safeMoney(booking?.services?.base_price) + safeMoney(booking?.services?.labor_cost);
}

function StatusBadge({ status }) {
  const normalized = normalizeStatus(status);

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${
        STATUS_STYLES[normalized] || STATUS_STYLES.pending
      }`}
    >
      {formatLabel(normalized)}
    </span>
  );
}

function PaymentBadge({ status }) {
  const normalized = normalizePaymentStatus(status);

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${
        PAYMENT_STYLES[normalized] || PAYMENT_STYLES.unpaid
      }`}
    >
      {normalized === 'paid' ? 'Reservation Paid' : formatLabel(normalized)}
    </span>
  );
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    blue: 'text-blue-600 dark:text-blue-300',
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>
        {value}
      </p>
    </div>
  );
}

function BookingSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
      {[1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="flex gap-4 border-b border-gray-100 p-5 last:border-b-0 dark:border-dark-700"
        >
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
          <div className="flex-1">
            <div className="mb-2 h-4 w-48 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
            <div className="h-3 w-80 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminBookings() {
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchBookings();

    const bookingsChannel = supabase
      .channel('admin-bookings-simple-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => fetchBookings(false)
      )
      .subscribe();

    const bookingServicesChannel = supabase
      .channel('admin-bookings-simple-list-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_services',
        },
        () => fetchBookings(false)
      )
      .subscribe();

    const handleFocus = () => fetchBookings(false);

    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(bookingServicesChannel);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, search, pageSize]);

  async function fetchBookings(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('bookings')
      .select(`
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
        profiles!bookings_customer_id_fkey(first_name, last_name, email, phone),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name, email, phone)
      `)
      .order('booking_date', { ascending: false })
      .order('booking_time', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load bookings.');
      setBookings([]);
      setLoading(false);
      return;
    }

    const bookingRows = (data || []).filter(
      (booking) =>
        booking.is_walkin !== true &&
        String(booking.source || '').toLowerCase() !== 'walkin'
    );

    setBookings(bookingRows);
    setLastUpdated(new Date());
    setLoading(false);
  }

  function openDetails(bookingId) {
    const safeId = sanitizeBookingId(bookingId);

    if (!safeId) return;
    navigate(`/admin/bookings/${encodeURIComponent(safeId)}`);
  }

  const counts = useMemo(() => {
    const result = {
      all: bookings.length,
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      inspection: 0,
      repairing: 0,
      quality_check: 0,
      ready_for_pickup: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
      no_show: 0,
    };

    bookings.forEach((booking) => {
      const status = normalizeStatus(booking.status);

      if (result[status] !== undefined) {
        result[status] += 1;
      }
    });

    return result;
  }, [bookings]);

  const filtered = useMemo(() => {
    const searchTerm = sanitizeSearchInput(search).toLowerCase();

    return bookings.filter((booking) => {
      const status = normalizeStatus(booking.status);
      const matchesStatus = filter === 'all' || status === filter;

      const customerName = getCustomerName(booking).toLowerCase();
      const customerContact = getCustomerContact(booking).toLowerCase();
      const serviceNames = getServiceNames(booking).toLowerCase();
      const mechanicName = getMechanicName(booking).toLowerCase();
      const id = sanitizeBookingId(booking.id).toLowerCase();
      const paymentReference = sanitizeText(booking.payment_reference, { max: 80 }).toLowerCase();

      const matchesSearch =
        !searchTerm ||
        customerName.includes(searchTerm) ||
        customerContact.includes(searchTerm) ||
        serviceNames.includes(searchTerm) ||
        mechanicName.includes(searchTerm) ||
        id.includes(searchTerm) ||
        paymentReference.includes(searchTerm);

      return matchesStatus && matchesSearch;
    });
  }, [bookings, filter, search]);

  const stats = useMemo(() => {
    const expectedTotal = filtered.reduce(
      (sum, booking) => sum + getBookingTotal(booking),
      0
    );

    return {
      filtered: filtered.length,
      pending: filtered.filter(
        (booking) => normalizeStatus(booking.status) === 'pending'
      ).length,
      confirmed: filtered.filter(
        (booking) => normalizeStatus(booking.status) === 'confirmed'
      ).length,
      paidReservations: filtered.filter(
        (booking) => normalizePaymentStatus(booking.payment_status) === 'paid'
      ).length,
      expectedTotal,
    };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const paginatedBookings = filtered.slice(startIndex, endIndex);

  function goToPage(nextPage) {
    setPage(Math.min(Math.max(1, nextPage), totalPages));
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Admin
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Manage Bookings
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Simple paginated booking list. Open Booking Details to manage mechanic assignment, reservation payment, status, invoice, service progress, and parts used.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchBookings(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Filtered Bookings" value={stats.filtered} icon="📅" tone="primary" />
          <StatCard label="Pending" value={stats.pending} icon="⏳" tone="yellow" />
          <StatCard label="Confirmed" value={stats.confirmed} icon="✅" tone="green" />
          <StatCard label="Paid Reservations" value={stats.paidReservations} icon="💳" tone="blue" />
          <StatCard label="Expected Total" value={formatPeso(stats.expectedTotal)} icon="💰" tone="accent" />
        </div>

        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {['all', ...STATUS_OPTIONS].map((status) => {
                const active = filter === status;
                const label = status === 'all' ? 'All' : formatLabel(status);

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilter(status === 'all' ? 'all' : normalizeStatus(status))}
                    className={`rounded-full px-4 py-2 text-xs font-black transition ${
                      active
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                    }`}
                  >
                    {label}
                    <span className={active ? 'ml-1 opacity-80' : 'ml-1 opacity-60'}>
                      ({counts[status] || 0})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(sanitizeSearchInput(event.target.value))}
                maxLength={MAX_SEARCH_LENGTH}
                placeholder="Search customer, phone, service, mechanic, or ID..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 sm:w-96"
              />

              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-700 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </select>

              {(search || filter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <BookingSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              📅
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No bookings found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Try changing the status filter or search keyword.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Bookings <span className="text-gray-400">({filtered.length})</span>
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Showing {filtered.length === 0 ? 0 : startIndex + 1}–{endIndex} of {filtered.length}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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

                <span className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 dark:bg-dark-900 dark:text-gray-300">
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

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-left text-sm dark:divide-dark-700">
                <thead className="bg-gray-50 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:bg-dark-900/60 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-4">Booking</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Services</th>
                    <th className="px-5 py-4">Schedule</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Payment</th>
                    <th className="px-5 py-4">Mechanic</th>
                    <th className="px-5 py-4 text-right">Total</th>
                    <th className="px-5 py-4 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                  {paginatedBookings.map((booking) => {
                    const serviceCount = getServiceCount(booking);
                    const duration = getServiceDuration(booking);

                    return (
                      <tr
                        key={booking.id}
                        onClick={() => openDetails(booking.id)}
                        className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-dark-900/50"
                      >
                        <td className="px-5 py-4 align-top">
                          <p className="font-mono text-xs font-black text-gray-950 dark:text-white">
                            #{sanitizeBookingId(booking.id).slice(0, 8).toUpperCase()}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Created {formatDate(booking.created_at)}
                          </p>
                        </td>

                        <td className="px-5 py-4 align-top">
                          <p className="font-black text-gray-950 dark:text-white">
                            {getCustomerName(booking)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {getCustomerContact(booking)}
                          </p>
                        </td>

                        <td className="max-w-xs px-5 py-4 align-top">
                          <p className="line-clamp-2 font-black text-primary-600 dark:text-primary-400">
                            {getServiceNames(booking)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {serviceCount} service{serviceCount > 1 ? 's' : ''} · {duration} mins
                          </p>
                        </td>

                        <td className="px-5 py-4 align-top">
                          <p className="font-black text-gray-950 dark:text-white">
                            {formatDate(booking.booking_date)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(booking.booking_time)}
                          </p>
                        </td>

                        <td className="px-5 py-4 align-top">
                          <StatusBadge status={booking.status} />
                        </td>

                        <td className="px-5 py-4 align-top">
                          <PaymentBadge status={booking.payment_status} />
                          {sanitizeText(booking.payment_reference, { max: 80 }) && (
                            <p className="mt-1 max-w-[160px] truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                              {sanitizeText(booking.payment_reference, { max: 80 })}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 align-top">
                          <p className="font-black text-gray-950 dark:text-white">
                            {getMechanicName(booking)}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-right align-top">
                          <p className="font-black text-gray-950 dark:text-white">
                            {formatPeso(getBookingTotal(booking))}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-right align-top">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetails(booking.id);
                            }}
                            className="rounded-2xl bg-primary-600 px-4 py-2 text-xs font-black text-white transition hover:bg-primary-700"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Showing {startIndex + 1}–{endIndex} of {filtered.length} bookings
              </p>

              <div className="flex flex-wrap items-center gap-2">
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
                <span className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 dark:bg-dark-900 dark:text-gray-300">
                  Page {safePage} of {totalPages}
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
          </div>
        )}
      </div>
    </div>
  );
}
