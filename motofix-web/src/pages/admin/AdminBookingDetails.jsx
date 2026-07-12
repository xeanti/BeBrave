import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import ServiceProgressManager from '../../components/ServiceProgressManager';
import InvoiceReceiptModal from '../../components/InvoiceReceiptModal';
import { generateOrSyncBookingInvoice } from '../../lib/invoices';
import { notifyUser } from '../../lib/notifications';

const STATUS_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  in_progress:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  inspection:
    'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25',
  repairing:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  quality_check:
    'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/25',
  ready_for_pickup:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  rejected:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  no_show:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
};

const PAYMENT_STYLES = {
  paid:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  unpaid:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  checkout_created:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  pending_payment:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  pending_verification:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  failed:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  expired:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
};

const NEXT_STATUS_ACTIONS = {
  pending: { next: 'confirmed', label: 'Confirm Booking' },
  confirmed: { next: 'in_progress', label: 'Start Service' },
  in_progress: { next: 'inspection', label: 'Move to Inspection' },
  inspection: { next: 'repairing', label: 'Move to Repairing' },
  repairing: { next: 'quality_check', label: 'Move to Quality Check' },
  quality_check: { next: 'ready_for_pickup', label: 'Mark Ready for Pickup' },
  ready_for_pickup: { next: 'completed', label: 'Complete Booking' },
};

const OTHER_STATUS_ACTIONS = [
  { status: 'cancelled', label: 'Cancel Booking' },
  { status: 'rejected', label: 'Reject Booking' },
  { status: 'no_show', label: 'Mark No Show' },
];

const PAYMENT_TYPES = ['balance', 'full', 'down_payment', 'refund'];
const PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];

const ACTIVE_SERVICE_STATUSES = [
  'confirmed',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
  'ready_for_pickup',
];

const PROGRESS_BY_STATUS = {
  pending: 10,
  confirmed: 25,
  in_progress: 40,
  inspection: 50,
  repairing: 70,
  quality_check: 85,
  ready_for_pickup: 95,
  completed: 100,
  cancelled: 0,
  rejected: 0,
  no_show: 0,
};

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateString) {
  if (!dateString) return '—';

  const [year, month, day] = String(dateString).split('-').map(Number);

  if (!year || !month || !day) return dateString;

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    weekday: 'long',
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

function formatSlot(slot) {
  if (!slot) return '—';

  const normalized = String(slot).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function sanitizeSingleLine(value, maxLength = 255) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(value, maxLength = 1000) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, ' ')
    .replace(/[<>]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength);
}

function sanitizeReference(value, maxLength = 80) {
  return sanitizeSingleLine(value, maxLength).replace(/[^a-zA-Z0-9#._\-/ ]/g, '');
}

function sanitizeAmount(value) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) return 0;

  return Math.round(amount * 100) / 100;
}

function getAllowedOption(value, options, fallback) {
  const normalized = normalizeStatus(value);

  return options.includes(normalized) ? normalized : fallback;
}

function getStatusLabel(status) {
  return String(status || 'pending')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ status }) {
  const normalized = String(status || 'pending').toLowerCase();

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ring-1 ${
        STATUS_STYLES[normalized] || STATUS_STYLES.pending
      }`}
    >
      {getStatusLabel(normalized)}
    </span>
  );
}

function PaymentBadge({ status }) {
  const normalized = String(status || 'unpaid').toLowerCase();

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ring-1 ${
        PAYMENT_STYLES[normalized] || PAYMENT_STYLES.unpaid
      }`}
    >
      {normalized === 'paid' ? 'Down Payment Paid' : getStatusLabel(normalized)}
    </span>
  );
}

