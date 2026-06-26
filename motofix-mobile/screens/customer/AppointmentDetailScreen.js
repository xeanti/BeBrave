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

function getPaymentAmount(payment) {
  return Number(
    payment?.amount ??
      payment?.amount_paid ??
      payment?.paid_amount ??
      payment?.total_paid ??
      0
  );
}

function getPaymentStatus(total, paid) {
  if (paid <= 0) return 'Unpaid';
  if (paid >= total) return 'Fully Paid';
  return 'Partially Paid';
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

  const s = styles(theme);

  const bookingId = booking?.id || routeBookingId;

  const total = useMemo(
    () => Number(booking?.total_amount || booking?.services?.base_price || 0),
    [booking]
  );

  const paid = useMemo(
    () => payments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0),
    [payments]
  );

  const balance = Math.max(total - paid, 0);
  const paymentProgress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  const paymentStatus = getPaymentStatus(total, paid);

  const currentStepIndex = useMemo(() => {
    const status = normalizeStatus(booking?.status);
    return SERVICE_STEPS.findIndex((step) => step.key === status);
  }, [booking?.status]);

  const canModify = ['pending', 'confirmed'].includes(normalizeStatus(booking?.status));

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
            estimated_duration_minutes
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
        invoicesResult,
      ] = await Promise.all([
        bookingQuery,
        progressQuery,
        paymentsQuery,
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

      if (!paymentsResult.error) {
        setPayments(paymentsResult.data || []);
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
          <Text style={s.serviceName}>{booking.services?.name || 'Service'}</Text>
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
        <DetailRow label="📅 Date" value={booking.booking_date || '—'} theme={theme} />
        <DetailRow
          label="🕐 Time"
          value={formatTimeSlot(booking.booking_time)}
          theme={theme}
        />
        <DetailRow
          label="💰 Total"
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
        icon="card"
        title="Payment Progress"
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
          <MiniStat label="Paid" value={peso(paid)} theme={theme} />
          <MiniStat label="Balance" value={peso(balance)} theme={theme} />
        </View>

        {payments.length > 0 ? (
          <View style={s.paymentList}>
            {payments.slice(0, 3).map((payment) => (
              <View key={payment.id} style={s.paymentRow}>
                <View>
                  <Text style={s.paymentRowTitle}>
                    {humanize(payment.payment_method || payment.method || 'Payment')}
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
              confirms your payment.
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.border,
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 13, color: theme.textMuted, flex: 1 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: highlight ? theme.primaryLight || YELLOW : theme.text,
          fontWeight: highlight ? 'bold' : '500',
          flex: 1.2,
          textAlign: 'right',
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
        flex: 1,
        backgroundColor: theme.bg2 || theme.bg,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 10,
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
    serviceName: { fontSize: 20, fontWeight: 'bold', color: theme.text },
    refText: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    badge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    badgeText: { fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' },
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
    },
    balanceText: {
      color: YELLOW,
      fontSize: 13,
      fontWeight: '900',
      textAlign: 'right',
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
      gap: 16,
    },
    paymentRowTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
    },
    paymentRowDate: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '500',
      marginTop: 3,
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