import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTimeSlot(time) {
  if (!time) return '—';

  const [h, m = '00'] = String(time).slice(0, 5).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function formatDate(dateString) {
  if (!dateString) return '—';

  const [year, month, day] = String(dateString).split('-').map(Number);

  if (!year || !month || !day) return dateString;

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getBookingTotal(booking) {
  const savedTotal = Number(booking?.total_amount) || 0;

  if (savedTotal > 0) return savedTotal;

  const basePrice = Number(booking?.services?.base_price) || 0;
  const laborCost = Number(booking?.services?.labor_cost) || 0;

  return basePrice + laborCost;
}

function getReservationFee(booking) {
  const savedFee = Number(booking?.reservation_fee) || 0;

  if (savedFee > 0) return savedFee;

  return Number((getBookingTotal(booking) * 0.2).toFixed(2));
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
      },
    ];
  }

  return [];
}

function getBookingServiceName(booking) {
  if (booking?.services_summary) return booking.services_summary;

  const selected = getBookingServices(booking);
  if (selected.length > 0) {
    return selected
      .map((item) => item.service_name || item.name || item.services?.name)
      .filter(Boolean)
      .join(', ');
  }

  return booking?.services?.name || 'Service';
}

function getPaymentMethodLabel(booking, latestPayment) {
  const raw = String(
    booking?.payment_method || latestPayment?.payment_method || latestPayment?.provider || ''
  ).toLowerCase();

  if (raw === 'cash_at_shop' || raw === 'cash') return 'Cash at Shop';
  if (raw === 'gcash_manual' || raw === 'manual_gcash' || raw === 'personal_gcash') {
    return 'Personal GCash / Manual';
  }
  if (raw.includes('paymongo') || raw.includes('qr')) return 'PayMongo QR Ph / GCash';

  return 'Manual / Counter';
}

function getLatestBookingPayment(booking) {
  const list = Array.isArray(booking?.booking_payments)
    ? booking.booking_payments
    : [];

  if (!list.length) return null;

  return [...list].sort((a, b) => {
    const aTime = new Date(a.paid_at || a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.paid_at || b.updated_at || b.created_at || 0).getTime();

    return bTime - aTime;
  })[0];
}

function getPaymentInfo(booking) {
  const total = getBookingTotal(booking);
  const reservationFee = getReservationFee(booking);
  const latestPayment = getLatestBookingPayment(booking);

  const bookingPaymentStatus = String(booking?.payment_status || '').toLowerCase();
  const latestPaymentStatus = String(latestPayment?.status || '').toLowerCase();

  const isPaid =
    bookingPaymentStatus === 'paid' ||
    latestPaymentStatus === 'paid' ||
    latestPaymentStatus === 'succeeded';

  const isCheckoutCreated =
    bookingPaymentStatus === 'checkout_created' ||
    Boolean(booking?.paymongo_checkout_session_id) ||
    Boolean(latestPayment?.provider_checkout_session_id);

  const isPendingVerification =
    bookingPaymentStatus === 'pending_verification' ||
    latestPaymentStatus === 'pending_verification';

  const paidAmount = isPaid
    ? Math.max(Number(latestPayment?.amount) || 0, Number(booking?.down_payment) || 0, reservationFee)
    : 0;

  const balance = Math.max(total - paidAmount, 0);

  let label = 'Unpaid';
  let note = 'Reservation payment has not been received yet.';
  let tone = 'danger';

  if (isPaid) {
    label = 'Reservation Paid';
    note = 'Payment received. Your booking is ready for shop confirmation/service update.';
    tone = 'success';
  } else if (isCheckoutCreated) {
    label = 'Waiting for Payment';
    note = 'PayMongo QR Ph / GCash checkout was created.';
    tone = 'warning';
  } else if (isPendingVerification) {
    label = 'Pending Verification';
    note = 'Staff/admin still needs to verify your manual GCash payment.';
    tone = 'primary';
  } else if (bookingPaymentStatus === 'pending_payment') {
    label = 'Pending Payment';
    note = 'Waiting for reservation payment.';
    tone = 'warning';
  } else if (['failed', 'expired', 'cancelled'].includes(bookingPaymentStatus)) {
    label = humanize(bookingPaymentStatus);
    note = 'Payment was not completed.';
    tone = 'danger';
  }

  return {
    label,
    note,
    tone,
    paidAmount,
    reservationFee,
    balance,
    isPaid,
    method: getPaymentMethodLabel(booking, latestPayment),
    reference:
      booking?.payment_reference ||
      latestPayment?.reference_number ||
      booking?.paymongo_checkout_session_id ||
      latestPayment?.provider_checkout_session_id ||
      '—',
  };
}

