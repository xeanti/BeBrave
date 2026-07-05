import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const INITIAL_STATS = {
  todayBookings: 0,
  pendingBookings: 0,
  waitingWalkIns: 0,
  pendingOrders: 0,
  lowStockProducts: 0,
  todayRevenue: 0,
};

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
  processing:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  ready:
    'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
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

function cleanStatus(status) {
  return String(status || 'pending').toLowerCase();
}

function statusLabel(status) {
  return cleanStatus(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ status }) {
  const normalized = cleanStatus(status);

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${
        STATUS_STYLES[normalized] || STATUS_STYLES.pending
      }`}
    >
      {statusLabel(normalized)}
    </span>
  );
}

function getCustomerName(row) {
  const profile = row?.profiles || row?.customer || {};
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

  return name || profile.email || profile.phone || row?.customer_name || row?.walkin_customer_name || 'Customer';
}

function getServiceRows(booking) {
  const rows = Array.isArray(booking?.booking_services) ? booking.booking_services : [];

  if (rows.length > 0) {
    return rows.map((row) => ({
      ...row,
      service_name: row.service_name || row.services?.name || 'Service',
    }));
  }

  if (booking?.services_summary && String(booking.services_summary).includes(',')) {
    return String(booking.services_summary)
      .split(',')
      .map((name, index) => ({
        id: `summary-${index}`,
        service_name: name.trim(),
      }))
      .filter((row) => row.service_name);
  }

  if (booking?.services?.name || booking?.services_summary) {
    return [
      {
        id: booking?.service_id || 'single-service',
        service_name: booking.services_summary || booking.services?.name || 'Service',
      },
    ];
  }

  return [];
}

function getServiceNames(booking) {
  const rows = getServiceRows(booking);

  if (rows.length > 0) {
    return rows.map((row) => row.service_name).join(', ');
  }

  return 'Service';
}

function StatCard({ label, value, icon, to, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    red: 'text-red-600 dark:text-red-300',
    blue: 'text-blue-600 dark:text-blue-300',
  };

  const card = (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-200 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-2xl">{icon}</span>
        {to && <span className="text-xs font-black text-gray-400">View →</span>}
      </div>
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>
        {value}
      </p>
      <p className="mt-1 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
    </div>
  );

  return to ? <Link to={to}>{card}</Link> : card;
}

function QuickAction({ to, icon, title, subtitle }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 dark:hover:bg-primary-500/5"
    >
      <div className="mb-3 text-3xl">{icon}</div>
      <p className="text-sm font-black text-gray-950 dark:text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{subtitle}</p>
    </Link>
  );
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-950 dark:text-white">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>

      {children}
    </section>
  );
}

function LoadingBox() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900"
        />
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(INITIAL_STATS);
  const [todayBookings, setTodayBookings] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchDashboardData();

    const watchedTables = ['bookings', 'walkin_queue', 'orders', 'parts', 'services'];
    const channels = watchedTables.map((table) =>
      supabase
        .channel(`simple-admin-dashboard-${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => fetchDashboardData(false)
        )
        .subscribe()
    );

    const handleFocus = () => fetchDashboardData(false);

    window.addEventListener('focus', handleFocus);

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  async function safeQuery(label, query) {
    const result = await query;

    if (result.error) {
      console.warn(`${label}:`, result.error.message);
      return [];
    }

    return result.data || [];
  }

  async function fetchDashboardData(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    try {
      const today = todayISO();

      const [
        bookingRows,
        walkInRows,
        orderRows,
        productRows,
        todayBookingRows,
        recentOrderRows,
      ] = await Promise.all([
        safeQuery(
          'bookings',
          supabase
            .from('bookings')
            .select(
              `
              id,
              status,
              booking_date,
              booking_time,
              total_amount,
              service_total,
              services_summary,
              services(name, base_price, labor_cost),
              booking_services(id, service_name, services(name))
            `
            )
        ),
        safeQuery(
          'walkin_queue',
          supabase
            .from('walkin_queue')
            .select('id, status, queue_number, total_amount, created_at')
        ),
        safeQuery(
          'orders',
          supabase
            .from('orders')
            .select('id, status, total_amount, created_at')
        ),
        safeQuery(
          'parts',
          supabase
            .from('parts')
            .select('id, name, stock_quantity, reorder_threshold, image_url')
            .order('stock_quantity', { ascending: true })
        ),
        safeQuery(
          'today_bookings',
          supabase
            .from('bookings')
            .select(
              `
              id,
              status,
              booking_date,
              booking_time,
              services_summary,
              services(name),
              booking_services(id, service_name, services(name)),
              profiles!bookings_customer_id_fkey(first_name, last_name, phone, email)
            `
            )
            .eq('booking_date', today)
            .order('booking_time', { ascending: true })
            .limit(6)
        ),
        safeQuery(
          'recent_orders',
          supabase
            .from('orders')
            .select(
              `
              id,
              status,
              total_amount,
              created_at,
              profiles!orders_customer_id_fkey(first_name, last_name, phone, email),
              order_items(id)
            `
            )
            .order('created_at', { ascending: false })
            .limit(5)
        ),
      ]);

      const pendingBookingRows = bookingRows.filter(
        (booking) => cleanStatus(booking.status) === 'pending'
      );

      const waitingWalkInRows = walkInRows.filter((row) =>
        ['waiting', 'queued', 'pending'].includes(cleanStatus(row.status))
      );

      const pendingOrderRows = orderRows.filter((order) =>
        ['pending', 'processing'].includes(cleanStatus(order.status))
      );

      const lowStockRows = productRows.filter((part) => {
        const stock = Number(part.stock_quantity) || 0;
        const threshold = Number(part.reorder_threshold ?? 5) || 5;

        return stock > 0 && stock <= threshold;
      });

      const outOfStockRows = productRows.filter(
        (part) => Number(part.stock_quantity) <= 0
      );

      const completedTodayOrders = orderRows.filter((order) => {
        const date = String(order.created_at || '').slice(0, 10);
        return cleanStatus(order.status) === 'completed' && date === today;
      });

      const completedTodayBookings = bookingRows.filter((booking) => {
        return (
          cleanStatus(booking.status) === 'completed' &&
          String(booking.booking_date || '').slice(0, 10) === today
        );
      });

      const todayOrderRevenue = completedTodayOrders.reduce(
        (sum, order) => sum + (Number(order.total_amount) || 0),
        0
      );

      const todayBookingRevenue = completedTodayBookings.reduce((sum, booking) => {
        const savedTotal =
          Number(booking.total_amount) || Number(booking.service_total) || 0;

        if (savedTotal > 0) return sum + savedTotal;

        const services = booking.services || {};
        return (
          sum +
          (Number(services.base_price) || 0) +
          (Number(services.labor_cost) || 0)
        );
      }, 0);

      setStats({
        todayBookings: todayBookingRows.length,
        pendingBookings: pendingBookingRows.length,
        waitingWalkIns: waitingWalkInRows.length,
        pendingOrders: pendingOrderRows.length,
        lowStockProducts: lowStockRows.length + outOfStockRows.length,
        todayRevenue: todayOrderRevenue + todayBookingRevenue,
      });

      setTodayBookings(todayBookingRows);
      setRecentOrders(recentOrderRows);
      setLowStockProducts([...outOfStockRows, ...lowStockRows].slice(0, 5));
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Failed to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }

  const quickActions = useMemo(
    () => [
      {
        to: '/admin/bookings',
        icon: '📅',
        title: 'Bookings',
        subtitle: 'Approve and manage appointments.',
      },
      {
        to: '/admin/walk-in-queue',
        icon: '🎫',
        title: 'Walk-in Queue',
        subtitle: 'View and process walk-in customers.',
      },
      {
        to: '/admin/orders',
        icon: '📦',
        title: 'Orders',
        subtitle: 'Manage product orders.',
      },
      {
        to: '/admin/parts',
        icon: '🛒',
        title: 'Products',
        subtitle: 'Update products and stock.',
      },
      {
        to: '/admin/services',
        icon: '🛠️',
        title: 'Services',
        subtitle: 'Manage service list and pricing.',
      },
      {
        to: '/admin/chat',
        icon: '💬',
        title: 'Chats',
        subtitle: 'Reply to customer concerns.',
      },
    ],
    []
  );

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              MotoFix Admin
            </p>
            <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white">
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              Simple daily overview for bookings, walk-ins, orders, and stock.
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
            className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
          >
            Refresh
          </button>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatCard
            label="Today"
            value={stats.todayBookings}
            icon="📅"
            tone="blue"
            to="/admin/bookings"
          />
          <StatCard
            label="Pending Bookings"
            value={stats.pendingBookings}
            icon="⏳"
            tone="yellow"
            to="/admin/bookings"
          />
          <StatCard
            label="Walk-ins Waiting"
            value={stats.waitingWalkIns}
            icon="🎫"
            tone="primary"
            to="/admin/walk-in-queue"
          />
          <StatCard
            label="Pending Orders"
            value={stats.pendingOrders}
            icon="📦"
            tone="green"
            to="/admin/orders"
          />
          <StatCard
            label="Stock Alerts"
            value={stats.lowStockProducts}
            icon="⚠️"
            tone={stats.lowStockProducts > 0 ? 'red' : 'default'}
            to="/admin/parts"
          />
          <StatCard
            label="Today Revenue"
            value={formatPeso(stats.todayRevenue)}
            icon="💰"
            tone="green"
          />
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <QuickAction key={action.to} {...action} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <SectionCard
            title="Today’s Bookings"
            subtitle="Bookings scheduled for today."
            action={
              <Link
                to="/admin/bookings"
                className="text-xs font-black text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                View all →
              </Link>
            }
          >
            {loading ? (
              <LoadingBox />
            ) : todayBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  No bookings scheduled today.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    to={`/admin/bookings/${booking.id}`}
                    className="block rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-primary-200 dark:border-dark-700 dark:bg-dark-900/60 dark:hover:border-primary-500/30"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                          {formatTime(booking.booking_time)} · {getCustomerName(booking)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {getServiceNames(booking)}
                        </p>
                      </div>
                      <StatusBadge status={booking.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Stock Alerts"
            subtitle="Products that need restocking."
            action={
              <Link
                to="/admin/parts"
                className="text-xs font-black text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Manage →
              </Link>
            }
          >
            {loading ? (
              <LoadingBox />
            ) : lowStockProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  All products have enough stock.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.map((product) => {
                  const stock = Number(product.stock_quantity) || 0;
                  const isOut = stock <= 0;

                  return (
                    <Link
                      key={product.id}
                      to="/admin/parts"
                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-primary-200 dark:border-dark-700 dark:bg-dark-900/60 dark:hover:border-primary-500/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {isOut ? 'Out of stock' : `${stock} left`}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                          isOut
                            ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25'
                            : 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25'
                        }`}
                      >
                        {isOut ? 'Out' : 'Low'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="mt-6">
          <SectionCard
            title="Recent Orders"
            subtitle="Latest product order activity."
            action={
              <Link
                to="/admin/orders"
                className="text-xs font-black text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                View all →
              </Link>
            }
          >
            {loading ? (
              <LoadingBox />
            ) : recentOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  No recent orders.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    to="/admin/orders"
                    className="rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-primary-200 dark:border-dark-700 dark:bg-dark-900/60 dark:hover:border-primary-500/30"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                          {getCustomerName(order)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {order.order_items?.length || 0} item
                          {order.order_items?.length === 1 ? '' : 's'} ·{' '}
                          {formatPeso(order.total_amount)} · {formatDate(order.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
