import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const INITIAL_STATS = {
  totalBookings: 0,
  pendingBookings: 0,
  pendingAssessments: 0,
  pendingOrders: 0,
  totalCustomers: 0,
  totalMechanics: 0,
  totalParts: 0,
  totalServices: 0,
  totalRevenue: 0,
  orderRevenue: 0,
  bookingRevenue: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
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
  const [h, m = '00'] = String(time).slice(0, 5).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

const STATUS_STYLES = {
  confirmed: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  pending: 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  in_progress: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  completed: 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  cancelled: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  preparing: 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  processing: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  ready: 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25',
  reviewed: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  converted: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {String(status || 'pending').replace('_', ' ')}
    </span>
  );
}

function StatCard({ label, value, icon, to, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    red: 'text-red-600 dark:text-red-300',
    blue: 'text-blue-600 dark:text-blue-300',
  };

  const card = (
    <div className="group h-full rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary-100 hover:shadow-xl hover:shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 dark:hover:shadow-black/20">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-50 text-2xl ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
          {icon}
        </div>
        {to && <span className="text-xs font-black text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400">View →</span>}
      </div>
      <p className={`text-3xl font-black ${tones[tone] || tones.default}`}>{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );

  return to ? <Link to={to}>{card}</Link> : card;
}

function QuickLink({ to, label, icon }) {
  return (
    <Link
      to={to}
      className="group rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary-100 hover:shadow-xl hover:shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 dark:hover:shadow-black/20"
    >
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary-50 text-2xl text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/20">
        {icon}
      </div>
      <p className="text-sm font-black text-gray-950 group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-400">
        {label}
      </p>
    </Link>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(INITIAL_STATS);
  const [recentBookings, setRecentBookings] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockParts, setLowStockParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchDashboardData();

    const tables = ['bookings', 'pre_assessments', 'orders', 'profiles', 'parts', 'services'];
    const channels = tables.map((table) =>
      supabase
        .channel(`admin-dashboard-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => fetchDashboardData(false))
        .subscribe()
    );

    const handleFocus = () => fetchDashboardData(false);
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchDashboardData(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function fetchDashboardData(showLoader = true) {
    if (showLoader) setLoading(true);
    setFetchError('');

    try {
      const [
        bookings,
        assessments,
        orders,
        customers,
        mechanics,
        parts,
        services,
        recentBookingsResult,
        recentOrdersResult,
      ] = await Promise.all([
        supabase.from('bookings').select('id, status, down_payment, booking_date, booking_time, created_at, services(base_price, labor_cost)'),
        supabase.from('pre_assessments').select('id, status'),
        supabase.from('orders').select('id, status, total_amount, created_at'),
        supabase.from('profiles').select('id').eq('role', 'customer'),
        supabase.from('profiles').select('id').eq('role', 'mechanic'),
        supabase.from('parts').select('id, name, stock_quantity, reorder_threshold, image_url').order('stock_quantity', { ascending: true }),
        supabase.from('services').select('id'),
        supabase
          .from('bookings')
          .select('*, services(name), profiles!bookings_customer_id_fkey(first_name, last_name)')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('orders')
          .select('*, profiles!orders_customer_id_fkey(first_name, last_name), order_items(id)')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const firstError = [bookings, assessments, orders, customers, mechanics, parts, services, recentBookingsResult, recentOrdersResult]
        .find((result) => result.error)?.error;

      if (firstError) throw firstError;

      const bookingRows = bookings.data || [];
      const assessmentRows = assessments.data || [];
      const orderRows = orders.data || [];
      const partRows = parts.data || [];

      const orderRevenue = orderRows
        .filter((order) => order.status === 'completed')
        .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);

      const bookingRevenue = bookingRows
        .filter((booking) => booking.status === 'completed')
        .reduce((sum, booking) => {
          const total =
            (Number(booking.services?.base_price) || 0) +
            (Number(booking.services?.labor_cost) || 0);

          return sum + total;
        }, 0);

      const outOfStock = partRows.filter((part) => Number(part.stock_quantity) <= 0);
      const lowStock = partRows.filter((part) => {
        const stock = Number(part.stock_quantity) || 0;
        const threshold = Number(part.reorder_threshold ?? 5);
        return stock > 0 && stock <= threshold;
      });

      setLowStockParts([...outOfStock, ...lowStock].slice(0, 6));

      setStats({
        totalBookings: bookingRows.length,
        pendingBookings: bookingRows.filter((booking) => booking.status === 'pending').length,
        pendingAssessments: assessmentRows.filter((assessment) => assessment.status === 'pending').length,
        pendingOrders: orderRows.filter((order) => order.status === 'pending').length,
        totalCustomers: customers.data?.length || 0,
        totalMechanics: mechanics.data?.length || 0,
        totalParts: partRows.length,
        totalServices: services.data?.length || 0,
        totalRevenue: orderRevenue + bookingRevenue,
        orderRevenue,
        bookingRevenue,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
      });

      setRecentBookings(recentBookingsResult.data || []);
      setRecentOrders(recentOrdersResult.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Failed to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }

  const hasStockWarnings = stats.lowStockCount > 0 || stats.outOfStockCount > 0;

  const quickLinks = [
    ['/admin/bookings', 'Manage Bookings', '📋'],
    ['/admin/orders', 'Manage Orders', '📦'],
    ['/admin/parts', 'Manage Parts', '⚙️'],
    ['/admin/services', 'Manage Services', '🛠️'],
    ['/admin/chatbot-templates', 'Chatbot Templates', '🤖'],
    ['/admin/assessments', 'Assessments', '📋'],
    ['/admin/chat', 'Customer Chats', '💬'],
    ['/admin/users', 'Manage Users', '👥'],
  ];

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
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
                  Admin Dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Overview of bookings, assessments, orders, users, inventory, services, and completed revenue.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchDashboardData(false)}
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

        {/* Stats grid */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Bookings" value={stats.totalBookings} icon="📅" tone="blue" to="/admin/bookings" />
          <StatCard label="Pending Bookings" value={stats.pendingBookings} icon="⏳" tone="yellow" to="/admin/bookings" />
          <StatCard label="Pending Assessments" value={stats.pendingAssessments} icon="📋" tone="accent" to="/admin/assessments" />
          <StatCard label="Pending Orders" value={stats.pendingOrders} icon="📦" tone="primary" to="/admin/orders" />
          <StatCard label="Customers" value={stats.totalCustomers} icon="👥" tone="green" to="/admin/users" />
          <StatCard label="Mechanics" value={stats.totalMechanics} icon="🔧" tone="primary" to="/admin/users" />
          <StatCard
            label="Low Stock Parts"
            value={stats.lowStockCount}
            icon="⚠️"
            tone={stats.lowStockCount > 0 ? 'yellow' : 'default'}
            to="/admin/parts"
          />
          <StatCard
            label="Out of Stock"
            value={stats.outOfStockCount}
            icon="🚫"
            tone={stats.outOfStockCount > 0 ? 'red' : 'default'}
            to="/admin/parts"
          />
        </div>

        {/* Revenue */}
        <section className="mb-8 overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-sm dark:border-primary-500/20 dark:bg-dark-800">
          <div className="relative p-6">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-primary-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                  Total Combined Revenue
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight text-gray-950 dark:text-white">
                  {formatPeso(stats.totalRevenue)}
                </p>
                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Based on orders and bookings marked as completed.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-gray-50 px-5 py-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Completed Orders
                  </p>
                  <p className="mt-1 text-xl font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(stats.orderRevenue)}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 px-5 py-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Completed Bookings
                  </p>
                  <p className="mt-1 text-xl font-black text-primary-600 dark:text-primary-400">
                    {formatPeso(stats.bookingRevenue)}
                  </p>
                </div>
              </div>

              <div className="hidden text-5xl lg:block">💰</div>
            </div>
          </div>
        </section>

        {/* Stock alert */}
        {hasStockWarnings && (
          <section className="mb-8 rounded-3xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm dark:border-yellow-500/25 dark:bg-yellow-500/10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-yellow-800 dark:text-yellow-200">
                  <span>⚠️</span> Stock Alert
                </h2>
                <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                  Parts that are low or out of stock need attention.
                </p>
              </div>

              <Link
                to="/admin/parts"
                className="rounded-2xl bg-primary-600 px-4 py-2 text-xs font-black text-white transition hover:bg-primary-700"
              >
                Manage Parts →
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {lowStockParts.map((part) => {
                const stock = Number(part.stock_quantity) || 0;
                const isOut = stock <= 0;

                return (
                  <div
                    key={part.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 ring-1 ring-yellow-100 dark:bg-dark-900/80 dark:ring-yellow-500/20"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700">
                        {part.image_url ? (
                          <img src={part.image_url} alt={part.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xl text-gray-400">⚙️</div>
                        )}
                      </div>
                      <p className="truncate text-sm font-black text-gray-950 dark:text-white">{part.name}</p>
                    </div>

                    <span
                      className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-black ring-1 ${
                        isOut
                          ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25'
                          : 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25'
                      }`}
                    >
                      {isOut ? 'Out of stock' : `${stock} left`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Quick links */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map(([to, label, icon]) => (
            <QuickLink key={to} to={to} label={label} icon={icon} />
          ))}
        </div>

        {/* Recent activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-gray-950 dark:text-white">
                  Recent Bookings
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Latest service booking requests.
                </p>
              </div>
              <Link to="/admin/bookings" className="text-xs font-black text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                View all →
              </Link>
            </div>

            {loading ? (
              <LoadingRows />
            ) : recentBookings.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No bookings yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentBookings.map((booking) => (
                  <article key={booking.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                          {booking.profiles?.first_name} {booking.profiles?.last_name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {booking.services?.name || 'Service'} · {formatDate(booking.booking_date)} at {formatTime(booking.booking_time)}
                        </p>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-gray-950 dark:text-white">
                  Recent Orders
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Latest parts order activity.
                </p>
              </div>
              <Link to="/admin/orders" className="text-xs font-black text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                View all →
              </Link>
            </div>

            {loading ? (
              <LoadingRows />
            ) : recentOrders.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No orders yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <article key={order.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                          {order.profiles?.first_name} {order.profiles?.last_name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {order.order_items?.length || 0} item{order.order_items?.length === 1 ? '' : 's'} · {formatPeso(order.total_amount)}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
