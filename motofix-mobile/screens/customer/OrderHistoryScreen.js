import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return 'No date';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizeStatus(status) {
  return String(status || 'pending').toLowerCase();
}

function humanize(value) {
  if (!value) return 'Pending';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPaidAmount(order) {
  const status = normalizeStatus(order.payment_status || order.status);
  const total = Number(order.total_amount || 0);

  if (order.paid_amount != null) return Number(order.paid_amount);
  if (order.amount_paid != null) return Number(order.amount_paid);
  if (order.payment_amount != null) return Number(order.payment_amount);
  if (order.down_payment != null) return Number(order.down_payment);

  if (
    status === 'paid' ||
    status === 'completed' ||
    status === 'fully_paid' ||
    status === 'fully paid'
  ) {
    return total;
  }

  return 0;
}

function getPaymentStatus(order) {
  const total = Number(order.total_amount || 0);
  const paid = getPaidAmount(order);

  if (order.payment_status) return humanize(order.payment_status);
  if (paid <= 0) return 'Unpaid';
  if (paid >= total) return 'Fully Paid';
  return 'Partially Paid';
}

export default function OrderHistoryScreen({ navigation }) {
  const { theme } = useTheme();

  const [orders, setOrders] = useState([]);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const s = styles(theme);

  useEffect(() => {
    fetchOrders();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchOrders(false);
    });

    return unsubscribe;
  }, [navigation]);

  async function fetchOrders(showLoader = true) {
    if (showLoader) setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, parts(name, image_url, category))')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setOrders([]);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchOrders(false);
  }

  const counts = useMemo(() => {
    const result = { all: orders.length };

    FILTERS.forEach((filter) => {
      if (filter.key !== 'all') {
        result[filter.key] = orders.filter(
          (order) => normalizeStatus(order.status) === filter.key
        ).length;
      }
    });

    return result;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;

    return orders.filter(
      (order) => normalizeStatus(order.status) === statusFilter
    );
  }, [orders, statusFilter]);

  function statusColor(status) {
    switch (normalizeStatus(status)) {
      case 'completed':
        return theme.success;
      case 'ready':
      case 'ready_for_pickup':
        return theme.primaryLight;
      case 'processing':
      case 'preparing':
        return theme.warning;
      case 'cancelled':
      case 'rejected':
        return theme.danger;
      case 'pending':
      default:
        return theme.textMuted;
    }
  }

  function paymentColor(order) {
    const total = Number(order.total_amount || 0);
    const paid = getPaidAmount(order);

    if (paid <= 0) return theme.danger;
    if (paid >= total) return theme.success;
    return theme.warning;
  }

  function renderReceiptSection(order) {
    const invoiceNumber =
      order.invoice_number ||
      order.receipt_number ||
      order.reference_number ||
      null;

    const paymentMethod =
      order.payment_method ||
      order.method ||
      order.payment_type ||
      'Not specified';

    const paid = getPaidAmount(order);
    const total = Number(order.total_amount || 0);
    const balance = Math.max(total - paid, 0);
    const progress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;

    return (
      <View style={s.receiptCard}>
        <View style={s.receiptHeader}>
          <View style={s.receiptIcon}>
            <Ionicons name="receipt-outline" size={20} color={theme.primaryLight} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.receiptTitle}>Payment / E-Receipt</Text>
            <Text style={s.receiptSub}>
              {invoiceNumber
                ? `Reference: ${invoiceNumber}`
                : 'No invoice or receipt number yet'}
            </Text>
          </View>
        </View>

        <View style={s.paymentProgressTrack}>
          <View style={[s.paymentProgressFill, { width: `${progress}%` }]} />
        </View>

        <View style={s.paymentGrid}>
          <MiniStat theme={theme} label="Status" value={getPaymentStatus(order)} />
          <MiniStat theme={theme} label="Paid" value={formatPeso(paid)} />
          <MiniStat theme={theme} label="Balance" value={formatPeso(balance)} />
        </View>

        <View style={s.receiptInfoRow}>
          <Text style={s.receiptInfoLabel}>Payment Method</Text>
          <Text style={s.receiptInfoValue}>{humanize(paymentMethod)}</Text>
        </View>

        <View style={s.receiptInfoRow}>
          <Text style={s.receiptInfoLabel}>Order Date</Text>
          <Text style={s.receiptInfoValue}>{formatDate(order.created_at)}</Text>
        </View>

        {order.paid_at || order.payment_date ? (
          <View style={s.receiptInfoRow}>
            <Text style={s.receiptInfoLabel}>Payment Date</Text>
            <Text style={s.receiptInfoValue}>
              {formatDate(order.paid_at || order.payment_date)}
            </Text>
          </View>
        ) : null}

        {!invoiceNumber && paid <= 0 ? (
          <View style={s.receiptNotice}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
            <Text style={s.receiptNoticeText}>
              The official e-receipt will appear once the shop records or confirms the payment.
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
        <Text style={s.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primaryLight}
        />
      }
    >
      <Text style={s.title}>Order History</Text>
      <Text style={s.subtitle}>Track your parts orders from the shop.</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              s.filterChip,
              statusFilter === filter.key && s.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter.key)}
          >
            <Text
              style={[
                s.filterCount,
                statusFilter === filter.key && s.filterTextActive,
              ]}
            >
              {counts[filter.key] ?? 0}
            </Text>

            <Text
              style={[
                s.filterText,
                statusFilter === filter.key && s.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {orders.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="receipt-outline" size={44} color={theme.textMuted} />
          <Text style={s.emptyTitle}>No orders yet</Text>
          <Text style={s.emptyText}>
            Your submitted parts orders will appear here.
          </Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="search-outline" size={44} color={theme.textMuted} />
          <Text style={s.emptyTitle}>No matching orders</Text>
          <TouchableOpacity onPress={() => setStatusFilter('all')}>
            <Text style={s.clearText}>Clear filter</Text>
          </TouchableOpacity>
        </View>
      ) : (
        filteredOrders.map((order) => {
          const color = statusColor(order.status);
          const paymentStatusText = getPaymentStatus(order);
          const payColor = paymentColor(order);
          const isExpanded = expandedOrderId === order.id;

          return (
            <View key={order.id} style={s.orderCard}>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() =>
                  setExpandedOrderId(isExpanded ? null : order.id)
                }
              >
                <View style={s.orderTop}>
                  <View style={{ flex: 1 }}>
                    <View style={s.badgeRow}>
                      <View
                        style={[
                          s.statusBadge,
                          { backgroundColor: `${color}22` },
                        ]}
                      >
                        <Text style={[s.statusText, { color }]}>
                          {humanize(order.status || 'pending')}
                        </Text>
                      </View>

                      <View
                        style={[
                          s.statusBadge,
                          { backgroundColor: `${payColor}22` },
                        ]}
                      >
                        <Text style={[s.statusText, { color: payColor }]}>
                          {paymentStatusText}
                        </Text>
                      </View>
                    </View>

                    <Text style={s.orderTitle}>
                      Order #{order.id?.slice(0, 8).toUpperCase()}
                    </Text>
                    <Text style={s.orderDate}>{formatDate(order.created_at)}</Text>
                  </View>

                  <View style={s.orderRight}>
                    <Text style={s.orderTotal}>
                      {formatPeso(order.total_amount)}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={theme.textMuted}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <>
                  <View style={s.itemsWrap}>
                    {order.order_items?.length > 0 ? (
                      order.order_items.map((item) => {
                        const unitPrice = Number(item.unit_price) || 0;
                        const subtotal =
                          Number(item.subtotal) || unitPrice * Number(item.quantity || 0);

                        return (
                          <View key={item.id} style={s.itemRow}>
                            <View style={s.itemIcon}>
                              <Ionicons
                                name="cube-outline"
                                size={18}
                                color={theme.textMuted}
                              />
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text style={s.itemName}>
                                {item.parts?.name || 'Part'}
                              </Text>
                              <Text style={s.itemMeta}>
                                {item.parts?.category || 'General'} ·{' '}
                                {formatPeso(unitPrice)} × {item.quantity}
                              </Text>
                            </View>

                            <Text style={s.itemSubtotal}>
                              {formatPeso(subtotal)}
                            </Text>
                          </View>
                        );
                      })
                    ) : (
                      <Text style={s.emptyText}>No order items found.</Text>
                    )}
                  </View>

                  {renderReceiptSection(order)}

                  {order.notes ? (
                    <View style={s.notesBox}>
                      <Text style={s.notesLabel}>Notes</Text>
                      <Text style={s.notesText}>{order.notes}</Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          );
        })
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function MiniStat({ theme, label, value }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.bg2,
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
          fontSize: 12,
          fontWeight: '900',
          marginTop: 4,
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 16 },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: { color: theme.textSub || theme.textMuted, marginTop: 10 },
    title: { color: theme.text, fontSize: 28, fontWeight: '900' },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      marginTop: 4,
      marginBottom: 16,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 14,
    },
    filterChip: {
      minWidth: 88,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 13,
      paddingHorizontal: 12,
      paddingVertical: 9,
      alignItems: 'center',
    },
    filterChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    filterCount: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    filterText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
    filterTextActive: {
      color: '#fff',
    },
    clearText: {
      color: theme.primaryLight,
      fontSize: 14,
      fontWeight: '800',
      marginTop: 10,
    },
    emptyCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 28,
      alignItems: 'center',
      marginTop: 20,
    },
    emptyTitle: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 17,
      marginTop: 12,
    },
    emptyText: {
      color: theme.textSub || theme.textMuted,
      textAlign: 'center',
      marginTop: 5,
    },
    orderCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 15,
      marginBottom: 14,
    },
    orderTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'capitalize',
    },
    orderTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
    orderDate: { color: theme.textMuted, fontSize: 12, marginTop: 3 },
    orderRight: {
      alignItems: 'flex-end',
      gap: 6,
    },
    orderTotal: {
      color: theme.primaryLight,
      fontWeight: '900',
      fontSize: 16,
    },
    itemsWrap: {
      gap: 8,
      marginTop: 14,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bg2,
      borderRadius: 13,
      padding: 10,
      gap: 10,
    },
    itemIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemName: { color: theme.text, fontWeight: '800', fontSize: 13 },
    itemMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
    itemSubtotal: { color: theme.text, fontWeight: '900', fontSize: 12 },
    receiptCard: {
      marginTop: 12,
      backgroundColor: theme.bg2,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    receiptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    receiptIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receiptTitle: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 14,
    },
    receiptSub: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    paymentProgressTrack: {
      height: 8,
      backgroundColor: theme.card,
      borderRadius: 999,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 10,
    },
    paymentProgressFill: {
      height: '100%',
      backgroundColor: theme.primaryLight,
      borderRadius: 999,
    },
    paymentGrid: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    receiptInfoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    receiptInfoLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    receiptInfoValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'right',
      flex: 1,
    },
    receiptNotice: {
      marginTop: 8,
      flexDirection: 'row',
      gap: 7,
      alignItems: 'flex-start',
    },
    receiptNoticeText: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    notesBox: {
      marginTop: 12,
      backgroundColor: theme.bg2,
      borderRadius: 13,
      padding: 11,
    },
    notesLabel: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 12,
      marginBottom: 4,
    },
    notesText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
  });