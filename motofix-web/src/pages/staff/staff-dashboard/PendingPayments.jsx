// Place this file at:
// motofix-web/src/pages/staff/staff-dashboard/PendingPayments.jsx

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../../../lib/payments';

import {
  Section,
  StatCard,
  CustomerAvatar,
  PaymentMethodPicker,
  ModulePaymentBadge,
  formatPeso,
  getCustomerName,
  calculateBookingTotal,
  getReservationFee,
  bookingRequiresReservationPayment,
  getReservationPaidAmount,
  isReservationPaid,
  getLatestOnlinePayment,
  getOnlinePaymentReference,
} from './StaffDashboardShared';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];
const PAID_ORDER_PAYMENT_STATUSES = [
  'paid',
  'payment_received',
  'fully_paid',
  'full_paid',
  'settled',
  'completed',
  'verified',
  'confirmed',
];

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function sanitizeReference(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9\-_.]/g, '')
    .slice(0, 50);
}

function sanitizeAmountInput(value) {
  const cleaned = String(value || '').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const whole = parts[0] || '';
  const decimal = parts.slice(1).join('').slice(0, 2);

  return parts.length > 1 ? `${whole}.${decimal}` : whole;
}

function parseMoney(value) {
  const amount = Number.parseFloat(String(value || '').replace(/,/g, ''));

  if (!Number.isFinite(amount)) return 0;

  return Number(amount.toFixed(2));
}

function normalizePaymentMethod(value) {
  const method = String(value || 'cash').trim().toLowerCase();

  return ALLOWED_PAYMENT_METHODS.includes(method) ? method : 'cash';
}

function safeId(value) {
  return String(value || '');
}

function safeShortId(value) {
  return safeId(value).slice(0, 8).toUpperCase();
}

function normalizeOrderPaymentRecord(payment) {
  return {
    ...payment,
    amount: Number(payment?.amount) || 0,
    payment_type:
      payment?.payment_type ||
      (String(payment?.status || '').toLowerCase() === 'paid' ? 'full' : 'payment'),
    method: payment?.method || payment?.payment_method || payment?.provider || 'payment',
    receipt_number:
      payment?.receipt_number ||
      payment?.reference_number ||
      payment?.provider_payment_id ||
      null,
    receipt_status: payment?.receipt_status || payment?.status || null,
    receipt_issued_at:
      payment?.receipt_issued_at || payment?.paid_at || payment?.created_at || null,
    created_at: payment?.created_at || payment?.paid_at || null,
  };
}

