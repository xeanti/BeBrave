import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';

const YELLOW = '#EAB308';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value) {
  if (!value) return '—';

  const clean = String(value).slice(0, 5);
  const [hourText, minuteText = '00'] = clean.split(':');
  const hour = Number(hourText);

  if (Number.isNaN(hour)) return value;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${minuteText} ${ampm}`;
}

function shortId(value) {
  if (!value) return '—';

  return String(value).slice(0, 8).toUpperCase();
}

function formatPaymentStatus(value) {
  const status = String(value || 'unpaid').toLowerCase();

  if (status === 'paid') return 'Paid';
  if (status === 'checkout_created') return 'Waiting for QR Ph Payment';
  if (status === 'pending_payment') return 'Pending Payment';
  if (status === 'failed') return 'Failed';
  if (status === 'expired') return 'Expired';
  if (status === 'cancelled') return 'Cancelled';

  return 'Unpaid';
}

export default function BookingConfirmationScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const s = styles(theme);
  const params = route?.params || {};

  const bookingId = params.bookingId || params.id;
  const serviceName = params.serviceName || params.service?.name || 'Service Booking';
  const motorcycle = params.motorcycle || params.motorcycleName || 'Motorcycle';
  const bookingDate = params.bookingDate || params.date;
  const bookingTime = params.bookingTime || params.time;
  const mechanicName = params.mechanicName || 'No preference / auto-assigned';
  const totalAmount = params.totalAmount || params.total || 0;
  const status = params.status || 'pending';

  const initialPaymentStatus = params.paymentStatus || 'unpaid';
  const reservationFee =
    Number(params.reservationFee) > 0
      ? Number(params.reservationFee)
      : Number(totalAmount || 0) * 0.2;
  const initialPaymentReference = params.paymentReference || null;
  const initialPaidAt = params.paidAt || null;
  const paymentMethod = params.paymentMethod || 'PayMongo QR Ph / GCash';
  const checkoutUrl = params.checkoutUrl || null;

  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [paymentReference, setPaymentReference] = useState(initialPaymentReference);
  const [paidAt, setPaidAt] = useState(initialPaidAt);
  const paymentAlertShown = useRef(false);

  const isPaymentPaid = String(paymentStatus).toLowerCase() === 'paid';
  const canContinuePayment = checkoutUrl && !isPaymentPaid;

  useEffect(() => {
    if (!bookingId) return;

    let mounted = true;

    async function fetchLatestPaymentStatus() {
      const { data, error } = await supabase
        .from('bookings')
        .select('payment_status, payment_reference, paid_at')
        .eq('id', bookingId)
        .maybeSingle();

      if (error || !mounted || !data) return;

      applyPaymentStatusUpdate(data, false);
    }

    function applyPaymentStatusUpdate(updatedBooking, showAlert = true) {
      const nextStatus = updatedBooking?.payment_status || 'unpaid';

      setPaymentStatus(nextStatus);
      setPaymentReference(updatedBooking?.payment_reference || null);
      setPaidAt(updatedBooking?.paid_at || null);

      if (
        showAlert &&
        String(nextStatus).toLowerCase() === 'paid' &&
        !paymentAlertShown.current
      ) {
        paymentAlertShown.current = true;

        Alert.alert(
          'Payment Received',
          'Your QR Ph / GCash reservation payment has been received. Please wait for booking confirmation.'
        );
      }
    }

    fetchLatestPaymentStatus();

    const channel = supabase
      .channel(`booking-payment-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        (payload) => {
          applyPaymentStatusUpdate(payload.new, true);
        }
      )
      .subscribe();

    const interval = setInterval(fetchLatestPaymentStatus, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  async function handleContinuePayment() {
    if (!checkoutUrl) {
      Alert.alert('Payment Link Missing', 'No PayMongo QR payment link was found for this booking.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(checkoutUrl);

      if (!supported) {
        Alert.alert('Cannot Open Payment Link', 'Your device cannot open the PayMongo payment page.');
        return;
      }

      await Linking.openURL(checkoutUrl);
    } catch (err) {
      console.log('OPEN CHECKOUT ERROR:', err);
      Alert.alert('Payment Error', 'Unable to open the PayMongo QR payment page.');
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.heroCard}>
        <View style={s.successIcon}>
          <Ionicons name="checkmark" size={42} color="#111827" />
        </View>

        <Text style={s.title}>Booking Submitted!</Text>
        <Text style={s.subtitle}>
          {isPaymentPaid
            ? 'Your QR Ph / GCash reservation payment has been received. Please wait for MotoFix to confirm your booking.'
            : 'Your booking request was created. Please complete the 20% reservation payment using PayMongo QR Ph / GCash so MotoFix can proceed with confirmation.'}
        </Text>

        <View style={s.statusPill}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>{String(status).toUpperCase()}</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Booking Summary</Text>

        <InfoRow
          theme={theme}
          icon="receipt-outline"
          label="Booking ID"
          value={`#${shortId(bookingId)}`}
        />

        <InfoRow
          theme={theme}
          icon="construct-outline"
          label="Service"
          value={serviceName}
        />

        <InfoRow
          theme={theme}
          icon="bicycle-outline"
          label="Motorcycle"
          value={motorcycle}
        />

        <InfoRow
          theme={theme}
          icon="calendar-outline"
          label="Schedule"
          value={`${formatDate(bookingDate)} · ${formatTime(bookingTime)}`}
        />

        <InfoRow
          theme={theme}
          icon="person-outline"
          label="Mechanic"
          value={mechanicName}
        />

        <InfoRow
          theme={theme}
          icon="cash-outline"
          label="Estimated Total"
          value={formatPeso(totalAmount)}
          strong
        />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Reservation Payment</Text>

        {isPaymentPaid ? (
          <View style={s.paymentSuccessBox}>
            <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
            <View style={{ flex: 1 }}>
              <Text style={s.paymentSuccessTitle}>Payment Received</Text>
              <Text style={s.paymentSuccessText}>
                Your QR Ph / GCash reservation payment has been received.
              </Text>
            </View>
          </View>
        ) : (
          <View style={s.paymentWaitingBox}>
            <Ionicons name="time-outline" size={22} color={theme.warning || YELLOW} />
            <View style={{ flex: 1 }}>
              <Text style={s.paymentWaitingTitle}>Waiting for QR Ph / GCash Payment</Text>
              <Text style={s.paymentWaitingText}>
                Complete the PayMongo QR Ph payment page. This screen will update automatically after PayMongo confirms payment.
              </Text>
            </View>
          </View>
        )}

        <InfoRow
          theme={theme}
          icon="qr-code-outline"
          label="Payment Method"
          value={paymentMethod}
        />

        <InfoRow
          theme={theme}
          icon="wallet-outline"
          label="20% Reservation Fee"
          value={formatPeso(reservationFee)}
          strong
        />

        <InfoRow
          theme={theme}
          icon="card-outline"
          label="Payment Status"
          value={formatPaymentStatus(paymentStatus)}
        />

        {paymentReference ? (
          <InfoRow
            theme={theme}
            icon="pricetag-outline"
            label="Payment Reference"
            value={paymentReference}
          />
        ) : null}

        {paidAt ? (
          <InfoRow
            theme={theme}
            icon="time-outline"
            label="Paid At"
            value={formatDate(paidAt)}
          />
        ) : null}

        {canContinuePayment ? (
          <TouchableOpacity style={s.payButton} onPress={handleContinuePayment}>
            <Ionicons name="qr-code" size={18} color="#111827" />
            <Text style={s.payButtonText}>Continue QR Ph / GCash Payment</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.noticeCard}>
        <Ionicons name="information-circle-outline" size={20} color={theme.primaryLight || YELLOW} />
        <Text style={s.noticeText}>
          {isPaymentPaid
            ? 'Payment received. MotoFix staff can now verify and confirm your booking schedule.'
            : 'Once PayMongo confirms your QR Ph / GCash payment, your booking payment status will automatically update to Paid. You can track the booking status from your appointments page.'}
        </Text>
      </View>

      <TouchableOpacity
        style={s.primaryButton}
        onPress={() =>
          navigation.replace('Main', {
            screen: 'Appointments',
          })
        }
      >
        <Ionicons name="calendar" size={18} color="#fff" />
        <Text style={s.primaryButtonText}>View Appointments</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.secondaryButton}
        onPress={() => navigation.replace('Booking')}
      >
        <Ionicons name="add-circle-outline" size={18} color={theme.text} />
        <Text style={s.secondaryButtonText}>Book Another Service</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.linkButton}
        onPress={() =>
          navigation.replace('Main', {
            screen: 'Home',
          })
        }
      >
        <Text style={s.linkButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ theme, icon, label, value, strong = false }) {
  const s = styles(theme);

  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={18} color={theme.primaryLight || YELLOW} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={[s.infoValue, strong && s.infoValueStrong]}>{value || '—'}</Text>
      </View>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    heroCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 22,
      padding: 24,
      alignItems: 'center',
      marginBottom: 14,
    },
    successIcon: {
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      shadowColor: YELLOW,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    title: {
      color: theme.text,
      fontSize: 25,
      fontWeight: '900',
      textAlign: 'center',
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginTop: 16,
      backgroundColor: (theme.warning || YELLOW) + '18',
      borderColor: (theme.warning || YELLOW) + '55',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: theme.warning || YELLOW,
    },
    statusText: {
      color: theme.warning || YELLOW,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 10,
    },
    infoRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    infoIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: (theme.primaryLight || YELLOW) + '16',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    infoValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      marginTop: 3,
      lineHeight: 19,
    },
    infoValueStrong: {
      color: theme.primaryLight || YELLOW,
      fontSize: 16,
      fontWeight: '900',
    },
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },
    noticeText: {
      flex: 1,
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },
    paymentSuccessBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: '#16A34A18',
      borderWidth: 1,
      borderColor: '#16A34A55',
      borderRadius: 16,
      padding: 13,
      marginBottom: 12,
    },
    paymentSuccessTitle: {
      color: '#16A34A',
      fontSize: 14,
      fontWeight: '900',
      marginBottom: 2,
    },
    paymentSuccessText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '700',
    },
    paymentWaitingBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: (theme.warning || YELLOW) + '12',
      borderWidth: 1,
      borderColor: (theme.warning || YELLOW) + '44',
      borderRadius: 16,
      padding: 13,
      marginBottom: 12,
    },
    paymentWaitingTitle: {
      color: theme.warning || YELLOW,
      fontSize: 14,
      fontWeight: '900',
      marginBottom: 2,
    },
    paymentWaitingText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '700',
    },
    payButton: {
      backgroundColor: YELLOW,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    payButtonText: {
      color: '#111827',
      fontSize: 14,
      fontWeight: '900',
    },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 15,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '900',
    },
    secondaryButton: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 15,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    secondaryButtonText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    linkButtonText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
  });
