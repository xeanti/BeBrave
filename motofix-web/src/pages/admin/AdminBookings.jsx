import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { summarizePayments } from '../../lib/payments';
import { notifyUser } from '../../lib/notifications';
import InvoiceReceiptModal from '../../components/InvoiceReceiptModal';
import { generateOrSyncBookingInvoice } from '../../lib/invoices';
import ServiceProgressManager from '../../components/ServiceProgressManager';

const STATUS_OPTIONS = [
  'pending',
  'confirmed',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
  'ready_for_pickup',
  'completed',
  'cancelled',
  'rejected',
  'no_show',
];

const PAYMENT_TYPES = ['down_payment', 'balance', 'full', 'refund'];
const PAYMENT_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];

const POLICY_DEFAULTS = {
  no_show_penalty_amount: '100',
};

const POLICY_KEYS = Object.keys(POLICY_DEFAULTS);

function getPolicyNumber(policies, key) {
  const value = Number(policies?.[key] ?? POLICY_DEFAULTS[key]);

  return Number.isNaN(value) ? Number(POLICY_DEFAULTS[key]) : value;
}

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  const parts = String(value).split('-');

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);

    return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

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

function formatTime(time) {
  if (!time) return '—';

  const normalized = String(time).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function getCustomerName(booking) {
  const name = `${booking.profiles?.first_name || ''} ${
    booking.profiles?.last_name || ''
  }`.trim();

  return name || 'Unknown Customer';
}

function getMechanicName(booking) {
  const name = `${booking.mechanic?.first_name || ''} ${
    booking.mechanic?.last_name || ''
  }`.trim();

  return name || 'Unassigned';
}

function getServiceTotal(booking) {
  return (
    (Number(booking.services?.base_price) || 0) +
    (Number(booking.services?.labor_cost) || 0)
  );
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
  return payment?.receipt_number || `TEMP-${payment?.id?.slice(0, 8)?.toUpperCase() || 'RECEIPT'}`;
}

function getReceiptNumbers(paymentList = []) {
  return paymentList
    .map((payment) => payment.receipt_number)
    .filter(Boolean)
    .join(', ');
}

function getStatusNotificationMessage(status, penaltyAmount = 0) {
  if (status === 'pending') return 'Your booking is now pending.';
  if (status === 'confirmed') return 'Your booking has been confirmed.';
  if (status === 'in_progress') return 'Your service is now in progress.';
  if (status === 'completed') return 'Your service booking has been completed.';
  if (status === 'cancelled') return 'Your booking has been cancelled.';
  if (status === 'no_show') {
    return `Your booking was marked as no-show. A penalty of ${formatPeso(
      penaltyAmount
    )} may apply according to shop policy.`;
  }

  return `Your booking status is now ${String(status).replace('_', ' ')}.`;
}

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

const ACTION_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25 dark:hover:bg-yellow-500/20',
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25 dark:hover:bg-green-500/20',
  in_progress:
    'bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25 dark:hover:bg-blue-500/20',
  inspection:
    'bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/25 dark:hover:bg-indigo-500/20',
  repairing:
    'bg-purple-50 text-purple-700 ring-purple-200 hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25 dark:hover:bg-purple-500/20',
  quality_check:
    'bg-cyan-50 text-cyan-700 ring-cyan-200 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/25 dark:hover:bg-cyan-500/20',
  ready_for_pickup:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25 dark:hover:bg-emerald-500/20',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 hover:bg-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25 dark:hover:bg-gray-500/20',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20',
  rejected:
    'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20',
  no_show:
    'bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25 dark:hover:bg-orange-500/20',
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${
        STATUS_STYLES[status] || STATUS_STYLES.pending
      }`}
    >
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
    blue: 'text-blue-600 dark:text-blue-300',
    red: 'text-red-600 dark:text-red-300',
    orange: 'text-orange-600 dark:text-orange-300',
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

function BookingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-72 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function AdminBookings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [policies, setPolicies] = useState(POLICY_DEFAULTS);

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [payments, setPayments] = useState({});
  const [paymentForm, setPaymentForm] = useState({});
  const [savingPayment, setSavingPayment] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [assigningMechanic, setAssigningMechanic] = useState(null);
  const [smartAssigning, setSmartAssigning] = useState(null);

  const [paymentToast, setPaymentToast] = useState(null);
  const [expandedPayment, setExpandedPayment] = useState(null);
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [expandedProgress, setExpandedProgress] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

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
    fetchBookings();
    fetchMechanics();
    fetchBookingPolicies();

    const bookingsChannel = supabase
      .channel('admin-bookings-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => fetchBookings(false)
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel('admin-bookings-payments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => fetchBookings(false)
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('admin-bookings-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          fetchBookings(false);
          fetchMechanics();
        }
      )
      .subscribe();

    const settingsChannel = supabase
      .channel('admin-bookings-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settings',
        },
        () => fetchBookingPolicies()
      )
      .subscribe();

    const handleFocus = () => {
      fetchBookings(false);
      fetchMechanics();
      fetchBookingPolicies();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchBookings(false);
        fetchMechanics();
        fetchBookingPolicies();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(settingsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function fetchBookingPolicies() {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', POLICY_KEYS);

    if (error) {
      console.error('Failed to load booking policies:', error);
      return;
    }

    const nextPolicies = { ...POLICY_DEFAULTS };

    (data || []).forEach((item) => {
      if (POLICY_KEYS.includes(item.key)) {
        nextPolicies[item.key] = String(item.value ?? POLICY_DEFAULTS[item.key]);
      }
    });

    setPolicies(nextPolicies);
  }

  async function fetchBookings(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        services(name, base_price, labor_cost),
        profiles!bookings_customer_id_fkey(first_name, last_name, email, phone),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `)
      .order('booking_date', { ascending: false })
      .order('booking_time', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load bookings.');
      setBookings([]);
      setPayments({});
      setLoading(false);
      return;
    }

    const bookingRows = data || [];
    setBookings(bookingRows);

    if (bookingRows.length > 0) {
      try {
        const { data: allPayments, error: paymentError } = await supabase
          .from('payments')
          .select(`
            id,
            booking_id,
            order_id,
            amount,
            payment_type,
            method,
            notes,
            created_at,
            processed_by,
            receipt_number,
            receipt_status,
            receipt_issued_at,
            receipt_issued_by,
            profiles!payments_processed_by_fkey(first_name, last_name, email, role)
          `)
          .in(
            'booking_id',
            bookingRows.map((booking) => booking.id)
          )
          .order('created_at', { ascending: true });

        if (paymentError) throw paymentError;

        const grouped = {};

        (allPayments || []).forEach((payment) => {
          if (!grouped[payment.booking_id]) grouped[payment.booking_id] = [];
          grouped[payment.booking_id].push(payment);
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

  async function fetchMechanics() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'mechanic')
      .order('first_name', { ascending: true });

    if (data) setMechanics(data);
  }

  async function insertAuditLog(action, entityId, details = {}) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'bookings',
      entity_id: entityId,
      performed_by: user.id,
      details,
    });
  }

  async function updateStatus(id, status) {
    setUpdatingStatus(`${id}-${status}`);
    setFetchError('');

    try {
      const booking = bookings.find((item) => item.id === id);
      const penaltyAmount =
        status === 'no_show'
          ? getPolicyNumber(policies, 'no_show_penalty_amount')
          : Number(booking?.penalty_amount) || 0;

      const updatePayload = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'no_show') {
        updatePayload.no_show_at = new Date().toISOString();
        updatePayload.no_show_marked_by = user.id;
        updatePayload.penalty_amount = penaltyAmount;
      }

      const { error } = await supabase
        .from('bookings')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;

      await insertAuditLog('UPDATE_BOOKING_STATUS', id, {
        new_status: status,
        penalty_amount: status === 'no_show' ? penaltyAmount : undefined,
      });

      if (booking?.customer_id) {
        await notifyUser({
          userId: booking.customer_id,
          title:
            status === 'no_show'
              ? 'Booking Marked as No-show'
              : 'Booking Status Updated',
          message: getStatusNotificationMessage(status, penaltyAmount),
          type: status === 'no_show' ? 'penalty' : 'service_status',
          relatedTable: 'bookings',
          relatedId: id,
        });
      }

      if (
        booking?.mechanic_id &&
        ['confirmed', 'in_progress', 'completed'].includes(status)
      ) {
        await notifyUser({
          userId: booking.mechanic_id,
          title: 'Service Status Updated',
          message: `A booking assigned to you is now ${status.replace('_', ' ')}.`,
          type: 'service_status',
          relatedTable: 'bookings',
          relatedId: id,
        });
      }

      await fetchBookings(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to update booking status.');
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function smartAssignMechanic(booking) {
  if (!booking?.id || !booking?.service_id || !booking?.booking_date || !booking?.booking_time) {
    setFetchError('Booking is missing service, date, or time.');
    return;
  }

  setSmartAssigning(booking.id);
  setFetchError('');

  try {
    const { data, error } = await supabase.rpc('recommend_mechanics', {
      p_service_id: booking.service_id,
      p_booking_date: booking.booking_date,
      p_booking_time: booking.booking_time,
    });

    if (error) throw error;

    const bestMechanic = data?.[0];

    if (!bestMechanic) {
      setFetchError('No available mechanic found for this schedule.');
      return;
    }

    await assignMechanic(booking.id, bestMechanic.mechanic_id);

    await insertAuditLog('SMART_ASSIGN_MECHANIC', booking.id, {
      mechanic_id: bestMechanic.mechanic_id,
      mechanic_name: `${bestMechanic.first_name} ${bestMechanic.last_name}`,
      score: bestMechanic.score,
      skill_level: bestMechanic.skill_level,
      daily_bookings: bestMechanic.daily_bookings,
      active_bookings: bestMechanic.active_bookings,
    });
  } catch (err) {
    setFetchError(err.message || 'Failed to smart assign mechanic.');
  } finally {
    setSmartAssigning(null);
  }
}

  async function assignMechanic(id, mechanicId) {
    setAssigningMechanic(id);
    setFetchError('');

    try {
      const booking = bookings.find((item) => item.id === id);

      const { error } = await supabase
        .from('bookings')
        .update({
          mechanic_id: mechanicId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      await insertAuditLog('ASSIGN_MECHANIC', id, {
        mechanic_id: mechanicId || null,
      });

      if (mechanicId) {
        await notifyUser({
          userId: mechanicId,
          title: 'New Service Assignment',
          message: 'You have been assigned to a motorcycle service booking.',
          type: 'booking',
          relatedTable: 'bookings',
          relatedId: id,
        });
      }

      if (booking?.customer_id) {
        await notifyUser({
          userId: booking.customer_id,
          title: mechanicId ? 'Mechanic Assigned' : 'Mechanic Unassigned',
          message: mechanicId
            ? 'A mechanic has been assigned to your booking.'
            : 'The mechanic assigned to your booking has been removed.',
          type: 'booking',
          relatedTable: 'bookings',
          relatedId: id,
        });
      }

      await fetchBookings(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to assign mechanic.');
    } finally {
      setAssigningMechanic(null);
    }
  }

  function openBookingDetails(bookingId) {
    if (!bookingId) return;
    navigate(`/admin/bookings/${bookingId}`);
  }

  function handleBookingCardClick(event, bookingId) {
    const interactiveElement = event.target.closest(
      'button, a, input, select, textarea, label, option'
    );

    if (interactiveElement) return;

    openBookingDetails(bookingId);
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

  async function openBookingInvoice(booking, bookingPayments = []) {
    if (!booking?.id) return;

    setFetchError('');

    try {
      const invoice = await generateOrSyncBookingInvoice({
        bookingId: booking.id,
        issuedBy: user?.id || null,
      });

      await insertAuditLog('GENERATE_BOOKING_INVOICE', booking.id, {
        invoice_id: invoice?.id || null,
        invoice_number: invoice?.invoice_number || null,
      });

      setDocumentModal({
        isOpen: true,
        type: 'invoice',
        invoice,
        receipt: null,
        booking,
        payments: bookingPayments,
        customerName: getCustomerName(booking),
      });
    } catch (err) {
      setFetchError(err.message || 'Failed to generate invoice.');
    }
  }

  function openBookingReceipt(booking, payment, bookingPayments = []) {
    if (!payment) {
      setFetchError('No receipt found for this booking yet.');
      return;
    }

    setDocumentModal({
      isOpen: true,
      type: 'receipt',
      invoice: null,
      receipt: payment,
      booking,
      payments: bookingPayments,
      customerName: getCustomerName(booking),
    });
  }

  async function submitPayment(bookingId) {
    const form = paymentForm[bookingId] || {
      amount: '',
      payment_type: 'balance',
      method: 'cash',
    };

    const amount = parseFloat(form.amount);

    if (!amount || amount <= 0) {
      setFetchError('Please enter a valid payment amount.');
      return;
    }

    setSavingPayment(bookingId);
    setFetchError('');

    try {
      const { data: paymentRecord, error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: bookingId,
          amount,
          payment_type: form.payment_type || 'balance',
          method: form.method || 'cash',
          processed_by: user.id,
        })
        .select(
          'id, receipt_number, receipt_status, receipt_issued_at, amount, payment_type, method'
        )
        .single();

      if (paymentError) throw paymentError;

      await insertAuditLog('RECORD_PAYMENT', bookingId, {
        amount,
        payment_type: form.payment_type || 'balance',
        method: form.method || 'cash',
        receipt_number: paymentRecord?.receipt_number || null,
      });

      const booking = bookings.find((item) => item.id === bookingId);
      const total = getServiceTotal(booking);
      const existingPaid = (payments[bookingId] || []).reduce(
        (sum, payment) =>
          payment.payment_type === 'refund'
            ? sum - Number(payment.amount || 0)
            : sum + Number(payment.amount || 0),
        0
      );

      const newTotalPaid =
        form.payment_type === 'refund' ? existingPaid - amount : existingPaid + amount;

      const newBalance = Math.max(total - newTotalPaid, 0);

      if (booking?.customer_id) {
        await notifyUser({
          userId: booking.customer_id,
          title: 'Payment Recorded',
          message:
            form.payment_type === 'refund'
              ? `A refund of ${formatPeso(amount)} has been recorded for your booking. Receipt No: ${
                  paymentRecord?.receipt_number || 'Pending'
                }.`
              : `Your payment of ${formatPeso(
                  amount
                )} has been recorded. Receipt No: ${
                  paymentRecord?.receipt_number || 'Pending'
                }. Remaining balance: ${formatPeso(newBalance)}.`,
          type: 'payment',
          relatedTable: 'bookings',
          relatedId: bookingId,
        });
      }

      setPaymentToast({
        bookingId,
        amount,
        balance: newBalance,
        isFullyPaid: newBalance <= 0,
        receiptNumber: paymentRecord?.receipt_number || null,
        receiptStatus: paymentRecord?.receipt_status || 'issued',
      });

      setTimeout(() => setPaymentToast(null), 4000);

      setPaymentForm((current) => ({
        ...current,
        [bookingId]: {
          amount: '',
          payment_type: 'balance',
          method: 'cash',
        },
      }));

      setExpandedPayment(null);
      await fetchBookings(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to record payment.');
    } finally {
      setSavingPayment(null);
    }
  }

  const counts = useMemo(() => {
    const result = {
      all: bookings.length,
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      inspection: 0,
      repairing: 0,
      quality_check: 0,
      ready_for_pickup: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
      no_show: 0,
    };

    bookings.forEach((booking) => {
      if (result[booking.status] !== undefined) {
        result[booking.status] += 1;
      }
    });

    return result;
  }, [bookings]);

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus = filter === 'all' || booking.status === filter;
      const customerName = getCustomerName(booking).toLowerCase();
      const serviceName = String(booking.services?.name || '').toLowerCase();
      const email = String(booking.profiles?.email || '').toLowerCase();
      const phone = String(booking.profiles?.phone || '').toLowerCase();
      const id = String(booking.id || '').toLowerCase();
      const receiptNumbers = getReceiptNumbers(payments[booking.id] || []).toLowerCase();

      const matchesSearch =
        !searchTerm ||
        customerName.includes(searchTerm) ||
        serviceName.includes(searchTerm) ||
        email.includes(searchTerm) ||
        phone.includes(searchTerm) ||
        id.includes(searchTerm) ||
        receiptNumbers.includes(searchTerm);

      return matchesStatus && matchesSearch;
    });
  }, [bookings, filter, search, payments]);

  const paymentStats = useMemo(() => {
    return filtered.reduce(
      (acc, booking) => {
        const total = getServiceTotal(booking);
        const bookingPayments = payments[booking.id] || [];
        const { totalPaid } = summarizePayments(bookingPayments);
        const balance = Math.max(total - totalPaid, 0);

        acc.total += total;
        acc.paid += totalPaid;
        acc.balance += balance;

        return acc;
      },
      { total: 0, paid: 0, balance: 0 }
    );
  }, [filtered, payments]);

  const noShowPenalty = getPolicyNumber(policies, 'no_show_penalty_amount');

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
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
                  Manage Bookings
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  View customer bookings, assign mechanics, record payments, update booking statuses, and apply no-show penalties.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  fetchBookings(false);
                  fetchMechanics();
                  fetchBookingPolicies();
                }}
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

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Filtered Bookings" value={filtered.length} icon="📅" tone="primary" />
          <StatCard label="Expected Total" value={formatPeso(paymentStats.total)} icon="💰" tone="accent" />
          <StatCard label="Total Paid" value={formatPeso(paymentStats.paid)} icon="✅" tone="green" />
          <StatCard
            label="Total Balance"
            value={formatPeso(paymentStats.balance)}
            icon="⚠️"
            tone={paymentStats.balance > 0 ? 'yellow' : 'default'}
          />
          <StatCard
            label="No-show Penalty"
            value={formatPeso(noShowPenalty)}
            icon="🚫"
            tone="orange"
          />
        </div>

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
              placeholder="Search customer, service, phone, email, or ID..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 lg:w-96"
            />
          </div>
        </div>

        {loading ? (
          <BookingSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              📅
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No bookings found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Try changing the status filter or search keyword.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((booking) => {
              const total = getServiceTotal(booking);
              const bookingPayments = payments[booking.id] || [];
              const { totalPaid } = summarizePayments(bookingPayments);
              const balance = Math.max(total - totalPaid, 0);
              const isFullyPaid = total > 0 && balance <= 0;
              const paymentPercent =
                total > 0 ? Math.min((totalPaid / total) * 100, 100) : 0;
              const form = paymentForm[booking.id] || {
                amount: '',
                payment_type: 'balance',
                method: 'cash',
              };
              const isPaymentOpen = expandedPayment === booking.id;
              const isHistoryOpen = expandedHistory === booking.id;
              const latestPayment = getLatestPayment(bookingPayments);
              const latestReceiptNumber = latestPayment?.receipt_number;

              return (
                <article
                  key={booking.id}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => handleBookingCardClick(event, booking.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') openBookingDetails(booking.id);
                  }}
                  className="cursor-pointer overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:border-primary-300 hover:shadow-md dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/40"
                >
                  <div className="p-5 sm:p-6">
                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={booking.status} />
                          <PaymentBadge isFullyPaid={isFullyPaid} balance={balance} />
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                            #{booking.id?.slice(0, 8).toUpperCase()}
                          </span>
                          {latestReceiptNumber && (
                            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-mono font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                              OR {latestReceiptNumber}
                            </span>
                          )}
                        </div>

                        <h2 className="text-xl font-black text-gray-950 dark:text-white">
                          {getCustomerName(booking)}
                        </h2>

                        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                          👤 {booking.profiles?.email || 'No email'}
                          {booking.profiles?.phone ? ` · ${booking.profiles.phone}` : ''}
                        </p>

                        <p className="mt-1 text-sm font-black text-primary-600 dark:text-primary-400">
                          🔧 {booking.services?.name || 'No service selected'}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {formatDate(booking.booking_date)} at {formatTime(booking.booking_time)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Booking Total
                        </p>
                        <p className="text-xl font-black text-gray-950 dark:text-white">
                          {formatPeso(total)}
                        </p>
                      </div>
                    </div>

                    {booking.notes && (
                      <div className="mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm italic leading-6 text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                        “{booking.notes}”
                      </div>
                    )}

                    {booking.status === 'no_show' && (
                      <div className="mb-5 rounded-3xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
                        <p className="font-black">No-show Penalty Applied</p>
                        <p className="mt-1">
                          Penalty amount:{' '}
                          <span className="font-black">
                            {formatPeso(booking.penalty_amount)}
                          </span>
                        </p>
                        {booking.no_show_at && (
                          <p className="mt-1 text-xs">
                            Marked no-show on {formatDateTime(booking.no_show_at)}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mb-5 grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Total
                        </p>
                        <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                          {formatPeso(total)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Paid
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

                      <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Mechanic
                        </p>
                        <p className="mt-1 truncate text-sm font-black text-gray-950 dark:text-white">
                          {getMechanicName(booking)}
                        </p>
                      </div>
                    </div>

                    <div className="mb-5">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Payment Progress
                        </p>
                        <p className="text-[11px] font-black text-primary-600 dark:text-primary-400">
                          {Math.round(paymentPercent)}%
                        </p>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                        <div
                          className="h-full rounded-full bg-primary-600 transition-all"
                          style={{ width: `${paymentPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="mb-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                        <div>
                          <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Assigned Mechanic
                          </label>
                          <select
                            value={booking.mechanic_id || ''}
                            onChange={(event) => assignMechanic(booking.id, event.target.value)}
                            disabled={assigningMechanic === booking.id}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                          >
                            <option value="">Unassigned</option>
                            {mechanics.map((mechanic) => (
                              <option key={mechanic.id} value={mechanic.id}>
                                {mechanic.first_name} {mechanic.last_name}
                              </option>
                            ))}
                          </select>

                          <button
  type="button"
  onClick={() => smartAssignMechanic(booking)}
  disabled={
    smartAssigning === booking.id ||
    assigningMechanic === booking.id ||
    updatingStatus !== null
  }
  className="mt-3 w-full rounded-2xl bg-primary-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  {smartAssigning === booking.id
    ? 'Finding best mechanic...'
    : 'Smart Assign Best Mechanic'}
</button>
                        </div>

                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {assigningMechanic === booking.id
                            ? 'Updating mechanic...'
                            : 'Changes save automatically.'}
                        </div>
                      </div>
                    </div>

                    <div className="mb-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                      <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Update Status
                      </p>

                      <div className="mb-3 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-xs leading-5 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
                        Current no-show penalty from settings:{' '}
                        <span className="font-black">{formatPeso(noShowPenalty)}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.filter((status) => status !== booking.status).map(
                          (status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => updateStatus(booking.id, status)}
                              disabled={updatingStatus === `${booking.id}-${status}`}
                              className={`rounded-2xl px-4 py-2 text-xs font-black capitalize ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${ACTION_STYLES[status]}`}
                            >
                              {updatingStatus === `${booking.id}-${status}`
                                ? 'Updating...'
                                : status.replace('_', ' ')}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedPayment(isPaymentOpen ? null : booking.id)}
                        className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
                          isPaymentOpen
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                            : 'border border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400'
                        }`}
                      >
                        {isPaymentOpen ? 'Close Form' : '+ Record Payment'}
                      </button>

                      <button
                        type="button"
                        onClick={() => openBookingInvoice(booking, bookingPayments)}
                        className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-black text-primary-700 transition hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                      >
                        Generate / View Invoice
                      </button>

                      {latestPayment && (
                        <button
                          type="button"
                          onClick={() => openBookingReceipt(booking, latestPayment, bookingPayments)}
                          className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                        >
                          View Latest E-Receipt
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedProgress(expandedProgress === booking.id ? null : booking.id)}
                        className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
                          expandedProgress === booking.id
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                            : 'border border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400'
                        }`}
                      >
                        {expandedProgress === booking.id ? 'Hide Service Progress' : 'Service Progress'}
                      </button>

                      {bookingPayments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedHistory(isHistoryOpen ? null : booking.id)}
                          className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                        >
                          {isHistoryOpen ? 'Hide Payment History' : 'View Payment History'} (
                          {bookingPayments.length})
                        </button>
                      )}
                    </div>

                    {expandedProgress === booking.id && (
                      <div className="mt-5">
                        <ServiceProgressManager
                          booking={booking}
                          onUpdated={() => fetchBookings(false)}
                          compact
                        />
                      </div>
                    )}

                    {isHistoryOpen && bookingPayments.length > 0 && (
                      <div className="mt-5 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                        <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Payment History
                        </p>

                        <div className="space-y-2">
                          {bookingPayments.map((payment) => (
                            <div
                              key={payment.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-xs ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-primary-50 px-3 py-1 font-mono font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                                    OR {getReceiptNumber(payment)}
                                  </span>
                                  <span className="rounded-full bg-gray-100 px-3 py-1 font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700">
                                    {payment.receipt_status || 'issued'}
                                  </span>
                                </div>

                                <p className="font-black capitalize text-gray-950 dark:text-white">
                                  {String(payment.payment_type || '').replace('_', ' ')} ·{' '}
                                  {String(payment.method || 'cash').replace('_', ' ')}
                                </p>
                                <p className="mt-1 text-gray-500 dark:text-gray-400">
                                  Issued {formatDateTime(payment.receipt_issued_at || payment.created_at)} · processed by{' '}
                                  {payment.profiles
                                    ? `${payment.profiles.first_name} ${payment.profiles.last_name}`
                                    : 'System'}
                                </p>
                              </div>

                              <div className="flex flex-shrink-0 flex-col items-end gap-2">
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
                                  onClick={() => openBookingReceipt(booking, payment, bookingPayments)}
                                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-[11px] font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-300"
                                >
                                  View E-Receipt
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                                  [booking.id]: {
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
                                  [booking.id]: {
                                    ...form,
                                    payment_type: event.target.value,
                                  },
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                            >
                              {PAYMENT_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type.replace('_', ' ')}
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
                                  [booking.id]: {
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
                            onClick={() => submitPayment(booking.id)}
                            disabled={savingPayment === booking.id}
                            className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingPayment === booking.id ? 'Saving...' : 'Save Payment'}
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
        isOpen={documentModal.isOpen}
        type={documentModal.type}
        invoice={documentModal.invoice}
        receipt={documentModal.receipt}
        booking={documentModal.booking}
        payments={documentModal.payments}
        customerName={documentModal.customerName}
        onClose={closeDocumentModal}
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
              ? '✓ Booking is now fully paid.'
              : `${formatPeso(paymentToast.balance)} balance remaining.`}
          </p>
        </div>
      )}
    </div>
  );
}