import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, RefreshControl,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { useTheme } from '../../lib/ThemeContext';

const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

const STATUS_COLOR_KEY = {
  pending: 'warning',
  confirmed: 'success',
  preparing: 'primaryLight',
  ready: 'primaryLight',
  completed: 'textMuted',
  cancelled: 'danger',
};

export default function AdminOrdersScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [userId, setUserId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState({}); // orderId -> [payments]
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Status modal
  const [statusModal, setStatusModal] = useState(null); // orderId

  // Payment modal
  const [paymentModal, setPaymentModal] = useState(null); // { order, due }
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('balance');
  const [method, setMethod] = useState('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
    fetchOrders();
  }, []);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select(
        '*, profiles!orders_customer_id_fkey(first_name, last_name, email, phone), order_items(*, parts(name, image_url))'
      )
      .order('created_at', { ascending: false });

    const ordersData = data || [];
    setOrders(ordersData);

    if (ordersData.length) {
      const all = await fetchPaymentsFor({ orderIds: ordersData.map((o) => o.id) });
      const grouped = {};
      all.forEach((p) => {
        if (!grouped[p.order_id]) grouped[p.order_id] = [];
        grouped[p.order_id].push(p);
      });
      setPayments(grouped);
    } else {
      setPayments({});
    }

    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchOrders();
  }

  async function updateStatus(id, status) {
    await supabase.from('orders').update({ status }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_ORDER_STATUS',
      entity: 'orders',
      entity_id: id,
      performed_by: userId,
      details: { new_status: status },
    });
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    setStatusModal(null);
  }

  function openPaymentModal(order, due) {
    setPaymentModal({ order, due });
    setAmount(due.toFixed(2));
    setPaymentType('balance');
    setMethod('cash');
  }

  async function submitPayment() {
    if (!paymentModal) return;
    const { order } = paymentModal;
    const paidAmount = parseFloat(amount);
    if (!paidAmount || paidAmount <= 0) return;

    setSavingPayment(true);
    try {
      await supabase.from('payments').insert({
        order_id: order.id,
        amount: paidAmount,
        payment_type: paymentType,
        method,
        processed_by: userId,
      });

      await supabase.from('audit_logs').insert({
        action: 'RECORD_ORDER_PAYMENT',
        entity: 'orders',
        entity_id: order.id,
        performed_by: userId,
        details: { amount: paidAmount, payment_type: paymentType },
      });

      setPaymentModal(null);
      fetchOrders();
    } finally {
      setSavingPayment(false);
    }
  }

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    confirmed: orders.filter((o) => o.status === 'confirmed').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
  };

  const filtered = orders.filter((o) => {
    const matchesStatus = filter === 'all' || o.status === filter;
    const fullName = `${o.profiles?.first_name || ''} ${o.profiles?.last_name || ''}`.toLowerCase();
    const q = search.trim().toLowerCase();
    const matchesSearch = q === '' || fullName.includes(q) || o.id.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

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

      {/* Filter Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
        {['all', ...STATUSES].map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f} ({counts[f] ?? 0})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by customer name..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={s.searchClear}>
            <Text style={{ color: theme.textMuted }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Orders List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📦</Text>
            <Text style={s.emptyTitle}>No orders found</Text>
          </View>
        ) : (
          filtered.map((o) => {
            const { totalPaid } = summarizePayments(payments[o.id] || []);
            const balance = Math.max((o.total_amount || 0) - totalPaid, 0);
            const isFullyPaid = (o.total_amount || 0) > 0 && balance <= 0;
            const colorKey = STATUS_COLOR_KEY[o.status] || 'textMuted';

            return (
              <View key={o.id} style={s.card}>
                {/* Header */}
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.customerName}>
                      {o.profiles?.first_name} {o.profiles?.last_name}
                    </Text>
                    <Text style={s.customerSub}>
                      {o.profiles?.email}{o.profiles?.phone ? ` · ${o.profiles.phone}` : ''}
                    </Text>
                    <Text style={s.orderMeta}>
                      #{o.id.slice(0, 8).toUpperCase()} · {new Date(o.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: theme[colorKey] + '22' }]}>
                    <Text style={[s.badgeText, { color: theme[colorKey] }]}>{o.status}</Text>
                  </View>
                </View>

                {o.notes ? (
                  <View style={s.notesBox}>
                    <Text style={s.notesText}>"{o.notes}"</Text>
                  </View>
                ) : null}

                {/* Items */}
                <View style={s.itemsBox}>
                  <Text style={s.itemsLabel}>ORDER ITEMS</Text>
                  {o.order_items?.map((item) => (
                    <View key={item.id} style={s.itemRow}>
                      <Text style={s.itemName} numberOfLines={1}>{item.parts?.name}</Text>
                      <Text style={s.itemValue}>
                        ₱{item.unit_price} × {item.quantity} = ₱{item.subtotal}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Money summary */}
                <View style={s.moneyGrid}>
                  <View style={s.moneyCell}>
                    <Text style={s.moneyLabel}>Total</Text>
                    <Text style={s.moneyValue}>₱{Number(o.total_amount || 0).toFixed(2)}</Text>
                  </View>
                  <View style={s.moneyCell}>
                    <Text style={s.moneyLabel}>Paid</Text>
                    <Text style={[s.moneyValue, { color: theme.success }]}>₱{totalPaid.toFixed(2)}</Text>
                  </View>
                  <View style={s.moneyCell}>
                    <Text style={s.moneyLabel}>{isFullyPaid ? 'Status' : 'Balance'}</Text>
                    {isFullyPaid ? (
                      <Text style={[s.moneyValue, { color: theme.success }]}>✓ Paid</Text>
                    ) : (
                      <Text style={[s.moneyValue, { color: theme.warning }]}>₱{balance.toFixed(2)}</Text>
                    )}
                  </View>
                </View>

                {/* Actions */}
                <View style={s.actionsRow}>
                  <TouchableOpacity
                    style={s.actionBtn}
                    onPress={() =>
                      navigation.navigate('AdminOrderDetails', {
                        orderId: o.id,
                        order: o,
                      })
                    }
                  >
                    <Text style={s.actionBtnText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => setStatusModal(o.id)}>
                    <Text style={s.actionBtnText}>⚡ Update Status</Text>
                  </TouchableOpacity>
                  {!isFullyPaid && (
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionBtnPrimary]}
                      onPress={() => openPaymentModal(o, balance)}
                    >
                      <Text style={s.actionBtnPrimaryText}>+ Record Payment</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Status Modal */}
      <Modal visible={!!statusModal} transparent animationType="slide" onRequestClose={() => setStatusModal(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setStatusModal(null)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Update Status</Text>
            {STATUSES.map((st) => (
              <TouchableOpacity
                key={st}
                style={[s.modalOption, { borderColor: theme[STATUS_COLOR_KEY[st]] + '44' }]}
                onPress={() => updateStatus(statusModal, st)}
              >
                <View style={[s.modalDot, { backgroundColor: theme[STATUS_COLOR_KEY[st]] }]} />
                <Text style={[s.modalOptionText, { color: theme[STATUS_COLOR_KEY[st]] }]}>
                  {st === 'ready' ? 'Ready for Pickup' : st}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.modalCancel} onPress={() => setStatusModal(null)}>
              <Text style={{ color: theme.textSub, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={!!paymentModal} transparent animationType="slide" onRequestClose={() => setPaymentModal(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setPaymentModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
              <Text style={s.modalTitle}>Record Payment</Text>
              <Text style={s.modalSub}>₱{paymentModal?.due.toFixed(2)} currently due.</Text>

              <Text style={s.fieldLabel}>Amount (₱)</Text>
              <TextInput
                style={s.input}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={s.fieldLabel}>Type</Text>
              <View style={s.chipRow}>
                {['down_payment', 'balance', 'full', 'refund'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.smallChip, paymentType === t && s.smallChipActive]}
                    onPress={() => setPaymentType(t)}
                  >
                    <Text style={[s.smallChipText, paymentType === t && s.smallChipTextActive]}>
                      {t.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>Method</Text>
              <View style={s.chipRow}>
                {['cash', 'gcash', 'card', 'bank_transfer'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.smallChip, method === m && s.smallChipActive]}
                    onPress={() => setMethod(m)}
                  >
                    <Text style={[s.smallChipText, method === m && s.smallChipTextActive]}>
                      {m.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.confirmBtn} onPress={submitPayment} disabled={savingPayment}>
                {savingPayment ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.confirmBtnText}>Save Payment</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setPaymentModal(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },

    filterBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: theme.border },
    filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
    filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    filterText: { fontSize: 12, color: theme.textSub, fontWeight: '500', textTransform: 'capitalize' },
    filterTextActive: { color: '#fff', fontWeight: 'bold' },

    searchWrap: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: theme.bg2, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12 },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: theme.text },
    searchClear: { padding: 4 },

    card: { backgroundColor: theme.card, marginHorizontal: 12, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    customerName: { fontSize: 15, fontWeight: 'bold', color: theme.text },
    customerSub: { fontSize: 12, color: theme.textSub, marginTop: 2 },
    orderMeta: { fontSize: 11, color: theme.textMuted, marginTop: 4 },
    badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },

    notesBox: { backgroundColor: theme.bg2, borderRadius: 8, padding: 10, marginBottom: 10 },
    notesText: { fontSize: 12, color: theme.textSub, fontStyle: 'italic' },

    itemsBox: { backgroundColor: theme.bg2, borderRadius: 10, padding: 10, marginBottom: 10 },
    itemsLabel: { fontSize: 10, color: theme.textMuted, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 6 },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    itemName: { fontSize: 12, color: theme.textSub, flex: 1, marginRight: 8 },
    itemValue: { fontSize: 12, color: theme.text },

    moneyGrid: { flexDirection: 'row', backgroundColor: theme.bg2, borderRadius: 10, padding: 10, marginBottom: 10, gap: 16 },
    moneyCell: {},
    moneyLabel: { fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    moneyValue: { fontSize: 13, fontWeight: 'bold', color: theme.text },

    actionsRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
    actionBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
    actionBtnText: { fontSize: 12, fontWeight: '600', color: theme.text },
    actionBtnPrimary: { backgroundColor: theme.primary, borderColor: theme.primary },
    actionBtnPrimaryText: { fontSize: 12, fontWeight: '600', color: '#fff' },

    emptyCard: { alignItems: 'center', padding: 48 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
    modalTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 4, textAlign: 'center' },
    modalSub: { fontSize: 13, color: theme.textSub, marginBottom: 16, textAlign: 'center' },
    modalOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
    modalDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    modalOptionText: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
    modalCancel: { marginTop: 4, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: theme.bg2 },

    fieldLabel: { fontSize: 12, color: theme.textMuted, marginBottom: 6, marginTop: 12 },
    input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    smallChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
    smallChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    smallChipText: { fontSize: 12, color: theme.textSub, textTransform: 'capitalize' },
    smallChipTextActive: { color: '#fff', fontWeight: 'bold' },

    confirmBtn: { backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20, marginBottom: 8 },
    confirmBtnText: { color: '#fff', fontWeight: 'bold' },
    cancelBtn: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, alignItems: 'center' },
    cancelBtnText: { color: theme.text, fontWeight: '600' },
  });