export default function AppointmentsScreen({ navigation }) {
  const { theme, isDark } = useTheme();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const s = styles(theme);

  const filters = useMemo(
    () => ['all', 'pending', 'confirmed', 'in_progress', 'ready_for_pickup', 'completed', 'cancelled'],
    []
  );

  useEffect(() => {
    fetchBookings();

    const focusUnsubscribe = navigation.addListener?.('focus', () => {
      fetchBookings(false);
    });

    return () => {
      focusUnsubscribe?.();
    };
  }, [navigation]);

  useEffect(() => {
    fetchBookings(false);
  }, [filter]);

  async function fetchBookings(showLoader = true) {
    if (showLoader) setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      setBookings([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let query = supabase
      .from('bookings')
      .select(
        `
        *,
        services (
          id,
          name,
          base_price,
          labor_cost
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
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (error) {
      console.log('Fetch bookings error:', error.message);
      setBookings([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const bookingRows = data || [];
    const bookingIds = bookingRows.map((booking) => booking.id);
    let groupedPayments = {};

    if (bookingIds.length > 0) {
      const { data: paymentRows, error: paymentError } = await supabase
        .from('booking_payments')
        .select('*')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: false });

      if (paymentError) {
        console.log('Fetch booking_payments error:', paymentError.message);
      } else {
        groupedPayments = (paymentRows || []).reduce((acc, payment) => {
          if (!acc[payment.booking_id]) acc[payment.booking_id] = [];
          acc[payment.booking_id].push(payment);
          return acc;
        }, {});
      }
    }

    setBookings(
      bookingRows.map((booking) => ({
        ...booking,
        booking_payments: groupedPayments[booking.id] || [],
      }))
    );

    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchBookings(false);
  }

  function getStatusColor(status) {
    switch (String(status || 'pending').toLowerCase()) {
      case 'confirmed':
        return theme.success || '#22c55e';
      case 'pending':
        return theme.warning || '#f59e0b';
      case 'in_progress':
        return '#3b82f6';
      case 'ready_for_pickup':
        return theme.primaryLight || theme.primary || YELLOW;
      case 'completed':
        return theme.success || '#22c55e';
      case 'cancelled':
      case 'rejected':
      case 'no_show':
        return theme.danger || '#ef4444';
      default:
        return theme.textMuted || '#9ca3af';
    }
  }

  function getPaymentColor(tone) {
    if (tone === 'success') return theme.success || '#22c55e';
    if (tone === 'warning') return theme.warning || '#f59e0b';
    if (tone === 'primary') return theme.primaryLight || theme.primary || YELLOW;
    return theme.danger || '#ef4444';
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight || YELLOW} />
        <Text style={s.loadingText}>Loading bookings...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.header}>
        <Text style={s.title}>My Bookings</Text>
        <Text style={s.subtitle}>
          Track schedule, reservation payment, and remaining balance.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={s.filterContent}
      >
        {filters.map((item) => (
          <TouchableOpacity
            key={item}
            style={[s.filterChip, filter === item && s.filterChipActive]}
            onPress={() => setFilter(item)}
          >
            <Text style={[s.filterText, filter === item && s.filterTextActive]}>
              {item === 'all' ? 'All' : humanize(item)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight || YELLOW}
          />
        }
      >
        {bookings.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No bookings found</Text>
            <Text style={s.emptyText}>
              {filter === 'all'
                ? "You haven't made any bookings yet."
                : `No ${humanize(filter)} bookings.`}
            </Text>
          </View>
        ) : (
          bookings.map((booking) => {
            const total = getBookingTotal(booking);
            const payment = getPaymentInfo(booking);
            const statusColor = getStatusColor(booking.status);
            const paymentColor = getPaymentColor(payment.tone);

            return (
              <TouchableOpacity
                key={booking.id}
                style={s.card}
                activeOpacity={0.78}
                onPress={() =>
                  navigation.navigate('AppointmentDetail', {
                    booking,
                    bookingId: booking.id,
                  })
                }
              >
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.serviceName} numberOfLines={2}>
                      {getBookingServiceName(booking)}
                    </Text>
                    <Text style={s.refText}>
                      #{String(booking.id || '').slice(0, 8).toUpperCase()}
                    </Text>
                  </View>

                  <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[s.statusBadgeText, { color: statusColor }]}>
                      {humanize(booking.status || 'pending')}
                    </Text>
                  </View>
                </View>

                <View style={s.infoGrid}>
                  <MiniInfo theme={theme} label="Date" value={formatDate(booking.booking_date)} />
                  <MiniInfo theme={theme} label="Time" value={formatTimeSlot(booking.booking_time)} />
                  <MiniInfo theme={theme} label="Total" value={formatPeso(total)} highlight />
                </View>

                <View style={s.paymentCard}>
                  <View style={s.paymentTop}>
                    <View style={[s.paymentBadge, { backgroundColor: paymentColor + '18' }]}>
                      <Text style={[s.paymentBadgeText, { color: paymentColor }]}>
                        {payment.label}
                      </Text>
                    </View>

                    <Text style={s.paymentMethod}>{payment.method}</Text>
                  </View>

                  <Text style={s.paymentNote}>{payment.note}</Text>

                  <View style={s.paymentStats}>
                    <MiniInfo
                      theme={theme}
                      label="Reservation"
                      value={formatPeso(payment.reservationFee)}
                    />
                    <MiniInfo
                      theme={theme}
                      label="Paid"
                      value={formatPeso(payment.paidAmount)}
                      highlight={payment.paidAmount > 0}
                    />
                    <MiniInfo
                      theme={theme}
                      label="Balance"
                      value={formatPeso(payment.balance)}
                      highlight={payment.balance <= 0}
                    />
                  </View>

                  {payment.reference !== '—' ? (
                    <Text style={s.referenceText} numberOfLines={1}>
                      Ref: {payment.reference}
                    </Text>
                  ) : null}
                </View>

                {booking.notes ? (
                  <View style={s.notesBox}>
                    <Text style={s.notesText}>📝 {booking.notes}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function MiniInfo({ theme, label, value, highlight }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: theme.bg2 || theme.bg,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 13,
        paddingVertical: 10,
        paddingHorizontal: 10,
      }}
    >
      <Text
        style={{
          color: theme.textMuted,
          fontSize: 10,
          fontWeight: '900',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          color: highlight ? theme.primaryLight || YELLOW : theme.text,
          fontSize: 12,
          fontWeight: '900',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    loadingText: {
      color: theme.textSub || theme.textMuted,
      marginTop: 10,
      fontWeight: '700',
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 8,
    },
    title: {
      color: theme.text,
      fontSize: 28,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    filterBar: {
      maxHeight: 58,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    filterContent: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    filterChip: {
      minHeight: 36,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    filterChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    filterText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
    filterTextActive: {
      color: '#fff',
      fontWeight: '900',
    },
    listContent: {
      paddingBottom: 20,
    },
    card: {
      backgroundColor: theme.card,
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
    },
    serviceName: {
      fontSize: 17,
      fontWeight: '900',
      color: theme.text,
    },
    refText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 4,
    },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
      flexShrink: 0,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'capitalize',
    },
    infoGrid: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    paymentCard: {
      backgroundColor: theme.bg2 || theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 12,
      marginTop: 2,
    },
    paymentTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 8,
    },
    paymentBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      flexShrink: 1,
    },
    paymentBadgeText: {
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    paymentMethod: {
      flex: 1,
      textAlign: 'right',
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '900',
    },
    paymentNote: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginBottom: 10,
    },
    paymentStats: {
      flexDirection: 'row',
      gap: 8,
    },
    referenceText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 10,
    },
    notesBox: {
      backgroundColor: theme.bg2 || theme.bg,
      borderRadius: 12,
      padding: 10,
      marginTop: 10,
    },
    notesText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    emptyCard: {
      alignItems: 'center',
      padding: 48,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: theme.textSub || theme.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
