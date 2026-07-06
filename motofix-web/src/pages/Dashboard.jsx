import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) return '—';

  const [year, month, day] = dateString.split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(time) {
  if (!time) return '—';

  const [h, m = '00'] = time.slice(0, 5).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(profile) {
  const first = profile?.first_name?.[0] || '';
  const last = profile?.last_name?.[0] || '';

  return `${first}${last}`.toUpperCase() || '🏍️';
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: '⏳',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  },
  confirmed: {
    label: 'Confirmed',
    icon: '✓',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
  in_progress: {
    label: 'In Progress',
    icon: '🔧',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  completed: {
    label: 'Completed',
    icon: '★',
    classes:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  },
  cancelled: {
    label: 'Cancelled',
    icon: '✕',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  },
  processing: {
    label: 'Processing',
    icon: '🔧',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  ready: {
    label: 'Ready',
    icon: '📦',
    classes:
      'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25',
  },
  converted: {
    label: 'Converted',
    icon: '📅',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
  reviewed: {
    label: 'Reviewed',
    icon: '✓',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${config.classes}`}>
      <span>{config.icon}</span>
      {config.label || String(status || 'pending').replace('_', ' ')}
    </span>
  );
}

function QuickAction({ to, title, description, icon, accent = false }) {
  return (
    <Link
      to={to}
      className="group rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary-100 hover:shadow-xl hover:shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 dark:hover:shadow-black/20"
    >
      <div
        className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl text-2xl transition ${
          accent
            ? 'bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400'
            : 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400'
        }`}
      >
        {icon}
      </div>
      <h3 className="text-sm font-black text-gray-950 transition group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-400">
        {title}
      </h3>
      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </Link>
  );
}

function StatCard({ label, value, icon, accent = false }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p
            className={`mt-2 text-2xl font-black ${
              accent
                ? 'text-accent-600 dark:text-accent-400'
                : 'text-gray-950 dark:text-white'
            }`}
          >
            {value}
          </p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-50 text-2xl ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function BookingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900"
        />
      ))}
    </div>
  );
}

