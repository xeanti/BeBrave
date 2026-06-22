import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, RefreshControl, TouchableOpacity
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const STATUS_COLORS = {
  pending: '#eab308',
  confirmed: '#22c55e',
  in_progress: '#3b82f6',
  completed: '#9ca3af',
  cancelled: '#ef4444',
  preparing: '#a855f7',
  ready: '#06b6d4',
};

export default function AdminDashboardScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [stats, setStats] = useState({
    totalBookings: 0,
    pendingBookings: 0,
    pendingOrders: 0,
    pendingAssessments: 0,
    totalCustomers: 0,
    totalMechanics: 0,
    totalParts: 0,
    totalServices: 0,
    orderRevenue: 0,
    bookingRevenue: 0,
    totalRevenue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  });
  const [recentBookings, setRecentBookings] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockParts, setLowStockParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [bookings, orders, assessments, customers, mechanics, parts, services] = await Promise.all([
      supabase.from('bookings').select('id, status, services(base_price, labor_cost)'),
      supabase.from('orders').select('id, status, total_amount'),
      supabase.from('pre_assessments').select('id, status'),
      supabase.from('profiles').select('id').eq('role', 'customer'),
      supabase.from('profiles').select('id').eq('role', 'mechanic'),
      supabase.from('parts').select('id, name, stock_quantity, reorder_threshold').order('stock_quantity', { ascending: true }),
      supabase.from('services').select('id'),
    ]);

    const orderRevenue = (orders.data || [])
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const bookingRevenue = (bookings.data || [])
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.services?.base_price || 0) + (b.services?.labor_cost || 0), 0);

    const allParts = parts.data || [];
    const outOfStock = allParts.filter((p) => p.stock_quantity <= 0);
    const lowStock = allParts.filter(
      (p) => p.stock_quantity > 0 && p.stock_quantity <= (p.reorder_threshold ?? 5)
    );
    setLowStockParts([...outOfStock, ...lowStock].slice(0, 6));

    setStats({
      totalBookings: bookings.data?.length || 0,
      pendingBookings: bookings.data?.filter(b => b.status === 'pending').length || 0,
      pendingOrders: orders.data?.filter(o => o.status === 'pending').length || 0,
      pendingAssessments: assessments.data?.filter(a => a.status === 'pending').length || 0,
      totalCustomers: customers.data?.length || 0,
      totalMechanics: mechanics.data?.length || 0,
      totalParts: allParts.length,
      totalServices: services.data?.length || 0,
      orderRevenue,
      bookingRevenue,
      totalRevenue: orderRevenue + bookingRevenue,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
    });

    const [rb, ro] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, services(name), profiles!bookings_customer_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('orders')
        .select('*, profiles!orders_customer_id_fkey(first_name, last_name), order_items(id)')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    setRecentBookings(rb.data || []);
    setRecentOrders(ro.data || []);
    setLoading(false);
    setRefreshing(false);
  }

  const s = styles(theme);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <ScrollView
      style={s.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={theme.primaryLight} />}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <Text style={s.pageTitle}>Admin Dashboard</Text>
      <Text style={s.pageSubtitle}>Overview of MotoFix operations</Text>

      {/* Stats Grid */}
      <View style={s.statsGrid}>
        <StatCard icon="📅" label="Total Bookings" value={stats.totalBookings} color="#3b82f6" theme={theme} />
        <StatCard icon="⏳" label="Pending Bookings" value={stats.pendingBookings} color="#eab308" theme={theme} />
        <StatCard icon="📦" label="Pending Orders" value={stats.pendingOrders} color="#f97316" theme={theme} />
        <StatCard icon="📋" label="Pending Assessments" value={stats.pendingAssessments} color="#eab308" theme={theme} />
        <StatCard icon="👥" label="Customers" value={stats.totalCustomers} color="#22c55e" theme={theme} />
        <StatCard icon="🔧" label="Mechanics" value={stats.totalMechanics} color="#db2777" theme={theme} />
        <StatCard
          icon="⚠️"
          label="Low Stock"
          value={stats.lowStockCount}
          color={stats.lowStockCount > 0 ? '#eab308' : theme.textMuted}
          theme={theme}
          onPress={() => navigation.navigate('Inventory')}
        />
        <StatCard
          icon="🚫"
          label="Out of Stock"
          value={stats.outOfStockCount}
          color={stats.outOfStockCount > 0 ? '#ef4444' : theme.textMuted}
          theme={theme}
          onPress={() => navigation.navigate('Inventory')}
        />
      </View>

      {/* Revenue Card */}
      <View style={s.revenueCard}>
        <Text style={s.revenueLabel}>Total Combined Revenue</Text>
        <Text style={s.revenueTotal}>
          ₱{stats.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </Text>
        <View style={s.revenueRow}>
          <View style={s.revenueItem}>
            <Text style={s.revenueItemLabel}>From Orders</Text>
            <Text style={[s.revenueItemValue, { color: '#eab308' }]}>
              ₱{stats.orderRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={s.revenueItem}>
            <Text style={s.revenueItemLabel}>From Bookings</Text>
            <Text style={[s.revenueItemValue, { color: theme.primaryLight }]}>
              ₱{stats.bookingRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>
      </View>

      {/* Low Stock Alert */}
      {(stats.lowStockCount > 0 || stats.outOfStockCount > 0) && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>⚠️ Low Stock Alert</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Inventory')}>
              <Text style={s.sectionLink}>Manage →</Text>
            </TouchableOpacity>
          </View>
          {lowStockParts.map((p) => {
            const isOut = p.stock_quantity <= 0;
            return (
              <TouchableOpacity
                key={p.id}
                style={s.recentCard}
                onPress={() => navigation.navigate('Inventory')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.recentName}>{p.name}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: (isOut ? '#ef4444' : '#eab308') + '22' }]}>
                  <Text style={[s.badgeText, { color: isOut ? '#ef4444' : '#eab308' }]}>
                    {isOut ? 'Out of stock' : `${p.stock_quantity} left`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Recent Bookings */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Recent Bookings</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Bookings')}>
            <Text style={s.sectionLink}>View all →</Text>
          </TouchableOpacity>
        </View>
        {recentBookings.length === 0 ? (
          <Text style={s.emptyText}>No bookings yet.</Text>
        ) : (
          recentBookings.map(b => (
            <View key={b.id} style={s.recentCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.recentName}>
                  {b.profiles?.first_name} {b.profiles?.last_name}
                </Text>
                <Text style={s.recentSub}>
                  {b.services?.name} · {b.booking_date}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: STATUS_COLORS[b.status] + '22' }]}>
                <Text style={[s.badgeText, { color: STATUS_COLORS[b.status] }]}>
                  {b.status?.replace('_', ' ')}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Recent Orders */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Recent Orders</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
            <Text style={s.sectionLink}>View all →</Text>
          </TouchableOpacity>
        </View>
        {recentOrders.length === 0 ? (
          <Text style={s.emptyText}>No orders yet.</Text>
        ) : (
          recentOrders.map(o => (
            <View key={o.id} style={s.recentCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.recentName}>
                  {o.profiles?.first_name} {o.profiles?.last_name}
                </Text>
                <Text style={s.recentSub}>
                  {o.order_items?.length} item{o.order_items?.length !== 1 ? 's' : ''} · ₱{o.total_amount}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: STATUS_COLORS[o.status] + '22' }]}>
                <Text style={[s.badgeText, { color: STATUS_COLORS[o.status] }]}>
                  {o.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StatCard({ icon, label, value, color, theme, onPress }) {
  const s = statStyles(theme);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={s.card} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={s.topRow}>
        <Text style={s.icon}>{icon}</Text>
        <Text style={[s.value, { color }]}>{value}</Text>
      </View>
      <Text style={s.label}>{label}</Text>
    </Wrapper>
  );
}

const statStyles = (theme) => StyleSheet.create({
  card: { width: '48%', backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  icon: { fontSize: 22 },
  value: { fontSize: 22, fontWeight: 'bold' },
  label: { fontSize: 12, color: theme.textSub },
});

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: theme.text, paddingHorizontal: 16, paddingTop: 20 },
  pageSubtitle: { fontSize: 13, color: theme.textSub, paddingHorizontal: 16, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16 },
  revenueCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: theme.card, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: theme.primary + '33' },
  revenueLabel: { fontSize: 12, color: theme.textSub, marginBottom: 6 },
  revenueTotal: { fontSize: 28, fontWeight: 'bold', color: theme.text, marginBottom: 14 },
  revenueRow: { flexDirection: 'row', gap: 20 },
  revenueItem: {},
  revenueItemLabel: { fontSize: 11, color: theme.textMuted, marginBottom: 2 },
  revenueItemValue: { fontSize: 16, fontWeight: 'bold' },
  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },
  sectionLink: { fontSize: 12, color: theme.primaryLight },
  recentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  recentName: { fontSize: 14, fontWeight: '600', color: theme.text },
  recentSub: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
  emptyText: { fontSize: 13, color: theme.textMuted, textAlign: 'center', padding: 20 },
});