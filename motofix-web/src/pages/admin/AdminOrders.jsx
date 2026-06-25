import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { summarizePayments } from '../../lib/payments';
import { notifyUser } from '../../lib/notifications';
import { generateOrSyncOrderInvoice } from '../../lib/invoices';
import InvoiceReceiptModal from '../../components/InvoiceReceiptModal';
const STATUS_OPTIONS = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
const PAYMENT_TYPES = ['down_payment', 'balance', 'full', 'refund'];
const PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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


function formatPaymentType(type) {
  return String(type || 'payment').replace('_', ' ');
}

function getReceiptNumber(payment) {
  return payment?.receipt_number || payment?.receiptNumber || `PAY-${payment?.id?.slice(0, 8)?.toUpperCase() || 'PENDING'}`;
}

function getLatestReceipt(payments = []) {
  return [...payments].reverse().find((payment) => payment.receipt_number);
}

function getCustomerName(order) {
  const name = `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim();

  return name || 'Unknown Customer';
}

const STATUS_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  preparing:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  ready:
    'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
};

const ACTION_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25 dark:hover:bg-yellow-500/20',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25 dark:hover:bg-green-500/20',
  preparing:
    'bg-purple-50 text-purple-700 ring-purple-200 hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25 dark:hover:bg-purple-500/20',
  ready:
    'bg-primary-50 text-primary-700 ring-primary-100 hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25 dark:hover:bg-primary-500/20',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 hover:bg-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25 dark:hover:bg-gray-500/20',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {String(status || 'pending').replace('_', ' ')}
    </span>
  );
}

function PaymentBadge({ isFullyPaid, balance }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ring-1 ${
        isFullyPaid
          ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
          : 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25'
      }`}
    >
      {isFullyPaid ? '✓ Fully Paid' : `${formatPeso(balance)} balance due`}
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

function OrderSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-80 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function AdminOrders() {
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [payments, setPayments] = useState({});
  const [paymentForm, setPaymentForm] = useState({});
  const [savingPayment, setSavingPayment] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(null);

  const [paymentToast, setPaymentToast] = useState(null);
  const [expandedPayment, setExpandedPayment] = useState(null);
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [invoiceModal, setInvoiceModal] = useState({
    open: false,
    invoice: null,
    order: null,
    payments: [],
  });
  const [receiptModal, setReceiptModal] = useState({
    open: false,
    receipt: null,
    order: null,
  });
  const [generatingInvoice, setGeneratingInvoice] = useState(null);

  useEffect(() => {
    fetchOrders();

    /*
      Realtime refresh for admin order management.
      Enable Realtime in Supabase for orders, payments, profiles, order_items, and parts.
    */
    const ordersChannel = supabase
      .channel('admin-orders-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => fetchOrders(false)
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel('admin-orders-payments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => fetchOrders(false)
      )
      .subscribe();

    const orderItemsChannel = supabase
      .channel('admin-orders-order-items')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        () => fetchOrders(false)
      )
      .subscribe();

    const partsChannel = supabase
      .channel('admin-orders-parts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parts',
        },
        () => fetchOrders(false)
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('admin-orders-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => fetchOrders(false)
      )
      .subscribe();

    const handleFocus = () => fetchOrders(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchOrders(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(orderItemsChannel);
      supabase.removeChannel(partsChannel);
      supabase.removeChannel(profilesChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function fetchOrders(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        profiles!orders_customer_id_fkey(first_name, last_name, email, phone),
        order_items(*, parts(name, image_url, category))
      `)
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load orders.');
      setOrders([]);
      setPayments({});
      setLoading(false);
      return;
    }

    const orderRows = data || [];
    setOrders(orderRows);

    if (orderRows.length > 0) {
      try {
        const { data: allPayments, error: paymentsError } = await supabase
          .from('payments')
          .select(`
            *,
            profiles!payments_processed_by_fkey(first_name, last_name, email, role)
          `)
          .in(
            'order_id',
            orderRows.map((order) => order.id)
          )
          .order('created_at', { ascending: true });

        if (paymentsError) throw paymentsError;

        const grouped = {};

        (allPayments || []).forEach((payment) => {
          const targetId = payment.order_id || payment.booking_id;

          if (targetId) {
            if (!grouped[targetId]) grouped[targetId] = [];
            grouped[targetId].push(payment);
          }
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

  async function insertAuditLog(action, entityId, details = {}) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'orders',
      entity_id: entityId,
      performed_by: user.id,
      details,
    });
  }

  async function handleViewInvoice(order) {
    if (!order?.id) return;

    setGeneratingInvoice(order.id);
    setFetchError('');

    try {
      const invoice = await generateOrSyncOrderInvoice({
        orderId: order.id,
        issuedBy: user?.id || null,
      });

      await insertAuditLog('GENERATE_ORDER_INVOICE', order.id, {
        invoice_number: invoice?.invoice_number || null,
      });

      setInvoiceModal({
        open: true,
        invoice,
        order,
        payments: payments[order.id] || [],
      });

      await fetchOrders(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to generate invoice.');
    } finally {
      setGeneratingInvoice(null);
    }
  }

  function handleViewReceipt(order, payment) {
    if (!order || !payment) return;

    setReceiptModal({
      open: true,
      receipt: payment,
      order,
    });
  }

  async function updateStatus(id, status) {
  setUpdatingStatus(`${id}-${status}`);
  setFetchError('');

  try {
    const order = orders.find((item) => item.id === id);
const { error } = await supabase
    
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    await insertAuditLog('UPDATE_ORDER_STATUS', id, {
      new_status: status,
    });

    if (order?.customer_id) {
      let message = `Your order status is now ${status.replace('_', ' ')}.`;

      if (status === 'confirmed') {
        message = 'Your parts order has been confirmed.';
      }

      if (status === 'preparing') {
        message = 'Your parts order is now being prepared.';
      }

      if (status === 'ready') {
        message = 'Your parts order is ready for pickup.';
      }

      if (status === 'completed') {
        message = 'Your parts order has been completed. Thank you for using MotoFix.';
      }

      if (status === 'cancelled') {
        message = 'Your parts order has been cancelled.';
      }

      await notifyUser({
        userId: order.customer_id,
        title: 'Order Status Updated',
        message,
        type: 'order',
        relatedTable: 'orders',
        relatedId: id,
      });
    }

    await fetchOrders(false);
  } catch (err) {
    setFetchError(err.message || 'Failed to update order status.');
  } finally {
    setUpdatingStatus(null);
  }
}

  async function submitPayment(orderId) {
    const form = paymentForm[orderId] || {
      amount: '',
      payment_type: 'balance',
      method: 'cash',
    };

    const amount = parseFloat(form.amount);

    if (!amount || amount <= 0) {
      setFetchError('Please enter a valid payment amount.');
      return;
    }

    setSavingPayment(orderId);
    setFetchError('');

    try {
      const { data: paymentRecord, error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: orderId,
          amount,
          payment_type: form.payment_type || 'balance',
          method: form.method || 'cash',
          processed_by: user.id,
        })
        .select('id, receipt_number, receipt_status, receipt_issued_at, payment_type, method, amount')
        .single();

      if (paymentError) throw paymentError;

      await insertAuditLog('RECORD_ORDER_PAYMENT', orderId, {
        amount,
        payment_type: form.payment_type || 'balance',
        method: form.method || 'cash',
        receipt_number: paymentRecord?.receipt_number || null,
      });

      const currentOrder = orders.find((order) => order.id === orderId);
      const total = Number(currentOrder?.total_amount) || 0;

      const existingPaid = (payments[orderId] || []).reduce(
        (sum, payment) =>
          payment.payment_type === 'refund'
            ? sum - Number(payment.amount || 0)
            : sum + Number(payment.amount || 0),
        0
      );

      const newTotalPaid =
        form.payment_type === 'refund'
          ? existingPaid - amount
          : existingPaid + amount;

      const newBalance = Math.max(total - newTotalPaid, 0);

      if (currentOrder?.customer_id) {
        const receiptText = paymentRecord?.receipt_number
          ? ` Receipt No: ${paymentRecord.receipt_number}.`
          : '';

        await notifyUser({
          userId: currentOrder.customer_id,
          title: 'Order Payment Recorded',
          message:
            form.payment_type === 'refund'
              ? `A refund of ${formatPeso(amount)} has been recorded for your order.${receiptText}`
              : `Your order payment of ${formatPeso(amount)} has been recorded. Remaining balance: ${formatPeso(newBalance)}.${receiptText}`,
          type: 'payment',
          relatedTable: 'orders',
          relatedId: orderId,
        });
      }

      setPaymentToast({
        orderId,
        amount,
        balance: newBalance,
        isFullyPaid: newBalance <= 0,
        receiptNumber: paymentRecord?.receipt_number || null,
      });

      setTimeout(() => setPaymentToast(null), 4000);

      setPaymentForm((previous) => ({
        ...previous,
        [orderId]: {
          amount: '',
          payment_type: 'balance',
          method: 'cash',
        },
      }));

      setExpandedPayment(null);
      await fetchOrders(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to record payment.');
    } finally {
      setSavingPayment(null);
    }
  }

  const counts = useMemo(() => {
    const result = {
      all: orders.length,
      pending: 0,
      confirmed: 0,
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

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus = filter === 'all' || order.status === filter;
      const customerName = getCustomerName(order).toLowerCase();
      const email = String(order.profiles?.email || '').toLowerCase();
      const phone = String(order.profiles?.phone || '').toLowerCase();
      const id = String(order.id || '').toLowerCase();
      const partNames = (order.order_items || [])
        .map((item) => item.parts?.name || '')
        .join(' ')
        .toLowerCase();
      const receiptNumbers = (payments[order.id] || [])
        .map((payment) => payment.receipt_number || '')
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !searchTerm ||
        customerName.includes(searchTerm) ||
        email.includes(searchTerm) ||
        phone.includes(searchTerm) ||
        id.includes(searchTerm) ||
        partNames.includes(searchTerm) ||
        receiptNumbers.includes(searchTerm);

      return matchesStatus && matchesSearch;
    });
  }, [orders, filter, search, payments]);

  const paymentStats = useMemo(() => {
    return filtered.reduce(
      (acc, order) => {
        const total = Number(order.total_amount) || 0;
        const orderPayments = payments[order.id] || [];
        const { totalPaid } = summarizePayments(orderPayments);
        const balance = Math.max(total - totalPaid, 0);

        acc.total += total;
        acc.paid += totalPaid;
        acc.balance += balance;

        return acc;
      },
      { total: 0, paid: 0, balance: 0 }
    );
  }, [filtered, payments]);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
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
                  Manage Orders
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  View customer parts orders, update order status, and record payments or refunds.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchOrders(false)}
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

        {/* Summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Filtered Orders" value={filtered.length} icon="📦" tone="primary" />
          <StatCard label="Order Total" value={formatPeso(paymentStats.total)} icon="💰" tone="accent" />
          <StatCard label="Total Collected" value={formatPeso(paymentStats.paid)} icon="✅" tone="green" />
          <StatCard label="Total Balance" value={formatPeso(paymentStats.balance)} icon="⚠️" tone={paymentStats.balance > 0 ? 'yellow' : 'default'} />
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {['all', ...STATUS_OPTIONS].map((status) => {
                const active = filter === status;
                const label = status === 'all' ? 'All' : status.replace('_', ' ');

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

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, email, phone, part, or order ID..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 lg:w-96"
            />
          </div>
        </div>

        {loading ? (
          <OrderSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              📦
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No orders found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Try changing the status filter or search keyword.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => {
              const total = Number(order.total_amount) || 0;
              const orderPayments = payments[order.id] || [];
              const latestReceipt = getLatestReceipt(orderPayments);
              const { totalPaid } = summarizePayments(orderPayments);
              const balance = Math.max(total - totalPaid, 0);
              const isFullyPaid = total > 0 && balance <= 0;
              const paymentPercent = total > 0 ? Math.min((totalPaid / total) * 100, 100) : 0;
              const form = paymentForm[order.id] || {
                amount: '',
                payment_type: 'balance',
                method: 'cash',
              };
              const isPaymentOpen = expandedPayment === order.id;
              const isHistoryOpen = expandedHistory === order.id;

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800"
                >
                  <div className="p-5 sm:p-6">
                    {/* Header */}
                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={order.status} />
                          <PaymentBadge isFullyPaid={isFullyPaid} balance={balance} />
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                            #{order.id?.slice(0, 8).toUpperCase()}
                          </span>
                          {latestReceipt && (
                            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-mono font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                              OR {getReceiptNumber(latestReceipt)}
                            </span>
                          )}
                        </div>

                        <h2 className="text-xl font-black text-gray-950 dark:text-white">
                          {getCustomerName(order)}
                        </h2>

                        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                          👤 {order.profiles?.email || 'No email'}
                          {order.profiles?.phone ? ` · ${order.profiles.phone}` : ''}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          Ordered on {formatDateTime(order.created_at)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Order Total
                        </p>
                        <p className="text-xl font-black text-gray-950 dark:text-white">
                          {formatPeso(total)}
                        </p>
                      </div>
                    </div>

                    {order.notes && (
                      <div className="mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm italic leading-6 text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                        “{order.notes}”
                      </div>
                    )}

                    {/* Items */}
                    <div className="mb-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                      <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Order Items
                      </p>

                      {order.order_items?.length > 0 ? (
                        <div className="space-y-3">
                          {order.order_items.map((item) => {
                            const unitPrice = Number(item.unit_price) || 0;
                            const quantity = Number(item.quantity) || 0;
                            const subtotal = Number(item.subtotal) || unitPrice * quantity;

                            return (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700"
                              >
                                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                                  {item.parts?.image_url ? (
                                    <img
                                      src={item.parts.image_url}
                                      alt={item.parts.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="grid h-full w-full place-items-center text-xl text-gray-400">
                                      ⚙️
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                                    {item.parts?.name || 'Part'}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {item.parts?.category || 'General'} · {formatPeso(unitPrice)} × {quantity}
                                  </p>
                                </div>

                                <p className="shrink-0 text-sm font-black text-accent-600 dark:text-accent-400">
                                  {formatPeso(subtotal)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
                          No order items found.
                        </p>
                      )}
                    </div>

                    {/* Payment Summary */}
                    <div className="mb-5 grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Total Amount
                        </p>
                        <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                          {formatPeso(total)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Down Payment 15%
                        </p>
                        <p className="mt-1 text-sm font-black text-yellow-600 dark:text-yellow-300">
                          {formatPeso(total * 0.15)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Collected
                        </p>
                        <p className="mt-1 text-sm font-black text-green-600 dark:text-green-300">
                          {formatPeso(totalPaid)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Balance
                        </p>
                        <p
                          className={`mt-1 text-sm font-black ${
                            isFullyPaid
                              ? 'text-green-600 dark:text-green-300'
                              : 'text-yellow-600 dark:text-yellow-300'
                          }`}
                        >
                          {formatPeso(balance)}
                        </p>
                      </div>
                    </div>

                    <div className="mb-5 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-all"
                        style={{ width: `${paymentPercent}%` }}
                      />
                    </div>

                    {/* Status Actions */}
                    <div className="mb-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                      <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Update Status
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.filter((status) => status !== order.status).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateStatus(order.id, status)}
                            disabled={updatingStatus === `${order.id}-${status}`}
                            className={`rounded-2xl px-4 py-2 text-xs font-black capitalize ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${ACTION_STYLES[status]}`}
                          >
                            {updatingStatus === `${order.id}-${status}`
                              ? 'Updating...'
                              : status === 'ready'
                              ? 'Ready for Pickup'
                              : status.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Utilities */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewInvoice(order)}
                        disabled={generatingInvoice === order.id}
                        className="rounded-2xl bg-accent-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-accent-500/20 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {generatingInvoice === order.id ? 'Generating...' : '🧾 Generate / View Invoice'}
                      </button>

                      {latestReceipt && (
                        <button
                          type="button"
                          onClick={() => handleViewReceipt(order, latestReceipt)}
                          className="rounded-2xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-black text-green-700 transition hover:bg-green-100 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-500/20"
                        >
                          View Latest E-Receipt
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedPayment(isPaymentOpen ? null : order.id)}
                        className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
                          isPaymentOpen
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                            : 'border border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400'
                        }`}
                      >
                        {isPaymentOpen ? 'Close Form' : '+ Record Payment'}
                      </button>

                      {orderPayments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedHistory(isHistoryOpen ? null : order.id)}
                          className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                        >
                          {isHistoryOpen ? 'Hide History' : 'View History'} ({orderPayments.length})
                        </button>
                      )}
                    </div>

                    {/* Payment History */}
                    {isHistoryOpen && orderPayments.length > 0 && (
                      <div className="mt-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                        <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Payment Ledger
                        </p>

                        <div className="space-y-2">
                          {orderPayments.map((payment) => (
                            <div
                              key={payment.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-xs ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-primary-50 px-3 py-1 font-mono text-[11px] font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                                    OR {getReceiptNumber(payment)}
                                  </span>
                                  <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25">
                                    {formatPaymentType(payment.payment_type)}
                                  </span>
                                  {payment.receipt_status && (
                                    <span className="rounded-full bg-green-50 px-3 py-1 text-[11px] font-black capitalize text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25">
                                      {payment.receipt_status}
                                    </span>
                                  )}
                                </div>

                                <p className="font-black capitalize text-gray-950 dark:text-white">
                                  {payment.method || 'cash'}
                                </p>
                                <p className="mt-1 text-gray-500 dark:text-gray-400">
                                  Issued {formatDateTime(payment.receipt_issued_at || payment.created_at)} · processed by{' '}
                                  {payment.profiles
                                    ? `${payment.profiles.first_name} ${payment.profiles.last_name}`
                                    : 'System'}
                                </p>
                                {payment.notes && (
                                  <p className="mt-1 text-gray-500 dark:text-gray-400">
                                    Note: {payment.notes}
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-col items-end gap-2">
                                <p
                                  className={`font-black ${
                                    payment.payment_type === 'refund'
                                      ? 'text-red-600 dark:text-red-300'
                                      : 'text-green-600 dark:text-green-300'
                                  }`}
                                >
                                  {payment.payment_type === 'refund' ? '-' : ''}
                                  {formatPeso(payment.amount)}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleViewReceipt(order, payment)}
                                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-[11px] font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                                >
                                  View E-Receipt
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Record Payment */}
                    {isPaymentOpen && (
                      <div className="mt-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                        <p className="mb-4 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Record Payment
                        </p>

                        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                          <div>
                            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Amount
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              autoFocus
                              value={form.amount}
                              onChange={(event) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  [order.id]: {
                                    ...form,
                                    amount: event.target.value,
                                  },
                                }))
                              }
                              placeholder="0.00"
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Payment Type
                            </label>
                            <select
                              value={form.payment_type || 'balance'}
                              onChange={(event) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  [order.id]: {
                                    ...form,
                                    payment_type: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                            >
                              {PAYMENT_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type === 'down_payment'
                                    ? 'Down Payment'
                                    : type.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Method
                            </label>
                            <select
                              value={form.method || 'cash'}
                              onChange={(event) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  [order.id]: {
                                    ...form,
                                    method: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                            >
                              {PAYMENT_METHODS.map((method) => (
                                <option key={method} value={method}>
                                  {method.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => submitPayment(order.id)}
                            disabled={savingPayment === order.id}
                            className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingPayment === order.id ? 'Saving...' : 'Save Payment'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <InvoiceReceiptModal
        isOpen={invoiceModal.open}
        type="invoice"
        invoice={invoiceModal.invoice}
        payments={invoiceModal.payments}
        order={invoiceModal.order}
        customerName={invoiceModal.order ? getCustomerName(invoiceModal.order) : ''}
        onClose={() =>
          setInvoiceModal({
            open: false,
            invoice: null,
            order: null,
            payments: [],
          })
        }
      />

      <InvoiceReceiptModal
        isOpen={receiptModal.open}
        type="receipt"
        receipt={receiptModal.receipt}
        order={receiptModal.order}
        customerName={receiptModal.order ? getCustomerName(receiptModal.order) : ''}
        onClose={() =>
          setReceiptModal({
            open: false,
            receipt: null,
            order: null,
          })
        }
      />

      {paymentToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs rounded-3xl border border-primary-100 bg-white px-5 py-4 shadow-2xl dark:border-primary-500/25 dark:bg-dark-800">
          <p className="mb-1 text-sm font-black text-gray-950 dark:text-white">
            {formatPeso(paymentToast.amount)} payment recorded
          </p>
          {paymentToast.receiptNumber && (
            <p className="mb-1 font-mono text-xs font-black text-primary-600 dark:text-primary-400">
              OR {paymentToast.receiptNumber}
            </p>
          )}
          <p className="text-xs leading-5 text-gray-600 dark:text-gray-400">
            {paymentToast.isFullyPaid
              ? '✓ Order invoice is fully settled.'
              : `${formatPeso(paymentToast.balance)} balance remaining.`}
          </p>
        </div>
      )}
    </div>
  );
}