function EmptyState({ icon, title, text, actionLabel, actionTo }) {
  return (
    <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-black text-gray-950 dark:text-white">
        {title}
      </h3>
      <p className="mx-auto mb-5 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
        {text}
      </p>
      <Link
        to={actionTo}
        className="inline-flex rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const { profile, user } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [assessments, setAssessments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!user?.id) return;

    fetchData();

    /*
      Realtime refresh for customer dashboard.
      Enable Realtime for bookings, orders, and pre_assessments in Supabase.
    */
    const bookingsChannel = supabase
      .channel(`dashboard-bookings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `customer_id=eq.${user.id}`,
        },
        () => fetchData(false)
      )
      .subscribe();

    const ordersChannel = supabase
      .channel(`dashboard-orders-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user.id}`,
        },
        () => fetchData(false)
      )
      .subscribe();

    const assessmentsChannel = supabase
      .channel(`dashboard-assessments-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pre_assessments',
          filter: `customer_id=eq.${user.id}`,
        },
        () => fetchData(false)
      )
      .subscribe();

    const handleFocus = () => fetchData(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchData(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(assessmentsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  async function fetchData(showLoader = true) {
    if (!user?.id) return;
    if (showLoader) setLoading(true);

    setFetchError('');

    try {
      const today = getTodayString();

      const [bookingsResult, ordersResult, assessmentsResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('*, services(name)')
          .eq('customer_id', user.id)
          .gte('booking_date', today)
          .in('status', ['pending', 'confirmed', 'in_progress'])
          .order('booking_date', { ascending: true })
          .order('booking_time', { ascending: true })
          .limit(6),

        supabase
          .from('orders')
          .select('id, status, total_amount, created_at')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),

        supabase
          .from('pre_assessments')
          .select('id, status, estimated_total, created_at, services(name)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (bookingsResult.error) throw bookingsResult.error;
      if (ordersResult.error) throw ordersResult.error;
      if (assessmentsResult.error) throw assessmentsResult.error;

      setBookings(bookingsResult.data || []);
      setOrders(ordersResult.data || []);
      setAssessments(assessmentsResult.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  const upcomingCount = useMemo(
    () => bookings.filter((booking) => ['pending', 'confirmed', 'in_progress'].includes(booking.status)).length,
    [bookings]
  );

  const pendingOrders = useMemo(
    () => orders.filter((order) => ['pending', 'processing', 'ready'].includes(order.status)).length,
    [orders]
  );

  const latestAssessment = assessments[0];
  const motorcycleLabel = profile?.moto_make
    ? `${profile.moto_make} ${profile.moto_model || ''}${profile.moto_year ? ` (${profile.moto_year})` : ''}`.trim()
    : '';

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-50 px-4 py-8 text-gray-900 transition-colors dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                {profile?.profile_photo_url ? (
                  <img
                    src={profile.profile_photo_url}
                    alt={profile.first_name || 'Profile'}
                    className="h-20 w-20 flex-shrink-0 rounded-3xl border-2 border-primary-100 object-cover shadow-sm dark:border-primary-500/30"
                  />
                ) : (
                  <div className="grid h-20 w-20 flex-shrink-0 place-items-center rounded-3xl bg-primary-600 text-2xl font-black text-white shadow-sm">
                    {getInitials(profile)}
                  </div>
                )}

                <div className="min-w-0">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                    {greeting()}
                  </p>
                  <h1 className="truncate text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                    {profile?.first_name || 'Rider'}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                    {upcomingCount > 0
                      ? `${upcomingCount} upcoming booking${upcomingCount > 1 ? 's' : ''} on your schedule.`
                      : "No upcoming bookings yet. You can view appointments or request a cost assessment."}
                  </p>
                  {lastUpdated && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Last updated: {formatTime(`${lastUpdated.getHours()}:${String(lastUpdated.getMinutes()).padStart(2, '0')}`)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchData(false)}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <Link
                  to="/appointments"
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.99]"
                >
                  View Appointments
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
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Upcoming Bookings" value={upcomingCount} icon="📅" />
          <StatCard label="Active Orders" value={pendingOrders} icon="📦" />
          <StatCard label="Assessments" value={assessments.length} icon="📋" />
          <StatCard
            label="Latest Estimate"
            value={latestAssessment ? formatPeso(latestAssessment.estimated_total) : '—'}
            icon="💰"
            accent
          />
        </div>

        {/* Motorcycle card */}
        {motorcycleLabel && (
          <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {profile?.moto_photo_url ? (
                  <img
                    src={profile.moto_photo_url}
                    alt="My motorcycle"
                    className="h-16 w-16 rounded-3xl object-cover ring-1 ring-gray-200 dark:ring-dark-700"
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gray-50 text-3xl ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                    🏍️
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    My Motorcycle
                  </p>
                  <p className="mt-1 text-lg font-black text-gray-950 dark:text-white">
                    {motorcycleLabel}
                  </p>
                </div>
              </div>

              <Link
                to="/profile"
                className="rounded-2xl border border-gray-200 px-4 py-3 text-center text-sm font-black text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
              >
                Update Profile
              </Link>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            to="/appointments"
            title="My Appointments"
            description="View your service appointments and booking details."
            icon="📅"
          />
          <QuickAction
            to="/pre-assessment"
            title="Cost Assessment"
            description="Get a pre-assessment estimate before visiting the shop."
            icon="📋"
            accent
          />
          <QuickAction
            to="/my-assessments"
            title="My Assessments"
            description="Review your submitted cost estimate requests."
            icon="🔍"
          />
          <QuickAction
            to="/my-orders"
            title="My Orders"
            description="Track your product orders and payment status."
            icon="📦"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Bookings */}
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-gray-950 dark:text-white">
                  Upcoming Bookings
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Your next scheduled service appointments.
                </p>
              </div>

              <Link
                to="/appointments"
                className="rounded-full bg-primary-50 px-4 py-2 text-xs font-black text-primary-700 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:hover:bg-primary-500/20"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <BookingSkeleton />
            ) : bookings.length === 0 ? (
              <EmptyState
                icon="📅"
                title="No upcoming bookings"
                text="Your scheduled service appointments will appear here once created."
                actionLabel="View appointments"
                actionTo="/appointments"
              />
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <article
                    key={booking.id}
                    className="rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-primary-100 hover:bg-white dark:border-dark-700 dark:bg-dark-900/60 dark:hover:border-primary-500/30 dark:hover:bg-dark-900"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-white text-xl ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                          🔧
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                            {booking.services?.name || 'Service'}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {formatDate(booking.booking_date)} · {formatTime(booking.booking_time)}
                          </p>
                        </div>
                      </div>

                      <StatusBadge status={booking.status} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Activity */}
          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-gray-950 dark:text-white">
                    Recent Orders
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Latest parts order updates.
                  </p>
                </div>
                <Link
                  to="/my-orders"
                  className="text-xs font-black text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  View all
                </Link>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900"
                    />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-dark-900/60 dark:text-gray-400">
                  No orders yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {orders.slice(0, 3).map((order) => (
                    <div
                      key={order.id}
                      className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/60 dark:ring-dark-700"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-black text-gray-950 dark:text-white">
                          #{order.id?.slice(0, 8).toUpperCase()}
                        </p>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(order.created_at)}
                        </p>
                        <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                          {formatPeso(order.total_amount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-gray-950 dark:text-white">
                    Latest Assessments
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Recent cost estimate requests.
                  </p>
                </div>
                <Link
                  to="/my-assessments"
                  className="text-xs font-black text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  View all
                </Link>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900"
                    />
                  ))}
                </div>
              ) : assessments.length === 0 ? (
                <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-dark-900/60 dark:text-gray-400">
                  No assessments yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {assessments.slice(0, 3).map((assessment) => (
                    <div
                      key={assessment.id}
                      className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/60 dark:ring-dark-700"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-black text-gray-950 dark:text-white">
                          {assessment.services?.name || 'Assessment'}
                        </p>
                        <StatusBadge status={assessment.status} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(assessment.created_at)}
                        </p>
                        <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                          {formatPeso(assessment.estimated_total)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
