import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLastDays(count = 7) {
  return Array.from({ length: count })
    .map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (count - 1 - index));
      return getLocalDateString(date);
    });
}

function getPaymentDate(payment) {
  return String(
    payment?.paid_at ||
      payment?.receipt_issued_at ||
      payment?.created_at ||
      new Date().toISOString()
  ).slice(0, 10);
}

function getPaymentAmount(payment) {
  return Number(
    payment?.amount ??
      payment?.amount_paid ??
      payment?.paid_amount ??
      payment?.total_paid ??
      0
  );
}

function isPaidPayment(payment) {
  const status = String(
    payment?.status ||
      payment?.payment_status ||
      payment?.receipt_status ||
      ''
  ).toLowerCase();

  if (!status) return true;

  return ['paid', 'succeeded', 'success', 'completed', 'confirmed', 'issued'].includes(status);
}

function normalizeRole(role) {
  if (!role) return 'unknown';

  return String(role).toLowerCase();
}

function roleLabel(role) {
  return String(role || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatCard({ label, value, icon, tone = 'default', subtext }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    red: 'text-red-600 dark:text-red-300',
    blue: 'text-blue-600 dark:text-blue-300',
    purple: 'text-purple-600 dark:text-purple-300',
    accent: 'text-accent-600 dark:text-accent-400',
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

      {subtext && (
        <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          {subtext}
        </p>
      )}
    </div>
  );
}

function Section({ title, subtitle, children, action }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
            {title}
          </p>
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

function BarChart({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      <div className="flex h-52 items-end gap-3 rounded-3xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
        {data.map((item) => {
          const height = Math.max(8, (item.value / maxValue) * 100);

          return (
            <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
              <div className="text-center text-[11px] font-black text-gray-500 dark:text-gray-400">
                {formatPeso(item.value)}
              </div>
              <div className="flex flex-1 items-end">
                <div
                  className="w-full rounded-t-2xl bg-primary-600 transition-all dark:bg-primary-500"
                  style={{ height: `${height}%` }}
                  title={`${item.label}: ${formatPeso(item.value)}`}
                />
              </div>
              <div className="truncate text-center text-[11px] font-black text-gray-500 dark:text-gray-400">
                {item.shortLabel}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
        Simple 7-day sales graph based on paid booking, order, and walk-in payments.
      </p>
    </div>
  );
}

function RoleDistribution({ rows }) {
  const maxValue = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.role} className="rounded-2xl bg-gray-50 p-3 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
              {roleLabel(row.role)}
            </span>
            <span className="text-sm font-black text-gray-950 dark:text-white">
              {row.count}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
            <div
              className="h-full rounded-full bg-accent-500"
              style={{ width: `${Math.max(6, (row.count / maxValue) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SuperAdminDashboard() {
  const { profile } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [walkins, setWalkins] = useState([]);
  const [parts, setParts] = useState([]);

  const [payments, setPayments] = useState([]);
  const [bookingPayments, setBookingPayments] = useState([]);
  const [walkinPayments, setWalkinPayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchDashboard();

    const tables = [
      'profiles',
      'bookings',
      'orders',
      'walkin_queue',
      'payments',
      'booking_payments',
      'walkin_queue_payments',
      'parts',
    ];

    const channel = supabase.channel('super-admin-dashboard-live');

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => fetchDashboard(false)
      );
    });

    channel.subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchDashboard(showLoader = true) {
    if (showLoader) setLoading(true);
    setFetchError('');

    try {
      const [
        profilesResult,
        bookingsResult,
        ordersResult,
        walkinsResult,
        paymentsResult,
        bookingPaymentsResult,
        walkinPaymentsResult,
        partsResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, role, is_active, created_at'),

        supabase
          .from('bookings')
          .select('id, status, payment_status, total_amount, service_total, reservation_fee, booking_date, created_at'),

        supabase
          .from('orders')
          .select('id, status, payment_status, total_amount, created_at'),

        supabase
          .from('walkin_queue')
          .select('id, status, payment_status, total_amount, queue_date, created_at'),

        supabase
          .from('payments')
          .select('id, amount, booking_id, order_id, payment_type, status, receipt_status, created_at, paid_at, receipt_issued_at'),

        supabase
          .from('booking_payments')
          .select('id, booking_id, amount, status, payment_method, created_at, paid_at'),

        supabase
          .from('walkin_queue_payments')
          .select('id, walkin_queue_id, amount, method, created_at, receipt_issued_at'),

        supabase
          .from('parts')
          .select('id, stock_quantity, reorder_threshold, is_active'),
      ]);

      const firstError = [
        profilesResult,
        bookingsResult,
        ordersResult,
        walkinsResult,
        paymentsResult,
        bookingPaymentsResult,
        walkinPaymentsResult,
        partsResult,
      ].find((result) => result.error)?.error;

      if (firstError) throw firstError;

      setProfiles(profilesResult.data || []);
      setBookings(bookingsResult.data || []);
      setOrders(ordersResult.data || []);
      setWalkins(walkinsResult.data || []);
      setPayments(paymentsResult.data || []);
      setBookingPayments(bookingPaymentsResult.data || []);
      setWalkinPayments(walkinPaymentsResult.data || []);
      setParts(partsResult.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Failed to load super-admin dashboard.');
    } finally {
      setLoading(false);
    }
  }

  const paidPaymentRows = useMemo(() => {
    const paidBookingPaymentIds = new Set(
      bookingPayments
        .filter(isPaidPayment)
        .map((payment) => payment.booking_id)
        .filter(Boolean)
    );

    const normalizedBookingPayments = bookingPayments
      .filter(isPaidPayment)
      .map((payment) => ({
        ...payment,
        source: 'booking_reservation',
        amount: getPaymentAmount(payment),
        paid_date: getPaymentDate(payment),
      }));

    const normalizedGeneralPayments = payments
      .filter(isPaidPayment)
      .filter((payment) => {
        if (!payment.booking_id) return true;

        const type = String(payment.payment_type || '').toLowerCase();

        return !paidBookingPaymentIds.has(payment.booking_id) || type !== 'reservation_fee';
      })
      .map((payment) => ({
        ...payment,
        source: payment.order_id ? 'orders' : payment.booking_id ? 'bookings' : 'other',
        amount: getPaymentAmount(payment),
        paid_date: getPaymentDate(payment),
      }));

    const normalizedWalkinPayments = walkinPayments
      .filter(isPaidPayment)
      .map((payment) => ({
        ...payment,
        source: 'walkins',
        amount: getPaymentAmount(payment),
        paid_date: getPaymentDate(payment),
      }));

    return [
      ...normalizedBookingPayments,
      ...normalizedGeneralPayments,
      ...normalizedWalkinPayments,
    ];
  }, [payments, bookingPayments, walkinPayments]);

  const stats = useMemo(() => {
    const today = getLocalDateString();
    const activeProfiles = profiles.filter((row) => row.is_active !== false);
    const totalRevenue = paidPaymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const todayRevenue = paidPaymentRows
      .filter((row) => row.paid_date === today)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const pendingPayments =
      bookings.filter((row) =>
        ['unpaid', 'checkout_created', 'pending_payment', 'pending_verification', null, undefined, ''].includes(row.payment_status)
      ).length +
      orders.filter((row) =>
        ['unpaid', 'pending', 'pending_payment', null, undefined, ''].includes(row.payment_status)
      ).length +
      walkins.filter((row) =>
        ['unpaid', 'pending', 'pending_payment', null, undefined, ''].includes(row.payment_status)
      ).length;

    const lowStock = parts.filter((part) => {
      if (part.is_active === false) return false;
      return Number(part.stock_quantity) <= Number(part.reorder_threshold ?? 5);
    }).length;

    return {
      activeUsers: activeProfiles.length,
      totalUsers: profiles.length,
      totalRevenue,
      todayRevenue,
      pendingPayments,
      lowStock,
      totalBookings: bookings.length,
      totalOrders: orders.length,
      totalWalkins: walkins.length,
    };
  }, [profiles, bookings, orders, walkins, parts, paidPaymentRows]);

  const salesSeries = useMemo(() => {
    const days = getLastDays(7);
    const totals = days.reduce((acc, day) => ({ ...acc, [day]: 0 }), {});

    paidPaymentRows.forEach((payment) => {
      if (totals[payment.paid_date] !== undefined) {
        totals[payment.paid_date] += Number(payment.amount) || 0;
      }
    });

    return days.map((day) => {
      const [year, month, date] = day.split('-').map(Number);
      const label = new Date(year, month - 1, date).toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
      });

      return {
        label: day,
        shortLabel: label,
        value: totals[day],
      };
    });
  }, [paidPaymentRows]);

  const roleRows = useMemo(() => {
    const counts = profiles.reduce((acc, row) => {
      const role = normalizeRole(row.role);
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    return ['customer', 'mechanic', 'staff', 'admin', 'super_admin']
      .map((role) => ({
        role,
        count: counts[role] || 0,
      }))
      .filter((row) => row.count > 0 || row.role === 'super_admin');
  }, [profiles]);

  const revenueBreakdown = useMemo(() => {
    const breakdown = paidPaymentRows.reduce(
      (acc, row) => {
        acc[row.source] = (acc[row.source] || 0) + Number(row.amount || 0);
        return acc;
      },
      {
        booking_reservation: 0,
        bookings: 0,
        orders: 0,
        walkins: 0,
        other: 0,
      }
    );

    return [
      { label: 'Booking Reservations', value: breakdown.booking_reservation },
      { label: 'Booking Service Payments', value: breakdown.bookings },
      { label: 'Product Orders', value: breakdown.orders },
      { label: 'Walk-ins', value: breakdown.walkins },
    ];
  }, [paidPaymentRows]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 dark:bg-dark-900 sm:px-6 lg:py-10">
        <div className="mx-auto max-w-7xl space-y-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
            />
          ))}
        </div>
      </div>
    );
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
                  Super Admin Control Center
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Welcome, {profile?.first_name || 'Super Admin'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  System-level dashboard for account control, sales monitoring, reports, and settings.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {lastUpdated.toLocaleString('en-PH')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchDashboard(false)}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
                >
                  Refresh
                </button>

                <Link
                  to="/admin/reports"
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
                >
                  Open Reports
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

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard
            label="Total Revenue"
            value={formatPeso(stats.totalRevenue)}
            icon="💰"
            tone="accent"
            subtext="All paid records"
          />
          <StatCard
            label="Today Sales"
            value={formatPeso(stats.todayRevenue)}
            icon="📈"
            tone="green"
            subtext={getLocalDateString()}
          />
          <StatCard
            label="Users"
            value={stats.totalUsers}
            icon="👥"
            tone="primary"
            subtext={`${stats.activeUsers} active`}
          />
          <StatCard
            label="Bookings"
            value={stats.totalBookings}
            icon="📅"
            tone="blue"
            subtext="Scheduled records"
          />
          <StatCard
            label="Walk-ins"
            value={stats.totalWalkins}
            icon="🎫"
            tone="purple"
            subtext="Queue records"
          />
          <StatCard
            label="Needs Attention"
            value={stats.pendingPayments + stats.lowStock}
            icon="⚠️"
            tone={stats.pendingPayments + stats.lowStock > 0 ? 'yellow' : 'default'}
            subtext={`${stats.pendingPayments} payments · ${stats.lowStock} low stock`}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <Section
            title="Sales Graph"
            subtitle="Simple daily sales graph for the last 7 days."
            action={
              <Link
                to="/admin/reports"
                className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
              >
                View full report
              </Link>
            }
          >
            <BarChart data={salesSeries} />
          </Section>

          <Section
            title="User Roles"
            subtitle="Account distribution by role."
            action={
              <Link
                to="/admin/users"
                className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
              >
                Manage users
              </Link>
            }
          >
            <RoleDistribution rows={roleRows} />
          </Section>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Section title="Revenue Breakdown" subtitle="Where paid revenue came from.">
            <div className="grid gap-3 sm:grid-cols-2">
              {revenueBreakdown.map((row) => (
                <div
                  key={row.label}
                  className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700"
                >
                  <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {row.label}
                  </p>
                  <p className="mt-2 text-xl font-black text-gray-950 dark:text-white">
                    {formatPeso(row.value)}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Super Admin Shortcuts" subtitle="Only system-level pages are shown in the Super Admin sidebar.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Link
                to="/admin/users"
                className="rounded-2xl bg-primary-50 p-4 text-sm font-black text-primary-700 ring-1 ring-primary-100 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25"
              >
                👥 Users
              </Link>
              <Link
                to="/admin/reports"
                className="rounded-2xl bg-accent-500/10 p-4 text-sm font-black text-accent-600 ring-1 ring-accent-500/20 transition hover:bg-accent-500/20 dark:text-accent-300"
              >
                📈 Reports
              </Link>
              <Link
                to="/admin/settings"
                className="rounded-2xl bg-gray-50 p-4 text-sm font-black text-gray-700 ring-1 ring-gray-100 transition hover:bg-gray-100 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700"
              >
                ⚙️ Settings
              </Link>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