function isConfirmedOrderPayment(payment) {
  const type = String(payment?.payment_type || payment?.type || '').toLowerCase();

  if (type === 'refund') return false;

  const status = String(payment?.status || payment?.payment_status || '').toLowerCase();
  const receiptStatus = String(payment?.receipt_status || '').toLowerCase();

  if (
    PAID_ORDER_PAYMENT_STATUSES.includes(status) ||
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
      'payment_received',
      'fully_paid',
      'full_paid',
    ].includes(status) ||
    ['issued', 'paid', 'verified', 'confirmed', 'completed', 'payment_received'].includes(receiptStatus)
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


function getConfirmedOrderPaymentTotal(paymentList = []) {
  return (paymentList || [])
    .filter(isConfirmedOrderPayment)
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function getOrderPaidAmount(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const confirmedPaid = getConfirmedOrderPaymentTotal(paymentList);
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  const orderStatus = String(order?.status || '').toLowerCase();
  const storedPaid = Number(order?.down_payment_amount ?? order?.amount_paid ?? 0) || 0;
  const remainingBalance = Number(order?.remaining_balance);

  if (
    total > 0 &&
    (
      PAID_ORDER_PAYMENT_STATUSES.includes(paymentStatus) ||
      order?.payment_received === true ||
      orderStatus === 'completed'
    )
  ) {
    return total;
  }

  if (total > 0 && Number.isFinite(remainingBalance) && remainingBalance <= 0) {
    return total;
  }

  if (total > 0 && storedPaid >= total) {
    return total;
  }

  const partialStatuses = ['partial', 'partially_paid', 'downpayment_paid'];
  const trustedOrderPaid = partialStatuses.includes(paymentStatus) ? storedPaid : 0;

  return Math.max(0, Math.min(Math.max(confirmedPaid, trustedOrderPaid), total));
}

function isOrderFullySettled(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const paymentStatus = String(order?.payment_status || '').toLowerCase();

  if (
    PAID_ORDER_PAYMENT_STATUSES.includes(paymentStatus) ||
    order?.payment_received === true
  ) {
    return true;
  }

  return total > 0 && getOrderDue(order, paymentList) <= 0;
}


function getOrderDue(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;

  return Math.max(total - getOrderPaidAmount(order, paymentList), 0);
}

function getOrderPaymentSummary(order, paymentList = []) {
  const total = Number(order?.total_amount) || 0;
  const totalPaid = getOrderPaidAmount(order, paymentList);
  const due = getOrderDue(order, paymentList);
  const isFullyPaid = total > 0 && totalPaid >= total && due <= 0;
  const percent = total > 0 ? Math.min(Math.round((totalPaid / total) * 100), 100) : 0;

  return {
    total,
    totalPaid,
    due,
    isFullyPaid,
    percent,
  };
}


function getBookingPaidAmountWithoutDoubleCount(booking, paymentList = []) {
  const total = calculateBookingTotal(booking);
  const manualTotalPaid =
    Number(summarizePayments(paymentList || []).totalPaid) || 0;
  const reservationPaidAmount = getReservationPaidAmount(booking);
  const paymentStatus = String(booking?.payment_status || '').toLowerCase();

  if (paymentStatus === 'paid' && reservationPaidAmount >= total && total > 0) {
    return total;
  }

  // If a receipt/payment row already exists for the down payment, do not add
  // bookings.down_payment_amount again. Otherwise the same ₱98 reservation fee
  // becomes counted twice and the due becomes ₱295 instead of ₱393.
  return Math.max(manualTotalPaid, reservationPaidAmount);
}

function getBookingDueWithoutDoubleCount(booking, paymentList = []) {
  const total = calculateBookingTotal(booking);
  const totalPaid = getBookingPaidAmountWithoutDoubleCount(booking, paymentList);

  return Math.max(total - totalPaid, 0);
}

function getBookingServicesSummary(booking) {
  if (booking?.services_summary) return booking.services_summary;

  const selectedServices = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (selectedServices.length > 0) {
    return selectedServices
      .map((item) => item.service_name || item.name || item.services?.name)
      .filter(Boolean)
      .join(', ');
  }

  return booking?.services?.name || 'Service';
}

function getRecordSearchText(type, record, payments = []) {
  const paymentText = (payments || [])
    .map((payment) =>
      [
        payment.receipt_number,
        payment.reference_number,
        payment.provider_payment_id,
        payment.payment_type,
        payment.method,
        payment.payment_method,
      ]
        .filter(Boolean)
        .join(' ')
    )
    .join(' ');

  return [
    record?.id,
    getCustomerName(record),
    record?.profiles?.first_name,
    record?.profiles?.last_name,
    type === 'booking' ? getBookingServicesSummary(record) : 'Parts order',
    record?.payment_status,
    record?.status,
    record?.payment_method,
    record?.payment_reference,
    record?.paymongo_checkout_session_id,
    paymentText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}


function getBookingPaymentMethodDisplay(booking, latestOnlinePayment = null) {
  const bookingMethod = String(booking?.payment_method || '').toLowerCase();
  const onlineMethod = String(latestOnlinePayment?.payment_method || latestOnlinePayment?.provider || '').toLowerCase();

  if (bookingMethod === 'cash_at_shop' || bookingMethod === 'cash') {
    return 'Cash down payment at shop';
  }

  if (bookingMethod === 'gcash_manual' || bookingMethod === 'manual_gcash' || bookingMethod === 'personal_gcash') {
    return 'Personal GCash down payment for verification';
  }

  if (
    bookingMethod === 'paymongo_qrph' ||
    bookingMethod === 'paymongo' ||
    onlineMethod === 'paymongo_qrph' ||
    onlineMethod === 'paymongo'
  ) {
    return 'PayMongo QR Ph / GCash down payment';
  }

  return bookingMethod ? bookingMethod.replace(/_/g, ' ') : 'Down payment method not selected';
}

function getBookingPaymentInstruction(booking, latestOnlinePayment = null) {
  const paymentStatus = String(booking?.payment_status || '').toLowerCase();
  const paymentMethod = String(booking?.payment_method || '').toLowerCase();

  if (paymentStatus === 'pending_payment' || paymentMethod === 'cash_at_shop' || paymentMethod === 'cash') {
    return 'Waiting for cash down payment at the shop counter before booking confirmation.';
  }

  if (
    paymentStatus === 'pending_verification' ||
    paymentMethod === 'gcash_manual' ||
    paymentMethod === 'manual_gcash' ||
    paymentMethod === 'personal_gcash'
  ) {
    return 'Waiting for staff verification of the customer’s GCash down payment reference.';
  }

  if (
    paymentStatus === 'checkout_created' ||
    paymentMethod === 'paymongo_qrph' ||
    paymentMethod === 'paymongo' ||
    latestOnlinePayment?.checkout_url ||
    latestOnlinePayment?.provider_checkout_session_id
  ) {
    return 'Waiting for PayMongo QR Ph / GCash reservation payment before booking confirmation.';
  }

  return 'Waiting for down payment before booking confirmation.';
}

function OrderPaymentBadge({ status }) {
  const paymentStatus = String(status || 'pending_payment').toLowerCase();
  const paid = PAID_ORDER_PAYMENT_STATUSES.includes(paymentStatus);

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${
        paid
          ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
          : 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25'
      }`}
    >
      {paid ? 'Payment Received' : paymentStatus.replace(/_/g, ' ')}
    </span>
  );
}


function getBookingPaymentActionLabel(type, record, due, totalPaid) {
  if (type !== 'booking') return 'Confirm';

  const reservationFee = getReservationFee(record);

  if (totalPaid >= reservationFee && due > 0) {
    return 'Record Balance';
  }

  return 'Confirm';
}

function PaginationControls({ page, totalPages, pageSize, onPageChange, onPageSizeChange }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Rows
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          First
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          Prev
        </button>
        <span className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 dark:bg-dark-900 dark:text-gray-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
        >
          Last
        </button>
      </div>
    </div>
  );
}

export default function PendingPayments({ staffId, onReceipt }) {
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookingPayments, setBookingPayments] = useState({});
  const [onlineBookingPayments, setOnlineBookingPayments] = useState({});
  const [orderPayments, setOrderPayments] = useState({});

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [search, setSearch] = useState('');
  const [bookingPage, setBookingPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [error, setError] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchPending();

    const tables = ['bookings', 'orders', 'payments', 'booking_payments', 'order_payments'];

    const channels = tables.map((table) =>
      supabase
        .channel(`staff-pending-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => fetchPending(false))
        .subscribe()
    );

    const handleFocus = () => fetchPending(false);

    window.addEventListener('focus', handleFocus);

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    setBookingPage(1);
    setOrderPage(1);
  }, [search, pageSize]);

  async function fetchPending(showLoader = true) {
    if (showLoader) setLoading(true);

    setBookingPayments({});
    setOnlineBookingPayments({});
    setOrderPayments({});
    setError('');

    try {
      const [bookingsResult, ordersResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(`
            *,
            services(name, base_price, labor_cost),
            booking_services(id, service_id, service_name, base_price, labor_cost, estimated_duration_minutes, quantity),
            profiles!bookings_customer_id_fkey(first_name, last_name, profile_photo_url)
          `)
          .neq('status', 'completed')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('*, profiles!orders_customer_id_fkey(first_name, last_name, profile_photo_url)')
          .not('status', 'in', '(completed,cancelled,canceled,returned,refunded,void)')
          .order('created_at', { ascending: false }),
      ]);

      if (bookingsResult.error || ordersResult.error) {
        throw new Error(
          bookingsResult.error?.message ||
            ordersResult.error?.message ||
            'Failed to load pending payments.'
        );
      }

      const bookingsData = bookingsResult.data || [];
      const ordersData = ordersResult.data || [];

      let groupedBookingPayments = {};
      let groupedOnlineBookingPayments = {};

      if (bookingsData.length) {
        const bookingIds = bookingsData.map((booking) => booking.id).filter(Boolean);

        const allBookingPayments = await fetchPaymentsFor({ bookingIds });

        (allBookingPayments || []).forEach((payment) => {
          if (!payment.booking_id) return;

          if (!groupedBookingPayments[payment.booking_id]) {
            groupedBookingPayments[payment.booking_id] = [];
          }

          groupedBookingPayments[payment.booking_id].push(payment);
        });

        try {
          const { data: allOnlinePayments, error: onlinePaymentError } = await supabase
            .from('booking_payments')
            .select(`
              id,
              booking_id,
              provider,
              status,
              amount,
              currency,
              reference_number,
              checkout_url,
              provider_checkout_session_id,
              provider_payment_intent_id,
              provider_payment_id,
              payment_method,
              fee_amount,
              net_amount,
              paid_at,
              metadata,
              created_at
            `)
            .in('booking_id', bookingIds)
            .order('created_at', { ascending: true });

          if (onlinePaymentError) throw onlinePaymentError;

          (allOnlinePayments || []).forEach((payment) => {
            if (!payment.booking_id) return;

            if (!groupedOnlineBookingPayments[payment.booking_id]) {
              groupedOnlineBookingPayments[payment.booking_id] = [];
            }

            groupedOnlineBookingPayments[payment.booking_id].push(payment);
          });
        } catch (onlinePaymentError) {
          console.warn('Failed to load booking online payments:', onlinePaymentError.message);
          groupedOnlineBookingPayments = {};
        }
      }

      let groupedOrderPayments = {};

      if (ordersData.length) {
        const orderIds = ordersData.map((order) => order.id).filter(Boolean);

        const [manualPaymentsResult, onlinePaymentsResult] = await Promise.all([
          fetchPaymentsFor({ orderIds }),
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

        const manualPayments = Array.isArray(manualPaymentsResult) ? manualPaymentsResult : [];
        const onlinePayments = onlinePaymentsResult.error ? [] : onlinePaymentsResult.data || [];

        if (onlinePaymentsResult.error) {
          console.warn('Failed to load order online payments:', onlinePaymentsResult.error.message);
        }

        [...manualPayments, ...onlinePayments]
          .map(normalizeOrderPaymentRecord)
          .forEach((payment) => {
            if (!payment.order_id) return;

            if (!groupedOrderPayments[payment.order_id]) {
              groupedOrderPayments[payment.order_id] = [];
            }

            groupedOrderPayments[payment.order_id].push(payment);
          });
      }

      setBookings(
        bookingsData.filter(
          (booking) =>
            getBookingDueWithoutDoubleCount(
              booking,
              groupedBookingPayments[booking.id] || []
            ) > 0
        )
      );

      setOrders(
        ordersData.filter((order) => {
          const payments = groupedOrderPayments[order.id] || [];

          return !isOrderFullySettled(order, payments) && getOrderDue(order, payments) > 0;
        })
      );

      setBookingPayments(groupedBookingPayments);
      setOnlineBookingPayments(groupedOnlineBookingPayments);
      setOrderPayments(groupedOrderPayments);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load pending payments.');
      setBookings([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  function openConfirm(type, record, due, total, totalPaid) {
    if (!record?.id || due <= 0) return;

    setConfirming({
      type,
      record,
      due,
      total,
      totalPaid,
    });
    setAmount(due.toFixed(2));
    setMethod('cash');
    setPaymentReference('');
    setError('');
  }

  function closeConfirm() {
    if (savingPayment) return;

    setConfirming(null);
    setAmount('');
    setMethod('cash');
    setPaymentReference('');
    setError('');
  }

  async function confirmPayment() {
    if (!confirming || savingPayment) return;

    const { type, record, due, total } = confirming;
    const paidAmount = parseMoney(amount);
    const cleanMethod = normalizePaymentMethod(method);
    const cleanReference = sanitizeReference(paymentReference);
    const customerName = getCustomerName(record);

    if (!paidAmount || paidAmount <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }

    if (paidAmount > due) {
      setError(`Amount cannot exceed ${formatPeso(due)}.`);
      return;
    }

    if (cleanMethod === 'gcash' && !cleanReference) {
      setError('Enter the GCash reference number before confirming payment.');
      return;
    }

    const actionConfirmed = window.confirm(
      `Confirm ${formatPeso(paidAmount)} payment for ${customerName}?\n\n` +
        `Type: ${type === 'booking' ? 'Booking' : 'Order'}\n` +
        `Method: ${cleanMethod.replace(/_/g, ' ')}\n` +
        `Current due: ${formatPeso(due)}\n\n` +
        'This will generate a receipt and update the payment record.'
    );

    if (!actionConfirmed) return;

    setSavingPayment(true);
    setError('');

    try {
      let paymentRecord = null;
      const now = new Date().toISOString();
      const receiptNotes = cleanReference ? `Reference: ${cleanReference}` : null;

      if (type === 'booking') {
        const isFullPayment = paidAmount >= due;

        const { data: paymentData, error: paymentError } = await supabase
          .from('payments')
          .insert({
            booking_id: record.id,
            amount: paidAmount,
            payment_type: isFullPayment ? 'full' : 'balance',
            method: cleanMethod,
            notes: receiptNotes,
            processed_by: staffId || null,
          })
          .select('id, receipt_number, receipt_issued_at, payment_type, method, amount')
          .single();

        if (paymentError) throw paymentError;
        paymentRecord = paymentData;

        if (
          bookingRequiresReservationPayment(record) &&
          !isReservationPaid(record) &&
          paidAmount >= getReservationFee(record)
        ) {
          const { error: modulePaymentError } = await supabase
            .from('bookings')
            .update({
              payment_status: 'paid',
              reservation_fee: getReservationFee(record),
              payment_reference: cleanReference || paymentRecord?.receipt_number || null,
              paid_at: now,
              updated_at: now,
            })
            .eq('id', record.id);

          if (modulePaymentError) throw modulePaymentError;
        }

        if (isFullPayment) {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              status: 'completed',
              updated_at: now,
            })
            .eq('id', record.id);

          if (updateError) throw updateError;
        }

        await supabase.from('audit_logs').insert({
          action: 'CONFIRM_PAYMENT',
          entity: 'bookings',
          entity_id: record.id,
          performed_by: staffId || null,
          details: {
            method: cleanMethod,
            amount: paidAmount,
            payment_reference: cleanReference || null,
            is_full_payment: isFullPayment,
          },
        });

        onReceipt?.({
          customerName,
          type,
          paymentType: paymentRecord?.payment_type || (isFullPayment ? 'full' : 'balance'),
          items: [{ label: getBookingServicesSummary(record), amount: total }],
          total,
          amountPaid: paymentRecord?.amount ?? paidAmount,
          paymentMethod: paymentRecord?.method || cleanMethod,
          receiptNumber: paymentRecord?.receipt_number,
          issuedAt: paymentRecord?.receipt_issued_at,
          referenceId: safeShortId(record.id),
        });
      } else {
        const previousPaid = getOrderPaidAmount(record, orderPayments[record.id] || []);
        const newTotalPaid = Math.min(previousPaid + paidAmount, total);
        const newDue = Math.max(total - newTotalPaid, 0);
        const isFullPayment = total > 0 && newDue <= 0;

        const { data: paymentData, error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: record.id,
            amount: paidAmount,
            payment_type: isFullPayment ? 'full' : 'balance',
            method: cleanMethod,
            notes: receiptNotes,
            processed_by: staffId || null,
          })
          .select('id, receipt_number, receipt_issued_at, payment_type, method, amount')
          .single();

        if (paymentError) throw paymentError;
        paymentRecord = paymentData;

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            payment_status: isFullPayment ? 'paid' : 'partially_paid',
            down_payment_amount: newTotalPaid,
            remaining_balance: newDue,
            payment_method: cleanMethod,
            payment_reference: cleanReference || record.payment_reference || null,
            payment_received: isFullPayment,
            payment_received_at: isFullPayment ? now : null,
            payment_received_by: isFullPayment ? staffId || null : null,
            paid_at: isFullPayment ? now : null,
            updated_at: now,
          })
          .eq('id', record.id);

        if (updateError) throw updateError;

        await supabase.from('audit_logs').insert({
          action: 'CONFIRM_PAYMENT',
          entity: 'orders',
          entity_id: record.id,
          performed_by: staffId || null,
          details: {
            method: cleanMethod,
            amount: paidAmount,
            payment_reference: cleanReference || null,
            previous_paid: previousPaid,
            new_paid: newTotalPaid,
            new_due: newDue,
            is_full_payment: isFullPayment,
          },
        });

        onReceipt?.({
          customerName,
          type,
          paymentType: paymentRecord?.payment_type || (isFullPayment ? 'full' : 'balance'),
          items: [{ label: 'Parts order', amount: Number(record.total_amount) || 0 }],
          total,
          amountPaid: paymentRecord?.amount ?? paidAmount,
          paymentMethod: paymentRecord?.method || cleanMethod,
          receiptNumber: paymentRecord?.receipt_number,
          issuedAt: paymentRecord?.receipt_issued_at,
          referenceId: safeShortId(record.id),
        });
      }

      setConfirming(null);
      setAmount('');
      setMethod('cash');
      setPaymentReference('');
      await fetchPending(false);
    } catch (err) {
      setError(err.message || 'Failed to confirm payment.');
    } finally {
      setSavingPayment(false);
    }
  }

  const filteredBookings = useMemo(() => {
    const query = sanitizeSearch(search).toLowerCase();

    if (!query) return bookings;

    return bookings.filter((booking) =>
      getRecordSearchText('booking', booking, bookingPayments[booking.id] || []).includes(query)
    );
  }, [bookings, bookingPayments, search]);

  const filteredOrders = useMemo(() => {
    const query = sanitizeSearch(search).toLowerCase();

    if (!query) return orders;

    return orders.filter((order) =>
      getRecordSearchText('order', order, orderPayments[order.id] || []).includes(query)
    );
  }, [orders, orderPayments, search]);

  const totalPending = filteredBookings.length + filteredOrders.length;

  const totals = useMemo(() => {
    const bookingDue = filteredBookings.reduce(
      (sum, booking) =>
        sum + getBookingDueWithoutDoubleCount(booking, bookingPayments[booking.id] || []),
      0
    );

    const orderDue = filteredOrders.reduce(
      (sum, order) => sum + getOrderDue(order, orderPayments[order.id] || []),
      0
    );

    return {
      bookingDue,
      orderDue,
      totalDue: bookingDue + orderDue,
    };
  }, [filteredBookings, filteredOrders, bookingPayments, orderPayments]);

  const safePageSize = PAGE_SIZE_OPTIONS.includes(Number(pageSize))
    ? Number(pageSize)
    : DEFAULT_PAGE_SIZE;

  const bookingTotalPages = Math.max(1, Math.ceil(filteredBookings.length / safePageSize));
  const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / safePageSize));
  const safeBookingPage = Math.min(Math.max(bookingPage, 1), bookingTotalPages);
  const safeOrderPage = Math.min(Math.max(orderPage, 1), orderTotalPages);
  const bookingStart = (safeBookingPage - 1) * safePageSize;
  const orderStart = (safeOrderPage - 1) * safePageSize;
  const paginatedBookings = filteredBookings.slice(bookingStart, bookingStart + safePageSize);
  const paginatedOrders = filteredOrders.slice(orderStart, orderStart + safePageSize);

  function PaymentRow({ type, record, payments }) {
    const orderSummary = type === 'order' ? getOrderPaymentSummary(record, payments) : null;
    const total = type === 'booking' ? calculateBookingTotal(record) : orderSummary.total;
    const totalPaid =
      type === 'booking'
        ? getBookingPaidAmountWithoutDoubleCount(record, payments)
        : orderSummary.totalPaid;
    const due =
      type === 'booking'
        ? getBookingDueWithoutDoubleCount(record, payments)
        : orderSummary.due;
    const percent =
      type === 'booking'
        ? total > 0
          ? Math.min(Math.round((totalPaid / total) * 100), 100)
          : 0
        : orderSummary.percent;
    const requiresReservationPayment = type === 'booking' && bookingRequiresReservationPayment(record);
    const onlinePayments = type === 'booking' ? onlineBookingPayments[record.id] || [] : [];
    const latestOnlinePayment = getLatestOnlinePayment(onlinePayments);

    return (
      <div className="flex items-center gap-4 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900">
        <CustomerAvatar profile={record.profiles} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-950 dark:text-white">
            {getCustomerName(record)}
          </p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {type === 'booking' ? getBookingServicesSummary(record) : 'Parts order'} · {formatPeso(total)} total
          </p>

          {requiresReservationPayment && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ModulePaymentBadge status={record.payment_status} />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                Fee {formatPeso(getReservationFee(record))} · {getBookingPaymentMethodDisplay(record, latestOnlinePayment)} · Ref {record.payment_reference || getOnlinePaymentReference(record, latestOnlinePayment)}
              </span>
            </div>
          )}

          {type === 'order' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OrderPaymentBadge status={record.payment_status} />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                Method {String(record.payment_method || 'counter').replace(/_/g, ' ')} · Ref {record.payment_reference || record.paymongo_checkout_session_id || '—'}
              </span>
            </div>
          )}

          {requiresReservationPayment && !isReservationPaid(record) && (
            <p className="mt-2 rounded-xl bg-yellow-50 px-3 py-2 text-[11px] font-semibold leading-4 text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-200 dark:ring-yellow-500/25">
              {getBookingPaymentInstruction(record, latestOnlinePayment)}
            </p>
          )}

          {totalPaid > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} />
              </div>
              <span className="whitespace-nowrap text-[10px] font-black text-green-600 dark:text-green-300">
                {percent}% paid
              </span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-black text-accent-600 dark:text-accent-400">
            {formatPeso(due)}
          </p>
          <p className="mb-2 text-[10px] font-bold text-gray-400">due</p>
          <button
            type="button"
            onClick={() => openConfirm(type, record, due, total, totalPaid)}
            disabled={savingPayment || due <= 0}
            className="rounded-2xl bg-primary-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {getBookingPaymentActionLabel(type, record, due, totalPaid)}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-gray-200 bg-white py-20 shadow-sm dark:border-dark-700 dark:bg-dark-800">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Loading payments...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Pending Records" value={totalPending} icon="💰" tone="primary" />
        <StatCard label="Bookings Due" value={formatPeso(totals.bookingDue)} icon="📅" tone="accent" />
        <StatCard label="Orders Due" value={formatPeso(totals.orderDue)} icon="📦" tone="yellow" />
        <StatCard label="Total Due" value={formatPeso(totals.totalDue)} icon="⚠️" tone="green" />
      </div>

      <Section>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Pending Payments
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Search, verify, and record remaining booking/order payments.
              {lastUpdated ? ` Last updated ${lastUpdated.toLocaleString('en-PH')}.` : ''}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(sanitizeSearch(event.target.value))}
              placeholder="Search customer, receipt, method, status, or ID..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white sm:w-96"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => fetchPending(false)}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
            >
              Refresh
            </button>
          </div>
        </div>
      </Section>

      {totalPending === 0 ? (
        <Section>
          <div className="py-12 text-center">
            <span className="text-5xl">🎉</span>
            <p className="mt-4 text-lg font-black text-gray-950 dark:text-white">All caught up!</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No pending payments match the current search.
            </p>
          </div>
        </Section>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-black text-gray-950 dark:text-white">Bookings</h2>
              {filteredBookings.length > 0 && (
                <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-black text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25">
                  {filteredBookings.length} pending
                </span>
              )}
            </div>

            {filteredBookings.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-gray-300 py-8 text-center text-sm font-semibold text-gray-500 dark:border-dark-700 dark:text-gray-400">
                None pending ✓
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedBookings.map((booking) => (
                    <PaymentRow
                      key={booking.id}
                      type="booking"
                      record={booking}
                      payments={bookingPayments[booking.id] || []}
                    />
                  ))}
                </div>

                <PaginationControls
                  page={safeBookingPage}
                  totalPages={bookingTotalPages}
                  pageSize={safePageSize}
                  onPageChange={(nextPage) =>
                    setBookingPage(Math.min(Math.max(nextPage, 1), bookingTotalPages))
                  }
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </Section>

          <Section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-black text-gray-950 dark:text-white">Orders</h2>
              {filteredOrders.length > 0 && (
                <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-black text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25">
                  {filteredOrders.length} pending
                </span>
              )}
            </div>

            {filteredOrders.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-gray-300 py-8 text-center text-sm font-semibold text-gray-500 dark:border-dark-700 dark:text-gray-400">
                None pending ✓
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedOrders.map((order) => (
                    <PaymentRow
                      key={order.id}
                      type="order"
                      record={order}
                      payments={orderPayments[order.id] || []}
                    />
                  ))}
                </div>

                <PaginationControls
                  page={safeOrderPage}
                  totalPages={orderTotalPages}
                  pageSize={safePageSize}
                  onPageChange={(nextPage) =>
                    setOrderPage(Math.min(Math.max(nextPage, 1), orderTotalPages))
                  }
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </Section>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-700 dark:bg-dark-800">
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-primary-50 text-2xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
                💳
              </div>
              <h3 className="text-xl font-black text-gray-950 dark:text-white">Confirm Payment</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {getCustomerName(confirming.record)} —{' '}
                <span className="font-black text-accent-600 dark:text-accent-400">
                  {formatPeso(confirming.due)} due
                </span>
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Amount Received
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
              className="mb-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-lg font-black text-gray-950 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Payment Method
            </p>
            <div className="mb-4">
              <PaymentMethodPicker
                value={method}
                onChange={(value) => setMethod(normalizePaymentMethod(value))}
              />
            </div>

            {normalizePaymentMethod(method) === 'gcash' && (
              <>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  GCash Reference Number
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(sanitizeReference(event.target.value))}
                  placeholder="Required for GCash"
                  className="mb-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-950 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                />
              </>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmPayment}
                disabled={savingPayment}
                className="w-full rounded-2xl bg-primary-600 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPayment ? 'Saving...' : 'Confirm & Generate Receipt'}
              </button>

              <button
                type="button"
                onClick={closeConfirm}
                disabled={savingPayment}
                className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
