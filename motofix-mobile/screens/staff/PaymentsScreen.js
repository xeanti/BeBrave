import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, Modal, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { useTheme } from '../../lib/ThemeContext';

export default function PaymentsScreen() {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [staffId, setStaffId] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paymentsByBooking, setPaymentsByBooking] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [confirming, setConfirming] = useState(null); // { type, record, due }
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setStaffId(data?.user?.id || null));
    fetchPending();
  }, []);

  async function fetchPending() {
    const [b, o] = await Promise.all([
      supabase.from('bookings')
        .select('*, services(name, base_price, labor_cost), profiles!customer_id(first_name, last_name)')
        .neq('status', 'completed').neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('*, profiles!customer_id(first_name, last_name)')
        .eq('payment_received', false)
        .order('created_at', { ascending: false }),
    ]);

    const bookingsData = b.data || [];
    let grouped = {};
    if (bookingsData.length) {
      const allPayments = await fetchPaymentsFor({ bookingIds: bookingsData.map((bk) => bk.id) });
      allPayments.forEach((p) => {
        if (!grouped[p.booking_id]) grouped[p.booking_id] = [];
        grouped[p.booking_id].push(p);
      });
    }
    setPaymentsByBooking(grouped);

    const withBalance = bookingsData.filter((bk) => {
      const total = (bk.services?.base_price || 0) + (bk.services?.labor_cost || 0) || bk.total_amount || 0;
      const { totalPaid } = summarizePayments(grouped[bk.id] || []);
      return total - totalPaid > 0;
    });

    setBookings(withBalance);
    setOrders(o.data || []);
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

  async function confirmPayment() {
    if (!confirming) return;
    const { type, record, due } = confirming;
    const paidAmount = parseFloat(amount);
    if (!paidAmount || paidAmount <= 0) return;

    if (type === 'booking') {
      await supabase.from('payments').insert({
        booking_id: record.id,
        amount: paidAmount,
        payment_type: paidAmount >= due ? 'full' : 'balance',
        method,
        processed_by: staffId,
      });
    } else {
      await supabase.from('payments').insert({
        order_id: record.id,
        amount: paidAmount,
        payment_type: 'full',
        method,
        processed_by: staffId,
      });
      await supabase.from('orders').update({
        payment_received: true,
        payment_method: method,
        payment_received_at: new Date().toISOString(),
        payment_received_by: staffId,
        status: 'completed',
      }).eq('id', record.id);
    }

    await supabase.from('audit_logs').insert({
      action: 'CONFIRM_PAYMENT',
      entity: type === 'booking' ? 'bookings' : 'orders',
      entity_id: record.id,
      performed_by: staffId,
      details: { method, amount: paidAmount },
    });

    setReceipt({
      customerName: record.profiles ? `${record.profiles.first_name} ${record.profiles.last_name}` : 'Walk-in Customer',
      type,
      label: type === 'booking' ? (record.services?.name || 'Service') : 'Parts order',
      total: type === 'booking'
        ? (record.services?.base_price || 0) + (record.services?.labor_cost || 0)
        : record.total_amount,
      amountPaid: paidAmount,
      method,
      referenceId: record.id.slice(0, 8).toUpperCase(),
    });

    setConfirming(null);
    fetchPending();
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />}
      >
        <Text style={s.title}>Pending Payments</Text>
        <Text style={s.subtitle}>Confirm down payments and balances for walk-ins and online orders.</Text>

        <Text style={s.sectionTitle}>Bookings Awaiting Payment ({bookings.length})</Text>
        {bookings.length === 0 ? (
          <Text style={s.emptyText}>None pending.</Text>
        ) : (
          bookings.map((b) => {
            const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0) || b.total_amount || 0;
            const { totalPaid } = summarizePayments(paymentsByBooking[b.id] || []);
            const due = Math.max(total - totalPaid, 0);
            return (
              <View key={b.id} style={s.card}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName}>{b.profiles?.first_name} {b.profiles?.last_name}</Text>
                  <Text style={s.cardSub}>{b.services?.name} · ₱{due.toFixed(2)} due</Text>
                </View>
                <TouchableOpacity style={s.confirmBtn} onPress={() => openConfirm('booking', b, due)}>
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
          orders.map((o) => (
            <View key={o.id} style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardName}>{o.profiles?.first_name} {o.profiles?.last_name}</Text>
                <Text style={s.cardSub}>₱{Number(o.total_amount).toFixed(2)} due</Text>
              </View>
              <TouchableOpacity style={s.confirmBtn} onPress={() => openConfirm('order', o, o.total_amount)}>
                <Text style={s.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Confirm payment modal */}
      <Modal visible={!!confirming} transparent animationType="slide" onRequestClose={() => setConfirming(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setConfirming(null)}>
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTitle}>Confirm Payment</Text>
            <Text style={s.modalSub}>₱{confirming?.due.toFixed(2)} is currently due.</Text>

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
                  <Text style={[s.methodChipText, method === m && s.methodChipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={s.confirmModalBtn} onPress={confirmPayment}>
              <Text style={s.confirmModalBtnText}>Confirm & Record</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelModalBtn} onPress={() => setConfirming(null)}>
              <Text style={s.cancelModalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Receipt modal */}
      <Modal visible={!!receipt} transparent animationType="fade" onRequestClose={() => setReceipt(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setReceipt(null)}>
          <View style={s.receiptSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.receiptTitle}>✅ Payment Recorded</Text>
            <Text style={s.modalSub}>{receipt?.customerName}</Text>
            <View style={s.divider} />
            <Text style={s.cardSub}>{receipt?.label}</Text>
            <Text style={s.cardSub}>Total: ₱{Number(receipt?.total || 0).toFixed(2)}</Text>
            <Text style={[s.cardSub, { color: theme.success, fontWeight: 'bold' }]}>
              Paid: ₱{Number(receipt?.amountPaid || 0).toFixed(2)} ({receipt?.method})
            </Text>
            <Text style={[s.cardSub, { color: theme.textMuted, marginTop: 6 }]}>
              Ref #{receipt?.referenceId}
            </Text>
            <TouchableOpacity style={s.confirmModalBtn} onPress={() => setReceipt(null)}>
              <Text style={s.confirmModalBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.text },
  subtitle: { fontSize: 13, color: theme.textSub, marginTop: 2, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: theme.text, marginTop: 16, marginBottom: 10 },
  emptyText: { fontSize: 13, color: theme.textMuted },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  cardName: { fontSize: 14, fontWeight: '600', color: theme.text },
  cardSub: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  confirmBtn: { backgroundColor: theme.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  receiptSheet: { backgroundColor: theme.card, borderRadius: 16, padding: 20, margin: 24, alignSelf: 'center', width: '85%' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.text, marginBottom: 4 },
  receiptTitle: { fontSize: 17, fontWeight: 'bold', color: theme.success, marginBottom: 4, textAlign: 'center' },
  modalSub: { fontSize: 13, color: theme.textSub, marginBottom: 16, textAlign: 'center' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 10 },
  fieldLabel: { fontSize: 12, color: theme.textMuted, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2, marginBottom: 16 },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  methodChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  methodChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  methodChipText: { color: theme.textSub, fontSize: 13, textTransform: 'capitalize' },
  methodChipTextActive: { color: '#fff', fontWeight: 'bold' },
  confirmModalBtn: { backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 8 },
  confirmModalBtnText: { color: '#fff', fontWeight: 'bold' },
  cancelModalBtn: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelModalBtnText: { color: theme.text, fontWeight: '600' },
});