import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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

  function statusColor(status) {
    switch (status) {
      case 'completed':
        return theme.success;
      case 'ready':
        return theme.primaryLight;
      case 'preparing':
        return theme.warning;
      case 'cancelled':
        return theme.danger;
      case 'pending':
      default:
        return theme.textMuted;
    }
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />
      }
    >
      <Text style={s.title}>Order History</Text>
      <Text style={s.subtitle}>Track your parts orders from the shop.</Text>

      {orders.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="receipt-outline" size={44} color={theme.textMuted} />
          <Text style={s.emptyTitle}>No orders yet</Text>
          <Text style={s.emptyText}>Your submitted parts orders will appear here.</Text>
        </View>
      ) : (
        orders.map((order) => {
          const color = statusColor(order.status);

          return (
            <View key={order.id} style={s.orderCard}>
              <View style={s.orderTop}>
                <View>
                  <View style={[s.statusBadge, { backgroundColor: `${color}22` }]}>
                    <Text style={[s.statusText, { color }]}>{order.status || 'pending'}</Text>
                  </View>

                  <Text style={s.orderTitle}>Order #{order.id?.slice(0, 8).toUpperCase()}</Text>
                  <Text style={s.orderDate}>{formatDate(order.created_at)}</Text>
                </View>

                <Text style={s.orderTotal}>{formatPeso(order.total_amount)}</Text>
              </View>

              <View style={s.itemsWrap}>
                {order.order_items?.length > 0 ? (
                  order.order_items.map((item) => {
                    const unitPrice = Number(item.unit_price) || 0;
                    const subtotal = Number(item.subtotal) || unitPrice * item.quantity;

                    return (
                      <View key={item.id} style={s.itemRow}>
                        <View style={s.itemIcon}>
                          <Ionicons name="cube-outline" size={18} color={theme.textMuted} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={s.itemName}>{item.parts?.name || 'Part'}</Text>
                          <Text style={s.itemMeta}>
                            {item.parts?.category || 'General'} · {formatPeso(unitPrice)} × {item.quantity}
                          </Text>
                        </View>

                        <Text style={s.itemSubtotal}>{formatPeso(subtotal)}</Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={s.emptyText}>No order items found.</Text>
                )}
              </View>

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

      <View style={{ height: 30 }} />
    </ScrollView>
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
    loadingText: { color: theme.textSub, marginTop: 10 },
    title: { color: theme.text, fontSize: 28, fontWeight: '900' },
    subtitle: { color: theme.textSub, marginTop: 4, marginBottom: 16 },
    emptyCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 28,
      alignItems: 'center',
      marginTop: 20,
    },
    emptyTitle: { color: theme.text, fontWeight: '900', fontSize: 17, marginTop: 12 },
    emptyText: { color: theme.textSub, textAlign: 'center', marginTop: 5 },
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
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 8,
    },
    statusText: { fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
    orderTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
    orderDate: { color: theme.textMuted, fontSize: 12, marginTop: 3 },
    orderTotal: { color: theme.primaryLight, fontWeight: '900', fontSize: 16 },
    itemsWrap: { gap: 8 },
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
    notesBox: {
      marginTop: 12,
      backgroundColor: theme.bg2,
      borderRadius: 13,
      padding: 11,
    },
    notesLabel: { color: theme.text, fontWeight: '900', fontSize: 12, marginBottom: 4 },
    notesText: { color: theme.textSub, fontSize: 12, lineHeight: 18 },
  });