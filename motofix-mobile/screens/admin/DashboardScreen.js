import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

function formatCurrency(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatStatus(status) {
  if (!status) return 'Unknown';
  return String(status).replace(/_/g, ' ');
}

function getStatusColor(status, theme) {
  return STATUS_COLORS[status] || theme.textMuted;
}

function getFullName(profile) {
  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const name = `${firstName} ${lastName}`.trim();

  return name || 'Customer';
}

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
  const [screenError, setScreenError] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setScreenError('');

    try {
      const [
        bookings,
        orders,
        assessments,
        customers,
        mechanics,
        parts,
        services,
      ] = await Promise.all([
        supabase.from('bookings').select('id, status, services(base_price, labor_cost)'),
        supabase.from('orders').select('id, status, total_amount'),
        supabase.from('pre_assessments').select('id, status'),
        supabase.from('profiles').select('id').eq('role', 'customer'),
        supabase.from('profiles').select('id').eq('role', 'mechanic'),
        supabase
          .from('parts')
          .select('id, name, stock_quantity, reorder_threshold')
          .order('stock_quantity', { ascending: true }),
        supabase.from('services').select('id'),
      ]);

      const allBookings = bookings.data || [];
      const allOrders = orders.data || [];
      const allAssessments = assessments.data || [];
      const allParts = parts.data || [];

      const orderRevenue = allOrders
        .filter((order) => order.status === 'completed')
        .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);

      const bookingRevenue = allBookings
        .filter((booking) => booking.status === 'completed')
        .reduce(
          (sum, booking) =>
            sum +
            (Number(booking.services?.base_price) || 0) +
            (Number(booking.services?.labor_cost) || 0),
          0
        );

      const outOfStock = allParts.filter(
        (part) => Number(part.stock_quantity) <= 0
      );

      const lowStock = allParts.filter((part) => {
        const stock = Number(part.stock_quantity) || 0;
        const threshold = Number(part.reorder_threshold ?? 5);

        return stock > 0 && stock <= threshold;
      });

      setLowStockParts([...outOfStock, ...lowStock].slice(0, 6));

      setStats({
        totalBookings: allBookings.length,
        pendingBookings: allBookings.filter(
          (booking) => booking.status === 'pending'
        ).length,
        pendingOrders: allOrders.filter((order) => order.status === 'pending')
          .length,
        pendingAssessments: allAssessments.filter(
          (assessment) => assessment.status === 'pending'
        ).length,
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

      const [recentBookingsResult, recentOrdersResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(
            '*, services(name), profiles!bookings_customer_id_fkey(first_name, last_name)'
          )
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('orders')
          .select(
            '*, profiles!orders_customer_id_fkey(first_name, last_name), order_items(id)'
          )
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      setRecentBookings(recentBookingsResult.data || []);
      setRecentOrders(recentOrdersResult.data || []);
    } catch (error) {
      console.error(error);
      setScreenError(error.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchAll();
  }

  function openInventoryPart(partId) {
    navigation.navigate('More', {
      screen: 'AdminInv',
      params: {
        partId,
        selectedPartId: partId,
        focusPartId: partId,
      },
    });
  }

  function openBookingDetails(bookingId) {
    navigation.navigate('AdminBookingDetails', {
      bookingId,
      id: bookingId,
    });
  }

  function openOrderDetails(orderId) {
    navigation.navigate('AdminOrderDetails', {
      orderId,
      id: orderId,
    });
  }

  const s = styles(theme);
  const attentionCount =
    stats.pendingBookings +
    stats.pendingOrders +
    stats.pendingAssessments +
    stats.lowStockCount +
    stats.outOfStockCount;

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
        <Text style={s.loadingText}>Loading dashboard...</Text>
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
          onRefresh={handleRefresh}
          tintColor={theme.primaryLight}
          colors={[theme.primaryLight]}
        />
      }
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.heroCard}>
        <View style={s.heroTopRow}>
          <View style={s.heroIconWrap}>
            <Ionicons name="speedometer" size={24} color="#111827" />
          </View>

          <TouchableOpacity
            style={s.refreshButton}
            onPress={handleRefresh}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh" size={16} color={theme.text} />
            <Text style={s.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.pageTitle}>Admin Dashboard</Text>
        <Text style={s.pageSubtitle}>
          Monitor bookings, orders, inventory, and revenue in one place.
        </Text>

        <View style={s.heroDivider} />

        <View style={s.heroBottomRow}>
          <View>
            <Text style={s.heroSmallLabel}>Needs Attention</Text>
            <Text style={s.heroBigValue}>{attentionCount}</Text>
          </View>

          <View style={s.heroRevenueBox}>
            <Text style={s.heroSmallLabel}>Total Revenue</Text>
            <Text style={s.heroRevenue}>{formatCurrency(stats.totalRevenue)}</Text>
          </View>
        </View>
      </View>

      {!!screenError && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={18} color="#ef4444" />
          <Text style={s.errorText}>{screenError}</Text>
        </View>
      )}

      <View style={s.quickActions}>
        <QuickAction
          icon="calendar"
          label="Bookings"
          theme={theme}
          onPress={() => navigation.navigate('Bookings')}
        />
        <QuickAction
          icon="cart"
          label="Orders"
          theme={theme}
          onPress={() => navigation.navigate('More', { screen: 'AdminOrders' })}
        />
        <QuickAction
          icon="cube"
          label="Inventory"
          theme={theme}
          onPress={() => navigation.navigate('More', { screen: 'AdminInv' })}
        />
        <QuickAction
          icon="analytics"
          label="Reports"
          theme={theme}
          onPress={() => navigation.navigate('More', { screen: 'AdminReports' })}
        />
      </View>

      <Text style={s.blockTitle}>Overview</Text>

      <View style={s.statsGrid}>
        <StatCard
          icon="calendar"
          label="Total Bookings"
          value={stats.totalBookings}
          color="#3b82f6"
          theme={theme}
        />

        <StatCard
          icon="time"
          label="Pending Bookings"
          value={stats.pendingBookings}
          color="#eab308"
          theme={theme}
          onPress={() => navigation.navigate('Bookings')}
        />

        <StatCard
          icon="cart"
          label="Pending Orders"
          value={stats.pendingOrders}
          color="#f97316"
          theme={theme}
          onPress={() => navigation.navigate('More', { screen: 'AdminOrders' })}
        />

        <StatCard
          icon="clipboard"
          label="Pending Assessments"
          value={stats.pendingAssessments}
          color="#eab308"
          theme={theme}
          onPress={() =>
            navigation.navigate('More', { screen: 'AdminPreAssessments' })
          }
        />

        <StatCard
          icon="people"
          label="Customers"
          value={stats.totalCustomers}
          color="#22c55e"
          theme={theme}
        />

        <StatCard
          icon="construct"
          label="Mechanics"
          value={stats.totalMechanics}
          color="#db2777"
          theme={theme}
        />

        <StatCard
          icon="warning"
          label="Low Stock"
          value={stats.lowStockCount}
          color={stats.lowStockCount > 0 ? '#eab308' : theme.textMuted}
          theme={theme}
          onPress={() => navigation.navigate('More', { screen: 'AdminInv' })}
        />

        <StatCard
          icon="close-circle"
          label="Out of Stock"
          value={stats.outOfStockCount}
          color={stats.outOfStockCount > 0 ? '#ef4444' : theme.textMuted}
          theme={theme}
          onPress={() => navigation.navigate('More', { screen: 'AdminInv' })}
        />
      </View>

      <View style={s.revenueCard}>
        <View style={s.revenueHeader}>
          <View>
            <Text style={s.revenueLabel}>Total Combined Revenue</Text>
            <Text style={s.revenueTotal}>
              {formatCurrency(stats.totalRevenue)}
            </Text>
          </View>

          <View style={s.revenueIconWrap}>
            <Ionicons name="cash" size={22} color="#111827" />
          </View>
        </View>

        <View style={s.revenueRow}>
          <View style={s.revenueItem}>
            <Text style={s.revenueItemLabel}>From Orders</Text>
            <Text style={[s.revenueItemValue, { color: '#eab308' }]}>
              {formatCurrency(stats.orderRevenue)}
            </Text>
          </View>

          <View style={s.revenueSeparator} />

          <View style={s.revenueItem}>
            <Text style={s.revenueItemLabel}>From Bookings</Text>
            <Text style={[s.revenueItemValue, { color: theme.primaryLight }]}>
              {formatCurrency(stats.bookingRevenue)}
            </Text>
          </View>
        </View>
      </View>

      {(stats.lowStockCount > 0 || stats.outOfStockCount > 0) && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View>
              <Text style={s.sectionTitle}>Inventory Alerts</Text>
              <Text style={s.sectionSubtitle}>
                Parts that need restocking soon.
              </Text>
            </View>

            <TouchableOpacity
              style={s.linkPill}
              onPress={() => navigation.navigate('More', { screen: 'AdminInv' })}
            >
              <Text style={s.linkPillText}>Manage</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.primaryLight} />
            </TouchableOpacity>
          </View>

          {lowStockParts.map((part) => {
            const isOut = Number(part.stock_quantity) <= 0;
            const color = isOut ? '#ef4444' : '#eab308';

            return (
              <TouchableOpacity
                key={part.id}
                style={s.alertCard}
                onPress={() => openInventoryPart(part.id)}
                activeOpacity={0.75}
              >
                <View style={[s.alertIconWrap, { backgroundColor: color + '22' }]}>
                  <Ionicons
                    name={isOut ? 'close-circle' : 'warning'}
                    size={18}
                    color={color}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.recentName}>{part.name}</Text>
                  <Text style={s.recentSub}>
                    Threshold: {part.reorder_threshold ?? 5}
                  </Text>
                </View>

                <StatusBadge
                  label={isOut ? 'Out of stock' : `${part.stock_quantity} left`}
                  color={color}
                  theme={theme}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>Recent Bookings</Text>
            <Text style={s.sectionSubtitle}>Latest service appointments.</Text>
          </View>

          <TouchableOpacity
            style={s.linkPill}
            onPress={() => navigation.navigate('Bookings')}
          >
            <Text style={s.linkPillText}>View all</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.primaryLight} />
          </TouchableOpacity>
        </View>

        {recentBookings.length === 0 ? (
          <EmptyState text="No bookings yet." theme={theme} />
        ) : (
          recentBookings.map((booking) => {
            const color = getStatusColor(booking.status, theme);

            return (
              <TouchableOpacity
                key={booking.id}
                style={s.recentCard}
                onPress={() => openBookingDetails(booking.id)}
                activeOpacity={0.75}
              >
                <View style={s.recentIconWrap}>
                  <Ionicons name="calendar" size={18} color={theme.primaryLight} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.recentName}>{getFullName(booking.profiles)}</Text>
                  <Text style={s.recentSub}>
                    {booking.services?.name || 'Service'} · {booking.booking_date || 'No date'}
                  </Text>
                </View>

                <StatusBadge
                  label={formatStatus(booking.status)}
                  color={color}
                  theme={theme}
                />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>Recent Orders</Text>
            <Text style={s.sectionSubtitle}>Latest shop purchases.</Text>
          </View>

          <TouchableOpacity
            style={s.linkPill}
            onPress={() => navigation.navigate('More', { screen: 'AdminOrders' })}
          >
            <Text style={s.linkPillText}>View all</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.primaryLight} />
          </TouchableOpacity>
        </View>

        {recentOrders.length === 0 ? (
          <EmptyState text="No orders yet." theme={theme} />
        ) : (
          recentOrders.map((order) => {
            const color = getStatusColor(order.status, theme);
            const itemCount = order.order_items?.length || 0;

            return (
              <TouchableOpacity
                key={order.id}
                style={s.recentCard}
                onPress={() => openOrderDetails(order.id)}
                activeOpacity={0.75}
              >
                <View style={s.recentIconWrap}>
                  <Ionicons name="cart" size={18} color={theme.primaryLight} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.recentName}>{getFullName(order.profiles)}</Text>
                  <Text style={s.recentSub}>
                    {itemCount} item{itemCount !== 1 ? 's' : ''} ·{' '}
                    {formatCurrency(order.total_amount)}
                  </Text>
                </View>

                <StatusBadge
                  label={formatStatus(order.status)}
                  color={color}
                  theme={theme}
                />
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function QuickAction({ icon, label, theme, onPress }) {
  const s = componentStyles(theme);

  return (
    <TouchableOpacity style={s.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={s.quickIconWrap}>
        <Ionicons name={icon} size={18} color={theme.primaryLight} />
      </View>
      <Text style={s.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatCard({ icon, label, value, color, theme, onPress }) {
  const s = componentStyles(theme);
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      style={s.statCard}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={s.statTopRow}>
        <View style={[s.statIconWrap, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>

        <Text style={[s.statValue, { color }]}>{value}</Text>
      </View>

      <Text style={s.statLabel}>{label}</Text>

      {onPress && (
        <View style={s.statFooter}>
          <Text style={s.statFooterText}>Open</Text>
          <Ionicons name="arrow-forward" size={12} color={theme.textMuted} />
        </View>
      )}
    </Wrapper>
  );
}

function StatusBadge({ label, color, theme }) {
  const s = componentStyles(theme);

  return (
    <View style={[s.badge, { backgroundColor: color + '22' }]}>
      <Text style={[s.badgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EmptyState({ text, theme }) {
  const s = componentStyles(theme);

  return (
    <View style={s.emptyBox}>
      <Ionicons name="file-tray-outline" size={24} color={theme.textMuted} />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

const componentStyles = (theme) =>
  StyleSheet.create({
    quickAction: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      gap: 8,
    },
    quickIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: theme.primary + '1A',
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickLabel: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
    },

    statCard: {
      width: '48%',
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    statTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    statIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '900',
    },
    statLabel: {
      fontSize: 12,
      color: theme.textSub,
      fontWeight: '600',
    },
    statFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      gap: 4,
    },
    statFooterText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },

    badge: {
      maxWidth: 110,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginLeft: 8,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'capitalize',
    },

    emptyBox: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    emptyText: {
      fontSize: 13,
      color: theme.textMuted,
      textAlign: 'center',
    },
  });

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 120,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    loadingText: {
      color: theme.textMuted,
      marginTop: 12,
      fontSize: 13,
    },

    heroCard: {
      backgroundColor: theme.card,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14,
    },
    heroTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    heroIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.primary,
    },
    refreshButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.bg2,
    },
    refreshText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
    },
    pageTitle: {
      fontSize: 25,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 5,
    },
    pageSubtitle: {
      fontSize: 13,
      color: theme.textSub,
      lineHeight: 19,
    },
    heroDivider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 16,
    },
    heroBottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: 'flex-end',
    },
    heroSmallLabel: {
      fontSize: 11,
      color: theme.textMuted,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 3,
    },
    heroBigValue: {
      color: theme.primaryLight,
      fontSize: 30,
      fontWeight: '900',
    },
    heroRevenueBox: {
      alignItems: 'flex-end',
      flex: 1,
    },
    heroRevenue: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
    },

    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#ef444422',
      borderWidth: 1,
      borderColor: '#ef4444',
      borderRadius: 14,
      padding: 12,
      marginBottom: 14,
    },
    errorText: {
      flex: 1,
      color: '#ef4444',
      fontSize: 13,
      fontWeight: '600',
    },

    quickActions: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 18,
    },

    blockTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 10,
    },

    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 6,
    },

    revenueCard: {
      marginBottom: 22,
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.primary + '33',
    },
    revenueHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18,
    },
    revenueIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.primary,
    },
    revenueLabel: {
      fontSize: 12,
      color: theme.textSub,
      marginBottom: 5,
      fontWeight: '700',
    },
    revenueTotal: {
      fontSize: 28,
      fontWeight: '900',
      color: theme.text,
    },
    revenueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bg2,
      borderRadius: 16,
      padding: 14,
    },
    revenueItem: {
      flex: 1,
    },
    revenueItemLabel: {
      fontSize: 11,
      color: theme.textMuted,
      marginBottom: 4,
      fontWeight: '700',
    },
    revenueItemValue: {
      fontSize: 15,
      fontWeight: '900',
    },
    revenueSeparator: {
      width: 1,
      height: 36,
      backgroundColor: theme.border,
      marginHorizontal: 12,
    },

    section: {
      marginBottom: 22,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 11,
      gap: 12,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: theme.text,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    linkPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: theme.primary + '14',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    linkPillText: {
      fontSize: 11,
      color: theme.primaryLight,
      fontWeight: '900',
    },

    alertCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    alertIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },

    recentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    recentIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
      backgroundColor: theme.primary + '14',
    },
    recentName: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.text,
    },
    recentSub: {
      fontSize: 12,
      color: theme.textSub,
      marginTop: 2,
    },
  });
