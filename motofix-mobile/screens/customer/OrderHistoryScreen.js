import { useEffect, useState } from 'react';
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

function getOrderStatusConfig(theme, status) {
  const value = String(status || 'pending').toLowerCase();

  switch (value) {
    case 'completed':
      return {
        label: 'Completed',
        icon: 'checkmark-circle',
        color: theme.success,
        bg: theme.success + '18',
      };
    case 'ready':
      return {
        label: 'Ready',
        icon: 'bag-check',
        color: theme.primaryLight || theme.primary,
        bg: theme.primary + '18',
      };
    case 'preparing':
      return {
        label: 'Preparing',
        icon: 'construct',
        color: theme.warning,
        bg: theme.warning + '18',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: 'close-circle',
        color: theme.danger,
        bg: theme.danger + '18',
      };
    default:
      return {
        label: 'Pending',
        icon: 'time',
        color: theme.textMuted,
        bg: theme.bg2,
      };
  }
}

function getPaymentInfo(order) {
  const total = Number(order.total_amount) || 0;
  const downPayment = Number(order.down_payment_required) || total * 0.15;

  const paidAmount =
    Number(order.amount_paid) ||
    Number(order.paid_amount) ||
    Number(order.payment_amount) ||
    0;

  const orderStatus = String(order.status || 'pending').toLowerCase();
  const paymentStatus = String(order.payment_status || '').toLowerCase();

  const fullyPaid =
    paymentStatus === 'paid' ||
    paymentStatus === 'fully_paid' ||
    paymentStatus === 'full_paid' ||
    orderStatus === 'completed' ||
    paidAmount >= total;

  const partiallyPaid =
    paymentStatus === 'partial' ||
    paymentStatus === 'downpayment_paid' ||
    paidAmount > 0;

  if (fullyPaid) {
    return {
      label: 'Fully Paid',
      icon: 'receipt',
      paidAmount: total,
      remainingBalance: 0,
      receiptAvailable: true,
    };
  }

  if (partiallyPaid) {
    return {
      label: 'Down Payment Paid',
      icon: 'card',
      paidAmount,
      remainingBalance: Math.max(0, total - paidAmount),
      receiptAvailable: true,
    };
  }

  return {
    label: 'Pending Payment',
    icon: 'wallet-outline',
    paidAmount: 0,
    remainingBalance: total,
    receiptAvailable: false,
  };
}

