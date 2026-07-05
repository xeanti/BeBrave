// Place this file at:
// motofix-web/src/pages/admin/AdminWalkInQueue.jsx

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const STATUS_OPTIONS = [
  'queued',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
  'ready_for_payment',
  'completed',
  'cancelled',
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  const [year, month, day] = String(value).split('-').map(Number);

  if (!year || !month || !day) return String(value);

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
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

function formatStatus(value) {
  return String(value || 'queued')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCustomerName(queue) {
  if (queue?.guest_name) return queue.guest_name;
  if (queue?.walkin_customer_name) return queue.walkin_customer_name;

  const profile = queue?.profiles || queue?.customer || queue;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  if (name) return name;
  if (queue?.guest_phone) return `Guest ${queue.guest_phone}`;
  if (queue?.walkin_customer_phone) return `Guest ${queue.walkin_customer_phone}`;
  if (profile?.phone) return `Customer ${profile.phone}`;
  if (profile?.email) return profile.email;

  return 'Guest Customer';
}

function getCustomerContact(queue) {
  const profile = queue?.profiles || queue?.customer || queue;

  return (
    queue?.guest_phone ||
    queue?.walkin_customer_phone ||
    profile?.phone ||
    profile?.email ||
    'Guest walk-in'
  );
}

function getMechanicName(queue) {
  const mechanic = queue?.mechanic;
  const name = `${mechanic?.first_name || ''} ${mechanic?.last_name || ''}`.trim();

  return name || 'Unassigned';
}

function statusStyle(status) {
  const value = String(status || 'queued');

  if (value === 'completed') {
    return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25';
  }

  if (value === 'cancelled') {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25';
  }

  if (value === 'ready_for_payment') {
    return 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25';
  }

  if (['in_progress', 'inspection', 'repairing', 'quality_check'].includes(value)) {
    return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25';
  }

  return 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25';
}

function paymentStyle(status) {
  const value = String(status || 'unpaid');

  if (value === 'paid') {
    return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25';
  }

  if (value === 'partially_paid') {
    return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25';
  }

  return 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25';
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
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
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>{value}</p>
    </div>
  );
}

function getServiceLabel(queue) {
  const services = Array.isArray(queue.services) ? queue.services : [];

  if (!services.length) return 'No services';

  return services
    .map((service) => service.name || 'Service')
    .join(', ');
}

function getProductLabel(queue) {
  const products = Array.isArray(queue.products) ? queue.products : [];

  if (!products.length) return 'No products';

  return products
    .map((product) => `${product.name || 'Product'} × ${product.quantity || 1}`)
    .join(', ');
}

export default function AdminWalkInQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    fetchWalkInQueue();

    const tables = ['walkin_queue', 'walkin_queue_payments'];
    const channels = tables.map((table) =>
      supabase
        .channel(`admin-walkin-queue-${table}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          () => fetchWalkInQueue(false)
        )
        .subscribe()
    );

    const handleFocus = () => fetchWalkInQueue(false);
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchWalkInQueue(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, paymentFilter, pageSize]);

  async function fetchWalkInQueue(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('walkin_queue')
      .select(
        `
        *,
        profiles!walkin_queue_customer_id_fkey(first_name, last_name, phone, email),
        mechanic:profiles!walkin_queue_mechanic_id_fkey(first_name, last_name),
        walkin_queue_payments(id, amount, payment_type, method, reference_number, receipt_number, receipt_issued_at, created_at)
      `
      )
      .order('queue_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load walk-in queue. Run the walkin_queue SQL first.');
      setQueue([]);
    } else {
      setQueue(data || []);
      setLastUpdated(new Date());
    }

    setLoading(false);
  }

  const counts = useMemo(() => {
    const result = {
      all: queue.length,
      queued: 0,
      in_progress: 0,
      inspection: 0,
      repairing: 0,
      quality_check: 0,
      ready_for_payment: 0,
      completed: 0,
      cancelled: 0,
    };

    queue.forEach((item) => {
      const key = String(item.status || 'queued');

      if (result[key] !== undefined) result[key] += 1;
    });

    return result;
  }, [queue]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return queue.filter((item) => {
      const status = String(item.status || 'queued');
      const paymentStatus = String(item.payment_status || 'unpaid');

      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesPayment = paymentFilter === 'all' || paymentStatus === paymentFilter;

      const haystack = [
        item.id,
        item.queue_number,
        getCustomerName(item),
        getCustomerContact(item),
        item.motorcycle_model,
        getMechanicName(item),
        getServiceLabel(item),
        getProductLabel(item),
        item.status,
        item.payment_status,
        item.payment_method,
        item.payment_reference,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);

      return matchesStatus && matchesPayment && matchesSearch;
    });
  }, [queue, search, statusFilter, paymentFilter]);

  const stats = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        const amount = Number(item.total_amount) || 0;

        acc.total += amount;

        if (String(item.payment_status) === 'paid') {
          acc.paid += amount;
        } else {
          acc.balance += amount;
        }

        return acc;
      },
      { total: 0, paid: 0, balance: 0 }
    );
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedQueue = filtered.slice(startIndex, endIndex);

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
                  Walk-in Queue
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Walk-ins are not scheduled bookings. They are stored in the walkin_queue table and processed using queue status.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchWalkInQueue(false)}
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

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Filtered Queue" value={filtered.length} icon="🎫" tone="primary" />
          <StatCard label="Total Amount" value={formatPeso(stats.total)} icon="💰" tone="accent" />
          <StatCard label="Paid" value={formatPeso(stats.paid)} icon="✅" tone="green" />
          <StatCard label="Unpaid Balance" value={formatPeso(stats.balance)} icon="⚠️" tone={stats.balance > 0 ? 'yellow' : 'default'} />
        </div>

        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {['all', ...STATUS_OPTIONS].map((status) => {
                const active = statusFilter === status;
                const label = status === 'all' ? 'All' : formatStatus(status);

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
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

            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search queue number, customer, phone, motorcycle, mechanic, service, or product..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
              />

              <select
                value={paymentFilter}
                onChange={(event) => setPaymentFilter(event.target.value)}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              >
                <option value="all">All Payments</option>
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Paid</option>
              </select>

              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-36 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              🎫
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No walk-in queue records found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Walk-ins created by staff will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2 text-sm font-bold text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {startIndex + 1}–{Math.min(endIndex, filtered.length)} of {filtered.length} walk-ins
              </p>
              <p>
                Page {safePage} of {totalPages}
              </p>
            </div>

            <div className="space-y-3">
              {paginatedQueue.map((item) => {
                const payments = item.walkin_queue_payments || [];

                return (
                  <article
                    key={item.id}
                    className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/50"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${statusStyle(item.status)}`}>
                            {formatStatus(item.status)}
                          </span>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${paymentStyle(item.payment_status)}`}>
                            {formatStatus(item.payment_status)}
                          </span>
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                            {item.queue_number}
                          </span>
                        </div>

                        <h2 className="text-lg font-black text-gray-950 dark:text-white">
                          {getCustomerName(item)}
                        </h2>

                        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                          👤 {getCustomerContact(item)} · 🏍️ {item.motorcycle_model || 'No motorcycle saved'}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          Queue date: {formatDate(item.queue_date)} · Created: {formatDateTime(item.created_at)}
                        </p>

                        <div className="mt-3 grid gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 lg:grid-cols-3">
                          <div className="rounded-2xl bg-gray-50 p-3 dark:bg-dark-900">
                            <p className="text-[10px] font-black uppercase text-gray-400">Mechanic</p>
                            <p className="mt-1 font-black">{getMechanicName(item)}</p>
                          </div>

                          <div className="rounded-2xl bg-gray-50 p-3 dark:bg-dark-900">
                            <p className="text-[10px] font-black uppercase text-gray-400">Services</p>
                            <p className="mt-1 font-black">{getServiceLabel(item)}</p>
                          </div>

                          <div className="rounded-2xl bg-gray-50 p-3 dark:bg-dark-900">
                            <p className="text-[10px] font-black uppercase text-gray-400">Products</p>
                            <p className="mt-1 font-black">{getProductLabel(item)}</p>
                          </div>
                        </div>

                        {payments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {payments.slice(0, 3).map((payment) => (
                              <span
                                key={payment.id}
                                className="rounded-full bg-primary-50 px-3 py-1 font-mono text-[11px] font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25"
                              >
                                {payment.receipt_number || payment.reference_number || 'Receipt'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid min-w-[210px] gap-2 rounded-3xl bg-gray-50 p-4 dark:bg-dark-900">
                        <div className="flex justify-between gap-3 text-xs font-bold">
                          <span className="text-gray-500 dark:text-gray-400">Services</span>
                          <span>{formatPeso(item.service_total)}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-xs font-bold">
                          <span className="text-gray-500 dark:text-gray-400">Products</span>
                          <span>{formatPeso(item.product_total)}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-xs font-bold">
                          <span className="text-gray-500 dark:text-gray-400">Discount</span>
                          <span>- {formatPeso(item.discount_amount)}</span>
                        </div>
                        <div className="border-t border-gray-200 pt-2 dark:border-dark-700">
                          <div className="flex justify-between gap-3">
                            <span className="text-xs font-black text-gray-500 dark:text-gray-400">Total</span>
                            <span className="text-xl font-black text-primary-600 dark:text-primary-400">
                              {formatPeso(item.total_amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                disabled={safePage <= 1}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
              >
                Previous
              </button>

              <span className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-black text-gray-700 dark:bg-dark-800 dark:text-gray-300">
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                disabled={safePage >= totalPages}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
