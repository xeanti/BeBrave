import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { summarizePayments } from '../lib/payments';

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

const STATUS_CONFIG = {
  processing: {
    label: 'Processing',
    icon: '🔧',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  pending: {
    label: 'Pending',
    icon: '⏳',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  },
  preparing: {
    label: 'Preparing',
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
  completed: {
    label: 'Completed',
    icon: '✓',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
  cancelled: {
    label: 'Cancelled',
    icon: '✕',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || {
    label: status || 'Pending',
    icon: '•',
    classes:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${config.classes}`}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

function OrderSkeleton() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-5 flex justify-between gap-4">
        <div>
          <div className="mb-2 h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
          <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
        </div>
        <div className="h-7 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-dark-900" />
      </div>
      <div className="space-y-3">
        {[1, 2].map((item) => (
          <div key={item} className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
        ))}
      </div>
      <div className="mt-5 h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
    </div>
  );
}

function SummaryCard({ label, value, accent = false }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
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
  );
}


function normalizeOrderPaymentRecord(payment) {
  return {
    ...payment,
    amount: Number(payment.amount) || 0,
    payment_type: payment.payment_type || (payment.status === 'paid' ? 'full' : 'payment'),
    method: payment.method || payment.payment_method || payment.provider || 'payment',
    receipt_number: payment.receipt_number || payment.reference_number || payment.provider_payment_id || null,
    receipt_status: payment.receipt_status || payment.status || null,
    receipt_issued_at: payment.receipt_issued_at || payment.paid_at || payment.created_at || null,
    created_at: payment.created_at || payment.paid_at,
  };
}

function isConfirmedOrderPayment(payment) {
  const status = String(payment?.status || payment?.receipt_status || '').toLowerCase();

  if (['paid', 'completed', 'success', 'successful', 'verified'].includes(status)) {
    return true;
  }

  if (
    [
      'checkout_created',
      'pending_payment',
      'pending_verification',
      'unpaid',
      'failed',
      'expired',
      'cancelled',
      'canceled',
      'refunded',
    ].includes(status)
  ) {
    return false;
  }

  // Manual counter payments from the payments table may not have a status,
  // but they have a payment_type/method/receipt and no PayMongo checkout session id.
  return Boolean(
    payment?.payment_type &&
      payment?.amount &&
      !payment?.provider_checkout_session_id
  );
}

function getConfirmedOrderPaymentTotal(paymentList = []) {
  return (paymentList || [])
    .filter(isConfirmedOrderPayment)
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function getOrderPaidAmount(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const confirmedPaid = getConfirmedOrderPaymentTotal(paymentList);

  // Only count saved order amount when it is partial and not just checkout_created.
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  const partialStatuses = ['partial', 'partially_paid', 'downpayment_paid'];

  const trustedOrderPaid = partialStatuses.includes(paymentStatus)
    ? Number(order?.down_payment_amount) || 0
    : 0;

  return Math.min(Math.max(confirmedPaid, trustedOrderPaid), total);
}

function getOrderBalance(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  return Math.max(total - getOrderPaidAmount(order, paymentList), 0);
}

function getOrderPaymentSummary(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const totalPaid = getOrderPaidAmount(order, paymentList);
  const balance = getOrderBalance(order, paymentList);
  const isFullyPaid = total > 0 && totalPaid >= total && balance <= 0;
  const paymentPercent = total > 0 ? Math.min((totalPaid / total) * 100, 100) : 0;

  return {
    total,
    totalPaid,
    balance,
    isFullyPaid,
    paymentPercent,
  };
}

export default function MyOrders() {
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [filter, setFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!user?.id) return;

    fetchOrders();

    /*
      IMPORTANT:
      This listens for admin changes to this customer's orders.
      Supabase Realtime must be enabled for the "orders" table.
    */
    const ordersChannel = supabase
      .channel(`customer-orders-status-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user.id}`,
        },
        () => {
          fetchOrders(false);
        }
      )
      .subscribe();

    /*
      Payment changes may happen after staff/admin records payment.
      This keeps the payment summary updated too.
    */
    const paymentsChannel = supabase
      .channel(`customer-orders-payments-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => {
          fetchOrders(false);
        }
      )
      .subscribe();

    const orderPaymentsChannel = supabase
      .channel(`customer-online-order-payments-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_payments',
        },
        () => {
          fetchOrders(false);
        }
      )
      .subscribe();

    /*
      Fallback refresh:
      If Supabase Realtime is not enabled, this still refreshes when the user
      returns to the tab/window.
    */
    const handleFocus = () => fetchOrders(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchOrders(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(orderPaymentsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  async function fetchOrders(showLoader = true) {
    if (!user?.id) return;
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, parts(name, image_url, category))')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load orders.');
      setOrders([]);
      setPayments({});
      setLoading(false);
      return;
    }

    const orderData = data || [];
    setOrders(orderData);

    if (orderData.length > 0) {
      try {
        const orderIds = orderData.map((order) => order.id);

        const [manualPaymentsResult, onlinePaymentsResult] = await Promise.all([
          supabase
            .from('payments')
            .select(`
              id,
              order_id,
              amount,
              payment_type,
              method,
              created_at,
              receipt_number,
              receipt_status,
              receipt_issued_at,
              profiles!payments_processed_by_fkey(first_name, last_name)
            `)
            .in('order_id', orderIds)
            .order('created_at', { ascending: true }),
          supabase
            .from('order_payments')
            .select(`
              id,
              order_id,
              status,
              amount,
              reference_number,
              provider_checkout_session_id,
              provider_payment_id,
              payment_method,
              paid_at,
              created_at
            `)
            .in('order_id', orderIds)
            .order('created_at', { ascending: true }),
        ]);

        if (manualPaymentsResult.error) throw manualPaymentsResult.error;
        if (onlinePaymentsResult.error) throw onlinePaymentsResult.error;

        const grouped = {};

        [...(manualPaymentsResult.data || []), ...(onlinePaymentsResult.data || [])]
          .map(normalizeOrderPaymentRecord)
          .forEach((payment) => {
            if (!grouped[payment.order_id]) grouped[payment.order_id] = [];
            grouped[payment.order_id].push(payment);
          });

        setPayments(grouped);
      } catch (paymentError) {
        console.error(paymentError);
        setPayments({});
      }
    } else {
      setPayments({});
    }

    setLastUpdated(new Date());
    setLoading(false);
  }

  const counts = useMemo(() => {
    const result = {
      all: orders.length,
      pending: 0,
      processing: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };

    orders.forEach((order) => {
      if (result[order.status] !== undefined) {
        result[order.status] += 1;
      }
    });

    return result;
  }, [orders]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => filter === 'all' || order.status === filter),
    [orders, filter]
  );

  const totals = useMemo(() => {
    return filteredOrders.reduce(
      (acc, order) => {
        const orderPayments = payments[order.id] || [];
        const { total, totalPaid, balance } = getOrderPaymentSummary(order, orderPayments);

        acc.totalAmount += total;
        acc.totalPaid += totalPaid;
        acc.totalBalance += balance;

        return acc;
      },
      {
        totalAmount: 0,
        totalPaid: 0,
        totalBalance: 0,
      }
    );
  }, [filteredOrders, payments]);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Orders
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  My Orders
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Track your parts orders, payment history, balances, and order status updates.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchOrders(false)}
                  className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <Link
                  to="/shop"
                  className="inline-flex items-center justify-center rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.99]"
                >
                  Browse Parts
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Filtered Orders" value={filteredOrders.length} />
          <SummaryCard label="Total Paid" value={formatPeso(totals.totalPaid)} accent />
          <SummaryCard label="Remaining Balance" value={formatPeso(totals.totalBalance)} />
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-wrap gap-2">
            {['all', 'pending', 'processing', 'preparing', 'ready', 'completed', 'cancelled'].map((status) => {
              const active = filter === status;
              const label = status === 'all' ? 'All' : status;

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
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
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <OrderSkeleton key={item} />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              📦
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No orders found
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              {filter === 'all'
                ? 'You have not submitted any parts orders yet.'
                : `You do not have ${filter} orders yet.`}
            </p>
            <Link
              to="/shop"
              className="inline-flex rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
            >
              Browse Parts →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const orderPayments = payments[order.id] || [];
              const { total, totalPaid, balance, isFullyPaid, paymentPercent } = getOrderPaymentSummary(order, orderPayments);

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:border-primary-100 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30"
                >
                  <div className="p-5 sm:p-6">
                    {/* Top info */}
                    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={order.status} />
                          {isFullyPaid && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25">
                              ✓ Fully Paid
                            </span>
                          )}
                        </div>

                        <h2 className="text-lg font-black text-gray-950 dark:text-white">
                          Order #{order.id?.slice(0, 8).toUpperCase()}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Ordered on {formatDateTime(order.created_at)}
                        </p>
                        
                        <div className="mt-3">
                          <Link
                            to={`/my-orders/${order.id}`}
                            className="inline-block rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-center text-xs font-black text-gray-700 transition hover:bg-gray-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-700"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Total
                        </p>
                        <p className="text-xl font-black text-gray-950 dark:text-white">
                          {formatPeso(total)}
                        </p>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="mb-5 space-y-3">
                      {order.order_items?.length > 0 ? (
                        order.order_items.map((item) => {
                          const unitPrice = Number(item.unit_price) || 0;
                          const subtotal = Number(item.subtotal) || unitPrice * item.quantity;

                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/60"
                            >
                              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                                {item.parts?.image_url ? (
                                  <img
                                    src={item.parts.image_url}
                                    alt={item.parts.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="grid h-full w-full place-items-center text-xs font-bold text-gray-400">
                                    No img
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                                  {item.parts?.name || 'Part'}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {item.parts?.category || 'General'} · {formatPeso(unitPrice)} × {item.quantity}
                                </p>
                              </div>

                              <p className="shrink-0 text-sm font-black text-accent-600 dark:text-accent-400">
                                {formatPeso(subtotal)}
                              </p>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                          No order items found.
                        </div>
                      )}
                    </div>

                    {/* Payment summary */}
                    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-gray-950 dark:text-white">
                            Payment Summary
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {orderPayments.length} payment record{orderPayments.length === 1 ? '' : 's'}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Balance
                          </p>
                          <p
                            className={`text-lg font-black ${
                              isFullyPaid
                                ? 'text-green-600 dark:text-green-300'
                                : 'text-yellow-600 dark:text-yellow-300'
                            }`}
                          >
                            {formatPeso(balance)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                        <div
                          className="h-full rounded-full bg-primary-600 transition-all"
                          style={{ width: `${paymentPercent}%` }}
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Total
                          </p>
                          <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                            {formatPeso(total)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Paid
                          </p>
                          <p className="mt-1 text-sm font-black text-green-600 dark:text-green-300">
                            {formatPeso(totalPaid)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Payment Status
                          </p>
                          <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                            {isFullyPaid ? 'Fully paid' : 'Partial / unpaid'}
                          </p>
                        </div>
                      </div>

                      {/* Payment history */}
                      {orderPayments.length > 0 && (
                        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-dark-700">
                          <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Payment History
                          </p>

                          <div className="space-y-2">
                            {orderPayments.map((payment) => (
                              <div
                                key={payment.id}
                                className="rounded-2xl bg-white px-3 py-3 text-xs ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700"
                              >
                                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-black text-gray-950 dark:text-white">
                                      {formatPeso(payment.amount)}
                                    </p>
                                    <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                                      {formatDate(payment.created_at)} ·{' '}
                                      <span className="capitalize">
                                        {String(payment.payment_type || '').replace('_', ' ')}
                                      </span>
                                      {payment.method && (
                                        <>
                                          {' '}·{' '}
                                          <span className="uppercase">{payment.method}</span>
                                        </>
                                      )}
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                      Receipt No.
                                    </p>
                                    <p className="font-black text-primary-700 dark:text-primary-300">
                                      {payment.receipt_number || 'Pending'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-dark-700">
                                  <p className="text-gray-500 dark:text-gray-400">
                                    Issued:{' '}
                                    <span className="font-bold text-gray-700 dark:text-gray-300">
                                      {formatDateTime(payment.receipt_issued_at || payment.created_at)}
                                    </span>
                                  </p>

                                  {payment.profiles && (
                                    <p className="text-right text-gray-500 dark:text-gray-400">
                                      Processed by{' '}
                                      <span className="font-bold text-gray-700 dark:text-gray-300">
                                        {payment.profiles.first_name} {payment.profiles.last_name}
                                      </span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}