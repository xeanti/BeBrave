import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const STATUS_FLOW = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: '⏳',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
    dot: 'bg-yellow-500',
  },
  confirmed: {
    label: 'Confirmed',
    icon: '✅',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
    dot: 'bg-green-500',
  },
  in_progress: {
    label: 'In Progress',
    icon: '🔧',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
    dot: 'bg-blue-500',
  },
  completed: {
    label: 'Completed',
    icon: '✓',
    classes:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
    dot: 'bg-gray-500',
  },
  cancelled: {
    label: 'Cancelled',
    icon: '✕',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
    dot: 'bg-red-500',
  },
};

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  const name = `${booking.profiles?.first_name || ''} ${booking.profiles?.last_name || ''}`.trim();

  return name || 'Unknown Customer';
}

function getInitials(profile) {
  const first = profile?.first_name?.[0] || '';
  const last = profile?.last_name?.[0] || '';

  return `${first}${last}`.toUpperCase() || '?';
}

function getBookingTotal(booking) {
  return (
    (Number(booking.services?.base_price) || 0) +
    (Number(booking.services?.labor_cost) || 0)
  );
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${config.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
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
    red: 'text-red-600 dark:text-red-300',
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

function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[86px] rounded-2xl px-4 py-3 text-center transition ${
        active
          ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
          : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:text-primary-700 hover:ring-primary-200 dark:bg-dark-800 dark:text-gray-400 dark:ring-dark-700 dark:hover:text-primary-400 dark:hover:ring-primary-500/40'
      }`}
    >
      <span className="block text-lg font-black leading-none">{count}</span>
      <span className={`mt-1 block text-[11px] font-black ${active ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}

function EmptyState({ icon, title, sub, action }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
        {icon}
      </div>
      <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
        {title}
      </h2>
      {sub && (
        <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
          {sub}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action}
          className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function BookingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-56 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function MechanicDashboard() {
  const { user, profile } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);
  const [toast, setToast] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!user?.id) return;

    fetchBookings();

    /*
      Realtime refresh for mechanic dashboard.
      Enable Realtime in Supabase for bookings, services, and profiles.
    */
    const bookingsChannel = supabase
      .channel(`mechanic-dashboard-bookings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `mechanic_id=eq.${user.id}`,
        },
        () => fetchBookings(false)
      )
      .subscribe();

    const servicesChannel = supabase
      .channel('mechanic-dashboard-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
        },
        () => fetchBookings(false)
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('mechanic-dashboard-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => fetchBookings(false)
      )
      .subscribe();

    const handleFocus = () => fetchBookings(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchBookings(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(servicesChannel);
      supabase.removeChannel(profilesChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!toast) return;

    const timeout = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function fetchBookings(showLoader = true) {
    if (!user?.id) return;

    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        services(name, base_price, labor_cost, estimated_duration_minutes),
        profiles!bookings_customer_id_fkey(first_name, last_name, phone, email, profile_photo_url)
      `)
      .eq('mechanic_id', user.id)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (error) {
      setFetchError(error.message || 'Failed to load your bookings.');
      setBookings([]);
      setLoading(false);
      return;
    }

    setBookings(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  async function insertAuditLog(bookingId, status) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action: 'MECHANIC_UPDATE_BOOKING_STATUS',
      entity: 'bookings',
      entity_id: bookingId,
      performed_by: user.id,
      details: {
        new_status: status,
      },
    });
  }

  async function updateStatus(bookingId, status) {
    setUpdatingId(bookingId);
    setFetchError('');

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('mechanic_id', user.id);

      if (error) throw error;

      await insertAuditLog(bookingId, status);

      setBookings((previous) =>
        previous.map((booking) =>
          booking.id === bookingId ? { ...booking, status } : booking
        )
      );

      setToast(`Booking marked as ${String(status).replace('_', ' ')}.`);
      await fetchBookings(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to update booking status.');
    } finally {
      setUpdatingId(null);
    }
  }

  const counts = useMemo(() => {
    const result = {
      all: bookings.length,
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };

    bookings.forEach((booking) => {
      if (result[booking.status] !== undefined) {
        result[booking.status] += 1;
      }
    });

    return result;
  }, [bookings]);

  const stats = useMemo(() => {
    const today = getTodayString();

    const todayJobs = bookings.filter((booking) => booking.booking_date === today);
    const activeJobs = bookings.filter((booking) =>
      ['pending', 'confirmed', 'in_progress'].includes(booking.status)
    );

    const completedRevenue = bookings
      .filter((booking) => booking.status === 'completed')
      .reduce((sum, booking) => sum + getBookingTotal(booking), 0);

    return {
      todayJobs: todayJobs.length,
      activeJobs: activeJobs.length,
      completedRevenue,
      nextJob: activeJobs[0] || null,
    };
  }, [bookings]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
      const haystack = [
        booking.id,
        getCustomerName(booking),
        booking.profiles?.phone,
        booking.profiles?.email,
        booking.services?.name,
        booking.notes,
        booking.booking_date,
        booking.booking_time,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [bookings, search, statusFilter]);

  const initials = getInitials(profile);
  const ratingAverage = Number(profile?.rating_avg) || 0;
  const ratingCount = Number(profile?.rating_count) || 0;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                {profile?.profile_photo_url ? (
                  <img
                    src={profile.profile_photo_url}
                    alt="Profile"
                    className="h-16 w-16 flex-shrink-0 rounded-3xl object-cover ring-2 ring-primary-100 dark:ring-primary-500/30"
                  />
                ) : (
                  <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-3xl bg-primary-600 text-xl font-black text-white shadow-lg shadow-primary-600/20">
                    {initials}
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                    Mechanic Dashboard
                  </p>
                  <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white">
                    {profile?.first_name} {profile?.last_name}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {profile?.specialization && (
                      <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25">
                        🔧 {profile.specialization}
                      </span>
                    )}
                    <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-black text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25">
                      ★ {ratingAverage ? ratingAverage.toFixed(1) : '—'} · {ratingCount} reviews
                    </span>
                  </div>
                  {lastUpdated && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Last updated: {formatDateTime(lastUpdated)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchBookings(false)}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <Link
                  to="/mechanic-ratings"
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  View Reviews
                </Link>

                <Link
                  to="/profile"
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
                >
                  Edit Profile
                </Link>
              </div>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Today's Jobs" value={stats.todayJobs} icon="📅" tone="primary" />
          <StatCard label="Active Jobs" value={stats.activeJobs} icon="🔧" tone={stats.activeJobs > 0 ? 'yellow' : 'default'} />
          <StatCard label="Completed" value={counts.completed} icon="✅" tone="green" />
          <StatCard label="Completed Value" value={formatPeso(stats.completedRevenue)} icon="💰" tone="accent" />
        </div>

        {stats.nextJob && (
          <div className="mb-6 rounded-3xl border border-primary-100 bg-primary-50 p-5 shadow-sm dark:border-primary-500/25 dark:bg-primary-500/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-wider text-primary-700 dark:text-primary-400">
                  Next Active Job
                </p>
                <h2 className="text-lg font-black text-gray-950 dark:text-white">
                  {stats.nextJob.services?.name || 'Service'} · {getCustomerName(stats.nextJob)}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {formatDate(stats.nextJob.booking_date)} at {formatTime(stats.nextJob.booking_time)}
                </p>
              </div>

              <StatusBadge status={stats.nextJob.status} />
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'pending', label: 'Pending' },
              { key: 'confirmed', label: 'Confirmed' },
              { key: 'in_progress', label: 'In Progress' },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
            ].map((item) => (
              <FilterChip
                key={item.key}
                label={item.label}
                count={counts[item.key] || 0}
                active={statusFilter === item.key}
                onClick={() => setStatusFilter(item.key)}
              />
            ))}
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, phone, email, service, date, time, notes, or ID..."
              className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white dark:placeholder:text-gray-500"
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

        {loading ? (
          <BookingSkeleton />
        ) : bookings.length === 0 ? (
          <EmptyState
            icon="🔧"
            title="No bookings yet"
            sub="Bookings assigned to you will appear here."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No matches found"
            sub="Try changing your search keyword or status filter."
            action={() => {
              setSearch('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                updatingId={updatingId}
                onUpdateStatus={updateStatus}
              />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[130] max-w-xs rounded-3xl border border-primary-100 bg-white px-5 py-4 text-sm font-black text-gray-950 shadow-2xl dark:border-primary-500/25 dark:bg-dark-800 dark:text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking, updatingId, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false);

  const isUpdating = updatingId === booking.id;
  const basePrice = Number(booking.services?.base_price) || 0;
  const laborCost = Number(booking.services?.labor_cost) || 0;
  const total = basePrice + laborCost;
  const duration = booking.services?.estimated_duration_minutes;
  const otherStatuses = STATUS_FLOW.filter((status) => status !== booking.status);

  return (
    <article className={`overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition dark:border-dark-700 dark:bg-dark-800 ${isUpdating ? 'opacity-70' : ''}`}>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="w-full p-5 text-left transition hover:bg-gray-50 dark:hover:bg-dark-900/40 sm:p-6"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} />
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                #{booking.id?.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <h2 className="text-lg font-black text-gray-950 dark:text-white">
              {booking.services?.name || 'Service'}
            </h2>

            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              👤 {getCustomerName(booking)}
              {booking.profiles?.phone ? ` · ${booking.profiles.phone}` : ''}
            </p>
          </div>

          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Schedule
            </p>
            <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
              {formatDate(booking.booking_date)}
            </p>
            <p className="text-xs font-bold text-primary-600 dark:text-primary-400">
              {formatTime(booking.booking_time)}
              {duration ? ` · ${duration} mins` : ''}
            </p>
          </div>
        </div>

        {booking.notes && (
          <p className="mb-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm italic leading-6 text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
            “{booking.notes}”
          </p>
        )}

        <p className="text-xs font-black text-gray-400 dark:text-gray-500">
          {expanded ? '▲ Hide details' : '▼ Cost breakdown and status controls'}
        </p>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 dark:border-dark-700 sm:p-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <CostCard label="Base Price" value={basePrice} />
            <CostCard label="Labor Cost" value={laborCost} />
            <CostCard label="Total" value={total} strong />
          </div>

          {Number(booking.down_payment) > 0 && (
            <div className="mb-5 rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm font-semibold text-primary-700 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-400">
              Down payment collected: {formatPeso(booking.down_payment)}
            </div>
          )}

          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Update Status
            </p>

            <div className="flex flex-wrap gap-2">
              {otherStatuses.map((status) => {
                const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

                return (
                  <button
                    key={status}
                    type="button"
                    disabled={isUpdating}
                    onClick={() => onUpdateStatus(booking.id, status)}
                    className={`rounded-2xl px-4 py-2 text-xs font-black ring-1 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${config.classes}`}
                  >
                    {config.icon} {config.label}
                  </button>
                );
              })}

              {isUpdating && (
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                  Updating...
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function CostCard({ label, value, strong = false }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-black ${
          strong
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-gray-950 dark:text-white'
        }`}
      >
        {formatPeso(value)}
      </p>
    </div>
  );
}
