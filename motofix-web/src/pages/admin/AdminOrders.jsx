import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const STATUS_OPTIONS = ['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled', 'returned'];
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

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

function getOrderNoteValue(order, label) {
  const notes = String(order?.notes || '');
  const escapedLabel = String(label || '').replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
  const match = notes.match(
    new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'im')
  );

  return match?.[1]?.trim() || '';
}

function getCustomerName(order) {
  const guestName =
    order?.walkin_customer_name ||
    order?.guest_name ||
    order?.customer_name ||
    getOrderNoteValue(order, 'Guest Name');

  if (guestName) return String(guestName).trim();

  const profile = order?.profiles || order?.customer || {};
  const registeredName = `${profile?.first_name || ''} ${
    profile?.last_name || ''
  }`.trim();

  if (registeredName) return registeredName;

  const guestPhone =
    order?.customer_contact_phone ||
    order?.walkin_customer_phone ||
    order?.guest_phone ||
    getOrderNoteValue(order, 'Guest Phone');

  if (guestPhone) return `Guest ${guestPhone}`;

  if (profile?.phone) return `Customer ${profile.phone}`;
  if (profile?.email) return profile.email;

  return order?.is_walkin
    ? 'Guest Customer'
    : 'Customer';
}

function getCustomerPhone(order) {
  const profile = order?.profiles || order?.customer || {};

  return (
    order?.customer_contact_phone ||
    order?.walkin_customer_phone ||
    order?.guest_phone ||
    getOrderNoteValue(order, 'Guest Phone') ||
    profile?.phone ||
    ''
  );
}

function getCustomerEmail(order) {
  const profile = order?.profiles || order?.customer || {};

  return (
    order?.customer_email ||
    profile?.email ||
    ''
  );
}

function getCustomerContactDisplay(order) {
  const email = getCustomerEmail(order);
  const phone = getCustomerPhone(order);

  if (email && phone) return `${email} · ${phone}`;
  if (email) return email;
  if (phone) return phone;

  return order?.is_walkin
    ? 'Guest counter sale'
    : 'No contact information';
}

function normalizeStatus(status) {
  const value = String(status || 'pending').toLowerCase();

  if (value === 'preparing') return 'processing';
  if (value === 'ready_for_pickup') return 'ready';

  return value;
}

function sanitizeSearchText(value) {
  return String(value || '')
    .replace(/[<>`{}$]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function getFulfillmentMethod(order) {
  return String(order?.fulfillment_method || 'pickup').toLowerCase();
}

function getReadyLabel(order) {
  return getFulfillmentMethod(order) === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup';
}

function formatOrderStatus(status, order = null) {
  const value = normalizeStatus(status);

  if (value === 'ready') return getReadyLabel(order);
  if (value === 'returned') return 'Returned';

  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const STATUS_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  processing:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  ready:
    'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  returned:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
};

function StatusBadge({ status, order }) {
  const displayStatus = normalizeStatus(status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ring-1 ${
        STATUS_STYLES[displayStatus] || STATUS_STYLES.pending
      }`}
    >
      {formatOrderStatus(status, order)}
    </span>
  );
}

function isReturnedOrder(order) {
  return normalizeStatus(order?.status) === 'returned' || String(order?.notes || '').includes('RETURNED TO INVENTORY');
}

function normalizeOrderPaymentRecord(payment) {
  const amount = Number(
    payment.amount ??
      payment.amount_paid ??
      payment.paid_amount ??
      payment.total_paid ??
      payment.payment_amount ??
      payment.total_amount ??
      payment.amount_received ??
      payment.cash_received ??
      0
  );

  return {
    ...payment,
    amount,
    payment_type:
      payment.payment_type ||
      payment.type ||
      (payment.status === 'paid' || payment.payment_status === 'paid' ? 'full' : 'payment'),
    method: payment.method || payment.payment_method || payment.provider || 'payment',
    receipt_number:
      payment.receipt_number ||
      payment.reference_number ||
      payment.payment_reference ||
      payment.provider_payment_id ||
      payment.provider_checkout_session_id ||
      payment.checkout_session_id ||
      null,
    receipt_status:
      payment.receipt_status ||
      payment.status ||
      payment.payment_status ||
      null,
    receipt_issued_at:
      payment.receipt_issued_at ||
      payment.paid_at ||
      payment.created_at ||
      null,
    created_at: payment.created_at || payment.paid_at,
  };
}

