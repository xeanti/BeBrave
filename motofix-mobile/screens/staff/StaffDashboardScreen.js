import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';
const LOW_STOCK_LIMIT = 5;

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function formatTime(value) {
  if (!value) return '—';

  const clean = String(value).slice(0, 5);
  const [h, m = '00'] = clean.split(':');
  const hour = Number(h);

  if (Number.isNaN(hour)) return clean;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getCustomerName(record) {
  const profile = record?.profiles || record?.customer || {};
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  return name || profile?.email || 'Customer';
}

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isOpenBooking(status) {
  return [
    'pending',
    'confirmed',
    'in_progress',
    'inspection',
    'repairing',
    'quality_check',
    'ready_for_pickup',
  ].includes(String(status || '').toLowerCase());
}

function isPendingOrder(status) {
  return ['pending', 'processing', 'confirmed'].includes(
    String(status || '').toLowerCase()
  );
}

export default function StaffDashboardScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [lowStockParts, setLowStockParts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [errors, setErrors] = useState([]);

  const today = todayISO();

  useEffect(() => {
    navigation?.setOptions?.({
      title: 'Staff Dashboard',
      headerBackTitle: 'Back',
    });
  }, [navigation]);

  const fetchBookings = useCallback(async () => {
    let { data, error } = await supabase
      .from('bookings')
      .select(
        `
        id,
        status,
        booking_date,
        booking_time,
        total_amount,
        is_walkin,
        created_at,
        profiles!bookings_customer_id_fkey (
          first_name,
          last_name,
          email
        ),
        services (
          name
        )
      `
      )
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true })
      .limit(20);

    if (error) {
      console.log('Staff dashboard booking nested query failed:', error.message);

      const fallback = await supabase
        .from('bookings')
        .select('id, status, booking_date, booking_time, total_amount, is_walkin, created_at')
        .gte('booking_date', today)
        .order('booking_date', { ascending: true })
        .order('booking_time', { ascending: true })
        .limit(20);

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      throw new Error(`Bookings: ${error.message}`);
    }

    setBookings(data || []);
  }, [today]);

  const fetchOrders = useCallback(async () => {
    let { data, error } = await supabase
      .from('orders')
      .select(
        `
        id,
        status,
        total_amount,
        payment_status,
        is_walkin,
        created_at,
        profiles!orders_customer_id_fkey (
          first_name,
          last_name,
          email
        )
      `
      )
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.log('Staff dashboard order nested query failed:', error.message);

      const fallback = await supabase
        .from('orders')
        .select('id, status, total_amount, payment_status, is_walkin, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      throw new Error(`Orders: ${error.message}`);
    }

    setOrders(data || []);
  }, []);

  const fetchPayments = useCallback(async () => {
    let { data, error } = await supabase
      .from('payments')
      .select('id, amount, payment_type, method, receipt_number, created_at')
      .gte('created_at', `${today}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      throw new Error(`Payments: ${error.message}`);
    }

    setPayments(data || []);
  }, [today]);

  const fetchLowStockParts = useCallback(async () => {
    let { data, error } = await supabase
      .from('parts')
      .select('id, name, category, stock_quantity, price, is_active')
      .eq('is_active', true)
      .lte('stock_quantity', LOW_STOCK_LIMIT)
      .order('stock_quantity', { ascending: true })
      .limit(15);

    if (error) {
      const fallback = await supabase
        .from('parts')
        .select('id, name, category, stock_quantity, price')
        .lte('stock_quantity', LOW_STOCK_LIMIT)
        .order('stock_quantity', { ascending: true })
        .limit(15);

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      throw new Error(`Low stock: ${error.message}`);
    }

    setLowStockParts(data || []);
  }, []);

  const fetchMovements = useCallback(async () => {
    let { data, error } = await supabase
      .from('inventory_movements')
      .select(
        `
        id,
        movement_type,
        quantity,
        reason,
        created_at,
        parts (
          name
        )
      `
      )
      .order('created_at', { ascending: false })
      .limit(8);

    if (error) {
      console.log('Staff dashboard movements nested query failed:', error.message);

      const fallback = await supabase
        .from('inventory_movements')
        .select('id, movement_type, quantity, reason, created_at, part_id')
        .order('created_at', { ascending: false })
        .limit(8);

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      setMovements([]);
      return;
    }

    setMovements(data || []);
  }, []);

  const fetchDashboard = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      setErrors([]);

      const nextErrors = [];

      await Promise.allSettled([
        fetchBookings().catch((error) => nextErrors.push(error.message)),
        fetchOrders().catch((error) => nextErrors.push(error.message)),
        fetchPayments().catch((error) => nextErrors.push(error.message)),
        fetchLowStockParts().catch((error) => nextErrors.push(error.message)),
        fetchMovements().catch((error) => nextErrors.push(error.message)),
      ]);

      setErrors(nextErrors);
      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
    },
    [fetchBookings, fetchLowStockParts, fetchMovements, fetchOrders, fetchPayments]
  );

  useEffect(() => {
    fetchDashboard(true);

    const tables = ['bookings', 'orders', 'payments', 'parts', 'inventory_movements'];

    const channels = tables.map((table) =>
      supabase
        .channel(`mobile-staff-dashboard-${table}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          () => fetchDashboard(false)
        )
        .subscribe()
    );

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [fetchDashboard]);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard(false);
    }, [fetchDashboard])
  );

  function onRefresh() {
    setRefreshing(true);
    fetchDashboard(false);
  }

  const stats = useMemo(() => {
    const todayBookings = bookings.filter((item) => item.booking_date === today);
    const activeBookings = bookings.filter((item) => isOpenBooking(item.status));
    const pendingOrders = orders.filter((item) => isPendingOrder(item.status));
    const paymentTotal = payments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0
    );
    const walkInBookings = bookings.filter((item) => item.is_walkin).length;
    const walkInOrders = orders.filter((item) => item.is_walkin).length;

    return {
      todayBookings: todayBookings.length,
      activeBookings: activeBookings.length,
      pendingOrders: pendingOrders.length,
      lowStock: lowStockParts.length,
      paymentTotal,
      walkIns: walkInBookings + walkInOrders,
    };
  }, [bookings, lowStockParts.length, orders, payments, today]);

  async function shareSummary() {
    const lines = [
      'MotoFix Staff Dashboard',
      `Updated: ${lastUpdated ? formatDateTime(lastUpdated) : '—'}`,
      `Today’s Bookings: ${stats.todayBookings}`,
      `Active Bookings: ${stats.activeBookings}`,
      `Pending Orders: ${stats.pendingOrders}`,
      `Today's Payments: ${formatPeso(stats.paymentTotal)}`,
      `Low Stock Parts: ${stats.lowStock}`,
      `Walk-ins: ${stats.walkIns}`,
    ];

    try {
      await Share.share({ message: lines.join('\n') });
    } catch (error) {
      console.log('Share staff dashboard failed:', error.message);
    }
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight || YELLOW} />
        <Text style={s.loadingText}>Loading staff dashboard...</Text>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight || YELLOW}
            colors={[theme.primaryLight || YELLOW]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerCard}>
          <View style={s.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>MotoFix Staff</Text>
              <Text style={s.title}>Staff Dashboard</Text>
              <Text style={s.subtitle}>
                Track walk-ins, payments, pending orders, service activity, and inventory alerts.
              </Text>
            </View>

            <TouchableOpacity style={s.shareBtn} onPress={shareSummary}>
              <Ionicons name="share-social-outline" size={19} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={s.liveBox}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>
              Live updates active
              {lastUpdated ? ` · ${formatDateTime(lastUpdated)}` : ''}
            </Text>
          </View>
        </View>

        {errors.length > 0 && (
          <View style={s.errorBox}>
            <Ionicons name="warning-outline" size={18} color={theme.warning || YELLOW} />
            <View style={{ flex: 1 }}>
              <Text style={s.errorTitle}>Some dashboard data could not load</Text>
              {errors.slice(0, 3).map((error) => (
                <Text key={error} style={s.errorText}>
                  {error}
                </Text>
              ))}
            </View>
          </View>
        )}

        <View style={s.statsGrid}>
          <StatCard
            theme={theme}
            label="Today’s Bookings"
            value={stats.todayBookings}
            icon="calendar"
          />
          <StatCard
            theme={theme}
            label="Active Jobs"
            value={stats.activeBookings}
            icon="build"
            tone="blue"
          />
          <StatCard
            theme={theme}
            label="Pending Orders"
            value={stats.pendingOrders}
            icon="cart"
            tone="yellow"
          />
          <StatCard
            theme={theme}
            label="Low Stock"
            value={stats.lowStock}
            icon="alert-circle"
            tone="red"
          />
          <StatCard
            theme={theme}
            label="Today’s Payments"
            value={formatPeso(stats.paymentTotal)}
            icon="cash"
            wide
            tone="green"
          />
          <StatCard
            theme={theme}
            label="Walk-ins"
            value={stats.walkIns}
            icon="walk"
            tone="purple"
          />
        </View>

        <Text style={s.sectionTitle}>Quick Actions</Text>

        <View style={s.actionGrid}>
          <ActionCard
            theme={theme}
            icon="walk"
            title="Walk-ins"
            subtitle="Create walk-in booking"
            onPress={() => navigation.navigate('Walk-ins')}
          />
          <ActionCard
            theme={theme}
            icon="card"
            title="Payments"
            subtitle="Confirm payments"
            onPress={() => navigation.navigate('Payments')}
          />
          <ActionCard
            theme={theme}
            icon="cube"
            title="Inventory"
            subtitle="Manage parts stock"
            onPress={() => navigation.navigate('Inventory')}
          />
          <ActionCard
            theme={theme}
            icon="swap-horizontal"
            title="Movements"
            subtitle="Stock history"
            onPress={() => navigation.navigate('Inventory')}
          />
        </View>

        <SectionHeader
          theme={theme}
          title="Today & Upcoming Bookings"
          action="Open Walk-ins"
          onPress={() => navigation.navigate('Walk-ins')}
        />

        {bookings.length === 0 ? (
          <EmptyMini
            theme={theme}
            icon="calendar-outline"
            text="No upcoming bookings found."
          />
        ) : (
          bookings.slice(0, 5).map((booking) => (
            <RecordCard
              key={booking.id}
              theme={theme}
              icon="calendar"
              title={booking.services?.name || 'Service Booking'}
              subtitle={`${getCustomerName(booking)} · ${booking.booking_date || 'No date'} · ${formatTime(
                booking.booking_time
              )}`}
              meta={humanize(booking.status || 'pending')}
              metaTone={isOpenBooking(booking.status) ? 'warning' : 'muted'}
            />
          ))
        )}

        <SectionHeader
          theme={theme}
          title="Pending / Recent Orders"
          action="Open Payments"
          onPress={() => navigation.navigate('Payments')}
        />

        {orders.length === 0 ? (
          <EmptyMini
            theme={theme}
            icon="cart-outline"
            text="No recent orders found."
          />
        ) : (
          orders.slice(0, 5).map((order) => (
            <RecordCard
              key={order.id}
              theme={theme}
              icon="cart"
              title={`Order #${String(order.id).slice(0, 8).toUpperCase()}`}
              subtitle={`${getCustomerName(order)} · ${formatDateTime(order.created_at)}`}
              amount={formatPeso(order.total_amount)}
              meta={humanize(order.status || 'pending')}
              metaTone={isPendingOrder(order.status) ? 'warning' : 'muted'}
            />
          ))
        )}

        <SectionHeader
          theme={theme}
          title="Low Stock Parts"
          action="Open Inventory"
          onPress={() => navigation.navigate('Inventory')}
        />

        {lowStockParts.length === 0 ? (
          <EmptyMini
            theme={theme}
            icon="checkmark-circle-outline"
            text="No low-stock parts right now."
          />
        ) : (
          lowStockParts.slice(0, 6).map((part) => (
            <RecordCard
              key={part.id}
              theme={theme}
              icon="alert-circle"
              title={part.name || 'Part'}
              subtitle={part.category || 'General'}
              amount={`${Number(part.stock_quantity) || 0} left`}
              meta={formatPeso(part.price)}
              metaTone={Number(part.stock_quantity) <= 2 ? 'danger' : 'warning'}
            />
          ))
        )}

        <SectionHeader
          theme={theme}
          title="Recent Inventory Movements"
          action="Refresh"
          onPress={() => fetchDashboard(false)}
        />

        {movements.length === 0 ? (
          <EmptyMini
            theme={theme}
            icon="swap-horizontal-outline"
            text="No recent inventory movement found."
          />
        ) : (
          movements.slice(0, 5).map((movement) => (
            <RecordCard
              key={movement.id}
              theme={theme}
              icon="swap-horizontal"
              title={humanize(movement.movement_type || 'movement')}
              subtitle={`${movement.parts?.name || movement.part_id || 'Part'} · ${formatDateTime(
                movement.created_at
              )}`}
              amount={`${Number(movement.quantity) || 0}`}
              meta={movement.reason || 'Stock movement'}
              metaTone="muted"
            />
          ))
        )}

        <View style={{ height: 34 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({ theme, label, value, icon, tone = 'default', wide = false }) {
  const s = styles(theme);
  const colorMap = {
    default: theme.primaryLight || YELLOW,
    blue: '#60a5fa',
    green: '#22c55e',
    yellow: YELLOW,
    red: '#ef4444',
    purple: '#a855f7',
  };
  const color = colorMap[tone] || colorMap.default;

  return (
    <View style={[s.statCard, wide && s.statCardWide]}>
      <View style={[s.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <Text style={[s.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ theme, icon, title, subtitle, onPress }) {
  const s = styles(theme);

  return (
    <TouchableOpacity style={s.actionCard} onPress={onPress} activeOpacity={0.78}>
      <View style={s.actionIcon}>
        <Ionicons name={icon} size={21} color={theme.primaryLight || YELLOW} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.actionSub}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

function SectionHeader({ theme, title, action, onPress }) {
  const s = styles(theme);

  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>

      {!!action && (
        <TouchableOpacity onPress={onPress}>
          <Text style={s.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RecordCard({
  theme,
  icon,
  title,
  subtitle,
  amount,
  meta,
  metaTone = 'muted',
}) {
  const s = styles(theme);
  const toneColor =
    metaTone === 'danger'
      ? theme.danger || '#ef4444'
      : metaTone === 'warning'
        ? theme.warning || YELLOW
        : theme.textMuted;

  return (
    <View style={s.recordCard}>
      <View style={s.recordIcon}>
        <Ionicons name={icon} size={18} color={theme.primaryLight || YELLOW} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.recordTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.recordSub} numberOfLines={2}>
          {subtitle}
        </Text>

        {!!meta && (
          <Text style={[s.recordMeta, { color: toneColor }]} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>

      {!!amount && (
        <Text style={s.recordAmount} numberOfLines={1}>
          {amount}
        </Text>
      )}
    </View>
  );
}

function EmptyMini({ theme, icon, text }) {
  const s = styles(theme);

  return (
    <View style={s.emptyMini}>
      <Ionicons name={icon} size={25} color={theme.textMuted} />
      <Text style={s.emptyMiniText}>{text}</Text>
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
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    loadingText: {
      color: theme.textMuted,
      marginTop: 10,
      fontWeight: '700',
    },
    content: {
      padding: 16,
      paddingBottom: 36,
    },
    headerCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 20,
      padding: 16,
      marginBottom: 14,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    kicker: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },
    shareBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    liveBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 13,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: '#22c55e',
    },
    liveText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: (theme.warning || YELLOW) + '12',
      borderWidth: 1,
      borderColor: (theme.warning || YELLOW) + '44',
      borderRadius: 16,
      padding: 13,
      marginBottom: 14,
    },
    errorTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
      marginBottom: 3,
    },
    errorText: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
    },
    statCard: {
      width: '48%',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 17,
      padding: 13,
    },
    statCardWide: {
      width: '48%',
    },
    statIcon: {
      width: 35,
      height: 35,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 9,
    },
    statValue: {
      fontSize: 19,
      fontWeight: '900',
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 2,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      marginBottom: 10,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
    },
    sectionAction: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '900',
    },
    actionGrid: {
      gap: 10,
      marginBottom: 18,
    },
    actionCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    actionIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: (theme.primaryLight || YELLOW) + '16',
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    actionSub: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      fontWeight: '700',
    },
    recordCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 15,
      padding: 12,
      marginBottom: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    recordIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: (theme.primaryLight || YELLOW) + '14',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    recordSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      lineHeight: 16,
      fontWeight: '700',
    },
    recordMeta: {
      fontSize: 10,
      marginTop: 4,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    recordAmount: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '900',
      maxWidth: 96,
      textAlign: 'right',
    },
    emptyMini: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 15,
      padding: 18,
      alignItems: 'center',
      marginBottom: 10,
    },
    emptyMiniText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 7,
      textAlign: 'center',
    },
  });
