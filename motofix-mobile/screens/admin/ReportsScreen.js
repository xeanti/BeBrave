import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Platform,
  Share,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { fetchPaymentsFor, getPaymentInfo } from '../../lib/payments';
import { useTheme } from '../../lib/ThemeContext';

const STATUS_COLORS_KEY = {
  pending: 'warning',
  confirmed: 'success',
  in_progress: 'primaryLight',
  completed: 'textMuted',
  cancelled: 'danger',
  preparing: 'primaryLight',
  ready: 'success',
};

function displayDate(d) {
  if (!d) return 'Any';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReportsScreen() {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [activeTab, setActiveTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookingPayments, setBookingPayments] = useState({});
  const [orderPayments, setOrderPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function sortRows(rows, accessors) {
    if (!sortField || !accessors[sortField]) return rows;
    const getValue = accessors[sortField];
    const sorted = [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = useCallback(async () => {
    const [b, o] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          '*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name, email), mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('*, profiles!orders_customer_id_fkey(first_name, last_name, email), order_items(quantity, unit_price, subtotal, parts(name))')
        .order('created_at', { ascending: false }),
    ]);

    const bData = b.data || [];
    const oData = o.data || [];
    setBookings(bData);
    setOrders(oData);

    if (bData.length) {
      const allBP = await fetchPaymentsFor({ bookingIds: bData.map((x) => x.id) });
      const grouped = {};
      allBP.forEach((p) => {
        if (!grouped[p.booking_id]) grouped[p.booking_id] = [];
        grouped[p.booking_id].push(p);
      });
      setBookingPayments(grouped);
    } else {
      setBookingPayments({});
    }

    if (oData.length) {
      const allOP = await fetchPaymentsFor({ orderIds: oData.map((x) => x.id) });
      const grouped = {};
      allOP.forEach((p) => {
        if (!grouped[p.order_id]) grouped[p.order_id] = [];
        grouped[p.order_id].push(p);
      });
      setOrderPayments(grouped);
    } else {
      setOrderPayments({});
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  function onRefresh() {
    setRefreshing(true);
    fetchAll();
  }

  function filterByDate(items, dateField) {
    return items.filter((item) => {
      const raw = item[dateField] || item.created_at;
      const date = new Date(raw);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (date > end) return false;
      }
      return true;
    });
  }

  function filterBySearch(items, type) {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const customerName = `${item.profiles?.first_name || ''} ${item.profiles?.last_name || ''}`.toLowerCase();
      const email = (item.profiles?.email || '').toLowerCase();
      const status = (item.status || '').toLowerCase();
      const id = item.id?.slice(0, 8).toLowerCase() || '';
      if (customerName.includes(q) || email.includes(q) || status.includes(q) || id.includes(q)) {
        return true;
      }
      if (type === 'bookings') {
        const serviceName = (item.services?.name || '').toLowerCase();
        const mechanicName = item.mechanic
          ? `${item.mechanic.first_name} ${item.mechanic.last_name}`.toLowerCase()
          : '';
        return serviceName.includes(q) || mechanicName.includes(q);
      }
      if (type === 'orders') {
        const itemNames = (item.order_items || [])
          .map((oi) => oi.parts?.name?.toLowerCase() || '')
          .join(' ');
        return itemNames.includes(q);
      }
      return false;
    });
  }

  const bookingAccessors = {
    customer: (b) => `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`.trim(),
    service: (b) => b.services?.name || '',
    date: (b) => b.booking_date || '',
    mechanic: (b) => (b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : 'Unassigned'),
    status: (b) => b.status || '',
    total: (b) => (b.services?.base_price || 0) + (b.services?.labor_cost || 0),
    paid: (b) => getPaymentInfo(bookingPayments, b.id, (b.services?.base_price || 0) + (b.services?.labor_cost || 0)).totalPaid,
    balance: (b) => getPaymentInfo(bookingPayments, b.id, (b.services?.base_price || 0) + (b.services?.labor_cost || 0)).balance,
  };

  const orderAccessors = {
    customer: (o) => `${o.profiles?.first_name || ''} ${o.profiles?.last_name || ''}`.trim(),
    total: (o) => o.total_amount || 0,
    paid: (o) => getPaymentInfo(orderPayments, o.id, o.total_amount || 0).totalPaid,
    balance: (o) => getPaymentInfo(orderPayments, o.id, o.total_amount || 0).balance,
    status: (o) => o.status || '',
    date: (o) => o.created_at || '',
  };

  const filteredBookings = sortRows(filterBySearch(filterByDate(bookings, 'booking_date'), 'bookings'), bookingAccessors);
  const filteredOrders = sortRows(filterBySearch(filterByDate(orders, 'created_at'), 'orders'), orderAccessors);

  const bookingRevenue = filteredBookings
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => {
      const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
      return sum + getPaymentInfo(bookingPayments, b.id, total).totalPaid;
    }, 0);

  const orderRevenue = filteredOrders
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + getPaymentInfo(orderPayments, o.id, o.total_amount || 0).totalPaid, 0);

  function clearDates() {
    setDateFrom(null);
    setDateTo(null);
  }

  function onChangeFrom(event, selected) {
    if (Platform.OS === 'android') setShowFromPicker(false);
    if (selected) setDateFrom(selected);
  }

  function onChangeTo(event, selected) {
    if (Platform.OS === 'android') setShowToPicker(false);
    if (selected) setDateTo(selected);
  }

  async function handleExport() {
    let csv = '';
    if (activeTab === 'bookings') {
      const headers = ['ID', 'Customer', 'Service', 'Date', 'Time', 'Mechanic', 'Status', 'Total', 'Paid', 'Balance'];
      const rows = filteredBookings.map((b) => {
        const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
        const info = getPaymentInfo(bookingPayments, b.id, total);
        return [
          b.id.slice(0, 8),
          `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`,
          b.services?.name || '',
          b.booking_date,
          b.booking_time,
          b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : 'Unassigned',
          b.status,
          total.toFixed(2),
          info.totalPaid.toFixed(2),
          info.balance.toFixed(2),
        ].join(',');
      });
      csv = [headers.join(','), ...rows].join('\n');
    } else {
      const headers = ['ID', 'Customer', 'Total', 'Paid', 'Balance', 'Status', 'Date'];
      const rows = filteredOrders.map((o) => {
        const info = getPaymentInfo(orderPayments, o.id, o.total_amount || 0);
        return [
          o.id.slice(0, 8),
          `${o.profiles?.first_name || ''} ${o.profiles?.last_name || ''}`,
          (o.total_amount || 0).toFixed(2),
          info.totalPaid.toFixed(2),
          info.balance.toFixed(2),
          o.status,
          new Date(o.created_at).toLocaleDateString(),
        ].join(',');
      });
      csv = [headers.join(','), ...rows].join('\n');
    }

    try {
      await Share.share({
        message: csv,
        title: `${activeTab}-report.csv`,
      });

      const { data: auth } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        action: 'EXPORT_CSV',
        entity: activeTab === 'bookings' ? 'bookings-report.csv' : 'orders-report.csv',
        performed_by: auth?.user?.id,
        details: { rows: activeTab === 'bookings' ? filteredBookings.length : filteredOrders.length },
      });
    } catch (err) {
      console.log('Export error:', err);
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />}
      >
        <Text style={s.title}>Reports & Analytics</Text>
        <Text style={s.subtitle}>Shop performance, revenue, and transaction summaries.</Text>

        {/* Search */}
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search by customer, service, status, ID..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Date filter */}
        <View style={s.filterRow}>
          <TouchableOpacity style={s.dateChip} onPress={() => setShowFromPicker(true)}>
            <Text style={s.dateChipLabel}>From</Text>
            <Text style={s.dateChipValue}>{displayDate(dateFrom)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dateChip} onPress={() => setShowToPicker(true)}>
            <Text style={s.dateChipLabel}>To</Text>
            <Text style={s.dateChipValue}>{displayDate(dateTo)}</Text>
          </TouchableOpacity>
          {(dateFrom || dateTo) && (
            <TouchableOpacity style={s.clearBtn} onPress={clearDates}>
              <Text style={s.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {showFromPicker && (
          <DateTimePicker
            value={dateFrom || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeFrom}
            themeVariant={isDark ? 'dark' : 'light'}
            accentColor={theme.primary}
          />
        )}
        {showToPicker && (
          <DateTimePicker
            value={dateTo || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onChangeTo}
            themeVariant={isDark ? 'dark' : 'light'}
            accentColor={theme.primary}
          />
        )}
        {Platform.OS === 'ios' && (showFromPicker || showToPicker) && (
          <TouchableOpacity
            style={s.dateDoneBtn}
            onPress={() => {
              setShowFromPicker(false);
              setShowToPicker(false);
            }}
          >
            <Text style={s.dateDoneBtnText}>Done</Text>
          </TouchableOpacity>
        )}

        {/* Summary cards */}
        <View style={s.summaryGrid}>
          <SummaryCard theme={theme} label="Total Bookings" value={filteredBookings.length} color={theme.primaryLight} />
          <SummaryCard
            theme={theme}
            label="Completed"
            value={filteredBookings.filter((b) => b.status === 'completed').length}
            color={theme.success}
          />
          <SummaryCard theme={theme} label="Total Orders" value={filteredOrders.length} color={theme.primaryLight} />
          <SummaryCard
            theme={theme}
            label="Collected Revenue"
            value={`₱${(bookingRevenue + orderRevenue).toFixed(2)}`}
            color={theme.accent}
          />
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === 'bookings' && s.tabBtnActive]}
            onPress={() => { setActiveTab('bookings'); setSortField(null); setSortDirection('asc'); }}
          >
            <Text style={[s.tabBtnText, activeTab === 'bookings' && s.tabBtnTextActive]}>
              Bookings ({filteredBookings.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, activeTab === 'orders' && s.tabBtnActive]}
            onPress={() => { setActiveTab('orders'); setSortField(null); setSortDirection('asc'); }}
          >
            <Text style={[s.tabBtnText, activeTab === 'orders' && s.tabBtnTextActive]}>
              Orders ({filteredOrders.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.exportBtn} onPress={handleExport}>
            <Text style={s.exportBtnText}>⬇ Export</Text>
          </TouchableOpacity>
        </View>

        {/* Sort chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sortRow}>
          {(activeTab === 'bookings'
            ? [
                { key: 'customer', label: 'Customer' },
                { key: 'service', label: 'Service' },
                { key: 'date', label: 'Date' },
                { key: 'mechanic', label: 'Mechanic' },
                { key: 'status', label: 'Status' },
                { key: 'total', label: 'Total' },
                { key: 'paid', label: 'Paid' },
                { key: 'balance', label: 'Balance' },
              ]
            : [
                { key: 'customer', label: 'Customer' },
                { key: 'total', label: 'Total' },
                { key: 'paid', label: 'Paid' },
                { key: 'balance', label: 'Balance' },
                { key: 'status', label: 'Status' },
                { key: 'date', label: 'Date' },
              ]
          ).map((opt) => {
            const isActive = sortField === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[s.sortChip, isActive && s.sortChipActive]}
                onPress={() => handleSort(opt.key)}
              >
                <Text style={[s.sortChipText, isActive && s.sortChipTextActive]}>
                  {opt.label} {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Bookings list */}
        {activeTab === 'bookings' &&
          (filteredBookings.length === 0 ? (
            <EmptyState theme={theme} text="No bookings found for this range." />
          ) : (
            filteredBookings.map((b) => {
              const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
              const info = getPaymentInfo(bookingPayments, b.id, total);
              const colorKey = STATUS_COLORS_KEY[b.status] || 'textMuted';
              return (
                <View key={b.id} style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardName} numberOfLines={1}>
                      {b.profiles?.first_name} {b.profiles?.last_name}
                    </Text>
                    <View style={[s.badge, { backgroundColor: theme[colorKey] + '22' }]}>
                      <Text style={[s.badgeText, { color: theme[colorKey] }]}>{b.status?.replace('_', ' ')}</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub}>{b.services?.name || 'Service'}</Text>
                  <Text style={s.cardMeta}>
                    📅 {b.booking_date} · {b.booking_time}
                  </Text>
                  <Text style={s.cardMeta}>
                    🔧 {b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : 'Unassigned'}
                  </Text>

                  <View style={s.divider} />

                  <View style={s.moneyRow}>
                    <View>
                      <Text style={s.moneyLabel}>Total</Text>
                      <Text style={s.moneyValue}>₱{total.toFixed(2)}</Text>
                    </View>
                    <View>
                      <Text style={s.moneyLabel}>Paid</Text>
                      <Text style={[s.moneyValue, { color: theme.success }]}>₱{info.totalPaid.toFixed(2)}</Text>
                    </View>
                    <View>
                      <Text style={s.moneyLabel}>{info.isFullyPaid ? 'Status' : 'Balance'}</Text>
                      {info.isFullyPaid ? (
                        <Text style={[s.moneyValue, { color: theme.success }]}>✓ Paid</Text>
                      ) : (
                        <Text style={[s.moneyValue, { color: theme.warning }]}>₱{info.balance.toFixed(2)}</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          ))}

        {/* Orders list */}
        {activeTab === 'orders' &&
          (filteredOrders.length === 0 ? (
            <EmptyState theme={theme} text="No orders found for this range." />
          ) : (
            filteredOrders.map((o) => {
              const info = getPaymentInfo(orderPayments, o.id, o.total_amount || 0);
              const colorKey = STATUS_COLORS_KEY[o.status] || 'textMuted';
              return (
                <View key={o.id} style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardName} numberOfLines={1}>
                      {o.profiles?.first_name} {o.profiles?.last_name}
                    </Text>
                    <View style={[s.badge, { backgroundColor: theme[colorKey] + '22' }]}>
                      <Text style={[s.badgeText, { color: theme[colorKey] }]}>{o.status?.replace('_', ' ')}</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub}>
                    {o.order_items?.length || 0} item{o.order_items?.length !== 1 ? 's' : ''} · #{o.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text style={s.cardMeta}>📅 {new Date(o.created_at).toLocaleDateString()}</Text>

                  <View style={s.divider} />

                  <View style={s.moneyRow}>
                    <View>
                      <Text style={s.moneyLabel}>Total</Text>
                      <Text style={s.moneyValue}>₱{Number(o.total_amount || 0).toFixed(2)}</Text>
                    </View>
                    <View>
                      <Text style={s.moneyLabel}>Paid</Text>
                      <Text style={[s.moneyValue, { color: theme.success }]}>₱{info.totalPaid.toFixed(2)}</Text>
                    </View>
                    <View>
                      <Text style={s.moneyLabel}>{info.isFullyPaid ? 'Status' : 'Balance'}</Text>
                      {info.isFullyPaid ? (
                        <Text style={[s.moneyValue, { color: theme.success }]}>✓ Paid</Text>
                      ) : (
                        <Text style={[s.moneyValue, { color: theme.warning }]}>₱{info.balance.toFixed(2)}</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function SummaryCard({ theme, label, value, color }) {
  return (
    <View style={{ width: '48%', backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function EmptyState({ theme, text }) {
  return (
    <View style={{ alignItems: 'center', padding: 40 }}>
      <Text style={{ fontSize: 36, marginBottom: 10 }}>📊</Text>
      <Text style={{ color: theme.textSub, fontSize: 14, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    content: { padding: 16, paddingBottom: 24 },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.text, marginBottom: 2 },
    subtitle: { fontSize: 13, color: theme.textSub, marginBottom: 16 },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
      height: 44,
    },
    searchIcon: { fontSize: 14, marginRight: 8, opacity: 0.6 },
    searchInput: { flex: 1, color: theme.text, fontSize: 14, height: '100%' },
    searchClear: { color: theme.textSub, fontSize: 14, fontWeight: 'bold', paddingHorizontal: 6 },

    filterRow: { flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'center' },
    dateChip: { flex: 1, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    dateChipLabel: { fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    dateChipValue: { fontSize: 13, color: theme.text, fontWeight: '600', marginTop: 2 },
    clearBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.bg3, justifyContent: 'center', alignItems: 'center' },
    clearBtnText: { color: theme.textSub, fontSize: 14, fontWeight: 'bold' },
    dateDoneBtn: { alignSelf: 'flex-end', backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16 },
    dateDoneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 6 },

    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'center' },
    tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
    tabBtnActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    tabBtnText: { fontSize: 12, color: theme.textSub, fontWeight: '600' },
    tabBtnTextActive: { color: '#fff' },
    exportBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.bg3 },
    exportBtnText: { fontSize: 12, color: theme.text, fontWeight: '600' },

    sortRow: { marginBottom: 14 },
    sortChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, marginRight: 8 },
    sortChipActive: { backgroundColor: theme.primary + '22', borderColor: theme.primary },
    sortChipText: { fontSize: 12, color: theme.textSub, fontWeight: '500' },
    sortChipTextActive: { color: theme.primaryLight, fontWeight: 'bold' },

    card: { backgroundColor: theme.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardName: { fontSize: 15, fontWeight: 'bold', color: theme.text, flex: 1, marginRight: 8 },
    cardSub: { fontSize: 13, color: theme.primaryLight, marginBottom: 4 },
    cardMeta: { fontSize: 12, color: theme.textSub, marginBottom: 2 },
    badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
    divider: { height: 1, backgroundColor: theme.border, marginVertical: 10 },
    moneyRow: { flexDirection: 'row', justifyContent: 'space-between' },
    moneyLabel: { fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    moneyValue: { fontSize: 14, fontWeight: 'bold', color: theme.text },
  });