export default function OrderHistoryScreen({ navigation }) {
  const { theme } = useTheme();

  const [orders, setOrders] = useState([]);
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
      console.log('Fetch orders error:', error.message);
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

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
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
          tintColor={theme.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.title}>Order History</Text>
      <TouchableOpacity
        style={s.backToShopButton}
        onPress={() =>
          navigation.reset({
            index: 0,
            routes: [{ name: 'ShopHome' }],
          })
        }
        activeOpacity={0.8}
      >
        <Ionicons name="storefront-outline" size={18} color="#fff" />
        <Text style={s.backToShopText}>Back to Shop</Text>
      </TouchableOpacity>

      {orders.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="receipt-outline" size={42} color={theme.textMuted} />
          <Text style={s.emptyTitle}>No orders yet</Text>
          <Text style={s.emptyText}>
            Your submitted parts orders and receipts will appear here.
          </Text>
        </View>
      ) : (
        orders.map((order) => {
          const status = getOrderStatusConfig(theme, order.status);
          const payment = getPaymentInfo(order);
          const total = Number(order.total_amount) || 0;
          const downPayment = Number(order.down_payment_required) || total * 0.15;
          const receiptNumber =
            order.receipt_number ||
            `MFX-${String(order.id || '').slice(0, 8).toUpperCase()}`;

          return (
            <View key={order.id} style={s.orderCard}>
              <View style={s.orderTop}>
                <View style={{ flex: 1 }}>
                  <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
                    <Ionicons
                      name={status.icon}
                      size={13}
                      color={status.color}
                    />
                    <Text style={[s.statusText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>

                  <Text style={s.orderTitle}>
                    Order #{String(order.id || '').slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={s.orderDate}>{formatDate(order.created_at)}</Text>
                </View>

                <Text style={s.orderTotal}>{formatPeso(total)}</Text>
              </View>

              <View style={s.receiptCard}>
                <View style={s.receiptHeader}>
                  <View style={s.receiptIcon}>
                    <Ionicons
                      name={payment.icon}
                      size={20}
                      color={theme.primary}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={s.receiptTitle}>Payment & Receipt</Text>
                    <Text style={s.receiptSubtitle}>
                      {payment.receiptAvailable
                        ? 'Receipt details are available.'
                        : 'Receipt will be available after payment confirmation.'}
                    </Text>
                  </View>
                </View>

                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Payment Status</Text>
                  <Text
                    style={[
                      s.summaryValue,
                      {
                        color: payment.receiptAvailable
                          ? theme.success
                          : theme.warning,
                      },
                    ]}
                  >
                    {payment.label}
                  </Text>
                </View>

                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Required Down Payment</Text>
                  <Text style={s.summaryValue}>{formatPeso(downPayment)}</Text>
                </View>

                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Amount Paid</Text>
                  <Text style={s.summaryValue}>
                    {formatPeso(payment.paidAmount)}
                  </Text>
                </View>

                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Remaining Balance</Text>
                  <Text style={s.summaryValue}>
                    {formatPeso(payment.remainingBalance)}
                  </Text>
                </View>

                <View style={s.divider} />

                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Receipt No.</Text>
                  <Text style={s.summaryValue}>
                    {payment.receiptAvailable ? receiptNumber : 'Pending'}
                  </Text>
                </View>

                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Payment Method</Text>
                  <Text style={s.summaryValue}>
                    {order.payment_method || 'To be confirmed'}
                  </Text>
                </View>
              </View>

              <Text style={s.sectionLabel}>Items</Text>

              {order.order_items?.length > 0 ? (
                <View style={s.itemsWrap}>
                  {order.order_items.map((item) => {
                    const unitPrice = Number(item.unit_price) || 0;
                    const subtotal =
                      Number(item.subtotal) || unitPrice * item.quantity;

                    return (
                      <View key={item.id} style={s.itemRow}>
                        <View style={s.itemIcon}>
                          <Ionicons
                            name="cube-outline"
                            size={18}
                            color={theme.primary}
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
                  })}
                </View>
              ) : (
                <Text style={s.noItemsText}>No order items found.</Text>
              )}

              {order.notes ? (
                <View style={s.notesBox}>
                  <Text style={s.notesLabel}>Notes</Text>
                  <Text style={s.notesText}>{order.notes}</Text>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    backToShopButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  backgroundColor: theme.primary,
  paddingVertical: 12,
  borderRadius: 14,
  marginBottom: 16,
},
backToShopText: {
  color: '#fff',
  fontWeight: '900',
  fontSize: 14,
},
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 36,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: theme.textSub || theme.textMuted,
      marginTop: 10,
    },
    title: {
      color: theme.text,
      fontSize: 28,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      marginTop: 4,
      marginBottom: 16,
      lineHeight: 20,
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
      lineHeight: 19,
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
      marginBottom: 14,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginBottom: 8,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'capitalize',
    },
    orderTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    orderDate: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 3,
    },
    orderTotal: {
      color: theme.primaryLight || theme.primary,
      fontWeight: '900',
      fontSize: 16,
    },
    receiptCard: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 13,
      marginBottom: 14,
    },
    receiptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    receiptIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receiptTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    receiptSubtitle: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      lineHeight: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 8,
    },
    summaryLabel: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      flex: 1,
    },
    summaryValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'right',
      flex: 1,
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 8,
    },
    sectionLabel: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 13,
      marginBottom: 8,
    },
    itemsWrap: {
      gap: 8,
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
    itemName: {
      color: theme.text,
      fontWeight: '800',
      fontSize: 13,
    },
    itemMeta: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    itemSubtotal: {
      color: theme.text,
      fontWeight: '900',
      fontSize: 12,
    },
    noItemsText: {
      color: theme.textMuted,
      fontSize: 12,
      backgroundColor: theme.bg2,
      padding: 12,
      borderRadius: 12,
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