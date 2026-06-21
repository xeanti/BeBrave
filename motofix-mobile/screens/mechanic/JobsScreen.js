import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const STATUS_FLOW = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

export default function JobsScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    await fetchBookings(user?.id);
  }

  async function fetchBookings(userId) {
    const id = userId || user?.id;
    if (!id) return;

    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name, phone)')
      .eq('mechanic_id', id)
      .order('booking_date', { ascending: true });

    if (!error) setBookings(data || []);
    setLoading(false);
    setRefreshing(false);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookings();
  }, [user]);

  async function updateStatus(bookingId, status) {
    setUpdatingId(bookingId);
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .eq('mechanic_id', user.id);

    if (!error) {
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status } : b)));
    }
    setUpdatingId(null);
  }

  // FIXED: Cancelled metric now computed properly inside component render
  const counts = {
    all: bookings.length,
    pending: bookings.filter((b) => b.status === 'pending').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    in_progress: bookings.filter((b) => b.status === 'in_progress').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
  };

  const filtered = bookings.filter((b) => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const customerName = `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`.toLowerCase();
    const serviceName = (b.services?.name || '').toLowerCase();
    const query = search.trim().toLowerCase();
    const matchesSearch = query === '' || customerName.includes(query) || serviceName.includes(query);
    return matchesStatus && matchesSearch;
  });

  function statusColor(status) {
    switch (status) {
      case 'confirmed': return theme.success;
      case 'pending': return theme.warning;
      case 'in_progress': return '#3b82f6';
      case 'completed': return theme.textMuted;
      case 'cancelled': return theme.danger;
      default: return theme.textMuted;
    }
  }

  const s = styles(theme);

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

      {/* Top Filter Chips */}
      <View style={s.statBarOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statBarContent}>
          {[
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'confirmed', label: 'Confirmed' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'completed', label: 'Completed' },
            { key: 'cancelled', label: 'Cancelled' }, // FIXED: Integrated Cancelled button node mapping
          ].map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[s.statChip, statusFilter === f.key && s.statChipActive]}
              onPress={() => setStatusFilter(f.key)}
            >
              <Text style={[s.statChipNum, statusFilter === f.key && s.statChipNumActive]}>
                {counts[f.key] ?? 0}
              </Text>
              <Text style={[s.statChipLabel, statusFilter === f.key && s.statChipLabelActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search Input Wrapper */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by customer or service..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Job Cards List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />}
      >
        {bookings.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔧</Text>
            <Text style={s.emptyTitle}>No bookings assigned</Text>
            <Text style={s.emptyText}>Bookings assigned to you will show up here.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>No matches</Text>
            <TouchableOpacity onPress={() => { setSearch(''); setStatusFilter('all'); }}>
              <Text style={s.clearLink}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((b) => (
            <View key={b.id} style={s.card}>
              <TouchableOpacity onPress={() => navigation.navigate('JobDetail', { booking: b })} activeOpacity={0.7}>
                <View style={s.cardHeader}>
                  <Text style={s.serviceName}>{b.services?.name || 'Service'}</Text>
                  <View style={[s.badge, { backgroundColor: statusColor(b.status) + '22' }]}>
                    <Text style={[s.badgeText, { color: statusColor(b.status) }]}>
                      {b.status?.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <Text style={s.dateText}>📅 {b.booking_date} at {b.booking_time}</Text>

                {b.profiles && (
                  <Text style={s.customerText}>
                    👤 {b.profiles.first_name} {b.profiles.last_name}
                    {b.profiles.phone ? ` · ${b.profiles.phone}` : ''}
                  </Text>
                )}

                {b.notes ? <Text style={s.notesText}>"{b.notes}"</Text> : null}
              </TouchableOpacity>

              <View style={s.divider} />

              <Text style={s.updateLabel}>Update status</Text>
              <View style={s.statusRow}>
                {STATUS_FLOW.filter((st) => st !== b.status).map((st) => (
                  <TouchableOpacity
                    key={st}
                    disabled={updatingId === b.id}
                    onPress={() => updateStatus(b.id, st)}
                    style={[s.statusBtn, { borderColor: statusColor(st) + '55' }]}
                  >
                    <Text style={[s.statusBtnText, { color: statusColor(st) }]}>
                      {st.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  statBarOuter: {
    backgroundColor: theme.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  statBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    minWidth: 80,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.bg2,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  statChipNum: { fontSize: 15, fontWeight: 'bold', color: theme.text, lineHeight: 18 },
  statChipNumActive: { color: '#fff' },
  statChipLabel: { fontSize: 11, color: theme.textSub, marginTop: 2, lineHeight: 14 },
  statChipLabelActive: { color: 'rgba(255,255,255,0.9)' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  searchInput: { backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text },
  card: { backgroundColor: theme.card, marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: theme.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  serviceName: { fontSize: 16, fontWeight: 'bold', color: theme.text, flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
  dateText: { fontSize: 13, color: theme.textSub, marginBottom: 4 },
  customerText: { fontSize: 13, color: theme.textSub, marginBottom: 4 },
  notesText: { fontSize: 13, color: theme.textMuted, fontStyle: 'italic', marginTop: 4 },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 12 },
  updateLabel: { fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  statusBtnText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  emptyCard: { alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: theme.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.textSub, textAlign: 'center' },
  clearLink: { fontSize: 14, color: theme.primaryLight, fontWeight: '600' },
});