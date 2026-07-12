// Place this file at:
// motofix-web/src/pages/staff/staff-dashboard/PendingPayments.jsx

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../../../lib/payments';
import { generateOrSyncBookingInvoice } from '../../../lib/invoices';
import { createReceiptHistory } from '../../../lib/receiptHistory';

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
  hasReservationPaymentEvidence,
  isReservationPaymentVerified,
  isReservationPaid,
  getLatestOnlinePayment,
  getOnlinePaymentReference,
} from './StaffDashboardShared';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];
const GCASH_REFERENCE_MIN_LENGTH = 8;
const GCASH_REFERENCE_MAX_LENGTH = 20;
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

const CONFIRMED_BOOKING_ONLINE_PAYMENT_STATUSES = [
  'paid',
  'completed',
  'success',
  'successful',
  'succeeded',
  'captured',
  'verified',
  'confirmed',
  'settled',
];

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function sanitizeGcashReference(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\D/g, '')
    .slice(0, GCASH_REFERENCE_MAX_LENGTH);
}

function isValidGcashReference(value) {
  const reference = sanitizeGcashReference(value);

  return (
    reference.length >= GCASH_REFERENCE_MIN_LENGTH &&
    reference.length <= GCASH_REFERENCE_MAX_LENGTH &&
    !/^0+$/.test(reference)
  );
}