function SectionCard({ title, subtitle, children, className = '' }) {
  return (
    <section
      className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800 ${className}`}
    >
      {(title || subtitle) && (
        <div className="mb-5">
          {title && (
            <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              {title}
            </p>
          )}

          {subtitle && (
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {children}
    </section>
  );
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="break-words text-sm font-black text-gray-950 dark:text-white">
        {value || '—'}
      </p>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span
        className={`text-right ${
          strong
            ? 'text-lg font-black text-primary-600 dark:text-primary-400'
            : 'font-black text-gray-950 dark:text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function getReservationFee(booking) {
  const savedFee = Number(booking?.reservation_fee);

  if (Number.isFinite(savedFee) && savedFee > 0) return savedFee;

  return Number((getTotalBill(booking) * 0.2).toFixed(2));
}

function bookingRequiresReservationPayment(booking) {
  if (!booking || booking.is_walkin) return false;

  const status = String(booking.payment_status || '').toLowerCase();

  return getReservationFee(booking) > 0 || Boolean(status);
}

function isReservationPaid(booking) {
  return String(booking?.payment_status || '').toLowerCase() === 'paid';
}

function getReservationPaidAmount(booking) {
  return isReservationPaid(booking) ? getReservationFee(booking) : 0;
}

function getCustomerName(booking) {
  const profile = booking?.profiles || booking?.customer || booking;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  if (name) return name;
  if (profile?.phone) return `Customer ${profile.phone}`;
  if (profile?.email) return profile.email;

  return 'Customer';
}

function getCustomerContact(booking) {
  const profile = booking?.profiles || booking?.customer || booking;

  return profile?.phone || profile?.email || '—';
}

function getMechanicDisplayName(mechanic) {
  const name = `${mechanic?.first_name || ''} ${mechanic?.last_name || ''}`.trim();

  return name || mechanic?.email || mechanic?.phone || 'Unnamed Mechanic';
}

function getMechanicName(booking) {
  return getMechanicDisplayName(booking?.mechanic);
}

function getBookingServices(booking) {
  const list = Array.isArray(booking?.booking_services) ? booking.booking_services : [];

  if (list.length > 0) {
    return list.map((item) => ({
      ...item,
      service_name: item.service_name || item.name || item.services?.name || 'Service',
      base_price: Number(item.base_price ?? item.services?.base_price ?? 0) || 0,
      labor_cost: Number(item.labor_cost ?? item.services?.labor_cost ?? 0) || 0,
      estimated_duration_minutes:
        Number(item.estimated_duration_minutes ?? item.services?.estimated_duration_minutes ?? 30) || 30,
      quantity: Number(item.quantity) || 1,
    }));
  }

  if (booking?.services_summary && String(booking.services_summary).includes(',')) {
    return String(booking.services_summary)
      .split(',')
      .map((name, index) => ({
        id: `summary-${index}`,
        service_name: name.trim(),
        base_price: 0,
        labor_cost: 0,
        estimated_duration_minutes: 30,
        quantity: 1,
        summary_only: true,
      }))
      .filter((item) => item.service_name);
  }

  if (booking?.services?.name || booking?.services_summary) {
    return [
      {
        service_name: booking.services_summary || booking.services?.name,
        base_price: booking.services?.base_price || 0,
        labor_cost: booking.services?.labor_cost || 0,
        estimated_duration_minutes: booking.services?.estimated_duration_minutes || 30,
        quantity: 1,
      },
    ];
  }

  return [];
}

function getBookingServicesSummary(booking) {
  if (booking?.services_summary) return booking.services_summary;

  const selectedServices = getBookingServices(booking);

  if (selectedServices.length > 0) {
    return selectedServices
      .map((item) => item.service_name || item.name || item.services?.name)
      .filter(Boolean)
      .join(', ');
  }

  return booking?.services?.name || 'Service';
}

function getServiceLineTotal(item) {
  const quantity = Number(item?.quantity) || 1;
  const basePrice = Number(item?.base_price) || Number(item?.services?.base_price) || 0;
  const laborCost = Number(item?.labor_cost) || Number(item?.services?.labor_cost) || 0;

  return (basePrice + laborCost) * quantity;
}

function getServiceTotal(booking) {
  const savedServiceTotal = Number(booking?.service_total);
  if (Number.isFinite(savedServiceTotal) && savedServiceTotal > 0) return savedServiceTotal;

  const savedTotal = Number(booking?.total_amount);
  if (Number.isFinite(savedTotal) && savedTotal > 0) return savedTotal;

  const selectedServices = getBookingServices(booking);

  if (selectedServices.length > 0) {
    const computedTotal = selectedServices.reduce((sum, item) => sum + getServiceLineTotal(item), 0);
    if (computedTotal > 0) return computedTotal;
  }

  return (
    (Number(booking?.services?.base_price) || 0) +
    (Number(booking?.services?.labor_cost) || 0)
  );
}

function getTotalBill(booking) {
  const savedTotal = Number(booking?.total_amount);
  if (Number.isFinite(savedTotal) && savedTotal > 0) return savedTotal;

  return getServiceTotal(booking);
}

function getServicesDuration(booking) {
  const selectedServices = getBookingServices(booking);

  if (selectedServices.length > 0) {
    return selectedServices.reduce(
      (sum, item) =>
        sum +
        ((Number(item.estimated_duration_minutes) || 30) *
          (Number(item.quantity) || 1)),
      0
    );
  }

  return Number(booking?.services?.estimated_duration_minutes) || 30;
}

function getServicesCount(booking) {
  const selectedServices = getBookingServices(booking);

  if (selectedServices.length > 0) {
    return selectedServices.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  }

  return booking?.service_id ? 1 : 0;
}

function getLatestOnlinePayment(paymentList = []) {
  if (!paymentList.length) return null;

  return [...paymentList].sort((a, b) => {
    const dateA = new Date(a.paid_at || a.created_at || 0).getTime();
    const dateB = new Date(b.paid_at || b.created_at || 0).getTime();

    return dateA - dateB;
  })[paymentList.length - 1];
}

function getOnlinePaymentMethod(booking, latestPayment) {
  const raw = String(
    booking?.payment_method ||
      latestPayment?.payment_method ||
      latestPayment?.provider ||
      ''
  ).toLowerCase();

  if (raw === 'cash_at_shop' || raw === 'cash') return 'Cash at Shop';
  if (
    raw === 'gcash_manual' ||
    raw === 'manual_gcash' ||
    raw === 'personal_gcash'
  ) {
    return 'Personal GCash / Manual';
  }
  if (raw === 'bank_transfer') return 'Bank Transfer';
  if (raw.includes('qr') || raw.includes('paymongo')) {
    return 'PayMongo QR Ph / GCash';
  }

  return latestPayment || bookingRequiresReservationPayment(booking)
    ? 'PayMongo QR Ph / GCash'
    : '—';
}

function getNextStatusAction(status) {
  return NEXT_STATUS_ACTIONS[String(status || 'pending').toLowerCase()] || null;
}

function getLatestPayment(paymentList = []) {
  if (!paymentList.length) return null;

  return [...paymentList].sort((a, b) => {
    const dateA = new Date(a.receipt_issued_at || a.created_at || 0).getTime();
    const dateB = new Date(b.receipt_issued_at || b.created_at || 0).getTime();

    return dateA - dateB;
  })[paymentList.length - 1];
}

function getReceiptNumber(payment) {
  return (
    payment?.receipt_number ||
    payment?.reference_number ||
    `TEMP-${String(payment?.id || '').replace('online-', '').slice(0, 8).toUpperCase() || 'RECEIPT'}`
  );
}

function getPaymentAmount(payment) {
  return Number(
    payment?.amount ??
      payment?.amount_paid ??
      payment?.paid_amount ??
      payment?.total_paid ??
      payment?.payment_amount ??
      0
  );
}

function getPaymentTypeLabel(type) {
  const value = normalizeStatus(type);

  if (value === 'reservation_fee' || value === 'down_payment') return 'Down Payment';
  if (value === 'balance') return 'Balance Payment';
  if (value === 'full') return 'Full Payment';
  if (value === 'refund') return 'Refund';

  return String(type || 'Payment')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeOnlinePaymentForHistory(payment) {
  return {
    ...payment,
    id: `online-${payment.id}`,
    amount: Number(payment.amount) || 0,
    payment_type: 'reservation_fee',
    method: payment.payment_method || payment.provider || 'paymongo_qrph',
    receipt_number: payment.reference_number || payment.receipt_number || null,
    reference_number: payment.reference_number || payment.receipt_number || null,
    receipt_status: payment.status || 'paid',
    receipt_issued_at: payment.paid_at || payment.created_at,
    created_at: payment.paid_at || payment.created_at,
    source: 'online_down_payment',
  };
}

export default function AdminBookingDetails() {
  const params = useParams();
  const bookingId = params.bookingId || params.id;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [viewerRole, setViewerRole] = useState(null);
  const [mechanics, setMechanics] = useState([]);
  const [payments, setPayments] = useState([]);
  const [onlinePayments, setOnlinePayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [mechanicSaving, setMechanicSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_type: 'balance',
    method: 'cash',
    notes: '',
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');

  const [documentModal, setDocumentModal] = useState({
    isOpen: false,
    type: 'invoice',
    invoice: null,
    receipt: null,
    booking: null,
    payments: [],
    customerName: 'Customer',
  });

  useEffect(() => {
    let isMounted = true;

    async function boot() {
      await fetchMechanics();
      await fetchBookingDetails(true, isMounted);
    }

    boot();

    return () => {
      isMounted = false;
    };
  }, [user?.id, bookingId]);

  useEffect(() => {
    if (!bookingId || !user?.id) return;

    const bookingsChannel = supabase
      .channel(`admin-simple-booking-details-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        () => fetchBookingDetails(false)
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel(`admin-simple-booking-payments-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => fetchBookingDetails(false)
      )
      .subscribe();

    const bookingPaymentsChannel = supabase
      .channel(`admin-simple-booking-online-payments-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_payments',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => fetchBookingDetails(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(bookingPaymentsChannel);
    };
  }, [user?.id, bookingId]);

  async function fetchViewerRole(currentUserId) {
    if (!currentUserId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUserId)
      .maybeSingle();

    if (error) {
      console.warn('Failed to fetch viewer role:', error.message);
      return null;
    }

    return data?.role || null;
  }

  async function fetchMechanics() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone')
      .eq('role', 'mechanic')
      .order('first_name', { ascending: true });

    if (error) {
      console.warn('Failed to load mechanics:', error.message);
      setMechanics([]);
      return;
    }

    setMechanics(data || []);
  }

  async function fetchBookingDetails(showLoader = true, isMounted = true) {
    if (!bookingId) {
      setFetchError('Missing booking ID in the URL.');
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);

    setFetchError('');

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = user?.id || authData?.user?.id;

      if (!currentUserId) {
        throw new Error('Please log in to view this booking.');
      }

      const role = await fetchViewerRole(currentUserId);
      setViewerRole(role);

      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          *,
          services(name, base_price, labor_cost, estimated_duration_minutes),
          booking_services(id, service_id, service_name, base_price, labor_cost, estimated_duration_minutes, quantity),
          profiles!bookings_customer_id_fkey(first_name, last_name, email, phone, profile_photo_url),
          mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name, email, phone, profile_photo_url)
        `
        )
        .eq('id', bookingId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Booking not found.');

      const allowed =
        role === 'super_admin' ||
        role === 'admin' ||
        role === 'staff' ||
        data.mechanic_id === currentUserId;

      if (!allowed) {
        throw new Error('You do not have permission to view this booking.');
      }

      if (!isMounted) return;

      setBooking(data);

      try {
        const bookingPayments = await fetchPaymentsFor({
          bookingIds: [bookingId],
        });

        setPayments(bookingPayments || []);
      } catch (paymentError) {
        console.warn('Failed to load booking payments:', paymentError);
        setPayments([]);
      }

      try {
        const { data: onlinePaymentRows, error: onlinePaymentError } = await supabase
          .from('booking_payments')
          .select(
            `
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
          `
          )
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: true });

        if (onlinePaymentError) throw onlinePaymentError;

        setOnlinePayments(onlinePaymentRows || []);
      } catch (onlinePaymentError) {
        console.warn('Failed to load PayMongo booking payments:', onlinePaymentError);
        setOnlinePayments([]);
      }
    } catch (error) {
      if (!isMounted) return;

      setBooking(null);
      setPayments([]);
      setOnlinePayments([]);
      setFetchError(error.message || 'Failed to load booking details.');
    } finally {
      if (isMounted) setLoading(false);
    }
  }

  async function updateAssignedMechanic(mechanicId) {
    if (!booking?.id) return;

    const nextMechanicId = sanitizeSingleLine(mechanicId, 80) || null;

    if ((booking.mechanic_id || '') === (nextMechanicId || '')) return;

    const selectedMechanic =
      mechanics.find((mechanic) => mechanic.id === nextMechanicId) || null;
    const currentMechanicName = getMechanicName(booking);
    const nextMechanicName = selectedMechanic
      ? getMechanicDisplayName(selectedMechanic)
      : 'Unassigned';

    const confirmed = window.confirm(
      `Update assigned mechanic?\n\nFrom: ${currentMechanicName}\nTo: ${nextMechanicName}\n\nThis will change who is responsible for this booking.`
    );

    if (!confirmed) return;

    setMechanicSaving(true);

    const { error } = await supabase
      .from('bookings')
      .update({ mechanic_id: nextMechanicId })
      .eq('id', booking.id);

    if (error) {
      window.alert(error.message || 'Failed to update assigned mechanic.');
      setMechanicSaving(false);
      return;
    }

    await insertAuditLog('UPDATE_BOOKING_MECHANIC', {
      previous_mechanic_id: booking.mechanic_id || null,
      next_mechanic_id: nextMechanicId,
      next_mechanic_name: nextMechanicName,
    });

    setBooking((current) => ({
      ...current,
      mechanic_id: nextMechanicId,
      mechanic: selectedMechanic,
    }));

    setMechanicSaving(false);
    fetchBookingDetails(false);
  }

  async function smartAssignMechanic() {
    if (!booking?.id) return;

    if (mechanics.length === 0) {
      window.alert('No mechanic accounts found.');
      return;
    }

    setMechanicSaving(true);

    const { data: activeBookings, error: activeError } = await supabase
      .from('bookings')
      .select('mechanic_id')
      .in('status', ACTIVE_SERVICE_STATUSES)
      .not('mechanic_id', 'is', null);

    if (activeError) {
      window.alert(activeError.message || 'Failed to check mechanic workload.');
      setMechanicSaving(false);
      return;
    }

    const workload = new Map();

    mechanics.forEach((mechanic) => workload.set(mechanic.id, 0));

    (activeBookings || []).forEach((row) => {
      if (!row.mechanic_id) return;
      workload.set(row.mechanic_id, (workload.get(row.mechanic_id) || 0) + 1);
    });

    const bestMechanic = [...mechanics].sort((a, b) => {
      const loadA = workload.get(a.id) || 0;
      const loadB = workload.get(b.id) || 0;

      if (loadA !== loadB) return loadA - loadB;

      return getMechanicDisplayName(a).localeCompare(getMechanicDisplayName(b));
    })[0];

    if (!bestMechanic) {
      window.alert('No mechanic accounts found.');
      setMechanicSaving(false);
      return;
    }

    await updateAssignedMechanic(bestMechanic.id);
  }

  async function insertProgressEventForStatus(nextStatus) {
    if (!booking?.id || !booking?.customer_id) return;

    const progressPercent = PROGRESS_BY_STATUS[nextStatus] || 0;
    const title = getStatusLabel(nextStatus);
    const description = `Booking status updated to ${title}.`;

    const { error } = await supabase.from('service_progress_events').insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      mechanic_id: booking.mechanic_id || null,
      service_id: booking.service_id || null,
      status: nextStatus,
      title,
      description,
      progress_percent: progressPercent,
      event_type: 'status_update',
    });

    if (!error) return;

    await supabase.from('service_progress_events').insert({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      status: nextStatus,
      title,
      description,
      progress_percent: progressPercent,
    });
  }

  async function confirmReservationPayment() {
    if (!booking?.id) return;

    const methodLabel = sanitizeSingleLine(
      getOnlinePaymentMethod(booking, latestOnlinePayment),
      80
    );
    const reservationFee = getReservationFee(booking);
    const defaultReference = sanitizeReference(
      booking.payment_reference || latestOnlinePayment?.reference_number || ''
    );
    const reference = window.prompt(
      `Confirm down payment for ${getCustomerName(booking)}?\n\nMethod: ${methodLabel}\nAmount: ${formatPeso(reservationFee)}\n\nEnter receipt/reference number:`,
      defaultReference
    );

    if (reference === null) return;

    const cleanReference = sanitizeReference(reference);

    if (!cleanReference) {
      window.alert('Receipt/reference number is required.');
      return;
    }

    const confirmed = window.confirm(
      `Mark down payment as paid?\n\nCustomer: ${getCustomerName(booking)}\nAmount: ${formatPeso(reservationFee)}\nReference: ${cleanReference}\n\nThis will update the booking and create payment records.`
    );

    if (!confirmed) return;

    setStatusSaving(true);

    const now = new Date().toISOString();
    const cleanPaymentMethod =
      sanitizeSingleLine(booking.payment_method || 'manual', 60) || 'manual';

    const { error: bookingError } = await supabase
      .from('bookings')
      .update({
        payment_status: 'paid',
        payment_reference: cleanReference,
        paid_at: now,
      })
      .eq('id', booking.id);

    if (bookingError) {
      window.alert(bookingError.message || 'Failed to confirm down payment.');
      setStatusSaving(false);
      return;
    }

    await supabase.from('payments').insert({
      booking_id: booking.id,
      customer_id: booking.customer_id || null,
      amount: reservationFee,
      payment_type: 'reservation_fee',
      method: cleanPaymentMethod,
      receipt_number: cleanReference,
      notes: sanitizeSingleLine(
        `Down payment confirmed by admin/staff. Method: ${methodLabel}`,
        255
      ),
    });

    await supabase.from('booking_payments').insert({
      booking_id: booking.id,
      amount: reservationFee,
      currency: 'PHP',
      status: 'paid',
      payment_method: cleanPaymentMethod,
      reference_number: cleanReference,
      paid_at: now,
      provider: 'manual',
    });

    await insertAuditLog('CONFIRM_RESERVATION_PAYMENT', {
      amount: reservationFee,
      reference_number: cleanReference,
      method: cleanPaymentMethod,
    });

    setBooking((current) => ({
      ...current,
      payment_status: 'paid',
      payment_reference: cleanReference,
      paid_at: now,
    }));

    setStatusSaving(false);
    fetchBookingDetails(false);
    window.alert('Down payment confirmed. You can now confirm the booking.');
  }

  async function insertAuditLog(action, details = {}) {
    if (!user?.id || !booking?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'bookings',
      entity_id: booking.id,
      performed_by: user.id,
      details,
    });
  }

  function closeDocumentModal() {
    setDocumentModal({
      isOpen: false,
      type: 'invoice',
      invoice: null,
      receipt: null,
      booking: null,
      payments: [],
      customerName: 'Customer',
    });
  }

  async function openBookingInvoice() {
    if (!booking?.id) return;

    setPaymentMessage('');

    try {
      const invoice = await generateOrSyncBookingInvoice({
        bookingId: booking.id,
        issuedBy: user?.id || null,
      });

      await insertAuditLog('GENERATE_BOOKING_INVOICE', {
        invoice_id: invoice?.id || null,
        invoice_number: invoice?.invoice_number || null,
      });

      setDocumentModal({
        isOpen: true,
        type: 'invoice',
        invoice,
        receipt: null,
        booking,
        payments: paymentHistory,
        customerName: getCustomerName(booking),
      });
    } catch (err) {
      setPaymentMessage(`❌ ${err.message || 'Failed to generate invoice.'}`);
    }
  }

  function openBookingReceipt(payment) {
    if (!payment) {
      setPaymentMessage('❌ No receipt found yet.');
      return;
    }

    setDocumentModal({
      isOpen: true,
      type: 'receipt',
      invoice: null,
      receipt: payment,
      booking,
      payments: paymentHistory,
      customerName: getCustomerName(booking),
    });
  }

  async function submitPayment(event) {
    event.preventDefault();

    if (!booking?.id) return;

    const amount = sanitizeAmount(paymentForm.amount);
    const cleanPaymentType = getAllowedOption(
      paymentForm.payment_type,
      PAYMENT_TYPES,
      'balance'
    );
    const cleanMethod = getAllowedOption(paymentForm.method, PAYMENT_METHODS, 'cash');
    const cleanNotes = sanitizeMultiline(paymentForm.notes, 500);

    if (!amount || amount <= 0) {
      setPaymentMessage('❌ Please enter a valid payment amount.');
      return;
    }

    if (cleanPaymentType !== 'refund' && amount > balance) {
      const proceed = window.confirm(
        `Payment amount is higher than the current balance (${formatPeso(balance)}). Continue?`
      );

      if (!proceed) return;
    }

    const confirmed = window.confirm(
      `${cleanPaymentType === 'refund' ? 'Record refund' : 'Record payment'}?\n\nCustomer: ${getCustomerName(booking)}\nAmount: ${formatPeso(amount)}\nType: ${getPaymentTypeLabel(cleanPaymentType)}\nMethod: ${getPaymentTypeLabel(cleanMethod)}\n\nPlease confirm before saving this payment record.`
    );

    if (!confirmed) return;

    setSavingPayment(true);
    setPaymentMessage('');

    try {
      const { data: paymentRecord, error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: booking.id,
          customer_id: booking.customer_id || null,
          amount,
          payment_type: cleanPaymentType,
          method: cleanMethod,
          notes: cleanNotes || null,
          processed_by: user?.id || null,
        })
        .select(
          'id, receipt_number, receipt_status, receipt_issued_at, amount, payment_type, method, notes, created_at'
        )
        .single();

      if (paymentError) throw paymentError;

      const nextManualPaid =
        cleanPaymentType === 'refund'
          ? manualTotalPaid - amount
          : manualTotalPaid + amount;

      const nextTotalPaid = nextManualPaid + reservationPaidAmount;
      const nextBalance = Math.max(totalBill - nextTotalPaid, 0);

      if (
        bookingRequiresReservationPayment(booking) &&
        !isReservationPaid(booking) &&
        cleanPaymentType !== 'refund' &&
        nextManualPaid >= getReservationFee(booking)
      ) {
        const now = new Date().toISOString();

        const { error: bookingPaymentError } = await supabase
          .from('bookings')
          .update({
            payment_status: 'paid',
            reservation_fee: getReservationFee(booking),
            payment_reference: sanitizeReference(paymentRecord?.receipt_number || ''),
            paid_at: now,
            updated_at: now,
          })
          .eq('id', booking.id);

        if (bookingPaymentError) throw bookingPaymentError;
      }

      await insertAuditLog('RECORD_BOOKING_PAYMENT', {
        amount,
        payment_type: cleanPaymentType,
        method: cleanMethod,
        receipt_number: sanitizeReference(paymentRecord?.receipt_number || ''),
      });

      if (booking?.customer_id) {
        await notifyUser({
          userId: booking.customer_id,
          title: cleanPaymentType === 'refund' ? 'Refund Recorded' : 'Payment Recorded',
          message:
            cleanPaymentType === 'refund'
              ? `A refund of ${formatPeso(amount)} has been recorded for your booking.`
              : `Your payment of ${formatPeso(amount)} has been recorded. Remaining balance: ${formatPeso(nextBalance)}.`,
          type: 'payment',
          relatedTable: 'bookings',
          relatedId: booking.id,
        });
      }

      setPaymentMessage(
        `✅ Payment saved. Receipt: ${paymentRecord?.receipt_number || 'Pending'}`
      );

      setPaymentForm({
        amount: '',
        payment_type: 'balance',
        method: 'cash',
        notes: '',
      });

      await fetchBookingDetails(false);
    } catch (err) {
      setPaymentMessage(`❌ ${err.message || 'Failed to record payment.'}`);
    } finally {
      setSavingPayment(false);
    }
  }

  async function updateBookingStatus(nextStatus) {
    if (!booking?.id || !nextStatus) return;

    const cleanNextStatus = normalizeStatus(nextStatus);
    const currentBookingStatus = normalizeStatus(booking.status || 'pending');
    const validStatuses = Object.keys(STATUS_STYLES);

    if (!validStatuses.includes(cleanNextStatus)) {
      window.alert('Invalid booking status selected.');
      return;
    }

    if (cleanNextStatus === currentBookingStatus) return;

    if (
      cleanNextStatus === 'confirmed' &&
      bookingRequiresReservationPayment(booking) &&
      !isReservationPaid(booking)
    ) {
      window.alert('This booking cannot be confirmed until the down payment is paid.');
      return;
    }

    const isRiskyStatus = ['cancelled', 'rejected', 'no_show', 'completed'].includes(
      cleanNextStatus
    );
    const statusLabel = getStatusLabel(cleanNextStatus);
    const warningLine =
      cleanNextStatus === 'completed' && balance > 0
        ? `\n\nWarning: This booking still has a remaining balance of ${formatPeso(balance)}.`
        : isRiskyStatus
          ? '\n\nThis is a risky action. Please make sure the booking details are correct before continuing.'
          : '';

    const confirmed = window.confirm(
      `Update booking status?\n\nFrom: ${getStatusLabel(currentBookingStatus)}\nTo: ${statusLabel}${warningLine}`
    );

    if (!confirmed) return;

    setStatusSaving(true);

    const { error } = await supabase
      .from('bookings')
      .update({ status: cleanNextStatus })
      .eq('id', booking.id);

    if (error) {
      window.alert(error.message || 'Failed to update booking status.');
      setStatusSaving(false);
      return;
    }

    await insertProgressEventForStatus(cleanNextStatus);

    await insertAuditLog('UPDATE_BOOKING_STATUS', {
      previous_status: currentBookingStatus,
      next_status: cleanNextStatus,
    });

    setBooking((current) => ({
      ...current,
      status: cleanNextStatus,
    }));

    setStatusSaving(false);
    fetchBookingDetails(false);
  }

  const serviceTotal = useMemo(() => getServiceTotal(booking), [booking]);
  const totalBill = useMemo(() => getTotalBill(booking), [booking]);
  const balancePaymentRows = (payments || []).filter((payment) => {
    const type = normalizeStatus(payment.payment_type || payment.type);
    return type !== 'reservation_fee' && type !== 'down_payment';
  });

  const paymentSummary = summarizePayments(balancePaymentRows || []) || {};
  const manualTotalPaid = Number(paymentSummary.totalPaid) || 0;
  const reservationPaidAmount = getReservationPaidAmount(booking);
  const totalPaid = manualTotalPaid + reservationPaidAmount;
  const balance = Math.max(totalBill - totalPaid, 0);
  const paymentPercent =
    totalBill > 0 ? Math.min((totalPaid / totalBill) * 100, 100) : 0;

  const paymentHistory = useMemo(() => {
    const manualRows = (payments || []).map((payment) => ({
      ...payment,
      source: payment.source || 'manual_payment',
    }));

    const onlineRows = (onlinePayments || [])
      .filter((payment) =>
        ['paid', 'succeeded', 'success', 'completed', 'confirmed'].includes(
          normalizeStatus(payment.status)
        )
      )
      .map(normalizeOnlinePaymentForHistory);

    const combined = [...manualRows, ...onlineRows];
    const seen = new Set();

    return combined
      .filter((payment) => {
        const key = String(
          payment.receipt_number ||
            payment.reference_number ||
            `${payment.payment_type}-${Number(payment.amount) || 0}-${payment.created_at}`
        ).toLowerCase();

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.receipt_issued_at || a.paid_at || a.created_at || 0).getTime();
        const dateB = new Date(b.receipt_issued_at || b.paid_at || b.created_at || 0).getTime();

        return dateB - dateA;
      });
  }, [payments, onlinePayments]);

  const latestPayment = getLatestPayment(paymentHistory);
  const latestOnlinePayment = getLatestOnlinePayment(onlinePayments);
  const requiresReservationPayment = bookingRequiresReservationPayment(booking);
  const currentStatus = String(booking?.status || 'pending').toLowerCase();
  const nextStatusAction = getNextStatusAction(currentStatus);
  const canOpenServiceWork =
    !['pending', 'cancelled', 'rejected', 'no_show'].includes(currentStatus);
  const confirmBlockedByPayment =
    nextStatusAction?.next === 'confirmed' &&
    requiresReservationPayment &&
    !isReservationPaid(booking);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-6 py-10 text-gray-900 dark:bg-dark-900 dark:text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Loading booking details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (fetchError || !booking) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-6 py-10 text-gray-900 dark:bg-dark-900 dark:text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-red-50 text-4xl ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20">
              ⚠️
            </div>
            <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
              Cannot open booking
            </h1>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
              {fetchError}
            </p>
            <button
              type="button"
              onClick={() => navigate('/admin/bookings')}
              className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700"
            >
              Back to Admin Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canManageBooking =
    viewerRole === 'super_admin' ||
    viewerRole === 'admin' ||
    viewerRole === 'staff' ||
    booking.mechanic_id === user?.id;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            to="/admin/bookings"
            className="inline-flex items-center gap-2 text-sm font-black text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
          >
            ← Back to Admin Bookings
          </Link>
        </div>

        <div className="mb-6 overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Booking Details
              </p>
              <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white">
                {getCustomerName(booking)}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                #{booking.id?.slice(0, 8).toUpperCase()} · {getCustomerContact(booking)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} />
              {requiresReservationPayment && (
                <PaymentBadge status={booking.payment_status} />
              )}
              {getServicesCount(booking) > 1 && (
                <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                  {getServicesCount(booking)} Services
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <main className="space-y-6">
            <SectionCard title="Booking Summary">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailCard label="Services" value={getBookingServicesSummary(booking)} />
                <DetailCard label="Service Count" value={`${getServicesCount(booking)} service${getServicesCount(booking) > 1 ? 's' : ''}`} />
                <DetailCard label="Total Bill" value={formatPeso(totalBill)} />
                <DetailCard label="Date" value={formatDate(booking.booking_date)} />
                <DetailCard label="Time" value={formatSlot(booking.booking_time)} />
                <DetailCard label="Mechanic" value={getMechanicName(booking)} />
                <DetailCard label="Duration" value={`${getServicesDuration(booking)} minutes`} />
              </div>

              <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Selected Services
                  </p>
                  <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                    {getServicesCount(booking)} service{getServicesCount(booking) > 1 ? 's' : ''} · {getServicesDuration(booking)} mins
                  </span>
                </div>

                {getBookingServices(booking).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-semibold text-gray-500 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
                    No selected service rows found. Run the multi-service SQL and make sure booking_services rows are inserted.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {getBookingServices(booking).map((item, index) => (
                      <div
                        key={item.id || item.service_id || index}
                        className="flex items-center justify-between gap-4 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700"
                      >
                        <div>
                          <span className="font-bold text-gray-800 dark:text-gray-200">
                            {item.quantity > 1 ? `${item.quantity} × ` : ''}{item.service_name || item.name || 'Service'}
                          </span>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {item.summary_only
                              ? 'Summary only'
                              : `${formatPeso(item.base_price)} base + ${formatPeso(item.labor_cost)} labor · ${Number(item.estimated_duration_minutes) || 30} mins`}
                          </p>
                        </div>
                        <span className="font-black text-gray-950 dark:text-white">
                          {item.summary_only ? '—' : formatPeso(getServiceLineTotal(item))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {booking.notes && (
                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Notes
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                    {booking.notes}
                  </p>
                </div>
              )}
            </SectionCard>

            {requiresReservationPayment && (
              <SectionCard title="Down Payment">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    Customer must pay down payment before confirmation.
                  </p>
                  <PaymentBadge status={booking.payment_status} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailCard label="Down Payment" value={formatPeso(getReservationFee(booking))} />
                  <DetailCard
                    label="Method"
                    value={getOnlinePaymentMethod(booking, latestOnlinePayment)}
                  />
                  <DetailCard
                    label="Reference"
                    value={
                      latestOnlinePayment?.reference_number ||
                      booking.payment_reference ||
                      booking.paymongo_checkout_session_id ||
                      '—'
                    }
                  />
                  <DetailCard
                    label="Paid At"
                    value={formatDateTime(latestOnlinePayment?.paid_at || booking.paid_at)}
                  />
                </div>

                {!isReservationPaid(booking) && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold leading-6 text-yellow-800 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-200">
                      Payment is not marked as paid yet. Confirm the down payment first before confirming the booking.
                    </div>

                    {canManageBooking && (
                      <button
                        type="button"
                        onClick={confirmReservationPayment}
                        disabled={statusSaving}
                        className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {statusSaving ? 'Saving...' : 'Confirm Down Payment'}
                      </button>
                    )}
                  </div>
                )}
              </SectionCard>
            )}

            {canManageBooking && (
              <SectionCard
                title="Manage Booking"
                subtitle="Only the needed controls are shown here."
              >
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Assigned Mechanic
                    </label>

                    <select
                      value={booking.mechanic_id || ''}
                      onChange={(event) => updateAssignedMechanic(event.target.value)}
                      disabled={mechanicSaving}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-950 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-60 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    >
                      <option value="">Unassigned</option>
                      {mechanics.map((mechanic) => (
                        <option key={mechanic.id} value={mechanic.id}>
                          {getMechanicDisplayName(mechanic)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={smartAssignMechanic}
                      disabled={mechanicSaving || mechanics.length === 0}
                      className="mt-3 rounded-2xl bg-primary-600 px-4 py-3 text-xs font-black text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {mechanicSaving ? 'Saving...' : 'Smart Assign Mechanic'}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                    <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Status Update
                    </p>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={booking.status} />

                        {nextStatusAction ? (
                          <>
                            <span className="text-xs font-black uppercase tracking-wide text-gray-400">
                              Next
                            </span>
                            <StatusBadge status={nextStatusAction.next} />
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            No next step
                          </span>
                        )}
                      </div>

                      {nextStatusAction && (
                        <button
                          type="button"
                          onClick={() => updateBookingStatus(nextStatusAction.next)}
                          disabled={statusSaving || confirmBlockedByPayment}
                          className="rounded-2xl bg-primary-600 px-4 py-3 text-xs font-black text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {statusSaving
                            ? 'Updating...'
                            : confirmBlockedByPayment
                              ? 'Payment Required'
                              : nextStatusAction.label}
                        </button>
                      )}
                    </div>

                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs font-black text-gray-600 transition hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
                        Other actions
                      </summary>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {OTHER_STATUS_ACTIONS.map((action) => (
                          <button
                            key={action.status}
                            type="button"
                            onClick={() => updateBookingStatus(action.status)}
                            disabled={statusSaving || currentStatus === action.status}
                            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Service Work">
              {!canOpenServiceWork ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-900/70">
                  <p className="text-sm font-black text-gray-950 dark:text-white">
                    Service work is hidden for now.
                  </p>
                  <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Confirm the booking first. Parts used and service progress will be opened after confirmation.
                  </p>
                </div>
              ) : (
                <details className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                  <summary className="cursor-pointer text-sm font-black text-gray-950 dark:text-white">
                    Open Service Progress and Parts Used
                  </summary>

                  <div className="mt-4">
                    <ServiceProgressManager
                      booking={booking}
                      onUpdated={() => fetchBookingDetails(false)}
                    />
                  </div>
                </details>
              )}
            </SectionCard>
          </main>

          <aside className="space-y-6">
            <SectionCard title="Payment Summary" className="lg:sticky lg:top-24">
              <div className="space-y-3">
                <SummaryRow label="Service total" value={formatPeso(serviceTotal)} />
                <SummaryRow label="Total bill" value={formatPeso(totalBill)} />
                {requiresReservationPayment && (
                  <SummaryRow
                    label="Down payment"
                    value={formatPeso(getReservationFee(booking))}
                  />
                )}
                <SummaryRow label="Total paid" value={formatPeso(totalPaid)} />
                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <SummaryRow label="Balance" value={formatPeso(balance)} strong />
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <span>Payment Progress</span>
                  <span>{Math.round(paymentPercent)}%</span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all"
                    style={{ width: `${paymentPercent}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={openBookingInvoice}
                  className="rounded-2xl bg-primary-600 px-4 py-3 text-sm font-black text-white transition hover:bg-primary-700"
                >
                  🧾 Generate / View Invoice
                </button>

                {latestPayment && (
                  <button
                    type="button"
                    onClick={() => openBookingReceipt(latestPayment)}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300"
                  >
                    View Latest E-Receipt
                  </button>
                )}
              </div>

              {paymentMessage && (
                <div className={`mt-4 rounded-2xl p-3 text-sm font-semibold ${
                  paymentMessage.startsWith('✅')
                    ? 'border border-green-200 bg-green-50 text-green-700 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300'
                    : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300'
                }`}>
                  {paymentMessage}
                </div>
              )}

              {canManageBooking && balance > 0 && (
                <form
                  onSubmit={submitPayment}
                  className="mt-5 space-y-3 border-t border-gray-100 pt-5 dark:border-dark-700"
                >
                  <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Record Payment
                  </p>

                  <div>
                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Remaining balance: {formatPeso(balance)}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Payment Type
                    </label>
                    <select
                      value={paymentForm.payment_type}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          payment_type: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    >
                      {PAYMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {getPaymentTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Method
                    </label>
                    <select
                      value={paymentForm.method}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          method: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {getPaymentTypeLabel(method)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Notes
                    </label>
                    <textarea
                      rows={3}
                      value={paymentForm.notes}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          notes: sanitizeMultiline(event.target.value, 500),
                        }))
                      }
                      placeholder="Optional payment notes..."
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingPayment}
                    className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingPayment ? 'Saving...' : 'Save Payment'}
                  </button>
                </form>
              )}

              {canManageBooking && balance <= 0 && (
                <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300">
                  ✓ This booking is fully paid.
                </div>
              )}
            </SectionCard>

            <SectionCard title="Payment History">
              {paymentHistory.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:border-dark-700 dark:bg-dark-900/70 dark:text-gray-400">
                  No payment records yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {paymentHistory.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs font-black text-primary-600 dark:text-primary-400">
                          OR {getReceiptNumber(payment)}
                        </p>
                        <p
                          className={`text-sm font-black ${
                            payment.payment_type === 'refund'
                              ? 'text-red-600 dark:text-red-300'
                              : 'text-green-600 dark:text-green-300'
                          }`}
                        >
                          {payment.payment_type === 'refund' ? '-' : ''}
                          {formatPeso(getPaymentAmount(payment))}
                        </p>
                      </div>

                      <p className="text-xs font-black text-gray-950 dark:text-white">
                        {getPaymentTypeLabel(payment.payment_type)} · {getOnlinePaymentMethod({ payment_method: payment.method }, payment)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {payment.source === 'online_down_payment' ? 'Down payment confirmed' : 'Payment recorded'} · {formatDateTime(payment.receipt_issued_at || payment.created_at)}
                      </p>

                      <button
                        type="button"
                        onClick={() => openBookingReceipt(payment)}
                        className="mt-3 rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
                      >
                        View E-Receipt
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </aside>
        </div>
      </div>

      <InvoiceReceiptModal
        isOpen={documentModal.isOpen}
        type={documentModal.type}
        invoice={documentModal.invoice}
        receipt={documentModal.receipt}
        booking={documentModal.booking || booking}
        payments={documentModal.payments}
        customerName={documentModal.customerName}
        customerPhone={
          (documentModal.booking || booking)?.profiles?.phone ||
          (documentModal.booking || booking)?.walkin_customer_phone ||
          ''
        }
        customerEmail={
          (documentModal.booking || booking)?.profiles?.email ||
          ''
        }
        onClose={closeDocumentModal}
      />
    </div>
  );
}
