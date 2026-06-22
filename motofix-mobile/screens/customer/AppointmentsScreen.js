import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, RefreshControl } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

function formatTimeSlot(time) {
  if (!time) return '—';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

export default function BookingsScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchBookings(); }, []);

  async function fetchBookings() {
    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase
      .from('bookings')
      .select('*, services(name, base_price)')
      .eq('customer_id', user?.id)
      .order('booking_date', { ascending: false });

    if (filter !== 'all') query = query.eq('status', filter);

    const { data } = await query;
    setBookings(data || []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchBookings(); }, [filter]);

  const statusColor = (status) => {
    switch (status) {
      case 'confirmed': return theme.success;
      case 'pending': return theme.warning;
      case 'cancelled': return theme.danger;
      case 'completed': return theme.primaryLight;
      default: return theme.textMuted;
    }
  };

  const filters = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

  const s = styles(theme);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bookings List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} tintColor={theme.primaryLight} />}
      >
        {bookings.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No bookings found</Text>
            <Text style={s.emptyText}>
              {filter === 'all' ? "You haven't made any bookings yet." : `No ${filter} bookings.`}
            </Text>
          </View>
        ) : (
          bookings.map((b) => (
            <TouchableOpacity key={b.id} style={s.card} activeOpacity={0.7} onPress={() => navigation.navigate('AppointmentDetail', { booking: b })}>

              {/* Status Badge */}
              <View style={s.cardHeader}>
                <Text style={s.serviceName}>{b.services?.name || 'Service'}</Text>
                <View style={[s.badge, { backgroundColor: statusColor(b.status) + '22' }]}>
                  <Text style={[s.badgeText, { color: statusColor(b.status) }]}>
                    {b.status || 'pending'}
                  </Text>
                </View>
              </View>

              <View style={s.divider} />

              {/* Details */}
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>📅 Date</Text>
                <Text style={s.detailValue}>{b.booking_date || '—'}</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>🕐 Time</Text>
                <Text style={s.detailValue}>{formatTimeSlot(b.booking_time)}</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>💰 Total</Text>
                <Text style={[s.detailValue, { color: theme.primaryLight, fontWeight: 'bold' }]}>
                  ₱{b.total_amount || b.services?.base_price || '—'}
                </Text>
              </View>
              {b.notes ? (
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>📝 Notes</Text>
                  <Text style={s.detailValue}>{b.notes}</Text>
                </View>
              ) : null}

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
  filterBar: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: theme.border },
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterText: { color: theme.textSub, fontSize: 13, fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: theme.card, marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: theme.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  serviceName: { fontSize: 16, fontWeight: 'bold', color: theme.text, flex: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' },
  divider: { height: 1, backgroundColor: theme.border, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailLabel: { fontSize: 13, color: theme.textMuted },
  detailValue: { fontSize: 13, color: theme.text, maxWidth: '60%', textAlign: 'right' },
  emptyCard: { alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: theme.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.textSub, textAlign: 'center' },
});