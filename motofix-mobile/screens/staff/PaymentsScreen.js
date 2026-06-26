import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { notifyRole, notifyUser } from '../../lib/notifications';
import { useTheme } from '../../lib/ThemeContext';

function peso(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function generateReceiptNumber() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(100000 + Math.random() * 900000);

  return `RCPT-${y}${m}${d}-${random}`;
}

function getBookingTotal(booking) {
  const totalAmount = Number(booking?.total_amount || 0);
  const base = Number(booking?.services?.base_price || 0);
  const labor = Number(booking?.services?.labor_cost || 0);
  const computed = base + labor;

  return totalAmount || computed || 0;
}

export default function PaymentsScreen() {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [staffId, setStaffId] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookingPayments, setBookingPayments] = useState({});
  const [orderPayments, setOrderPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [confirming, setConfirming] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [receipt, setReceipt] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data } = await supabase.auth.getUser();
    setStaffId(data?.user?.id || null);
    await fetchPending();
  }

  async function fetchPending() {
    const [b, o] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          `
          *,
          services (
            name,
            base_price,
            labor_cost
          ),
          profiles!bookings_customer_id_fkey (
            id,
            first_name,
            last_name
          )
        `
        )
        .not('status', 'in', '("completed","cancelled","rejected","no_show")')
        .order('created_at', { ascending: false }),

      supabase
        .from('orders')
        .select(
          `
          *,
          profiles!orders_customer_id_fkey (
            id,
            first_name,
            last_name
          )
        `
        )
        .not('status', 'in', '("completed","cancelled","rejected")')
        .order('created_at', { ascending: false }),
    ]);

    const bookingsData = b.data || [];
    const ordersData = o.data || [];

    let groupedBookingPayments = {};
    if (bookingsData.length) {
      const allBP = await fetchPaymentsFor({
        bookingIds: bookingsData.map((booking) => booking.id),
      });

      allBP.forEach((payment) => {
        if (!groupedBookingPayments[payment.booking_id]) {
          groupedBookingPayments[payment.booking_id] = [];
        }

        groupedBookingPayments[payment.booking_id].push(payment);
      });
    }

    let groupedOrderPayments = {};
    if (ordersData.length) {
      const allOP = await fetchPaymentsFor({
        orderIds: ordersData.map((order) => order.id),
      });

      allOP.forEach((payment) => {
        if (!groupedOrderPayments[payment.order_id]) {
          groupedOrderPayments[payment.order_id] = [];
        }

        groupedOrderPayments[payment.order_id].push(payment);
      });
    }

    const bookingsWithBalance = bookingsData.filter((booking) => {
      const total = getBookingTotal(booking);
      const { totalPaid } = summarizePayments(groupedBookingPayments[booking.id] || []);
      return total - totalPaid > 0;
    });

    const ordersWithBalance = ordersData.filter((order) => {
      const total = Number(order.total_amount || 0);
      const { totalPaid } = summarizePayments(groupedOrderPayments[order.id] || []);
      return total - totalPaid > 0;
    });

    setBookingPayments(groupedBookingPayments);
    setOrderPayments(groupedOrderPayments);
    setBookings(bookingsWithBalance);
    setOrders(ordersWithBalance);
    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchPending();
  }

  function openConfirm(type, record, due) {
    setConfirming({ type, record, due });
    setAmount(due.toFixed(2));
    setMethod('cash');
  }

  async function tryCreateInvoice({ type, record, total, paidAmount, receiptNumber, isFullPayment }) {
    try {
      const payload = {
        total_amount: total,
        amount_paid: paidAmount,
        status: isFullPayment ? 'paid' : 'partial',
        receipt_number: receiptNumber,
        created_by: staffId,
      };

      if (type === 'booking') {
        payload.booking_id = record.id;
        payload.customer_id = record.customer_id;
      } else {
        payload.order_id = record.id;
        payload.customer_id = record.customer_id;
      }

      await supabase.from('invoices').insert(payload);
    } catch (error) {
      console.log('Invoice insert skipped:', error.message);
    }
  }

  async function confirmPayment() {
    if (!confirming || saving) return;

    const { type, record, due } = confirming;
    const paidAmount = parseFloat(amount);

    if (!paidAmount || paidAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount.');
      return;
    }

    if (paidAmount > due) {
      Alert.alert('Invalid Amount', `Amount cannot exceed the due amount of ${peso(due)}.`);
      return;
    }

    setSaving(true);

    const receiptNumber = generateReceiptNumber();
    const isFullPayment = paidAmount >= due;
    const total =
      type === 'booking'
        ? getBookingTotal(record)
        : Number(record.total_amount || 0);

    try {
      if (type === 'booking') {
        const { error: paymentError } = await supabase.from('payments').insert({
          booking_id: record.id,
          amount: paidAmount,
          payment_type: isFullPayment ? 'full' : 'balance',
          method,
          payment_method: method,
          receipt_number: receiptNumber,
          processed_by: staffId,
        });

        if (paymentError) throw paymentError;

        if (isFullPayment) {
          const { error: bookingError } = await supabase
            .from('bookings')
            .update({ status: 'completed' })
            .eq('id', record.id);

          if (bookingError) throw bookingError;
        }
      } else {
        const { error: paymentError } = await supabase.from('payments').insert({
          order_id: record.id,
          amount: paidAmount,
          payment_type: isFullPayment ? 'full' : 'balance',
          method,
          payment_method: method,
          receipt_number: receiptNumber,
          processed_by: staffId,
        });

        if (paymentError) throw paymentError;

        if (isFullPayment) {
          const { error: orderError } = await supabase
            .from('orders')
            .update({
              payment_received: true,
              payment_method: method,
              payment_received_at: new Date().toISOString(),
              payment_received_by: staffId,
              payment_status: 'paid',
              receipt_number: receiptNumber,
              status: 'completed',
            })
            .eq('id', record.id);

          if (orderError) throw orderError;
        }
      }

      await tryCreateInvoice({
        type,
        record,
        total,
        paidAmount,
        receiptNumber,
        isFullPayment,
      });

      await supabase.from('audit_logs').insert({
        action: 'CONFIRM_PAYMENT',
        entity: type === 'booking' ? 'bookings' : 'orders',
        entity_id: record.id,
        performed_by: staffId,
        details: {
          method,
          amount: paidAmount,
          receipt_number: receiptNumber,
          payment_type: isFullPayment ? 'full' : 'partial',
        },
      });

      if (record.customer_id) {
        await notifyUser({
          userId: record.customer_id,
          title: 'Payment Recorded',
          message: `Your ${type === 'booking' ? 'booking' : 'order'} payment of ${peso(
            paidAmount
          )} has been recorded.`,
          type: 'payment',
          relatedTable: type === 'booking' ? 'bookings' : 'orders',
          relatedId: record.id,
        });
      }

      await notifyRole({
        role: 'admin',
        title: 'Payment Recorded',
        message: `Staff recorded a ${type} payment of ${peso(paidAmount)}.`,
        type: 'payment',
        relatedTable: type === 'booking' ? 'bookings' : 'orders',
        relatedId: record.id,
      });

      setReceipt({
        customerName: record.profiles
          ? `${record.profiles.first_name} ${record.profiles.last_name}`
          : 'Walk-in Customer',
        type,
        label:
          type === 'booking'
            ? record.services?.name || 'Service'
            : 'Parts order',
        total,
        amountPaid: paidAmount,
        isFullPayment,
        method,
        referenceId: record.id.slice(0, 8).toUpperCase(),
        receiptNumber,
      });

      setConfirming(null);
      await fetchPending();
    } catch (error) {
      Alert.alert('Payment Failed', error.message || 'Unable to record payment.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight}
          />
        }
      >
        <Text style={s.title}>Pending Payments</Text>
        <Text style={s.subtitle}>
          Confirm down payments and balances for bookings and parts orders.
        </Text>

        <Text style={s.sectionTitle}>Bookings Awaiting Payment ({bookings.length})</Text>

        {bookings.length === 0 ? (
          <Text style={s.emptyText}>None pending.</Text>
        ) : (
          bookings.map((booking) => {
            const total = getBookingTotal(booking);
            const { totalPaid } = summarizePayments(bookingPayments[booking.id] || []);
            const due = Math.max(total - totalPaid, 0);

            return (
              <View key={booking.id} style={s.card}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName}>
                    {booking.profiles?.first_name} {booking.profiles?.last_name}
                  </Text>
                  <Text style={s.cardSub}>
                    {booking.services?.name || 'Service'} ·{' '}
                    <Text style={s.dueText}>{peso(due)} due</Text>
                  </Text>
                  {totalPaid > 0 && (
                    <Text style={s.paidText}>{peso(totalPaid)} already paid</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={s.confirmBtn}
                  onPress={() => openConfirm('booking', booking, due)}
                >
                  <Text style={s.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <Text style={s.sectionTitle}>Orders Awaiting Payment ({orders.length})</Text>

        {orders.length === 0 ? (
          <Text style={s.emptyText}>None pending.</Text>
        ) : (
          orders.map((order) => {
            const total = Number(order.total_amount || 0);
            const { totalPaid } = summarizePayments(orderPayments[order.id] || []);
            const due = Math.max(total - totalPaid, 0);

            return (
              <View key={order.id} style={s.card}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName}>
                    {order.profiles?.first_name} {order.profiles?.last_name}
                  </Text>
                  <Text style={s.cardSub}>
                    Parts order · <Text style={s.dueText}>{peso(due)} due</Text>
                  </Text>
                  {totalPaid > 0 && (
                    <Text style={s.paidText}>{peso(totalPaid)} already paid</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={s.confirmBtn}
                  onPress={() => openConfirm('order', order, due)}
                >
                  <Text style={s.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal
        visible={!!confirming}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirming(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setConfirming(null)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
              <Text style={s.modalTitle}>Confirm Payment</Text>
              <Text style={s.modalSub}>{peso(confirming?.due)} is currently due.</Text>

              <Text style={s.fieldLabel}>Amount Received (₱)</Text>
              <TextInput
                style={s.input}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={s.fieldLabel}>Payment Method</Text>
              <View style={s.methodRow}>
                {['cash', 'gcash', 'card'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.methodChip, method === m && s.methodChipActive]}
                    onPress={() => setMethod(m)}
                  >
                    <Text
                      style={[
                        s.methodChipText,
                        method === m && s.methodChipTextActive,
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.confirmModalBtn, saving && { opacity: 0.7 }]}
                onPress={confirmPayment}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.confirmModalBtnText}>Confirm & Record</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.cancelModalBtn}
                onPress={() => setConfirming(null)}
                disabled={saving}
              >
                <Text style={s.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!receipt}
        transparent
        animationType="fade"
        onRequestClose={() => setReceipt(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setReceipt(null)}
        >
          <View style={s.receiptSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.receiptTitle}>✅ Payment Recorded</Text>
            <Text style={s.modalSub}>{receipt?.customerName}</Text>

            <View style={s.divider} />

            <Text style={s.cardSub}>{receipt?.label}</Text>
            <Text style={s.cardSub}>Receipt: {receipt?.receiptNumber}</Text>
            <Text style={s.cardSub}>Total: {peso(receipt?.total)}</Text>

            <Text style={[s.cardSub, { color: theme.success, fontWeight: 'bold' }]}>
              Paid: {peso(receipt?.amountPaid)} ({receipt?.method})
            </Text>

            {!receipt?.isFullPayment && (
              <Text style={[s.cardSub, { color: theme.warning }]}>
                Partial payment — balance remains
              </Text>
            )}

            {receipt?.isFullPayment && (
              <Text style={[s.cardSub, { color: theme.success }]}>
                Fully paid ✓
              </Text>
            )}

            <Text style={[s.cardSub, { color: theme.textMuted, marginTop: 6 }]}>
              Ref #{receipt?.referenceId}
            </Text>

            <TouchableOpacity
              style={s.confirmModalBtn}
              onPress={() => setReceipt(null)}
            >
              <Text style={s.confirmModalBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    content: { padding: 16 },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.text },
    subtitle: {
      fontSize: 13,
      color: theme.textSub || theme.textMuted,
      marginTop: 2,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: theme.text,
      marginTop: 16,
      marginBottom: 10,
    },
    emptyText: { fontSize: 13, color: theme.textMuted },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardName: { fontSize: 14, fontWeight: '600', color: theme.text },
    cardSub: {
      fontSize: 12,
      color: theme.textSub || theme.textMuted,
      marginTop: 2,
    },
    dueText: { color: theme.warning, fontWeight: 'bold' },
    paidText: { fontSize: 11, color: theme.success, marginTop: 2 },
    confirmBtn: {
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    receiptSheet: {
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 20,
      margin: 24,
      alignSelf: 'center',
      width: '85%',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 4,
    },
    receiptTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: theme.success,
      marginBottom: 4,
      textAlign: 'center',
    },
    modalSub: {
      fontSize: 13,
      color: theme.textSub || theme.textMuted,
      marginBottom: 16,
      textAlign: 'center',
    },
    divider: { height: 1, backgroundColor: theme.border, marginVertical: 10 },
    fieldLabel: { fontSize: 12, color: theme.textMuted, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.bg2,
      marginBottom: 16,
    },
    methodRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    methodChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    methodChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    methodChipText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      textTransform: 'capitalize',
    },
    methodChipTextActive: { color: '#fff', fontWeight: 'bold' },
    confirmModalBtn: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
      marginBottom: 8,
    },
    confirmModalBtnText: { color: '#fff', fontWeight: 'bold' },
    cancelModalBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    cancelModalBtnText: { color: theme.text, fontWeight: '600' },
  });