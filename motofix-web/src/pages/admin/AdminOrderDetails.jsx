import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { notifyUser } from '../../lib/notifications';
import { generateOrSyncOrderInvoice } from '../../lib/invoices';
import InvoiceReceiptModal from '../../components/InvoiceReceiptModal';

const STATUS_OPTIONS = ['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled', 'returned'];
const PAYMENT_TYPES = ['down_payment', 'balance', 'full'];
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

function formatLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCustomerName(order) {
  if (order?.walkin_customer_name) {
    return order.walkin_customer_name;
  }

  if (order?.guest_name) {
    return order.guest_name;
  }

  const profile = order?.profiles || order?.customer || order;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  if (name) return name;

  if (order?.walkin_customer_phone) {
    return `Guest ${order.walkin_customer_phone}`;
  }

  if (profile?.phone) {
    return `Customer ${profile.phone}`;
  }

  if (profile?.email) {
    return profile.email;
  }

  return 'Guest Customer';
}

function getCustomerContact(order) {
  const profile = order?.profiles || order?.customer || order;

  return (
    order?.customer_contact_phone ||
    order?.walkin_customer_phone ||
    profile?.phone ||
    profile?.email ||
    'Guest sale'
  );
}

function normalizeStatus(status) {
  const value = String(status || 'pending').toLowerCase();

  if (value === 'preparing') return 'processing';
  if (value === 'ready_for_pickup') return 'ready';

  return value;
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

  return formatLabel(value);
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

const ACTION_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25 dark:hover:bg-yellow-500/20',
  processing:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25 dark:hover:bg-green-500/20',
  ready:
    'bg-primary-50 text-primary-700 ring-primary-100 hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25 dark:hover:bg-primary-500/20',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 hover:bg-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25 dark:hover:bg-gray-500/20',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20',
  returned:
    'bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25 dark:hover:bg-orange-500/20',
};

