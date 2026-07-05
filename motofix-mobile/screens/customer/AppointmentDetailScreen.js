import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;
const YELLOW = '#EAB308';

const SERVICE_STEPS = [
  { key: 'pending', label: 'Pending', icon: 'time' },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle' },
  { key: 'in_progress', label: 'In Progress', icon: 'play-circle' },
  { key: 'inspection', label: 'Inspection', icon: 'search' },
  { key: 'repairing', label: 'Repairing', icon: 'construct' },
  { key: 'quality_check', label: 'Quality Check', icon: 'shield-checkmark' },
  { key: 'ready_for_pickup', label: 'Ready', icon: 'bag-check' },
  { key: 'completed', label: 'Completed', icon: 'checkmark-done-circle' },
];

const TERMINAL_STATUSES = ['cancelled', 'rejected', 'no_show'];

function generateTimeSlots() {
  const slots = [];
  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

const timeSlots = generateTimeSlots();

function formatTimeSlot(slot) {
  if (!slot) return '—';
  const [h, m] = String(slot).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m || '00'} ${ampm}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toISODateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function peso(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function normalizeStatus(status) {
  return String(status || '').toLowerCase();
}

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getDownPaymentStatusLabel(status, paid, reservationFee) {
  const value = normalizeStatus(status);

  if (value === 'paid' || paid >= reservationFee) return 'Down Payment Paid';
  if (value === 'checkout_created') return 'Waiting for Down Payment';
  if (value === 'pending_payment') return 'Pay Down Payment at Shop';
  if (value === 'pending_verification') return 'Down Payment for Verification';
  if (value === 'failed') return 'Down Payment Failed';
  if (value === 'expired') return 'Down Payment Expired';

  return 'Down Payment Unpaid';
}

function getPaymentTypeLabel(type) {
  const value = normalizeStatus(type);

  if (value === 'reservation_fee' || value === 'down_payment') return 'Down Payment';
  if (value === 'balance') return 'Balance Payment';
  if (value === 'full') return 'Full Payment';
  if (value === 'refund') return 'Refund';

  return humanize(type || 'Payment');
}

function getPaymentRecordTitle(payment) {
  const typeLabel = getPaymentTypeLabel(payment?.payment_type);
  const methodLabel = getPaymentMethodLabel(payment?.payment_method || payment?.method);

  return `${typeLabel} · ${methodLabel}`;
}

function getPaymentAmount(payment) {
  return Number(
    payment?.amount ??
      payment?.amount_paid ??
      payment?.paid_amount ??
      payment?.total_paid ??
      0
  );
}

function getBookingServices(booking) {
  const list = Array.isArray(booking?.booking_services) ? booking.booking_services : [];

  if (list.length > 0) return list;

  if (booking?.services?.name) {
    return [
      {
        service_name: booking.services.name,
        base_price: booking.services.base_price,
        labor_cost: booking.services.labor_cost,
        estimated_duration_minutes: booking.services.estimated_duration_minutes,
        quantity: 1,
      },
    ];
  }

  return [];
}

function getServiceName(item) {
  return item?.service_name || item?.name || item?.services?.name || 'Service';
}

function getServiceSubtotal(item) {
  const quantity = Number(item?.quantity) || 1;
  const basePrice = Number(item?.base_price) || Number(item?.services?.base_price) || 0;
  const laborCost = Number(item?.labor_cost) || Number(item?.services?.labor_cost) || 0;

  return (basePrice + laborCost) * quantity;
}

function getServiceOnlyTotal(booking) {
  const savedServiceTotal = Number(booking?.service_total) || 0;

  if (savedServiceTotal > 0) return savedServiceTotal;

  const selectedServices = getBookingServices(booking);

  if (selectedServices.length > 0) {
    return selectedServices.reduce((sum, item) => sum + getServiceSubtotal(item), 0);
  }

  const basePrice = Number(booking?.services?.base_price) || 0;
  const laborCost = Number(booking?.services?.labor_cost) || 0;

  return basePrice + laborCost;
}

function getBookingServiceTitle(booking) {
  if (booking?.services_summary) return booking.services_summary;

  const selectedServices = getBookingServices(booking);

  if (selectedServices.length > 0) {
    return selectedServices.map(getServiceName).join(', ');
  }

  return booking?.services?.name || 'Service';
}

function normalizePartsUsed(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getPartsUsed(booking) {
  const partsUsed = normalizePartsUsed(booking?.parts_used);
  if (partsUsed.length > 0) return partsUsed;

  return normalizePartsUsed(booking?.products);
}

function getPartQty(item) {
  return Number(item?.quantity) || 1;
}

function getPartPrice(item) {
  return Number(item?.unit_price ?? item?.price) || 0;
}

function getPartSubtotal(item) {
  return Number(item?.subtotal) || getPartPrice(item) * getPartQty(item);
}

function getPartsTotal(booking) {
  const savedPartsTotal =
    Number(booking?.parts_total) || Number(booking?.product_total) || 0;

  if (savedPartsTotal > 0) return savedPartsTotal;

  return getPartsUsed(booking).reduce((sum, item) => sum + getPartSubtotal(item), 0);
}

function getBookingTotal(booking) {
  const savedTotal = Number(booking?.total_amount) || 0;

  if (savedTotal > 0) return savedTotal;

  return getServiceOnlyTotal(booking) + getPartsTotal(booking);
}

function getReservationFee(booking) {
  const savedFee = Number(booking?.reservation_fee) || 0;

  if (savedFee > 0) return savedFee;

  return Number((getBookingTotal(booking) * 0.2).toFixed(2));
}

function getPaymentStatus(total, paid, booking) {
  const bookingPaymentStatus = normalizeStatus(booking?.payment_status);
  const reservationFee = getReservationFee(booking);

  if (paid >= total && total > 0) return 'Fully Paid';

  if (bookingPaymentStatus === 'paid' && paid > 0 && paid < total) {
    return 'Down Payment Paid';
  }

  if (bookingPaymentStatus === 'checkout_created') return 'Waiting for Down Payment';
  if (bookingPaymentStatus === 'pending_verification') return 'Down Payment for Verification';
  if (bookingPaymentStatus === 'pending_payment') return 'Pay Down Payment at Shop';
  if (paid <= 0) return 'Unpaid';
  if (paid >= reservationFee && paid < total) return 'Down Payment Paid';

  return 'Partially Paid';
}

function getPaymentMethodLabel(method) {
  const value = normalizeStatus(method);

  if (value === 'paymongo_qrph' || value === 'paymongo') {
    return 'Down Payment via PayMongo QR / GCash';
  }

  if (value === 'gcash_manual' || value === 'manual_gcash' || value === 'personal_gcash') {
    return 'Down Payment via Personal GCash';
  }

  if (value === 'cash' || value === 'cash_at_shop') {
    return 'Down Payment Cash at Shop';
  }

  if (value === 'bank_transfer') {
    return 'Down Payment via Bank Transfer';
  }

  return method ? `Down Payment via ${humanize(method)}` : 'Not selected';
}

function canChangePaymentMethod(booking) {
  const bookingStatus = normalizeStatus(booking?.status);
  const paymentStatus = normalizeStatus(booking?.payment_status);

  return bookingStatus === 'pending' && paymentStatus !== 'paid';
}

export default function AppointmentDetailScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();

  const initialBooking = route?.params?.booking || null;
  const routeBookingId =
    route?.params?.bookingId || route?.params?.id || initialBooking?.id || null;

  const [booking, setBooking] = useState(initialBooking);
  const [progressEvents, setProgressEvents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [latestInvoice, setLatestInvoice] = useState(null);

  const [loading, setLoading] = useState(!initialBooking);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState(null);
  const [newTime, setNewTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [showPaymentMethodPanel, setShowPaymentMethodPanel] = useState(false);
  const [manualReference, setManualReference] = useState('');

  const s = styles(theme);

  const bookingId = booking?.id || routeBookingId;

  const selectedServices = useMemo(() => getBookingServices(booking), [booking]);
  const serviceTotal = useMemo(() => getServiceOnlyTotal(booking), [booking]);
  const partsUsed = useMemo(() => getPartsUsed(booking), [booking]);
  const partsTotal = useMemo(() => getPartsTotal(booking), [booking]);
  const total = useMemo(() => getBookingTotal(booking), [booking]);

  const paid = useMemo(() => {
    const recordedPayments = payments.reduce(
      (sum, payment) => sum + getPaymentAmount(payment),
      0
    );

    const reservationFee = getReservationFee(booking);
    const bookingPaymentStatus = normalizeStatus(booking?.payment_status);

    if (bookingPaymentStatus === 'paid') {
      return Math.max(recordedPayments, reservationFee);
    }

    return recordedPayments;
  }, [booking, payments]);

  const balance = Math.max(total - paid, 0);
  const paymentProgress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  const paymentStatus = getPaymentStatus(total, paid, booking);
  const downPaymentStatus = getDownPaymentStatusLabel(
    booking?.payment_status,
    paid,
    getReservationFee(booking)
  );

  const currentStepIndex = useMemo(() => {
    const status = normalizeStatus(booking?.status);
    return SERVICE_STEPS.findIndex((step) => step.key === status);
  }, [booking?.status]);

  const canModify = ['pending', 'confirmed'].includes(normalizeStatus(booking?.status));
  const canChangePayment = canChangePaymentMethod(booking);

  const fetchDetails = useCallback(
    async (showMainLoader = false) => {
      if (!bookingId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showMainLoader) setLoading(true);

      const bookingQuery = supabase
        .from('bookings')
        .select(
          `
          *,
          services (
            id,
            name,
            base_price,
            labor_cost,
            estimated_duration_minutes
          ),
          booking_services (
            id,
            service_id,
            service_name,
            base_price,
            labor_cost,
            estimated_duration_minutes,
            quantity
          )
        `
        )
        .eq('id', bookingId)
        .maybeSingle();

      const progressQuery = supabase
        .from('service_progress_events')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });

      const paymentsQuery = supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

      const bookingPaymentsQuery = supabase
        .from('booking_payments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

      const invoicesQuery = supabase
        .from('invoices')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1);

      const [
        bookingResult,
        progressResult,
        paymentsResult,
        bookingPaymentsResult,
        invoicesResult,
      ] = await Promise.all([
        bookingQuery,
        progressQuery,
        paymentsQuery,
        bookingPaymentsQuery,
        invoicesQuery,
      ]);

      if (bookingResult.error) {
        Alert.alert('Error', bookingResult.error.message);
      } else if (bookingResult.data) {
        setBooking(bookingResult.data);
      }

      if (!progressResult.error) {
        setProgressEvents(progressResult.data || []);
      }

      if (!paymentsResult.error || !bookingPaymentsResult.error) {
        const manualPayments = paymentsResult.data || [];

        const onlinePayments = (bookingPaymentsResult.data || []).map((payment) => ({
          id: payment.id,
          booking_id: payment.booking_id,
          amount: Number(payment.amount) || 0,
          payment_method: payment.payment_method || 'paymongo_qrph',
          method: payment.payment_method || 'paymongo_qrph',
          payment_type: 'reservation_fee',
          created_at: payment.paid_at || payment.created_at,
          paid_at: payment.paid_at,
          receipt_number: payment.reference_number,
          reference_number: payment.reference_number,
          status: payment.status,
        }));

        setPayments([...manualPayments, ...onlinePayments]);
      }

      if (!invoicesResult.error) {
        setLatestInvoice(invoicesResult.data?.[0] || null);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [bookingId]
  );

  useEffect(() => {
    fetchDetails(!initialBooking);
  }, [fetchDetails, initialBooking]);

  useFocusEffect(
    useCallback(() => {
      fetchDetails(false);
    }, [fetchDetails])
  );

  function statusColor(status) {
    switch (normalizeStatus(status)) {
      case 'confirmed':
        return theme.success;
      case 'pending':
        return theme.warning;
      case 'in_progress':
        return '#3b82f6';
      case 'inspection':
        return '#6366f1';
      case 'repairing':
        return '#f97316';
      case 'quality_check':
        return '#06b6d4';
      case 'ready_for_pickup':
        return '#22c55e';
      case 'completed':
        return theme.success;
      case 'cancelled':
      case 'rejected':
      case 'no_show':
        return theme.danger;
      default:
        return theme.textMuted;
    }
  }

  async function updatePaymentMethod(payload, successMessage) {
    if (!booking?.id) return;

    setActionLoading(true);

    const { error } = await supabase
      .from('bookings')
      .update(payload)
      .eq('id', booking.id);

    setActionLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setBooking((current) => ({
      ...current,
      ...payload,
    }));

    setShowPaymentMethodPanel(false);
    setManualReference('');
    Alert.alert('Payment Method Updated', successMessage);
    fetchDetails(false);
  }

  async function choosePayMongoPayment() {
    Alert.alert(
      'Use PayMongo QR / GCash for Down Payment?',
      'This will set your down payment method to PayMongo QR / GCash.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () =>
            updatePaymentMethod(
              {
                payment_method: 'paymongo_qrph',
                payment_status: 'checkout_created',
                payment_reference: booking?.payment_reference || null,
              },
              'Please continue your down payment using PayMongo QR / GCash.'
            ),
        },
      ]
    );
  }

  async function chooseCashAtShop() {
    Alert.alert(
      'Pay Down Payment Cash at Shop?',
      'Your booking will stay pending until staff receives and records your down payment at the shop.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () =>
            updatePaymentMethod(
              {
                payment_method: 'cash_at_shop',
                payment_status: 'pending_payment',
                payment_reference: null,
              },
              'Please pay your down payment at the shop counter.'
            ),
        },
      ]
    );
  }

  async function submitManualGCash() {
    const reference = manualReference.trim();

    if (reference.length < 4) {
      Alert.alert('Reference Required', 'Please enter your GCash reference number.');
      return;
    }

    await updatePaymentMethod(
      {
        payment_method: 'gcash_manual',
        payment_status: 'pending_verification',
        payment_reference: reference,
      },
      'Your GCash down payment reference was submitted. Please wait for staff verification.'
    );
  }

  async function handleCancel() {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);

            const { error } = await supabase
              .from('bookings')
              .update({ status: 'cancelled' })
              .eq('id', booking.id);

            setActionLoading(false);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setBooking({ ...booking, status: 'cancelled' });
              Alert.alert('Booking Cancelled', 'Your booking has been cancelled.');
              fetchDetails(false);
            }
          },
        },
      ]
    );
  }

  async function handleReschedule() {
    if (!newDate) {
      Alert.alert('Error', 'Please select a new date.');
      return;
    }

    if (!newTime) {
      Alert.alert('Error', 'Please select a new time slot.');
      return;
    }

    setActionLoading(true);

    const dateStr = toISODateString(newDate);

    const { error } = await supabase
      .from('bookings')
      .update({
        booking_date: dateStr,
        booking_time: newTime,
        status: 'pending',
      })
      .eq('id', booking.id);

    setActionLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setBooking({
        ...booking,
        booking_date: dateStr,
        booking_time: newTime,
        status: 'pending',
      });
      setShowReschedule(false);
      setNewDate(null);
      setNewTime('');
      Alert.alert(
        'Rescheduled!',
        'Your booking has been rescheduled and is pending confirmation.'
      );
      fetchDetails(false);
    }
  }

  function onChangeDate(event, selectedDate) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) setNewDate(selectedDate);
    } else if (selectedDate) {
      setNewDate(selectedDate);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchDetails(false);
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading appointment details...</Text>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={s.centered}>
        <Ionicons name="calendar-outline" size={44} color={theme.textMuted} />
        <Text style={s.emptyText}>Booking not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={YELLOW}
        />
      }
    >
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.serviceName}>{getBookingServiceTitle(booking)}</Text>
          <Text style={s.refText}>#{booking.id?.slice(0, 8).toUpperCase()}</Text>
        </View>

        <View
          style={[
            s.badge,
            { backgroundColor: statusColor(booking.status) + '22' },
          ]}
        >
          <Text style={[s.badgeText, { color: statusColor(booking.status) }]}>
            {humanize(booking.status)}
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <DetailRow label="📅 Date" value={booking.booking_date ? formatDisplayDate(new Date(`${booking.booking_date}T00:00:00`)) : '—'} theme={theme} />
        <DetailRow
          label="🕐 Time"
          value={formatTimeSlot(booking.booking_time)}
          theme={theme}
        />
        <DetailRow
          label={partsUsed.length > 0 ? '💰 Updated Total' : '💰 Total'}
          value={peso(total)}
          theme={theme}
          highlight
        />
        {booking.notes ? (
          <DetailRow label="📝 Notes" value={booking.notes} theme={theme} last />
        ) : (
          <DetailRow label="📝 Notes" value="No notes provided" theme={theme} last />
        )}
      </View>

      <SectionTitle
        theme={theme}
        icon="construct"
        title="Service Progress"
        subtitle="Track the current stage of your motorcycle service."
      />

      <View style={s.card}>
        {TERMINAL_STATUSES.includes(normalizeStatus(booking.status)) ? (
          <View style={s.terminalBox}>
            <Ionicons
              name="alert-circle"
              size={20}
              color={statusColor(booking.status)}
            />
            <Text style={[s.terminalText, { color: statusColor(booking.status) }]}>
              This booking is marked as {humanize(booking.status)}.
            </Text>
          </View>
        ) : (
          <View style={s.timelineWrap}>
            {SERVICE_STEPS.map((step, index) => {
              const isDone =
                currentStepIndex >= index ||
                normalizeStatus(booking.status) === 'completed';
              const isCurrent = currentStepIndex === index;
              const matchedEvent = progressEvents.find(
                (event) => normalizeStatus(event.status || event.stage) === step.key
              );

              return (
                <View key={step.key} style={s.stepRow}>
                  <View style={s.stepMarkerColumn}>
                    <View
                      style={[
                        s.stepCircle,
                        {
                          backgroundColor: isDone ? YELLOW : theme.bg2,
                          borderColor: isDone ? YELLOW : theme.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={step.icon}
                        size={15}
                        color={isDone ? '#111827' : theme.textMuted}
                      />
                    </View>

                    {index < SERVICE_STEPS.length - 1 && (
                      <View
                        style={[
                          s.stepLine,
                          {
                            backgroundColor:
                              currentStepIndex > index ? YELLOW : theme.border,
                          },
                        ]}
                      />
                    )}
                  </View>

                  <View style={s.stepContent}>
                    <View style={s.stepTitleRow}>
                      <Text
                        style={[
                          s.stepTitle,
                          { color: isDone ? theme.text : theme.textMuted },
                        ]}
                      >
                        {step.label}
                      </Text>

                      {isCurrent && (
                        <View style={s.currentPill}>
                          <Text style={s.currentPillText}>Current</Text>
                        </View>
                      )}
                    </View>

                    <Text style={s.stepMeta}>
                      {matchedEvent
                        ? formatDateTime(matchedEvent.created_at)
                        : isDone
                          ? 'Updated'
                          : 'Waiting'}
                    </Text>

                    {!!matchedEvent?.notes && (
                      <Text style={s.stepNote}>{matchedEvent.notes}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <SectionTitle
        theme={theme}
        icon="construct"
        title="Selected Services"
        subtitle="Services included in this appointment."
      />

      <View style={s.card}>
        {selectedServices.map((item, index) => {
          const quantity = Number(item.quantity) || 1;
          const subtotal = getServiceSubtotal(item);

          return (
            <View key={item.id || item.service_id || index} style={s.paymentRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.paymentRowTitle}>
                  {quantity > 1 ? `${quantity} × ` : ''}{getServiceName(item)}
                </Text>
                <Text style={s.paymentRowDate}>
                  Estimated duration: {item.estimated_duration_minutes || '—'} minutes
                </Text>
              </View>

              <Text style={s.paymentAmount}>{peso(subtotal)}</Text>
            </View>
          );
        })}

        <View style={s.paymentGrid}>
          <MiniStat label="Service Total" value={peso(serviceTotal)} theme={theme} />
          <MiniStat label="Parts" value={peso(partsTotal)} theme={theme} />
          <MiniStat label="Total" value={peso(total)} theme={theme} />
        </View>
      </View>

      <SectionTitle
        theme={theme}
        icon="cube"
        title="Parts Used"
        subtitle="Parts added by staff or mechanic after inspection will appear here."
      />

      <View style={s.card}>
        {partsUsed.length === 0 ? (
          <View style={s.emptyBoxLarge}>
            <Ionicons name="cube-outline" size={28} color={YELLOW} />
            <Text style={s.emptyBoxTitle}>No parts used yet</Text>
            <Text style={s.emptyBoxTextCenter}>
              Parts will appear here after the shop inspects your motorcycle and adds
              needed items such as brake fluid, oil, or spark plugs.
            </Text>
          </View>
        ) : (
          <>
            <View style={s.paymentList}>
              {partsUsed.map((item, index) => {
                const quantity = getPartQty(item);
                const price = getPartPrice(item);
                const subtotal = getPartSubtotal(item);
                const deducted = item?.stock_deducted === true;

                return (
                  <View
                    key={item.line_id || item.id || item.part_id || index}
                    style={s.paymentRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.paymentRowTitle}>
                        {quantity} × {item.name || 'Part / Product'}
                      </Text>
                      <Text style={s.paymentRowDate}>
                        {item.category || 'Service Part'} · {peso(price)} each
                      </Text>
                      <Text style={s.receiptText}>
                        {deducted ? 'Used during service' : 'Added to estimate'}
                      </Text>
                    </View>

                    <Text style={s.paymentAmount}>{peso(subtotal)}</Text>
                  </View>
                );
              })}
            </View>

            <View style={s.paymentGrid}>
              <MiniStat label="Service" value={peso(serviceTotal)} theme={theme} />
              <MiniStat label="Parts" value={peso(partsTotal)} theme={theme} />
              <MiniStat label="Updated Total" value={peso(total)} theme={theme} />
            </View>
          </>
        )}
      </View>

      <SectionTitle
        theme={theme}
        icon="wallet"
        title="Down Payment Method"
        subtitle="This is only for the required down payment before confirmation."
      />

      <View style={s.card}>
        <DetailRow
          label="Down Payment Method"
          value={getPaymentMethodLabel(booking.payment_method)}
          theme={theme}
        />
        <DetailRow
          label="Down Payment Status"
          value={downPaymentStatus}
          theme={theme}
          highlight
        />
        {booking.payment_reference ? (
          <DetailRow
            label="Reference"
            value={booking.payment_reference}
            theme={theme}
            last={!canChangePayment}
          />
        ) : null}

        {canChangePayment ? (
          <View style={s.paymentMethodBox}>
            {!showPaymentMethodPanel ? (
              <TouchableOpacity
                style={s.changePaymentBtn}
                onPress={() => setShowPaymentMethodPanel(true)}
                disabled={actionLoading}
              >
                <Ionicons name="swap-horizontal" size={17} color="#111827" />
                <Text style={s.changePaymentBtnText}>Change Payment Method</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={s.paymentMethodTitle}>Choose down payment method</Text>

                <TouchableOpacity
                  style={s.paymentOption}
                  onPress={choosePayMongoPayment}
                  disabled={actionLoading}
                >
                  <View style={s.paymentOptionIcon}>
                    <Ionicons name="qr-code-outline" size={20} color={YELLOW} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.paymentOptionTitle}>PayMongo QR / GCash Down Payment</Text>
                    <Text style={s.paymentOptionText}>
                      Pay the down payment using the online QR checkout.
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.paymentOption}
                  onPress={chooseCashAtShop}
                  disabled={actionLoading}
                >
                  <View style={s.paymentOptionIcon}>
                    <Ionicons name="cash-outline" size={20} color={YELLOW} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.paymentOptionTitle}>Cash Down Payment at Shop</Text>
                    <Text style={s.paymentOptionText}>
                      Staff will confirm once your down payment is received.
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={s.manualBox}>
                  <Text style={s.paymentOptionTitle}>Personal GCash Down Payment</Text>
                  <Text style={s.paymentOptionText}>
                    Enter the GCash reference number for staff verification.
                  </Text>
                  <TextInput
                    value={manualReference}
                    onChangeText={setManualReference}
                    placeholder="Enter GCash reference number"
                    placeholderTextColor={theme.textMuted}
                    style={s.referenceInput}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={s.submitManualBtn}
                    onPress={submitManualGCash}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color="#111827" />
                    ) : (
                      <Text style={s.submitManualBtnText}>Submit for Verification</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={s.closePaymentBtn}
                  onPress={() => {
                    setShowPaymentMethodPanel(false);
                    setManualReference('');
                  }}
                  disabled={actionLoading}
                >
                  <Text style={s.closePaymentBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={s.lockedPaymentBox}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.textMuted} />
            <Text style={s.lockedPaymentText}>
              Down payment method can no longer be changed after payment is confirmed.
            </Text>
          </View>
        )}
      </View>

      <SectionTitle
        theme={theme}
        icon="card"
        title="Payment Summary"
        subtitle="View down payment, full payment, balance, and receipt status."
      />

      <View style={s.card}>
        <View style={s.paymentHeader}>
          <View>
            <Text style={s.paymentStatus}>{paymentStatus}</Text>
            <Text style={s.paymentSubText}>
              Paid {peso(paid)} of {peso(total)}
            </Text>
          </View>

          <Text style={s.balanceText}>{peso(balance)} balance</Text>
        </View>

        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${paymentProgress}%` }]} />
        </View>

        <View style={s.paymentGrid}>
          <MiniStat label="Total" value={peso(total)} theme={theme} />
          <MiniStat label="Down Payment" value={peso(getReservationFee(booking))} theme={theme} />
          <MiniStat label="Paid" value={peso(paid)} theme={theme} />
          <MiniStat label="Balance" value={peso(balance)} theme={theme} />
        </View>

        {payments.length > 0 ? (
          <View style={s.paymentList}>
            {payments.slice(0, 3).map((payment) => (
              <View key={payment.id} style={s.paymentRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.paymentRowTitle}>
                    {getPaymentRecordTitle(payment)}
                  </Text>
                  <Text style={s.paymentRowDate}>
                    {formatDateTime(payment.created_at || payment.paid_at)}
                  </Text>
                  {!!payment.receipt_number && (
                    <Text style={s.receiptText}>
                      Receipt: {payment.receipt_number}
                    </Text>
                  )}
                </View>

                <Text style={s.paymentAmount}>{peso(getPaymentAmount(payment))}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={s.emptyBox}>
            <Ionicons name="receipt-outline" size={18} color={theme.textMuted} />
            <Text style={s.emptyBoxText}>No payment record yet.</Text>
          </View>
        )}
      </View>

      <SectionTitle
        theme={theme}
        icon="document-text"
        title="Invoice / E-Receipt"
        subtitle="Digital transaction record generated by the shop."
      />

      <View style={s.card}>
        {latestInvoice ? (
          <>
            <DetailRow
              label="Invoice No."
              value={
                latestInvoice.invoice_number ||
                latestInvoice.id?.slice(0, 8).toUpperCase()
              }
              theme={theme}
            />
            <DetailRow
              label="Status"
              value={humanize(latestInvoice.status || paymentStatus)}
              theme={theme}
            />
            <DetailRow
              label="Amount"
              value={peso(latestInvoice.total_amount || total)}
              theme={theme}
              highlight
            />
            <DetailRow
              label="Generated"
              value={formatDateTime(latestInvoice.created_at)}
              theme={theme}
              last
            />
          </>
        ) : (
          <View style={s.emptyBoxLarge}>
            <Ionicons name="document-outline" size={28} color={YELLOW} />
            <Text style={s.emptyBoxTitle}>No invoice yet</Text>
            <Text style={s.emptyBoxTextCenter}>
              The invoice or e-receipt will appear here after the shop records or
              confirms your down payment or balance payment.
            </Text>
          </View>
        )}
      </View>

      {canModify && !showReschedule && (
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={[
              s.actionBtn,
              {
                borderColor: '#3b82f644',
                backgroundColor: '#3b82f618',
              },
            ]}
            onPress={() => setShowReschedule(true)}
            disabled={actionLoading}
          >
            <Text style={[s.actionBtnText, { color: '#3b82f6' }]}>
              📅 Reschedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.actionBtn,
              {
                borderColor: theme.danger + '44',
                backgroundColor: theme.danger + '18',
              },
            ]}
            onPress={handleCancel}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <Text style={[s.actionBtnText, { color: theme.danger }]}>
                ✕ Cancel Booking
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {showReschedule && (
        <View style={s.reschedulePanel}>
          <Text style={s.reschedulTitle}>Pick a New Date & Time</Text>

          <TouchableOpacity
            style={s.dateCard}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={s.dateCardIcon}>📅</Text>
            <Text style={newDate ? s.dateCardText : s.dateCardPlaceholder}>
              {newDate ? formatDisplayDate(newDate) : 'Tap to choose a date'}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={newDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={onChangeDate}
              themeVariant={isDark ? 'dark' : 'light'}
              accentColor={theme.primary}
            />
          )}

          {Platform.OS === 'ios' && showDatePicker && (
            <TouchableOpacity
              style={s.dateDoneBtn}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={s.dateDoneBtnText}>Done</Text>
            </TouchableOpacity>
          )}

          <Text style={s.timeLabel}>Select Time</Text>

          <View style={s.timeGrid}>
            {timeSlots.map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.timeChip, newTime === t && s.timeChipActive]}
                onPress={() => setNewTime(t)}
              >
                <Text
                  style={[
                    s.timeChipText,
                    newTime === t && s.timeChipTextActive,
                  ]}
                >
                  {formatTimeSlot(t)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.rescheduleActions}>
            <TouchableOpacity
              style={s.cancelRescheduleBtn}
              onPress={() => {
                setShowReschedule(false);
                setNewDate(null);
                setNewTime('');
              }}
            >
              <Text style={s.cancelRescheduleBtnText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                s.confirmRescheduleBtn,
                actionLoading && { opacity: 0.6 },
              ]}
              onPress={handleReschedule}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.confirmRescheduleBtnText}>
                  Confirm Reschedule
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function SectionTitle({ theme, icon, title, subtitle }) {
  return (
    <View style={sectionStyles.sectionHeader}>
      <View style={[sectionStyles.sectionIcon, { backgroundColor: YELLOW + '22' }]}>
        <Ionicons name={icon} size={18} color={YELLOW} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[sectionStyles.sectionTitle, { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[sectionStyles.sectionSubtitle, { color: theme.textMuted }]}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function DetailRow({ label, value, theme, highlight, last }) {
  return (
    <View
      style={{
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.border,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: theme.textMuted,
          fontWeight: '700',
          marginBottom: 5,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: highlight ? 16 : 14,
          color: highlight ? theme.primaryLight || YELLOW : theme.text,
          fontWeight: highlight ? '900' : '700',
          lineHeight: highlight ? 22 : 20,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function MiniStat({ label, value, theme }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '47%',
        backgroundColor: theme.bg2 || theme.bg,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 10,
        minWidth: 130,
      }}
    >
      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>
        {label}
      </Text>
      <Text
        style={{
          color: theme.text,
          fontSize: 13,
          fontWeight: '900',
          marginTop: 4,
          lineHeight: 18,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 2,
  },
});

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
      padding: 24,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 12,
    },
    content: { padding: 20 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 20,
      gap: 10,
    },
    serviceName: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.text,
      lineHeight: 26,
      flexShrink: 1,
    },
    refText: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
    badge: {
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: 120,
      alignItems: 'center',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: 'bold',
      textTransform: 'capitalize',
      textAlign: 'center',
      lineHeight: 15,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 20,
      overflow: 'hidden',
    },
    timelineWrap: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4,
    },
    stepRow: {
      flexDirection: 'row',
      minHeight: 70,
    },
    stepMarkerColumn: {
      width: 34,
      alignItems: 'center',
    },
    stepCircle: {
      width: 30,
      height: 30,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    stepLine: {
      width: 2,
      flex: 1,
      marginVertical: 3,
    },
    stepContent: {
      flex: 1,
      paddingLeft: 10,
      paddingBottom: 16,
    },
    stepTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    stepTitle: {
      fontSize: 14,
      fontWeight: '900',
    },
    stepMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 3,
      fontWeight: '500',
    },
    stepNote: {
      color: theme.text,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 6,
    },
    currentPill: {
      backgroundColor: YELLOW,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    currentPillText: {
      color: '#111827',
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    terminalBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 16,
    },
    terminalText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
    },
    paymentHeader: {
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 14,
      flexWrap: 'wrap',
    },
    paymentStatus: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    paymentSubText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
      lineHeight: 17,
    },
    balanceText: {
      color: YELLOW,
      fontSize: 13,
      fontWeight: '900',
      textAlign: 'left',
      lineHeight: 18,
    },
    progressTrack: {
      height: 9,
      backgroundColor: theme.bg2 || theme.bg,
      borderRadius: 999,
      marginHorizontal: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
    },
    progressFill: {
      height: '100%',
      backgroundColor: YELLOW,
      borderRadius: 999,
    },
    paymentGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 16,
    },
    paymentList: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    paymentRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    paymentRowTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 18,
    },
    paymentRowDate: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '500',
      marginTop: 3,
      lineHeight: 16,
    },
    receiptText: {
      color: YELLOW,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 3,
    },
    paymentAmount: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
      textAlign: 'right',
      minWidth: 82,
      flexShrink: 0,
      lineHeight: 18,
    },
    emptyBox: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: theme.bg2 || theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    emptyBoxText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
    },
    emptyBoxLarge: {
      alignItems: 'center',
      padding: 22,
    },
    emptyBoxTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
      marginTop: 8,
      marginBottom: 4,
    },
    emptyBoxTextCenter: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      fontWeight: '500',
    },
    paymentMethodBox: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: 10,
    },
    changePaymentBtn: {
      backgroundColor: YELLOW,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    changePaymentBtnText: {
      color: '#111827',
      fontSize: 13,
      fontWeight: '900',
    },
    paymentMethodTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
      marginBottom: 2,
    },
    paymentOption: {
      backgroundColor: theme.bg2 || theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    paymentOptionIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: YELLOW + '22',
    },
    paymentOptionTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    paymentOptionText: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
      marginTop: 3,
      flexShrink: 1,
    },
    manualBox: {
      backgroundColor: theme.bg2 || theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 8,
    },
    referenceInput: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    submitManualBtn: {
      backgroundColor: YELLOW,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitManualBtnText: {
      color: '#111827',
      fontSize: 12,
      fontWeight: '900',
    },
    closePaymentBtn: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    closePaymentBtnText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    lockedPaymentBox: {
      margin: 16,
      marginTop: 0,
      backgroundColor: theme.bg2 || theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    lockedPaymentText: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      flex: 1,
    },
    actionsRow: { gap: 10 },
    actionBtn: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      marginBottom: 10,
    },
    actionBtnText: { fontSize: 14, fontWeight: '600' },
    emptyText: { color: theme.textSub || theme.textMuted, fontSize: 14 },
    reschedulePanel: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 20,
    },
    reschedulTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 16,
    },
    dateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bg2 || theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    dateCardIcon: { fontSize: 18, marginRight: 10 },
    dateCardText: { color: theme.text, fontSize: 15, fontWeight: '600' },
    dateCardPlaceholder: { color: theme.textMuted, fontSize: 15 },
    dateDoneBtn: {
      alignSelf: 'flex-end',
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginBottom: 16,
    },
    dateDoneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    timeLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSub || theme.textMuted,
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    timeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    timeChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: theme.bg2 || theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
    },
    timeChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    timeChipText: { color: theme.textSub || theme.textMuted, fontSize: 13 },
    timeChipTextActive: { color: '#fff', fontWeight: 'bold' },
    rescheduleActions: { flexDirection: 'row', gap: 10 },
    cancelRescheduleBtn: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    cancelRescheduleBtnText: { color: theme.text, fontWeight: '600' },
    confirmRescheduleBtn: {
      flex: 2,
      padding: 14,
      borderRadius: 12,
      backgroundColor: theme.primary,
      alignItems: 'center',
    },
    confirmRescheduleBtnText: { color: '#fff', fontWeight: 'bold' },
  });