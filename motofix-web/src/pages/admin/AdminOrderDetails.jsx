import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';

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

function getCustomerName(order) {
  const name = `${order.profiles?.first_name || ''} ${
    order.profiles?.last_name || ''
  }`.trim();

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

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${
        STATUS_STYLES[status] || STATUS_STYLES.pending
      }`}
    >
      {String(status || 'pending').replace('_', ' ')}
    </span>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-bold text-gray-950 dark:text-white">
        {value || '—'}
      </p>
    </div>
  );
}

export default function AdminOrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!orderId) return;

    fetchOrderDetails();

    const ordersChannel = supabase
      .channel(`admin-order-details-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel(`admin-order-payments-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [orderId]);

  async function fetchOrderDetails(showLoader = true) {
    if (showLoader) setLoading(true);
    setFetchError('');

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        *,
        profiles!orders_customer_id_fkey(first_name, last_name, email, phone),
        order_items(*, parts(name, image_url, category))
      `
      )
      .eq('id', orderId)
      .single();

    if (error) {
      setOrder(null);
      setPayments([]);
      setFetchError(error.message || 'Order not found.');
      setLoading(false);
      return;
    }

    setOrder(data);

    const orderPayments = await fetchPaymentsFor({
      orderIds: [orderId],
    });

    setPayments(orderPayments || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-5xl rounded-3xl border border-gray-200 bg-white p-8 text-center font-bold text-gray-500 shadow-sm dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
          Loading order details...
        </div>
      </div>
    );
  }

  if (fetchError || !order) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-5xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-500/30 dark:bg-dark-800">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-3 text-2xl font-black text-gray-950 dark:text-white">
            Order not found
          </h1>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {fetchError || 'This order may have been deleted.'}
          </p>
          <button
            onClick={() => navigate('/admin/orders')}
            className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700"
          >
            Back to Admin Orders
          </button>
        </div>
      </div>
    );
  }

  const total = Number(order.total_amount) || 0;
  const { totalPaid } = summarizePayments(payments);
  const balance = Math.max(total - totalPaid, 0);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              to="/admin/orders"
              className="text-sm font-black text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
            >
              ← Back to Manage Orders
            </Link>

            <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">
              Admin Order Details
            </h1>

            <p className="mt-1 break-all text-sm font-semibold text-gray-500 dark:text-gray-400">
              Order ID: {order.id}
            </p>
          </div>

          <StatusBadge status={order.status} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              Order Information
            </p>

            <h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
              {order.order_items?.length || 0} item(s)
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <DetailCard label="Customer" value={getCustomerName(order)} />
              <DetailCard label="Email" value={order.profiles?.email} />
              <DetailCard label="Phone" value={order.profiles?.phone} />
              <DetailCard label="Created At" value={formatDateTime(order.created_at)} />
            </div>

            <div className="mt-6 space-y-3">
              {order.order_items?.length > 0 ? (
                order.order_items.map((item) => {
                  const unitPrice = Number(item.unit_price) || 0;
                  const subtotal = Number(item.subtotal) || unitPrice * item.quantity;

                  return (
                    <div
                      key={item.id}
                      className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
                    >
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                        {item.parts?.image_url ? (
                          <img
                            src={item.parts.image_url}
                            alt={item.parts?.name || 'Part'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-2xl">
                            🧩
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-gray-950 dark:text-white">
                          {item.parts?.name || 'Part'}
                        </h3>

                        <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {item.parts?.category || 'Uncategorized'} • Qty {item.quantity}
                        </p>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <DetailCard label="Unit Price" value={formatPeso(unitPrice)} />
                          <DetailCard label="Subtotal" value={formatPeso(subtotal)} />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:bg-dark-900/70 dark:text-gray-400">
                  No order items found.
                </p>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Payment Summary
              </p>

              <div className="mt-5 space-y-3">
                <DetailCard label="Order Total" value={formatPeso(total)} />
                <DetailCard label="Total Paid" value={formatPeso(totalPaid)} />
                <DetailCard label="Balance" value={formatPeso(balance)} />
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Payment History
              </p>

              <div className="mt-5 space-y-3">
                {payments.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:bg-dark-900/70 dark:text-gray-400">
                    No payment records yet.
                  </p>
                ) : (
                  payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-gray-950 dark:text-white">
                          {formatPeso(payment.amount)}
                        </p>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
                          {payment.payment_type || 'payment'}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {payment.method || 'cash'} • {formatDateTime(payment.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}