function StatusBadge({ status, order }) {
  const displayStatus = normalizeStatus(status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${
        STATUS_STYLES[displayStatus] || STATUS_STYLES.pending
      }`}
    >
      {formatOrderStatus(status, order)}
    </span>
  );
}

function DetailCard({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    red: 'text-red-600 dark:text-red-300',
    primary: 'text-primary-600 dark:text-primary-400',
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-1 break-words text-sm font-black ${tones[tone] || tones.default}`}>
        {value || '—'}
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
  const type = String(payment?.payment_type || '').toLowerCase();

  if (type === 'refund') return false;

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

  return Boolean(
    payment?.payment_type &&
      payment?.amount &&
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
  const partialStatuses = ['partial', 'partially_paid', 'downpayment_paid'];

  const trustedOrderPaid = partialStatuses.includes(paymentStatus)
    ? Number(order?.down_payment_amount) || 0
    : 0;

  return Math.max(0, Math.min(Math.max(confirmedPaid, trustedOrderPaid), total));
}

function getOrderPaymentSummary(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const totalPaid = getOrderPaidAmount(order, paymentList);
  const balance = Math.max(total - totalPaid, 0);
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

function getLatestReceipt(payments = []) {
  return excludeOldRefundPayments(payments)
    .slice()
    .reverse()
    .find((payment) => payment.receipt_number);
}

function isReturnedOrder(order) {
  return normalizeStatus(order?.status) === 'returned' || String(order?.notes || '').includes('RETURNED TO INVENTORY');
}

function buildInvoiceForDisplay(invoice, order, paymentList = []) {
  if (!invoice) return invoice;

  const { total, totalPaid, balance, isFullyPaid } = getOrderPaymentSummary(order, paymentList);

  return {
    ...invoice,
    total_amount: total,
    amount_paid: totalPaid,
    balance_due: balance,
    status:
      normalizeStatus(order?.status) === 'returned'
        ? 'returned'
        : isFullyPaid
          ? 'paid'
          : totalPaid > 0
            ? 'partially_paid'
            : 'unpaid',
  };
}

export default function AdminOrderDetails() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [invoice, setInvoice] = useState(null);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [errorPopup, setErrorPopup] = useState(null);

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_type: 'balance',
    method: 'cash',
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [returningOrder, setReturningOrder] = useState(false);
  const [paymentToast, setPaymentToast] = useState(null);

  const [documentModal, setDocumentModal] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [documentError, setDocumentError] = useState('');

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
      .channel(`admin-order-details-payments-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `order_id=eq.${orderId}`,
        },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    const onlinePaymentsChannel = supabase
      .channel(`admin-order-details-online-payments-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_payments',
          filter: `order_id=eq.${orderId}`,
        },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    const partsChannel = supabase
      .channel(`admin-order-details-parts-${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
        () => fetchOrderDetails(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(onlinePaymentsChannel);
      supabase.removeChannel(partsChannel);
    };
  }, [orderId]);

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

  async function fetchOrderDetails(showLoader = true) {
    if (!orderId) return;

    if (showLoader) setLoading(true);
    setFetchError('');
    setDocumentError('');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        profiles!orders_customer_id_fkey(first_name, last_name, email, phone),
        order_items(*, parts(name, image_url, category, stock_quantity))
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      setOrder(null);
      setPayments([]);
      setInvoice(null);
      setLoading(false);
      showErrorPopup(error.message || 'Order not found.');
      return;
    }

    if (!data) {
      setOrder(null);
      setPayments([]);
      setInvoice(null);
      setFetchError('Order not found.');
      setLoading(false);
      return;
    }

    setOrder(data);

    const [manualPaymentsResult, onlinePaymentsResult, invoiceResult] = await Promise.all([
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
          profiles!payments_processed_by_fkey(first_name, last_name, email, role)
        `)
        .eq('order_id', orderId)
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
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      supabase
        .from('invoices')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle(),
    ]);

    let combinedPayments = [];

    if (manualPaymentsResult.error || onlinePaymentsResult.error) {
      console.error(manualPaymentsResult.error || onlinePaymentsResult.error);
      setPayments([]);
    } else {
      combinedPayments = [
        ...(manualPaymentsResult.data || []),
        ...(onlinePaymentsResult.data || []),
      ]
        .map(normalizeOrderPaymentRecord)
        .filter((payment) => String(payment.payment_type || '').toLowerCase() !== 'refund')
        .sort(
          (a, b) =>
            new Date(a.paid_at || a.created_at || 0).getTime() -
            new Date(b.paid_at || b.created_at || 0).getTime()
        );

      setPayments(combinedPayments);
    }

    if (invoiceResult.error) {
      console.error(invoiceResult.error);
      setInvoice(null);
    } else {
      setInvoice(buildInvoiceForDisplay(invoiceResult.data || null, data, combinedPayments));
    }

    setLoading(false);
  }

  async function insertAuditLog(action, details = {}) {
    if (!user?.id || !order?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'orders',
      entity_id: order.id,
      performed_by: user.id,
      details,
    });
  }

  async function updateStatus(status) {
    if (!order?.id) return;

    setUpdatingStatus(status);
    setFetchError('');

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (error) throw error;

      await insertAuditLog('UPDATE_ORDER_STATUS', {
        new_status: status,
      });

      if (order?.customer_id) {
        let message = `Your order status is now ${formatOrderStatus(status, order)}.`;

        if (status === 'confirmed') message = 'Your parts order has been confirmed.';
        if (status === 'processing') message = 'Your parts order is now being processed/prepared.';
        if (status === 'ready') {
          message =
            getFulfillmentMethod(order) === 'delivery'
              ? 'Your parts order is ready for delivery.'
              : 'Your parts order is ready for pickup.';
        }
        if (status === 'completed') message = 'Your parts order has been completed. Thank you for using MotoFix.';
        if (status === 'cancelled') message = 'Your parts order has been cancelled.';
        if (status === 'returned') message = 'Your parts order has been returned and the products were restored to inventory.';

        try {
          await notifyUser({
            userId: order.customer_id,
            title: 'Order Status Updated',
            message,
            type: 'order',
            relatedTable: 'orders',
            relatedId: order.id,
          });
        } catch (notifyError) {
          console.warn('Status updated, but notification failed:', notifyError);
        }
      }

      await fetchOrderDetails(false);
    } catch (err) {
      const message = String(err.message || '');

      if (message.includes('orders_status_check')) {
        showErrorPopup(
          'Order status is blocked by the database constraint. Run the orders_status_check SQL that allows returned/processing first.\n\nOriginal error: ' + message
        );
      } else {
        showErrorPopup(message || 'Failed to update order status.');
      }
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function submitPayment() {
    if (!order?.id) return;

    const amount = parseFloat(paymentForm.amount);

    if (paymentForm.payment_type === 'refund') {
      showErrorPopup('Refund was removed. Use Return Order to restore products to inventory.');
      return;
    }

    if (!amount || amount <= 0) {
      showErrorPopup('Please enter a valid payment amount.');
      return;
    }

    const summary = getOrderPaymentSummary(order, payments);
    const existingBalance = Math.max(summary.balance, 0);

    if (amount > existingBalance) {
      showErrorPopup(`Payment cannot exceed the remaining balance of ${formatPeso(existingBalance)}.`);
      return;
    }

    setSavingPayment(true);
    setFetchError('');

    try {
      const { data: paymentRecord, error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: order.id,
          amount,
          payment_type: paymentForm.payment_type || 'balance',
          method: paymentForm.method || 'cash',
          processed_by: user?.id || null,
        })
        .select('id, receipt_number, receipt_issued_at, payment_type, method, amount')
        .single();

      if (paymentError) throw paymentError;

      const newTotalPaid = Math.min(summary.totalPaid + amount, summary.total);
      const newBalance = Math.max(summary.total - newTotalPaid, 0);
      const isFullyPaid = summary.total > 0 && newBalance <= 0;
      const isPartiallyPaid = newTotalPaid > 0 && !isFullyPaid;
      const now = new Date().toISOString();

      const updatePayload = {
        payment_status: isFullyPaid
          ? 'paid'
          : isPartiallyPaid
            ? 'partially_paid'
            : order?.checkout_url || order?.paymongo_checkout_session_id
              ? 'checkout_created'
              : 'pending_payment',
        down_payment_amount: newTotalPaid,
        remaining_balance: newBalance,
        payment_method: paymentForm.method || order?.payment_method || 'cash',
        payment_received: isFullyPaid,
        payment_received_at: isFullyPaid ? now : null,
        payment_received_by: isFullyPaid ? user?.id || null : null,
        paid_at: isFullyPaid ? now : null,
        updated_at: now,
      };

      let { error: orderPaymentStatusError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', order.id);

      if (
        orderPaymentStatusError &&
        updatePayload.payment_status === 'partially_paid' &&
        String(orderPaymentStatusError.message || '').toLowerCase().includes('check constraint')
      ) {
        const retry = await supabase
          .from('orders')
          .update({
            ...updatePayload,
            payment_status: 'pending_payment',
          })
          .eq('id', order.id);

        orderPaymentStatusError = retry.error;
      }

      if (orderPaymentStatusError) throw orderPaymentStatusError;

      try {
        await insertAuditLog('RECORD_ORDER_PAYMENT', {
          amount,
          payment_type: paymentForm.payment_type || 'balance',
          method: paymentForm.method || 'cash',
          receipt_number: paymentRecord?.receipt_number || null,
          previous_paid: summary.totalPaid,
          new_paid: newTotalPaid,
          new_balance: newBalance,
        });
      } catch (auditError) {
        console.warn('Payment saved, but audit log failed:', auditError);
      }

      if (order?.customer_id) {
        try {
          const receiptText = paymentRecord?.receipt_number
            ? ` Receipt No: ${paymentRecord.receipt_number}.`
            : '';

          await notifyUser({
            userId: order.customer_id,
            title: 'Order Payment Recorded',
            message: `Your order payment of ${formatPeso(amount)} has been recorded. Remaining balance: ${formatPeso(newBalance)}.${receiptText}`,
            type: 'payment',
            relatedTable: 'orders',
            relatedId: order.id,
          });
        } catch (notifyError) {
          console.warn('Payment saved, but notification failed:', notifyError);
        }
      }

      setPaymentToast({
        title: `${formatPeso(amount)} payment recorded`,
        message: isFullyPaid ? '✓ Order invoice is fully settled.' : `${formatPeso(newBalance)} balance remaining.`,
      });

      setTimeout(() => setPaymentToast(null), 4000);

      setPaymentForm({
        amount: '',
        payment_type: 'balance',
        method: 'cash',
      });

      await fetchOrderDetails(false);
    } catch (err) {
      showErrorPopup(err.message || 'Failed to record payment.');
    } finally {
      setSavingPayment(false);
    }
  }

  async function returnOrderToInventory() {
    if (!order?.id) return;

    if (isReturnedOrder(order)) {
      showErrorPopup('This order was already returned to inventory.');
      return;
    }

    const orderItems = Array.isArray(order.order_items) ? order.order_items : [];

    if (orderItems.length === 0) {
      showErrorPopup('This order has no order items to return.');
      return;
    }

    const confirmed = window.confirm(
      'Return this order to inventory?\n\nThis will add all ordered quantities back to stock and mark the order as returned.'
    );

    if (!confirmed) return;

    setReturningOrder(true);
    setFetchError('');

    try {
      for (const item of orderItems) {
        const partId = item.part_id;
        const quantity = Number(item.quantity) || 0;

        if (!partId || quantity <= 0) continue;

        const { data: part, error: partError } = await supabase
          .from('parts')
          .select('id, stock_quantity')
          .eq('id', partId)
          .single();

        if (partError) throw partError;

        const currentStock = Number(part?.stock_quantity) || 0;

        const { error: stockError } = await supabase
          .from('parts')
          .update({
            stock_quantity: currentStock + quantity,
          })
          .eq('id', partId);

        if (stockError) throw stockError;
      }

      const now = new Date().toISOString();
      const returnNote = `[RETURNED TO INVENTORY ${formatDateTime(now)}] Items restored to inventory by ${user?.email || 'admin'}.`;
      const updatedNotes = [order.notes, returnNote].filter(Boolean).join('\n\n');

      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'returned',
          notes: updatedNotes,
          updated_at: now,
        })
        .eq('id', order.id);

      if (orderError) throw orderError;

      try {
        await insertAuditLog('RETURN_ORDER_TO_INVENTORY', {
          items: orderItems.map((item) => ({
            part_id: item.part_id,
            quantity: Number(item.quantity) || 0,
            name: item.parts?.name || 'Part',
          })),
        });
      } catch (auditError) {
        console.warn('Return saved, but audit log failed:', auditError);
      }

      if (order?.customer_id) {
        try {
          await notifyUser({
            userId: order.customer_id,
            title: 'Order Returned',
            message: 'Your order has been returned and the products were restored to inventory.',
            type: 'order',
            relatedTable: 'orders',
            relatedId: order.id,
          });
        } catch (notifyError) {
          console.warn('Return saved, but notification failed:', notifyError);
        }
      }

      setPaymentToast({
        title: 'Order returned to inventory',
        message: 'Products were added back to inventory and the order was marked returned.',
      });

      setTimeout(() => setPaymentToast(null), 4000);

      await fetchOrderDetails(false);
    } catch (err) {
      const message = String(err.message || '');

      if (message.includes('orders_status_check')) {
        showErrorPopup(
          'Return Order is blocked because the database does not allow status = returned yet. Run the orders_status_check SQL first.\n\nOriginal error: ' + message
        );
      } else {
        showErrorPopup(message || 'Failed to return order to inventory.');
      }
    } finally {
      setReturningOrder(false);
    }
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

      const displayInvoice = buildInvoiceForDisplay(syncedInvoice, order, payments);

      setInvoice(displayInvoice);
      setDocumentModal('invoice');
    } catch (err) {
      setDocumentError(err.message || 'Failed to load invoice.');
      showErrorPopup(err.message || 'Failed to load invoice.');
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
            {fetchError || 'This order may have been deleted or you do not have permission to view it.'}
          </p>
          <button
            onClick={() => navigate('/admin/orders')}
            className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700"
          >
            Back to Orders
          </button>
        </div>

        {errorPopup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-500/30 dark:bg-dark-800">
              <p className="mb-2 text-lg font-black text-gray-950 dark:text-white">Action Failed</p>
              <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-red-700 dark:text-red-300">
                {errorPopup}
              </p>
              <button
                type="button"
                onClick={clearErrorPopup}
                className="mt-4 w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700"
              >
                Okay
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const summary = getOrderPaymentSummary(order, payments);
  const latestReceipt = getLatestReceipt(payments);
  const customerName = getCustomerName(order);
  const paymentPercent = summary.total > 0 ? Math.min(Math.round(summary.paymentPercent), 100) : 0;
  const isPaymentDisabled = isReturnedOrder(order);

  return (
    <>
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                to="/admin/orders"
                className="text-sm font-black text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
              >
                ← Back to Orders
              </Link>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white">
                Order Details
              </h1>
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                Order #{order.id?.slice(0, 8).toUpperCase()}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge status={order.status} order={order} />

              {isReturnedOrder(order) && (
                <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25">
                  Returned to Inventory
                </span>
              )}

              {summary.isFullyPaid && (
                <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25">
                  ✓ Fully Paid
                </span>
              )}

              {latestReceipt && (
                <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-mono font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                  OR {latestReceipt.receipt_number}
                </span>
              )}
            </div>
          </div>

          {documentError && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {documentError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <main className="space-y-6">
              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-gray-950 dark:text-white">
                      {customerName}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                      👤 {getCustomerContact(order)}
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
                      {formatPeso(summary.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <DetailCard label="Fulfillment" value={getFulfillmentMethod(order) === 'delivery' ? 'Delivery' : 'Pickup'} />
                  <DetailCard
                    label="Delivery Address"
                    value={
                      getFulfillmentMethod(order) === 'delivery'
                        ? order.delivery_address || 'No delivery address saved'
                        : 'Not applicable'
                    }
                  />
                  <DetailCard label="Contact Phone" value={getCustomerContact(order)} />
                </div>

                {order.notes && (
                  <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm italic leading-6 text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                    “{order.notes}”
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
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
                          className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
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
                                ⚙️
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className="font-black text-gray-950 dark:text-white">
                              {item.parts?.name || 'Part'}
                            </h3>
                            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                              {item.parts?.category || 'General'} · {formatPeso(unitPrice)} × {quantity}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                              Current stock: {item.parts?.stock_quantity ?? '—'}
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
                  <p className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:bg-dark-900/70 dark:text-gray-400">
                    No order items found.
                  </p>
                )}
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Update Status
                </p>

                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.filter((status) => status !== normalizeStatus(order.status)).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateStatus(status)}
                      disabled={updatingStatus === status}
                      className={`rounded-2xl px-4 py-2 text-xs font-black capitalize ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        ACTION_STYLES[status] || ACTION_STYLES.pending
                      }`}
                    >
                      {updatingStatus === status ? 'Updating...' : formatOrderStatus(status, order)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Payment History
                </p>

                {payments.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:bg-dark-900/70 dark:text-gray-400">
                    No payment records yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {payments.map((payment) => {
                      const processedBy = payment.profiles
                        ? `${payment.profiles.first_name || ''} ${payment.profiles.last_name || ''}`.trim()
                        : '';

                      return (
                        <div
                          key={payment.id}
                          className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap gap-2">
                                {payment.receipt_number && (
                                  <span className="rounded-full bg-primary-50 px-3 py-1 font-mono text-[11px] font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                                    OR {payment.receipt_number}
                                  </span>
                                )}

                                <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25">
                                  {formatLabel(payment.payment_type || 'payment')}
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
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Issued {formatDateTime(payment.receipt_issued_at || payment.created_at)}
                                {processedBy ? ` · processed by ${processedBy}` : ''}
                              </p>
                              {payment.notes && (
                                <p className="mt-2 rounded-2xl bg-white p-3 text-xs font-semibold text-gray-600 ring-1 ring-gray-100 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
                                  {payment.notes}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <p className="font-black text-green-600 dark:text-green-300">
                                {formatPeso(payment.amount)}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleViewReceipt(payment)}
                                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[11px] font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                              >
                                View E-Receipt
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </main>

            <aside className="space-y-6">
              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Payment Summary
                </p>

                <div className="mt-5 grid gap-3">
                  <DetailCard label="Total Amount" value={formatPeso(summary.total)} />
                  <DetailCard label="Down Payment 15%" value={formatPeso(summary.total * 0.15)} tone="yellow" />
                  <DetailCard label="Collected" value={formatPeso(summary.totalPaid)} tone="green" />
                  <DetailCard label="Balance" value={formatPeso(summary.balance)} tone={summary.balance > 0 ? 'yellow' : 'green'} />
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all"
                    style={{ width: `${paymentPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-black text-gray-500 dark:text-gray-400">
                  {paymentPercent}% paid
                </p>

                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    onClick={handleViewInvoice}
                    disabled={loadingInvoice}
                    className="w-full rounded-2xl bg-accent-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-accent-500/20 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingInvoice
                      ? 'Generating...'
                      : invoice?.invoice_number
                        ? '🧾 View Invoice'
                        : '🧾 Generate / View Invoice'}
                  </button>

                  {latestReceipt && (
                    <button
                      type="button"
                      onClick={() => handleViewReceipt(latestReceipt)}
                      className="w-full rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-700 transition hover:bg-green-100 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-500/20"
                    >
                      View Latest E-Receipt
                    </button>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Record Payment
                </p>

                {isPaymentDisabled ? (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold leading-6 text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300">
                    This order is returned. Payments are locked here. Use payment history/invoice for records.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Amount
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentForm.amount}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                      />
                      <p className="mt-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        Remaining balance: {formatPeso(summary.balance)}
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Payment Type
                      </label>
                      <select
                        value={paymentForm.payment_type || 'balance'}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            payment_type: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                      >
                        {PAYMENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type === 'down_payment' ? 'Down Payment' : formatLabel(type)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Method
                      </label>
                      <select
                        value={paymentForm.method || 'cash'}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            method: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {formatLabel(method)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={submitPayment}
                      disabled={savingPayment || summary.balance <= 0}
                      className="w-full rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingPayment ? 'Saving...' : 'Save Payment'}
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-red-600 dark:text-red-400">
                  Return / Inventory
                </p>

                <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Use this only when the order products must go back to inventory. This does not create a refund payment.
                </p>

                {isReturnedOrder(order) ? (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-black text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300">
                    Returned to inventory
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={returnOrderToInventory}
                    disabled={returningOrder}
                    className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                  >
                    {returningOrder ? 'Returning...' : '↩ Return Order to Inventory'}
                  </button>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>

      <InvoiceReceiptModal
        isOpen={documentModal === 'invoice'}
        type="invoice"
        invoice={buildInvoiceForDisplay(invoice, order, payments)}
        payments={excludeOldRefundPayments(payments)}
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

      {paymentToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs rounded-3xl border border-primary-100 bg-white px-5 py-4 shadow-2xl dark:border-primary-500/25 dark:bg-dark-800">
          <p className="mb-1 text-sm font-black text-gray-950 dark:text-white">
            {paymentToast.title}
          </p>
          <p className="text-xs leading-5 text-gray-600 dark:text-gray-400">
            {paymentToast.message}
          </p>
        </div>
      )}

      {errorPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-500/30 dark:bg-dark-800">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-red-50 text-2xl ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/25">
                ⚠️
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-gray-950 dark:text-white">
                  Action Failed
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-red-700 dark:text-red-300">
                  {errorPopup}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={clearErrorPopup}
              className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700"
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </>
  );
}