async function findDuplicateGcashReference(reference) {
  const cleanReference = sanitizeGcashReference(reference);

  if (!isValidGcashReference(cleanReference)) return null;

  const [paymentsResult, bookingsResult, ordersResult] = await Promise.all([
    supabase
      .from('payments')
      .select('id, booking_id, order_id')
      .ilike('notes', `%Reference: ${cleanReference}%`)
      .limit(1),
    supabase
      .from('bookings')
      .select('id')
      .eq('payment_reference', cleanReference)
      .limit(1),
    supabase
      .from('orders')
      .select('id')
      .eq('payment_reference', cleanReference)
      .limit(1),
  ]);

  const queryError =
    paymentsResult.error ||
    bookingsResult.error ||
    ordersResult.error;

  if (queryError) {
    throw new Error(
      queryError.message ||
        'Unable to verify whether the GCash reference was already used.'
    );
  }

  if ((paymentsResult.data || []).length > 0) {
    return {
      source: 'payment',
      id: paymentsResult.data[0].id,
    };
  }

  if ((bookingsResult.data || []).length > 0) {
    return {
      source: 'booking',
      id: bookingsResult.data[0].id,
    };
  }

  if ((ordersResult.data || []).length > 0) {
    return {
      source: 'order',
      id: ordersResult.data[0].id,
    };
  }

  return null;
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

function getReservationPaymentMethod(booking, latestOnlinePayment = null) {
  const rawMethod = String(
    latestOnlinePayment?.payment_method ||
      latestOnlinePayment?.provider ||
      booking?.payment_method ||
      ''
  ).toLowerCase();

  if (rawMethod.includes('cash')) return 'cash';
  if (rawMethod.includes('card')) return 'card';
  if (rawMethod.includes('bank')) return 'bank_transfer';

  // PayMongo QR Ph, personal GCash, and manual GCash are recorded as GCash
  // in the canonical payments table.
  return 'gcash';
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


function getConfirmedBookingOnlinePaymentTotal(paymentList = []) {
  return (paymentList || []).reduce((sum, payment) => {
    const paymentType = String(
      payment?.payment_type || payment?.type || ''
    ).toLowerCase();

    if (paymentType === 'refund') {
      return sum - (Number(payment?.amount) || 0);
    }

    const status = String(
      payment?.status || payment?.payment_status || ''
    ).toLowerCase();

    if (!CONFIRMED_BOOKING_ONLINE_PAYMENT_STATUSES.includes(status)) {
      return sum;
    }

    return sum + (Number(payment?.amount) || 0);
  }, 0);
}

function manualPaymentsAlreadyIncludeReservation(booking, paymentList = []) {
  const verifiedAt = new Date(
    booking?.payment_received_at || booking?.paid_at || ''
  ).getTime();

  if (!Number.isFinite(verifiedAt)) return false;

  // Counter reservation payments are inserted immediately before the booking
  // is marked payment_received. Payments made later are balance payments.
  const verificationWindowEnd = verifiedAt + 2 * 60 * 1000;

  return (paymentList || []).some((payment) => {
    const paymentType = String(
      payment?.payment_type || payment?.type || ''
    ).toLowerCase();

    if (paymentType === 'refund') return false;
    if ((Number(payment?.amount) || 0) <= 0) return false;

    const createdAt = new Date(
      payment?.created_at ||
        payment?.receipt_issued_at ||
        payment?.paid_at ||
        ''
    ).getTime();

    return (
      Number.isFinite(createdAt) &&
      createdAt <= verificationWindowEnd
    );
  });
}

function getBookingPaidAmountWithoutDoubleCount(
  booking,
  paymentList = [],
  onlinePaymentList = []
) {
  const total = calculateBookingTotal(booking);
  const manualTotalPaid =
    Number(summarizePayments(paymentList || []).totalPaid) || 0;
  const onlineTotalPaid = getConfirmedBookingOnlinePaymentTotal(
    onlinePaymentList
  );
  const reservationPaidAmount = getReservationPaidAmount(booking);

  const reservationNeedsFallback =
    reservationPaidAmount > 0 &&
    onlineTotalPaid <= 0 &&
    !manualPaymentsAlreadyIncludeReservation(booking, paymentList);

  const totalPaid =
    manualTotalPaid +
    onlineTotalPaid +
    (reservationNeedsFallback ? reservationPaidAmount : 0);

  return Math.max(0, total > 0 ? Math.min(totalPaid, total) : totalPaid);
}

function getBookingDueWithoutDoubleCount(
  booking,
  paymentList = [],
  onlinePaymentList = []
) {
  const total = calculateBookingTotal(booking);
  const totalPaid = getBookingPaidAmountWithoutDoubleCount(
    booking,
    paymentList,
    onlinePaymentList
  );

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

  if (
    hasReservationPaymentEvidence(booking) &&
    !isReservationPaymentVerified(booking)
  ) {
    return 'Customer payment detected. A staff member must verify the payment before confirming the booking.';
  }

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



function needsReservationVerification(booking) {
  return (
    bookingRequiresReservationPayment(booking) &&
    hasReservationPaymentEvidence(booking) &&
    !isReservationPaymentVerified(booking)
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


function getReceiptPaymentMethod(method) {
  const value = String(method || 'cash').toLowerCase();

  if (value.includes('gcash')) return 'GCash Manual';
  if (value.includes('paymongo')) return 'PayMongo';
  if (value.includes('qrph')) return 'QRPH';
  if (value.includes('card')) return 'Card';
  if (value.includes('bank')) return 'Bank Transfer';

  return 'Cash';
}

function getBookingReceiptItems(booking, total) {
  const receiptItems = [];

  const services = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  services.forEach((service) => {
    const quantity = Math.max(1, Number(service?.quantity) || 1);
    const unitPrice =
      (Number(service?.base_price) || 0) +
      (Number(service?.labor_cost) || 0);

    receiptItems.push({
      itemType: 'service',
      itemName:
        service?.service_name ||
        service?.name ||
        service?.services?.name ||
        'Motorcycle Service',
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
      relatedServiceId: service?.service_id || null,
    });
  });

  const products = Array.isArray(booking?.parts_used)
    ? booking.parts_used
    : Array.isArray(booking?.products)
      ? booking.products
      : [];

  products.forEach((product) => {
    const quantity = Math.max(1, Number(product?.quantity) || 1);
    const unitPrice =
      Number(product?.unit_price ?? product?.price) || 0;

    receiptItems.push({
      itemType: 'product',
      itemName: product?.name || 'Product / Part',
      quantity,
      unitPrice,
      lineTotal:
        Number(product?.subtotal) || unitPrice * quantity,
      relatedPartId: product?.part_id || product?.id || null,
    });
  });

  if (receiptItems.length === 0) {
    receiptItems.push({
      itemType: 'service',
      itemName: getBookingServicesSummary(booking),
      quantity: 1,
      unitPrice: Number(total) || 0,
      lineTotal: Number(total) || 0,
    });
  }

  return receiptItems;
}

async function saveReceiptHistorySafely(payload) {
  try {
    const receipt = await createReceiptHistory(payload);

    return {
      receipt,
      warning: '',
    };
  } catch (receiptError) {
    console.error('Payment saved, but receipt history failed:', receiptError);

    return {
      receipt: null,
      warning:
        'Payment was saved, but it could not be added to the Receipts tab. Check the receipts table permissions or run the receipt-history SQL migration.',
    };
  }
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
            profiles!bookings_customer_id_fkey(first_name, last_name, phone, email, profile_photo_url)
          `)
          .neq('status', 'completed')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('*, profiles!orders_customer_id_fkey(first_name, last_name, phone, email, profile_photo_url)')
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
        bookingsData.filter((booking) => {
          const payments = groupedBookingPayments[booking.id] || [];
          const onlinePayments =
            groupedOnlineBookingPayments[booking.id] || [];

          return (
            needsReservationVerification(booking) ||
            getBookingDueWithoutDoubleCount(
              booking,
              payments,
              onlinePayments
            ) > 0
          );
        })
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


  async function verifyReservationPayment(record, latestOnlinePayment = null) {
    if (!record?.id || savingPayment) return;

    if (!needsReservationVerification(record)) {
      setError('This reservation payment is not waiting for staff verification.');
      return;
    }

    const reservationFee = getReservationFee(record);
    const onlineAmount = Number(latestOnlinePayment?.amount) || 0;
    const verifiedAmount = onlineAmount > 0 ? onlineAmount : reservationFee;
    const rawReference = getOnlinePaymentReference(record, latestOnlinePayment);
    const reference =
      rawReference && rawReference !== '—' ? rawReference : null;
    const canonicalMethod = getReservationPaymentMethod(
      record,
      latestOnlinePayment
    );

    const actionConfirmed = window.confirm(
      `Verify this reservation payment?\n\n` +
        `Customer: ${getCustomerName(record)}\n` +
        `Amount: ${formatPeso(verifiedAmount)}\n` +
        `Reference: ${reference || 'No reference'}\n\n` +
        'After verification, staff may confirm the booking.'
    );

    if (!actionConfirmed) return;

    setSavingPayment(true);
    setError('');

    let receiptHistoryWarning = '';

    try {
      const now = new Date().toISOString();

      // Keep one canonical down-payment entry in public.payments. The invoice
      // RPC uses this table to calculate amount_paid and balance_due.
      const { data: existingPayments, error: existingPaymentsError } =
        await supabase
          .from('payments')
          .select(
            'id, amount, payment_type, method, notes, receipt_number, receipt_issued_at, created_at'
          )
          .eq('booking_id', record.id)
          .neq('payment_type', 'refund');

      if (existingPaymentsError) throw existingPaymentsError;

      let canonicalPayment = (existingPayments || []).find(
        (payment) => {
          const paymentType = String(
            payment?.payment_type || ''
          ).toLowerCase();
          const paymentAmount = Number(payment?.amount) || 0;
          const notes = String(payment?.notes || '');

          if (paymentType === 'down_payment') return true;

          return (
            Math.abs(paymentAmount - verifiedAmount) < 0.01 &&
            Boolean(reference) &&
            notes.includes(reference)
          );
        }
      );

      if (!canonicalPayment && verifiedAmount > 0) {
        const referenceNote = reference
          ? `Verified reservation payment · Reference: ${reference}`
          : 'Verified reservation payment';

        const {
          data: insertedCanonicalPayment,
          error: canonicalPaymentError,
        } = await supabase
            .from('payments')
            .insert({
              booking_id: record.id,
              amount: verifiedAmount,
              payment_type: 'down_payment',
              method: canonicalMethod,
              notes: referenceNote,
              processed_by: staffId || null,
            })
            .select(
              'id, amount, payment_type, method, receipt_number, receipt_issued_at, created_at'
            )
            .single();

        if (canonicalPaymentError) throw canonicalPaymentError;

        canonicalPayment = insertedCanonicalPayment;
      }

      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          reservation_fee: reservationFee,
          payment_reference: reference || record.payment_reference || null,
          payment_received: true,
          payment_received_at: now,
          payment_received_by: staffId || null,
          paid_at:
            record.paid_at ||
            latestOnlinePayment?.paid_at ||
            latestOnlinePayment?.created_at ||
            now,
          updated_at: now,
        })
        .eq('id', record.id);

      if (updateError) throw updateError;

      // Rebuild invoice totals after the canonical payment is stored.
      await generateOrSyncBookingInvoice({ bookingId: record.id });

      if (canonicalPayment?.id) {
        const issuedAt =
          canonicalPayment.receipt_issued_at ||
          canonicalPayment.created_at ||
          now;
        const receiptNumber =
          canonicalPayment.receipt_number ||
          `MTFX-DP-${safeShortId(canonicalPayment.id)}`;

        const receiptHistoryResult = await saveReceiptHistorySafely({
          receiptNumber,
          sourceType: 'booking',
          sourceId: record.id,
          paymentTable: 'payments',
          paymentId: canonicalPayment.id,
          customerId: record.customer_id || null,
          customerName: getCustomerName(record),
          customerPhone:
            record.profiles?.phone ||
            record.customer?.phone ||
            null,
          customerEmail:
            record.profiles?.email ||
            record.customer?.email ||
            null,
          paymentMethod: getReceiptPaymentMethod(
            canonicalPayment.method || canonicalMethod
          ),
          paymentReference:
            reference ||
            record.payment_reference ||
            receiptNumber,
          subtotal: calculateBookingTotal(record),
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: calculateBookingTotal(record),
          amountPaid: verifiedAmount,
          balanceAmount: Math.max(
            calculateBookingTotal(record) - verifiedAmount,
            0
          ),
          status: 'issued',
          notes: 'Verified booking reservation payment.',
          issuedBy: staffId || null,
          issuedAt,
          metadata: {
            payment_type: 'down_payment',
            booking_status: record.status || null,
            provider: latestOnlinePayment?.provider || null,
          },
          items: getBookingReceiptItems(
            record,
            calculateBookingTotal(record)
          ),
        });

        receiptHistoryWarning = receiptHistoryResult.warning;
      }

      const { error: auditError } = await supabase.from('audit_logs').insert({
        action: 'VERIFY_RESERVATION_PAYMENT',
        entity: 'bookings',
        entity_id: record.id,
        performed_by: staffId || null,
        details: {
          amount: verifiedAmount,
          reservation_fee: reservationFee,
          payment_method: canonicalMethod,
          payment_reference: reference,
          provider: latestOnlinePayment?.provider || null,
          provider_payment_id: latestOnlinePayment?.provider_payment_id || null,
          canonical_payment_id: canonicalPayment?.id || null,
          canonical_payment_created: Boolean(canonicalPayment?.id),
          verified_at: now,
        },
      });

      if (auditError) {
        console.warn(
          'Payment verified, but the audit log could not be saved:',
          auditError.message
        );
      }

      if (canonicalPayment?.id) {
        const bookingTotal = calculateBookingTotal(record);
        const receiptNumber =
          canonicalPayment.receipt_number ||
          `MTFX-DP-${safeShortId(canonicalPayment.id)}`;

        onReceipt?.({
          customerName: getCustomerName(record),
          customerPhone:
            record.profiles?.phone ||
            record.customer?.phone ||
            '—',
          customerEmail:
            record.profiles?.email ||
            record.customer?.email ||
            '—',
          type: 'reservation_payment_verification',
          sourceLabel: 'Payment Verification',
          transactionLabel: 'Verified Reservation Payment',
          paymentType: 'down_payment',
          paymentReference:
            reference ||
            record.payment_reference ||
            receiptNumber,
          items: getBookingReceiptItems(
            record,
            bookingTotal
          ).map((item) => ({
            label: item.itemName || 'Motorcycle Service',
            description: item.itemType || 'Service',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            amount: item.lineTotal,
          })),
          subtotal: bookingTotal,
          discountAmount: 0,
          taxAmount: 0,
          total: bookingTotal,
          amountPaid: verifiedAmount,
          balance: Math.max(
            bookingTotal - verifiedAmount,
            0
          ),
          status:
            bookingTotal - verifiedAmount <= 0
              ? 'paid'
              : 'partially_paid',
          paymentMethod: getReceiptPaymentMethod(
            canonicalPayment.method || canonicalMethod
          ),
          receiptNumber,
          issuedAt:
            canonicalPayment.receipt_issued_at ||
            canonicalPayment.created_at ||
            now,
          referenceId: safeShortId(record.id),
          bookingId: record.id,
          motorcycleModel:
            record.motorcycle_model ||
            record.motorcycleModel ||
            '',
          notes: 'Verified booking reservation payment.',
        });
      }

      await fetchPending(false);

      if (receiptHistoryWarning) {
        setError(receiptHistoryWarning);
      }
    } catch (err) {
      setError(err.message || 'Failed to verify the reservation payment.');
    } finally {
      setSavingPayment(false);
    }
  }

  async function confirmPayment() {
    if (!confirming || savingPayment) return;

    let receiptHistoryWarning = '';

    const { type, record, due, total, totalPaid = 0 } = confirming;
    const paidAmount = parseMoney(amount);
    const cleanMethod = normalizePaymentMethod(method);
    const cleanReference = sanitizeGcashReference(paymentReference);
    const customerName = getCustomerName(record);

    if (!paidAmount || paidAmount <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }

    if (paidAmount > due) {
      setError(`Amount cannot exceed ${formatPeso(due)}.`);
      return;
    }

    if (
      cleanMethod === 'gcash' &&
      !isValidGcashReference(cleanReference)
    ) {
      setError(
        `Enter a valid GCash reference containing ${GCASH_REFERENCE_MIN_LENGTH}–${GCASH_REFERENCE_MAX_LENGTH} digits only.`
      );
      return;
    }

    if (cleanMethod === 'gcash') {
      try {
        const duplicateReference =
          await findDuplicateGcashReference(cleanReference);

        if (duplicateReference) {
          setError(
            'This GCash reference number has already been used. Check the transaction receipt and enter a unique reference.'
          );
          return;
        }
      } catch (referenceError) {
        setError(
          referenceError.message ||
            'Unable to validate the GCash reference number.'
        );
        return;
      }
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
          .select('id, receipt_number, receipt_issued_at, created_at, payment_type, method, amount')
          .single();

        if (paymentError) throw paymentError;
        paymentRecord = paymentData;

        if (
          bookingRequiresReservationPayment(record) &&
          !isReservationPaymentVerified(record) &&
          totalPaid + paidAmount >= getReservationFee(record)
        ) {
          const { error: modulePaymentError } = await supabase
            .from('bookings')
            .update({
              payment_status: 'paid',
              reservation_fee: getReservationFee(record),
              payment_reference: cleanReference || paymentRecord?.receipt_number || null,
              payment_received: true,
              payment_received_at: now,
              payment_received_by: staffId || null,
              paid_at: now,
              updated_at: now,
            })
            .eq('id', record.id);

          if (modulePaymentError) throw modulePaymentError;
        }

        // A fully paid invoice must not complete the motorcycle service.
        // Service status is controlled only from Service Progress.
        await generateOrSyncBookingInvoice({
          bookingId: record.id,
        });

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
            service_status_unchanged: true,
            current_service_status: record.status || null,
          },
        });

        const bookingReceiptHistory = await saveReceiptHistorySafely({
          receiptNumber:
            paymentRecord?.receipt_number ||
            `MTFX-BKG-${safeShortId(paymentRecord?.id || record.id)}`,
          sourceType: 'booking',
          sourceId: record.id,
          paymentTable: 'payments',
          paymentId: paymentRecord?.id || null,
          customerId: record.customer_id || null,
          customerName,
          customerPhone:
            record.profiles?.phone ||
            record.customer?.phone ||
            null,
          customerEmail:
            record.profiles?.email ||
            record.customer?.email ||
            null,
          paymentMethod: getReceiptPaymentMethod(
            paymentRecord?.method || cleanMethod
          ),
          paymentReference:
            cleanReference ||
            paymentRecord?.receipt_number ||
            record.payment_reference ||
            null,
          subtotal: total,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: total,
          amountPaid: paidAmount,
          balanceAmount: Math.max(due - paidAmount, 0),
          status: 'issued',
          notes: `${
            isFullPayment ? 'Full' : 'Balance'
          } payment for scheduled booking.`,
          issuedBy: staffId || null,
          issuedAt:
            paymentRecord?.receipt_issued_at ||
            paymentRecord?.created_at ||
            now,
          metadata: {
            payment_type:
              paymentRecord?.payment_type ||
              (isFullPayment ? 'full' : 'balance'),
            booking_status: record.status || null,
            due_before_payment: due,
            total_paid_before_payment: totalPaid,
          },
          items: getBookingReceiptItems(record, total),
        });

        receiptHistoryWarning = bookingReceiptHistory.warning;

        onReceipt?.({
          customerName,
          customerPhone:
            record.profiles?.phone ||
            record.customer?.phone ||
            '—',
          customerEmail:
            record.profiles?.email ||
            record.customer?.email ||
            '—',
          type: 'booking_payment',
          sourceLabel: 'Payment Verification',
          transactionLabel: 'Scheduled Booking Payment',
          paymentType:
            paymentRecord?.payment_type ||
            (isFullPayment ? 'full' : 'balance'),
          paymentReference:
            cleanReference ||
            paymentRecord?.receipt_number ||
            record.payment_reference ||
            '—',
          items: getBookingReceiptItems(record, total).map(
            (item) => ({
              label: item.itemName || 'Motorcycle Service',
              description: item.itemType || 'Service',
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              amount: item.lineTotal,
            })
          ),
          subtotal: total,
          discountAmount: 0,
          taxAmount: 0,
          total,
          amountPaid:
            paymentRecord?.amount ?? paidAmount,
          balance: Math.max(due - paidAmount, 0),
          status:
            Math.max(due - paidAmount, 0) <= 0
              ? 'paid'
              : 'partially_paid',
          paymentMethod:
            getReceiptPaymentMethod(
              paymentRecord?.method || cleanMethod
            ),
          receiptNumber:
            paymentRecord?.receipt_number ||
            `MTFX-BKG-${safeShortId(
              paymentRecord?.id || record.id
            )}`,
          issuedAt:
            paymentRecord?.receipt_issued_at ||
            paymentRecord?.created_at ||
            now,
          referenceId: safeShortId(record.id),
          bookingId: record.id,
          motorcycleModel:
            record.motorcycle_model ||
            record.motorcycleModel ||
            '',
          notes: `${
            isFullPayment ? 'Full' : 'Balance'
          } payment for scheduled booking.`,
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
          .select('id, receipt_number, receipt_issued_at, created_at, payment_type, method, amount')
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

        const orderReceiptHistory = await saveReceiptHistorySafely({
          receiptNumber:
            paymentRecord?.receipt_number ||
            `MTFX-ORD-${safeShortId(paymentRecord?.id || record.id)}`,
          sourceType: 'order',
          sourceId: record.id,
          paymentTable: 'payments',
          paymentId: paymentRecord?.id || null,
          customerId: record.customer_id || null,
          customerName,
          customerPhone:
            record.walkin_customer_phone ||
            record.profiles?.phone ||
            record.customer?.phone ||
            null,
          customerEmail:
            record.profiles?.email ||
            record.customer?.email ||
            null,
          paymentMethod: getReceiptPaymentMethod(
            paymentRecord?.method || cleanMethod
          ),
          paymentReference:
            cleanReference ||
            paymentRecord?.receipt_number ||
            record.payment_reference ||
            null,
          subtotal: total,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: total,
          amountPaid: paidAmount,
          balanceAmount: newDue,
          status: 'issued',
          notes: `${
            isFullPayment ? 'Full' : 'Balance'
          } payment for parts order.`,
          issuedBy: staffId || null,
          issuedAt:
            paymentRecord?.receipt_issued_at ||
            paymentRecord?.created_at ||
            now,
          metadata: {
            payment_type:
              paymentRecord?.payment_type ||
              (isFullPayment ? 'full' : 'balance'),
            order_status: record.status || null,
            previous_paid: previousPaid,
            new_total_paid: newTotalPaid,
          },
          items: [
            {
              itemType: 'product',
              itemName: 'Parts order',
              quantity: 1,
              unitPrice: total,
              lineTotal: total,
            },
          ],
        });

        receiptHistoryWarning = orderReceiptHistory.warning;

        onReceipt?.({
          customerName,
          customerPhone:
            record.walkin_customer_phone ||
            record.profiles?.phone ||
            record.customer?.phone ||
            '—',
          customerEmail:
            record.profiles?.email ||
            record.customer?.email ||
            '—',
          type: 'order_payment',
          sourceLabel: 'Payment Verification',
          transactionLabel: 'Parts Order Payment',
          paymentType:
            paymentRecord?.payment_type ||
            (isFullPayment ? 'full' : 'balance'),
          paymentReference:
            cleanReference ||
            paymentRecord?.receipt_number ||
            record.payment_reference ||
            '—',
          items: [
            {
              label: 'Parts Order',
              description: 'Order payment',
              quantity: 1,
              unitPrice: total,
              lineTotal: total,
              amount: total,
            },
          ],
          subtotal: total,
          discountAmount: 0,
          taxAmount: 0,
          total,
          amountPaid:
            paymentRecord?.amount ?? paidAmount,
          balance: newDue,
          status:
            newDue <= 0 ? 'paid' : 'partially_paid',
          paymentMethod:
            getReceiptPaymentMethod(
              paymentRecord?.method || cleanMethod
            ),
          receiptNumber:
            paymentRecord?.receipt_number ||
            `MTFX-ORD-${safeShortId(
              paymentRecord?.id || record.id
            )}`,
          issuedAt:
            paymentRecord?.receipt_issued_at ||
            paymentRecord?.created_at ||
            now,
          referenceId: safeShortId(record.id),
          orderId: record.id,
          notes: `${
            isFullPayment ? 'Full' : 'Balance'
          } payment for parts order.`,
        });
      }

      setConfirming(null);
      setAmount('');
      setMethod('cash');
      setPaymentReference('');
      await fetchPending(false);

      if (receiptHistoryWarning) {
        setError(receiptHistoryWarning);
      }
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
        sum +
        getBookingDueWithoutDoubleCount(
          booking,
          bookingPayments[booking.id] || [],
          onlineBookingPayments[booking.id] || []
        ),
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
  }, [
    filteredBookings,
    filteredOrders,
    bookingPayments,
    onlineBookingPayments,
    orderPayments,
  ]);

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
    const orderSummary =
      type === 'order' ? getOrderPaymentSummary(record, payments) : null;
    const onlinePayments =
      type === 'booking' ? onlineBookingPayments[record.id] || [] : [];
    const total =
      type === 'booking' ? calculateBookingTotal(record) : orderSummary.total;
    const totalPaid =
      type === 'booking'
        ? getBookingPaidAmountWithoutDoubleCount(
            record,
            payments,
            onlinePayments
          )
        : orderSummary.totalPaid;
    const due =
      type === 'booking'
        ? getBookingDueWithoutDoubleCount(
            record,
            payments,
            onlinePayments
          )
        : orderSummary.due;
    const percent =
      type === 'booking'
        ? total > 0
          ? Math.min(Math.round((totalPaid / total) * 100), 100)
          : 0
        : orderSummary.percent;
    const requiresReservationPayment =
      type === 'booking' && bookingRequiresReservationPayment(record);
    const latestOnlinePayment = getLatestOnlinePayment(onlinePayments);
    const waitingForStaffVerification =
      type === 'booking' && needsReservationVerification(record);

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
              <ModulePaymentBadge
                status={
                  waitingForStaffVerification
                    ? 'pending_verification'
                    : record.payment_status
                }
              />
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

          {waitingForStaffVerification && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-4 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
              Payment evidence is available. Verify the reference or provider payment before confirming this reservation.
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
            onClick={() => {
              if (waitingForStaffVerification) {
                verifyReservationPayment(record, latestOnlinePayment);
                return;
              }

              openConfirm(type, record, due, total, totalPaid);
            }}
            disabled={
              savingPayment || (!waitingForStaffVerification && due <= 0)
            }
            className={`rounded-2xl px-4 py-2 text-xs font-black text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
              waitingForStaffVerification
                ? 'bg-amber-600 shadow-amber-600/20 hover:bg-amber-700'
                : 'bg-primary-600 shadow-primary-600/20 hover:bg-primary-700'
            }`}
          >
            {waitingForStaffVerification
              ? savingPayment
                ? 'Verifying...'
                : 'Verify Reservation Payment'
              : getBookingPaymentActionLabel(type, record, due, totalPaid)}
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
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingPayment) {
              closeConfirm();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-payment-title"
            className="relative mx-auto overflow-y-auto rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-dark-700 dark:bg-dark-800 sm:p-6"
            style={{
              width: 'min(100%, 440px)',
              maxWidth: 440,
              maxHeight: 'calc(100dvh - 32px)',
            }}
          >
            <button
              type="button"
              onClick={closeConfirm}
              disabled={savingPayment}
              aria-label="Close payment confirmation"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-gray-50 text-lg font-black text-gray-500 transition hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-400 dark:hover:text-white"
            >
              ×
            </button>

            <div className="mb-5 pr-10 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary-50 text-xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
                💳
              </div>

              <h3
                id="confirm-payment-title"
                className="text-lg font-black text-gray-950 dark:text-white sm:text-xl"
              >
                Confirm Payment
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                {getCustomerName(confirming.record)} —{' '}
                <span className="font-black text-accent-600 dark:text-accent-400">
                  {formatPeso(confirming.due)} due
                </span>
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 sm:text-sm">
                {error}
              </div>
            )}

            <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Amount Received
            </label>

            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) =>
                setAmount(sanitizeAmountInput(event.target.value))
              }
              className="mb-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base font-black text-gray-950 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Payment Method
            </p>

            <div className="mb-4">
              <PaymentMethodPicker
                value={method}
                onChange={(value) =>
                  setMethod(normalizePaymentMethod(value))
                }
              />
            </div>

            {normalizePaymentMethod(method) === 'gcash' && (
              <>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  GCash Reference Number
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={GCASH_REFERENCE_MAX_LENGTH}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={paymentReference}
                  onChange={(event) => {
                    setPaymentReference(
                      sanitizeGcashReference(event.target.value)
                    );

                    if (error) setError('');
                  }}
                  placeholder={`${GCASH_REFERENCE_MIN_LENGTH}–${GCASH_REFERENCE_MAX_LENGTH} digits`}
                  aria-describedby="gcash-reference-help"
                  className={`w-full rounded-2xl border bg-gray-50 px-4 py-3 text-sm font-black tracking-wider text-gray-950 outline-none transition focus:ring-4 dark:bg-dark-900 dark:text-white ${
                    paymentReference &&
                    !isValidGcashReference(paymentReference)
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500'
                      : 'border-gray-200 focus:border-primary-500 focus:ring-primary-500/10 dark:border-dark-700'
                  }`}
                />

                <div
                  id="gcash-reference-help"
                  className="mb-4 mt-2 flex items-center justify-between gap-3 text-[10px]"
                >
                  <span
                    className={
                      paymentReference &&
                      !isValidGcashReference(paymentReference)
                        ? 'font-bold text-red-600 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }
                  >
                    Digits only. Spaces, letters, and symbols are removed
                    automatically.
                  </span>

                  <span className="whitespace-nowrap font-black text-gray-500 dark:text-gray-400">
                    {paymentReference.length}/{GCASH_REFERENCE_MAX_LENGTH}
                  </span>
                </div>
              </>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={savingPayment}
                className="order-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:text-gray-300 dark:hover:bg-dark-900 sm:order-1"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmPayment}
                disabled={savingPayment}
className="order-1 w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-amber-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60 sm:order-2"              >

                {savingPayment
                  ? 'Saving...'
                  : 'Confirm & Generate Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}