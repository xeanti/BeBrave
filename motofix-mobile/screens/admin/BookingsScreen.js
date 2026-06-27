import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, TextInput,
  Modal, Image, FlatList
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const STATUS_COLORS = {
  pending: '#eab308',
  confirmed: '#22c55e',
  in_progress: '#3b82f6',
  completed: '#9ca3af',
  cancelled: '#ef4444',
};

const ALL_STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const FILTER_KEYS = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

function formatStatus(status) {
  if (!status) return '—';
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function AdminBookingsScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [statusModal, setStatusModal] = useState(null);
  const [mechanicModal, setMechanicModal] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [b, m] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name, email), mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name, profile_photo_url)')
        .order('booking_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, first_name, last_name, profile_photo_url')
        .eq('role', 'mechanic'),
    ]);
    setBookings(b.data || []);
    setMechanics(m.data || []);
    setLoading(false);
    setRefreshing(false);
  }

  async function updateStatus(id, status) {
    await supabase.from('bookings').update({ status }).eq('id', id);
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    setStatusModal(null);
  }

  async function assignMechanic(bookingId, mechanicId) {
    await supabase.from('bookings').update({ mechanic_id: mechanicId || null }).eq('id', bookingId);
    const mechanic = mechanics.find(m => m.id === mechanicId) || null;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, mechanic_id: mechanicId, mechanic } : b));
    setMechanicModal(null);
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
    const matchStatus = filter === 'all' || b.status === filter;
    const fullName = `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`.toLowerCase();
    const matchSearch = search.trim() === '' || fullName.includes(search.trim().toLowerCase());
    return matchStatus && matchSearch;
  });

  const s = styles(theme);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  const renderCard = ({ item: b }) => {
    const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.customerName}>
              {b.profiles?.first_name} {b.profiles?.last_name}
            </Text>
            <Text style={s.customerEmail}>{b.profiles?.email}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: STATUS_COLORS[b.status] + '22' }]}>
            <Text style={[s.badgeText, { color: STATUS_COLORS[b.status] }]}>
              {formatStatus(b.status)}
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        <InfoRow label="🔧 Service" value={b.services?.name || '—'} theme={theme} />
        <InfoRow label="📅 Date" value={b.booking_date || '—'} theme={theme} />
        <InfoRow label="🕐 Time" value={b.booking_time?.slice(0, 5) || '—'} theme={theme} />
        <InfoRow label="💰 Total" value={`₱${total.toFixed(2)}`} theme={theme} highlight />

        {b.notes ? (
          <View style={s.notesBox}>
            <Text style={s.notesText}>"{b.notes}"</Text>
          </View>
        ) : null}

        <View style={s.divider} />

        <View style={s.actionBlock}>
          <Text style={s.actionLabel}>👨‍🔧 Mechanic</Text>
          <TouchableOpacity style={s.pickerBtn} onPress={() => setMechanicModal(b.id)}>
            {b.mechanic?.profile_photo_url ? (
              <Image source={{ uri: b.mechanic.profile_photo_url }} style={s.mechanicAvatar} />
            ) : b.mechanic ? (
              <View style={s.mechanicAvatarFallback}>
                <Text style={s.mechanicAvatarInitials}>
                  {(b.mechanic.first_name?.[0] || '') + (b.mechanic.last_name?.[0] || '')}
                </Text>
              </View>
            ) : null}
            <Text style={s.pickerBtnText} numberOfLines={1}>
              {b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : 'Unassigned'}
            </Text>
            <Text style={s.chevron}>▾</Text>
          </TouchableOpacity>
        </View>

        <View style={s.actionBlock}>
          <Text style={s.actionLabel}>⚡ Status</Text>
          <TouchableOpacity style={s.pickerBtn} onPress={() => setStatusModal(b.id)}>
            <View style={[s.statusDot, { backgroundColor: STATUS_COLORS[b.status] }]} />
            <Text style={[s.pickerBtnText, { color: STATUS_COLORS[b.status] }]}>
              {formatStatus(b.status)}
            </Text>
            <Text style={s.chevron}>▾</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.pickerBtn, { marginTop: 8 }]}
          onPress={() =>
            navigation.navigate('AdminBookingDetails', {
              bookingId: b.id,
              booking: b,
            })
          }
        >
          <Text style={s.pickerBtnText}>View Details</Text>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <Text style={s.bookingId}>#{b.id?.slice(0, 8).toUpperCase()}</Text>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Filter Pills — wrapped in fixed-height View so it never expands */}
      <View style={s.filterBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterContent}
        >
          {FILTER_KEYS.map(f => (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, filter === f && s.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f === 'all' ? 'All' : formatStatus(f)} ({counts[f]})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search — fixed height, sits right below filter bar */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by customer name..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={s.searchClear}>
            <Text style={{ color: theme.textMuted }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bookings List — FlatList takes all remaining space */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderCard}
        style={s.list}
        contentContainerStyle={filtered.length === 0 ? s.listEmptyContent : s.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAll(); }}
            tintColor={theme.primaryLight}
          />
        }
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📅</Text>
            <Text style={s.emptyTitle}>No bookings found</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 40 }} />}
      />

      {/* Status Picker Modal */}
      <Modal visible={!!statusModal} transparent animationType="slide" onRequestClose={() => setStatusModal(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setStatusModal(null)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Update Status</Text>
            {ALL_STATUSES.map(st => (
              <TouchableOpacity
                key={st}
                style={[s.modalOption, { borderColor: STATUS_COLORS[st] + '44' }]}
                onPress={() => updateStatus(statusModal, st)}
              >
                <View style={[s.modalDot, { backgroundColor: STATUS_COLORS[st] }]} />
                <Text style={[s.modalOptionText, { color: STATUS_COLORS[st] }]}>
                  {formatStatus(st)}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.modalCancel} onPress={() => setStatusModal(null)}>
              <Text style={{ color: theme.textSub, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Mechanic Picker Modal */}
      <Modal visible={!!mechanicModal} transparent animationType="slide" onRequestClose={() => setMechanicModal(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setMechanicModal(null)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Assign Mechanic</Text>

            <TouchableOpacity style={s.modalOption} onPress={() => assignMechanic(mechanicModal, null)}>
              <View style={s.mechanicAvatarFallback}>
                <Text style={s.mechanicAvatarInitials}>—</Text>
              </View>
              <Text style={[s.modalOptionText, { color: theme.textSub }]}>Unassigned</Text>
            </TouchableOpacity>

            {mechanics.map(m => (
              <TouchableOpacity
                key={m.id}
                style={s.modalOption}
                onPress={() => assignMechanic(mechanicModal, m.id)}
              >
                {m.profile_photo_url ? (
                  <Image source={{ uri: m.profile_photo_url }} style={s.mechanicAvatar} />
                ) : (
                  <View style={s.mechanicAvatarFallback}>
                    <Text style={s.mechanicAvatarInitials}>
                      {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                    </Text>
                  </View>
                )}
                <Text style={[s.modalOptionText, { color: theme.text }]}>
                  {m.first_name} {m.last_name}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={s.modalCancel} onPress={() => setMechanicModal(null)}>
              <Text style={{ color: theme.textSub, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value, theme, highlight }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: theme.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 13, color: highlight ? theme.accent : theme.text, fontWeight: highlight ? 'bold' : '500' }}>
        {value}
      </Text>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },

  // Filter bar — plain View with explicit height so it NEVER grows
  filterBarWrap: {
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.bg2,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterText: { fontSize: 13, color: theme.textSub, fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: 'bold' },

  // Search — explicit height, no flex, sits right below filter bar
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: theme.bg2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.text },
  searchClear: { padding: 4 },

  // FlatList takes all remaining space
  list: { flex: 1 },
  listContent: { paddingTop: 6 },
  listEmptyContent: { flex: 1 },

  card: {
    backgroundColor: theme.card,
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  customerName: { fontSize: 15, fontWeight: 'bold', color: theme.text },
  customerEmail: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 8 },
  notesBox: { backgroundColor: theme.bg2, borderRadius: 8, padding: 10, marginVertical: 6 },
  notesText: { fontSize: 12, color: theme.textSub, fontStyle: 'italic' },

  actionBlock: { marginTop: 6, gap: 4 },
  actionLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '500' },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg2,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: theme.border, gap: 8,
  },
  pickerBtnText: { flex: 1, fontSize: 13, color: theme.text, fontWeight: '600' },
  chevron: { fontSize: 12, color: theme.textMuted },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  bookingId: { fontSize: 10, color: theme.textMuted, textAlign: 'right', marginTop: 8 },

  emptyCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 16, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: theme.border, marginBottom: 8, gap: 10,
  },
  modalDot: { width: 10, height: 10, borderRadius: 5 },
  modalOptionText: { fontSize: 14, fontWeight: '600' },
  modalCancel: { marginTop: 4, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: theme.bg2 },
  mechanicAvatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: theme.border },
  mechanicAvatarFallback: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.primary + '44', alignItems: 'center', justifyContent: 'center',
  },
  mechanicAvatarInitials: { fontSize: 10, fontWeight: 'bold', color: theme.primaryLight },
});