function isConfirmedOrderPayment(payment) {
  const type = String(payment?.payment_type || payment?.type || '').toLowerCase();

  if (type === 'refund') return false;

  const status = String(
    payment?.status ||
      payment?.payment_status ||
      payment?.receipt_status ||
      ''
  ).toLowerCase();

  const receiptStatus = String(payment?.receipt_status || '').toLowerCase();

  if (
    [
      'paid',
      'completed',
      'success',
      'successful',
      'verified',
      'confirmed',
      'succeeded',
      'issued',
      'settled',
      'captured',
    ].includes(status) ||
    ['issued', 'paid', 'verified', 'confirmed'].includes(receiptStatus)
  ) {
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
      'void',
    ].includes(status)
  ) {
    return false;
  }

  return Boolean(
    (payment?.payment_type || payment?.receipt_number) &&
      Number(payment?.amount) > 0 &&
      !payment?.provider_checkout_session_id
  );
}

function excludeOldRefundPayments(paymentList = []) {
  return (paymentList || []).filter(
    (payment) => String(payment.payment_type || '').toLowerCase() !== 'refund'
  );
}

function getConfirmedOrderPaymentTotal(paymentList = []) {
  return excludeOldRefundPayments(paymentList)
    .filter(isConfirmedOrderPayment)
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function getOrderPaidAmount(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const confirmedPaid = getConfirmedOrderPaymentTotal(paymentList);
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  const orderStatus = normalizeStatus(order?.status);
  const partialStatuses = ['partial', 'partially_paid', 'downpayment_paid'];

  const trustedOrderPaid = partialStatuses.includes(paymentStatus)
    ? Number(order?.down_payment_amount) || 0
    : 0;

  const hasIssuedReceipt = (paymentList || []).some((payment) => {
    const receiptStatus = String(payment?.receipt_status || payment?.status || '').toLowerCase();

    return Boolean(payment?.receipt_number) &&
      ['issued', 'paid', 'verified', 'confirmed', 'completed'].includes(receiptStatus);
  });

  const shouldTrustFullOrder =
    total > 0 &&
    (
      paymentStatus === 'paid' ||
      orderStatus === 'completed' ||
      hasIssuedReceipt
    ) &&
    (confirmedPaid <= 0 || confirmedPaid >= total);

  if (shouldTrustFullOrder) {
    return total;
  }

  return Math.max(0, Math.min(Math.max(confirmedPaid, trustedOrderPaid), total));
}

function getOrderPaymentSummary(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const totalPaid = getOrderPaidAmount(order, paymentList);
  const returnedOrCancelled = ['returned', 'cancelled', 'refunded'].includes(normalizeStatus(order?.status));
  const balance = returnedOrCancelled ? 0 : Math.max(total - totalPaid, 0);
  const isFullyPaid = total > 0 && (totalPaid >= total || balance <= 0);
  const paymentPercent = total > 0 ? Math.min((totalPaid / total) * 100, 100) : 0;

  return {
    total,
    totalPaid,
    balance,
    isFullyPaid,
    paymentPercent,
  };
}

function PaymentBadge({ order, summary }) {
  if (isReturnedOrder(order)) {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25">
        Returned
      </span>
    );
  }

  if (summary.isFullyPaid) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25">
        ✓ Fully Paid
      </span>
    );
  }

  if (summary.totalPaid > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25">
        Partially Paid
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-yellow-50 px-3 py-1 text-xs font-black text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25">
      Pending Payment
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
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function AdminOrders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [errorPopup, setErrorPopup] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchOrders();

    const ordersChannel = supabase
      .channel('admin-orders-list-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchOrders(false)
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel('admin-orders-list-payments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => fetchOrders(false)
      )
      .subscribe();

    const onlinePaymentsChannel = supabase
      .channel('admin-orders-list-online-payments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_payments' },
        () => fetchOrders(false)
      )
      .subscribe();

    const orderItemsChannel = supabase
      .channel('admin-orders-list-order-items')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => fetchOrders(false)
      )
      .subscribe();

    const partsChannel = supabase
      .channel('admin-orders-list-parts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
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
      supabase.removeChannel(onlinePaymentsChannel);
      supabase.removeChannel(orderItemsChannel);
      supabase.removeChannel(partsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search, pageSize]);

  useEffect(() => {
    if (!errorPopup) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight =
      document.body.style.paddingRight;
    const scrollbarWidth = Math.max(
      window.innerWidth -
        document.documentElement.clientWidth,
      0
    );

    document.body.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        clearErrorPopup();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight =
        previousPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [errorPopup]);

  function showErrorPopup(message) {
    const cleanMessage =
      typeof message === 'string' && message.trim()
        ? message
        : 'Something went wrong. Please try again.';

    setFetchError(cleanMessage);
    setErrorPopup(cleanMessage);
  }

  function clearErrorPopup() {
    setErrorPopup(null);
    setFetchError('');
  }

  async function fetchOrders(showLoader = true) {
    if (showLoader) setLoading(true);
    setFetchError('');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        profiles!orders_customer_id_fkey(first_name, last_name, email, phone),
        order_items(id, part_id, quantity, unit_price, subtotal, parts(name, category, image_url))
      `)
      .order('created_at', { ascending: false });

    if (error) {
      const message = error.message || 'Failed to load orders.';
      setOrders([]);
      setPayments({});
      setLoading(false);
      showErrorPopup(message);
      return;
    }

    const orderRows = data || [];
    setOrders(orderRows);

    if (orderRows.length > 0) {
      try {
        const orderIds = orderRows.map((order) => order.id);

        const [manualPaymentsResult, onlinePaymentsResult] = await Promise.all([
          supabase
            .from('payments')
            .select(`
              *,
              profiles!payments_processed_by_fkey(first_name, last_name, email, role)
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
              amount_paid,
              paid_amount,
              total_paid,
              payment_amount,
              total_amount,
              amount_received,
              cash_received,
              reference_number,
              payment_reference,
              receipt_number,
              receipt_status,
              provider_checkout_session_id,
              provider_payment_id,
              checkout_session_id,
              payment_method,
              paid_at,
              receipt_issued_at,
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
          .filter((payment) => String(payment.payment_type || '').toLowerCase() !== 'refund')
          .forEach((payment) => {
            const targetId = payment.order_id;

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

  const counts = useMemo(() => {
    const result = {
      all: orders.length,
      pending: 0,
      confirmed: 0,
      processing: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
      returned: 0,
    };

    orders.forEach((order) => {
      const key = normalizeStatus(order.status);

      if (result[key] !== undefined) {
        result[key] += 1;
      }
    });

    return result;
  }, [orders]);

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus = filter === 'all' || normalizeStatus(order.status) === filter;
      const customerName = getCustomerName(order).toLowerCase();
      const email = getCustomerEmail(order).toLowerCase();
      const phone = getCustomerPhone(order).toLowerCase();
      const notes = String(order.notes || '').toLowerCase();
      const id = String(order.id || '').toLowerCase();
      const fulfillment = String(order.fulfillment_method || '').toLowerCase();
      const address = String(order.delivery_address || '').toLowerCase();
      const partNames = (order.order_items || [])
        .map((item) => item.parts?.name || '')
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !searchTerm ||
        customerName.includes(searchTerm) ||
        email.includes(searchTerm) ||
        phone.includes(searchTerm) ||
        notes.includes(searchTerm) ||
        id.includes(searchTerm) ||
        fulfillment.includes(searchTerm) ||
        address.includes(searchTerm) ||
        partNames.includes(searchTerm);

      return matchesStatus && matchesSearch;
    });
  }, [orders, filter, search]);

  const paymentStats = useMemo(() => {
    return filtered.reduce(
      (acc, order) => {
        const summary = getOrderPaymentSummary(order, payments[order.id] || []);

        acc.total += summary.total;
        acc.paid += summary.totalPaid;
        acc.balance += summary.balance;

        return acc;
      },
      { total: 0, paid: 0, balance: 0 }
    );
  }, [filtered, payments]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedOrders = filtered.slice(startIndex, endIndex);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              MotoFix Admin
            </p>
            <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white">
              Orders
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              Paginated order list. Open details for payments, returns, receipts, and status updates.
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

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Filtered Orders" value={filtered.length} icon="📦" tone="primary" />
          <StatCard label="Order Total" value={formatPeso(paymentStats.total)} icon="💰" tone="accent" />
          <StatCard label="Total Collected" value={formatPeso(paymentStats.paid)} icon="✅" tone="green" />
          <StatCard label="Total Balance" value={formatPeso(paymentStats.balance)} icon="⚠️" tone={paymentStats.balance > 0 ? 'yellow' : 'default'} />
        </div>

        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {['all', ...STATUS_OPTIONS].map((status) => {
                const active = filter === status;
                const label = status === 'all' ? 'All' : formatOrderStatus(status);

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

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(sanitizeSearchText(event.target.value))}
                placeholder="Search customer, email, phone, address, product, or order ID..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
              />

              <div className="flex flex-wrap items-center gap-2">
                {(search || filter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setFilter('all');
                    }}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300"
                  >
                    Clear Filters
                  </button>
                )}

                <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Per page
                </span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
          <>
            <div className="mb-4 flex flex-col gap-2 text-sm font-bold text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {startIndex + 1}–{Math.min(endIndex, filtered.length)} of {filtered.length} orders
              </p>
              <p>
                Page {safeCurrentPage} of {totalPages}
              </p>
            </div>

            <div className="space-y-3">
              {paginatedOrders.map((order) => {
                const orderPayments = payments[order.id] || [];
                const summary = getOrderPaymentSummary(order, orderPayments);
                const firstItem = order.order_items?.[0];
                const itemCount = order.order_items?.length || 0;

                return (
                  <article
                    key={order.id}
                    className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/50"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={order.status} order={order} />
                          <PaymentBadge order={order} summary={summary} />
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                            #{order.id?.slice(0, 8).toUpperCase()}
                          </span>
                        </div>

                        <h2 className="truncate text-lg font-black text-gray-950 dark:text-white">
                          {getCustomerName(order)}
                        </h2>

                        <p className="mt-1 break-words text-sm leading-6 text-gray-600 dark:text-gray-400">
                          👤 {getCustomerContactDisplay(order)}
                        </p>

                        {!order.customer_id && (
                          <span className="mt-2 inline-flex rounded-full bg-pink-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-pink-700 ring-1 ring-pink-200 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-500/25">
                            Guest Customer
                          </span>
                        )}

                        <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          Ordered on {formatDateTime(order.created_at)}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                          <span className="rounded-full bg-gray-100 px-3 py-1 capitalize text-gray-600 dark:bg-dark-900 dark:text-gray-300">
                            {getFulfillmentMethod(order) === 'delivery' ? 'Delivery' : 'Pickup'}
                          </span>
                          {getFulfillmentMethod(order) === 'delivery' && (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600 dark:bg-dark-900 dark:text-gray-300">
                              📍 {order.delivery_address || 'No address saved'}
                            </span>
                          )}
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600 dark:bg-dark-900 dark:text-gray-300">
                            {itemCount} item{itemCount === 1 ? '' : 's'}
                            {firstItem?.parts?.name ? ` · ${firstItem.parts.name}${itemCount > 1 ? ' +' + (itemCount - 1) : ''}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 lg:w-[470px]">
                        <div className="rounded-2xl bg-gray-50 p-4 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                          <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Total
                          </p>
                          <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                            {formatPeso(summary.total)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                          <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Collected
                          </p>
                          <p className="mt-1 text-sm font-black text-green-600 dark:text-green-300">
                            {formatPeso(summary.totalPaid)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                          <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Balance
                          </p>
                          <p className={`mt-1 text-sm font-black ${summary.balance > 0 ? 'text-yellow-600 dark:text-yellow-300' : 'text-green-600 dark:text-green-300'}`}>
                            {formatPeso(summary.balance)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/orders/${order.id}`)}
                          className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                Showing {startIndex + 1}–{Math.min(endIndex, filtered.length)} of {filtered.length}
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={safeCurrentPage <= 1}
                  className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  First
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                  disabled={safeCurrentPage <= 1}
                  className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  Prev
                </button>

                <span className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-black text-gray-700 dark:bg-dark-900 dark:text-gray-300">
                  {safeCurrentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                  disabled={safeCurrentPage >= totalPages}
                  className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  Next
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safeCurrentPage >= totalPages}
                  className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                >
                  Last
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {errorPopup &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                clearErrorPopup();
              }
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="admin-orders-error-title"
              aria-describedby="admin-orders-error-message"
              className="relative mx-auto rounded-3xl border border-red-200 bg-white p-5 shadow-2xl outline-none dark:border-red-500/30 dark:bg-dark-800 sm:p-6"
              style={{
                width: 'min(calc(100vw - 32px), 440px)',
                maxWidth: 440,
                maxHeight: 'calc(100dvh - 32px)',
                overflowY: 'auto',
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={clearErrorPopup}
                aria-label="Close error message"
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-gray-50 text-lg font-black text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ×
              </button>

              <div className="mb-5 flex items-start gap-3 pr-10">
                <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-red-50 text-2xl ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/25">
                  ⚠️
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    id="admin-orders-error-title"
                    className="text-lg font-black text-gray-950 dark:text-white"
                  >
                    Action Failed
                  </p>

                  <p
                    id="admin-orders-error-message"
                    className="mt-2 break-words whitespace-pre-wrap text-sm font-semibold leading-6 text-red-700 dark:text-red-300"
                  >
                    {errorPopup}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={clearErrorPopup}
                className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-500/20"
              >
                Okay
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
