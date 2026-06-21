import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const STATUS_COLORS = {
  pending: '#eab308',
  confirmed: '#22c55e',
  in_progress: '#3b82f6',
  completed: '#9ca3af',
  cancelled: '#ef4444',
};

export default function JobsScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => { fetchBookings(); }, []);

  async function fetchBookings() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name, base_price), profiles!bookings_customer_id_fkey(first_name, last_name, phone)')
      .eq('mechanic_id', user.id)
      .order('booking_date', { ascending: true });
    setBookings(data || []);
    setLoading(false);
    setRefreshing(false);
  }

  async function updateStatus(id, status) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .eq('mechanic_id', user.id);
    fetchBookings();
  }

  const counts = {
    all: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  };

  const filtered = bookings.filter(b => {
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    const customerName = `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`.toLowerCase();
    const serviceName = (b.services?.name || '').toLowerCase();
    const q = search.trim().toLowerCase();
    const matchSearch = q === '' || customerName.includes(q) || serviceName.includes(q);
    return matchStatus && matchSearch;
  });

  const s = styles(theme);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Stats row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsRow} contentContainerStyle={s.statsContent}>
        {[
          { key: 'all', label: 'All', count: counts.all, color: theme.text },
          { key: 'pending', label: 'Pending', count: counts.pending, color: STATUS_COLORS.pending },
          { key: 'confirmed', label: 'Confirmed', count: counts.confirmed, color: STATUS_COLORS.confirmed },
          { key: 'in_progress', label: 'In Progress', count: counts.in_progress, color: STATUS_COLORS.in_progress },
          { key: 'completed', label: 'Done', count: counts.completed, color: STATUS_COLORS.completed },
        ].map(item => (
          <TouchableOpacity
            key={item.key}
            style={[s.statChip, statusFilter === item.key && s.statChipActive]}
            onPress={() => setStatusFilter(item.key)}
          >
            <Text style={[s.statCount, { color: item.color }]}>{item.count}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by customer or service..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={s.searchClear}>
            <Text style={{ color: theme.textMuted, fontSize: 14 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} tintColor={theme.primaryLight} />}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>No jobs found</Text>
            <Text style={s.emptyText}>
              {bookings.length === 0 ? 'No bookings assigned to you yet.' : 'Try adjusting your filters.'}
            </Text>
          </View>
        ) : (
          filtered.map(b => (
            <TouchableOpacity
              key={b.id}
              style={s.card}
              onPress={() => navigation.navigate('Job Detail', { booking: b, onUpdate: fetchBookings })}
              activeOpacity={0.8}
            >
              {/* Header */}
              <View style={s.cardHeader}>
                <Text style={s.serviceName} numberOfLines={1}>{b.services?.name || 'Service'}</Text>
                <View style={[s.badge, { backgroundColor: STATUS_COLORS[b.status] + '22' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLORS[b.status] }]}>
                    {b.status?.replace('_', ' ')}
                  </Text>
                </View>
              </View>

              <View style={s.divider} />

              {/* Details */}
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>📅 Date</Text>
                <Text style={s.detailValue}>{b.booking_date}</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>🕐 Time</Text>
                <Text style={s.detailValue}>{b.booking_time?.slice(0, 5) || '—'}</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>👤 Customer</Text>
                <Text style={s.detailValue}>{b.profiles?.first_name} {b.profiles?.last_name}</Text>
              </View>
              {b.profiles?.phone && (
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>📞 Phone</Text>
                  <Text style={s.detailValue}>{b.profiles.phone}</Text>
                </View>
              )}
              {b.notes && (
                <View style={[s.detailRow, { alignItems: 'flex-start' }]}>
                  <Text style={s.detailLabel}>📝 Notes</Text>
                  <Text style={[s.detailValue, { flex: 1, textAlign: 'right' }]}>{b.notes}</Text>
                </View>
              )}

              {/* Quick status update */}
              <View style={s.actionRow}>
                {['confirmed', 'in_progress', 'completed'].filter(s => s !== b.status).map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[s.actionBtn, { backgroundColor: STATUS_COLORS[st] + '22', borderColor: STATUS_COLORS[st] + '55' }]}
                    onPress={(e) => { e.stopPropagation?.(); updateStatus(b.id, st); }}
                  >
                    <Text style={[s.actionBtnText, { color: STATUS_COLORS[st] }]}>
                      {st === 'in_progress' ? 'Start' : st === 'completed' ? 'Complete' : 'Confirm'}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={s.detailBtn} onPress={() => navigation.navigate('Job Detail', { booking: b, onUpdate: fetchBookings })}>
                  <Text style={s.detailBtnText}>Details →</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
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
  statsRow: { maxHeight: 80, borderBottomWidth: 1, borderBottomColor: theme.border },
  statsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  statChip: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, minWidth: 70 },
  statChipActive: { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
  statCount: { fontSize: 18, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: theme.bg2, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: theme.text },
  searchClear: { padding: 4 },
  card: { backgroundColor: theme.card, marginHorizontal: 12, marginTop: 10, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  serviceName: { fontSize: 16, fontWeight: 'bold', color: theme.text, flex: 1, marginRight: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
  divider: { height: 1, backgroundColor: theme.border, marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailLabel: { fontSize: 13, color: theme.textMuted },
  detailValue: { fontSize: 13, color: theme.text, fontWeight: '500' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' },
  detailBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6 },
  detailBtnText: { fontSize: 12, color: theme.primaryLight, fontWeight: '600' },
  emptyCard: { alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: theme.textSub, textAlign: 'center' },
});