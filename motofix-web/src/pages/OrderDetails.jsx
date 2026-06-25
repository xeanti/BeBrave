import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { summarizePayments } from '../lib/payments';
import { generateOrSyncOrderInvoice } from '../lib/invoices';
import InvoiceReceiptModal from '../components/InvoiceReceiptModal';

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

function getCustomerName(order, user) {
  const profileName = `${order?.profiles?.first_name || ''} ${
    order?.profiles?.last_name || ''
  }`.trim();

  return profileName || user?.email || 'Customer';
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  },
  preparing: {
    label: 'Preparing',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  ready: {
    label: 'Ready',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
  completed: {
    label: 'Completed',
    classes:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  },
  cancelled: {
    label: 'Cancelled',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ring-1 ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-gray-950 dark:text-white">
        {value || '—'}
      </p>
    </div>
  );
}

export default function OrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [invoice, setInvoice] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [documentModal, setDocumentModal] = useState(null);
  const [documentError, setDocumentError] = useState('');
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  useEffect(() => {
    if (!user?.id || !orderId) return;
    fetchOrderDetails();

    const ordersChannel = supabase
      .channel(`order-details-${orderId}`)
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
      .channel(`order-payments-${orderId}`)
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

    const invoicesChannel = supabase
      .channel(`order-invoices-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: `order_id=eq.${orderId}`,
        },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(invoicesChannel);
    };
  }, [user?.id, orderId]);

  async function fetchOrderDetails(showLoader = true) {
    if (!user?.id || !orderId) return;

    if (showLoader) setLoading(true);
    setFetchError('');
    setDocumentError('');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        profiles!orders_customer_id_fkey(first_name, last_name, email, phone),
        order_items(*, parts(name, image_url, category))
      `)
      .eq('id', orderId)
      .eq('customer_id', user.id)
      .single();

    if (error) {
      setOrder(null);
      setPayments([]);
      setInvoice(null);
      setFetchError(error.message || 'Order not found.');
      setLoading(false);
      return;
    }

    setOrder(data);

    const [paymentsResult, invoiceResult] = await Promise.all([
      supabase
        .from('payments')
        .select(`
          id,
          order_id,
          booking_id,
          amount,
          payment_type,
          method,
          notes,
          created_at,
          receipt_number,
          receipt_status,
          receipt_issued_at,
          receipt_issued_by,
          profiles!payments_processed_by_fkey(first_name, last_name)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle(),
    ]);

    if (paymentsResult.error) {
      console.error(paymentsResult.error);
      setPayments([]);
    } else {
      setPayments(paymentsResult.data || []);
    }

    if (invoiceResult.error) {
      console.error(invoiceResult.error);
      setInvoice(null);
    } else {
      setInvoice(invoiceResult.data || null);
    }

    setLoading(false);
  }

  async function handleViewInvoice() {
    if (!order?.id) return;

    setLoadingInvoice(true);
    setDocumentError('');

    try {
      const syncedInvoice = await generateOrSyncOrderInvoice({
        orderId: order.id,
        issuedBy: user?.id || null,
      });

      setInvoice(syncedInvoice);
      setDocumentModal('invoice');
    } catch (err) {
      setDocumentError(err.message || 'Failed to load invoice.');
    } finally {
      setLoadingInvoice(false);
    }
  }

  function handleViewReceipt(payment) {
    setSelectedReceipt(payment);
    setDocumentModal('receipt');
  }

  function closeDocumentModal() {
    setDocumentModal(null);
    setSelectedReceipt(null);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-4xl rounded-3xl border border-gray-200 bg-white p-8 text-center font-bold text-gray-500 shadow-sm dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
          Loading order details...
        </div>
      </div>
    );
  }

  if (fetchError || !order) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-500/30 dark:bg-dark-800">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-3 text-2xl font-black text-gray-950 dark:text-white">
            Order not found
          </h1>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {fetchError || 'This order may have been deleted or does not belong to your account.'}
          </p>
          <button
            onClick={() => navigate('/my-orders')}
            className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700"
          >
            Back to My Orders
          </button>
        </div>
      </div>
    );
  }

  const total = Number(order.total_amount) || 0;
  const { totalPaid } = summarizePayments(payments);
  const balance = Math.max(total - totalPaid, 0);
  const isFullyPaid = total > 0 && balance <= 0;
  const customerName = getCustomerName(order, user);

  return (
    <>
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                to="/my-orders"
                className="text-sm font-black text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
              >
                ← Back to My Orders
              </Link>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">
                Order Details
              </h1>
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                Order #{order.id?.slice(0, 8).toUpperCase()}
              </p>
            </div>

            <StatusBadge status={order.status} />
          </div>

          {documentError && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {documentError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Ordered Parts
                </p>
                <h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
                  {order.order_items?.length || 0} item(s)
                </h2>
                <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                  Ordered on {formatDateTime(order.created_at)}
                </p>
              </div>

              <div className="space-y-3">
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

                  {invoice?.invoice_number && (
                    <DetailCard label="Invoice No." value={invoice.invoice_number} />
                  )}

                  {isFullyPaid && (
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-black text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                      ✓ Fully Paid
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleViewInvoice}
                    disabled={loadingInvoice}
                    className="w-full rounded-2xl bg-primary-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingInvoice
                      ? 'Loading Invoice...'
                      : invoice?.invoice_number
                      ? 'View Invoice'
                      : 'Generate / View Invoice'}
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Digital Receipt / Payment History
                </p>

                <div className="mt-5 space-y-3">
                  {payments.length === 0 ? (
                    <p className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:bg-dark-900/70 dark:text-gray-400">
                      No payment records yet.
                    </p>
                  ) : (
                    payments.map((payment) => {
                      const processedBy = payment.profiles
                        ? `${payment.profiles.first_name || ''} ${payment.profiles.last_name || ''}`.trim()
                        : '';

                      return (
                        <div
                          key={payment.id}
                          className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
                        >
                          <div className="mb-3 rounded-2xl border border-primary-100 bg-white p-3 dark:border-primary-500/20 dark:bg-dark-800">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Receipt No.
                            </p>
                            <p className="mt-1 break-all text-sm font-black text-primary-700 dark:text-primary-300">
                              {payment.receipt_number || `TEMP-${payment.id?.slice(0, 8).toUpperCase()}`}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-gray-950 dark:text-white">
                              {formatPeso(payment.amount)}
                            </p>
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
                              {String(payment.payment_type || 'payment').replaceAll('_', ' ')}
                            </span>
                          </div>

                          <div className="mt-2 grid gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                            <div className="flex justify-between gap-3">
                              <span>Method</span>
                              <span className="font-black uppercase text-gray-700 dark:text-gray-300">
                                {payment.method || 'cash'}
                              </span>
                            </div>

                            <div className="flex justify-between gap-3">
                              <span>Issued</span>
                              <span className="text-right font-bold text-gray-700 dark:text-gray-300">
                                {formatDateTime(payment.receipt_issued_at || payment.created_at)}
                              </span>
                            </div>

                            <div className="flex justify-between gap-3">
                              <span>Status</span>
                              <span className="font-black capitalize text-green-600 dark:text-green-300">
                                {payment.receipt_status || 'issued'}
                              </span>
                            </div>

                            {processedBy && (
                              <div className="flex justify-between gap-3">
                                <span>Processed by</span>
                                <span className="text-right font-bold text-gray-700 dark:text-gray-300">
                                  {processedBy}
                                </span>
                              </div>
                            )}
                          </div>

                          {payment.notes && (
                            <p className="mt-3 rounded-2xl bg-white p-3 text-xs font-semibold text-gray-600 ring-1 ring-gray-100 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
                              {payment.notes}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => handleViewReceipt(payment)}
                            className="mt-4 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                          >
                            View E-Receipt
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>

      <InvoiceReceiptModal
        isOpen={documentModal === 'invoice'}
        type="invoice"
        invoice={invoice}
        payments={payments}
        order={order}
        customerName={customerName}
        onClose={closeDocumentModal}
      />

      <InvoiceReceiptModal
        isOpen={documentModal === 'receipt'}
        type="receipt"
        receipt={selectedReceipt}
        order={order}
        customerName={customerName}
        onClose={closeDocumentModal}
      />
    </>
  );
}
