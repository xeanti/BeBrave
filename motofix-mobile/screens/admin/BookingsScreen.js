import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl, TextInput,
  Modal, FlatList
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

export default function AdminBookingsScreen() {
  const { theme, isDark } = useTheme();
  const [bookings, setBookings] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Modal state
  const [statusModal, setStatusModal] = useState(null); // bookingId
  const [mechanicModal, setMechanicModal] = useState(null); // bookingId

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [b, m] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name, email), mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)')
        .order('booking_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, first_name, last_name')
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

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Filter Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
        {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f.replace('_', ' ')} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
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

      {/* Bookings List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={theme.primaryLight} />}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📅</Text>
            <Text style={s.emptyTitle}>No bookings found</Text>
          </View>
        ) : (
          filtered.map(b => {
            const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
            return (
              <View key={b.id} style={s.card}>

                {/* Card Header */}
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.customerName}>
                      {b.profiles?.first_name} {b.profiles?.last_name}
                    </Text>
                    <Text style={s.customerEmail}>{b.profiles?.email}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: STATUS_COLORS[b.status] + '22' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLORS[b.status] }]}>
                      {b.status?.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <View style={s.divider} />

                {/* Details */}
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

                {/* Mechanic Picker */}
                <View style={s.actionRow}>
                  <Text style={s.actionLabel}>👨‍🔧 Mechanic</Text>
                  <TouchableOpacity
                    style={s.pickerBtn}
                    onPress={() => setMechanicModal(b.id)}
                  >
                    <Text style={s.pickerBtnText}>
                      {b.mechanic
                        ? `${b.mechanic.first_name} ${b.mechanic.last_name}`
                        : 'Unassigned'}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}> ▾</Text>
                  </TouchableOpacity>
                </View>

                {/* Status Picker */}
                <View style={s.actionRow}>
                  <Text style={s.actionLabel}>⚡ Status</Text>
                  <TouchableOpacity
                    style={s.pickerBtn}
                    onPress={() => setStatusModal(b.id)}
                  >
                    <Text style={[s.pickerBtnText, { color: STATUS_COLORS[b.status] }]}>
                      {b.status?.replace('_', ' ')}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}> ▾</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.bookingId}>#{b.id?.slice(0, 8).toUpperCase()}</Text>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

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
                  {st.replace('_', ' ')}
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
            <TouchableOpacity
              style={s.modalOption}
              onPress={() => assignMechanic(mechanicModal, null)}
            >
              <Text style={[s.modalOptionText, { color: theme.textSub }]}>Unassigned</Text>
            </TouchableOpacity>
            {mechanics.map(m => (
              <TouchableOpacity
                key={m.id}
                style={s.modalOption}
                onPress={() => assignMechanic(mechanicModal, m.id)}
              >
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
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
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
  filterBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: theme.border },
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterText: { fontSize: 12, color: theme.textSub, fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: 'bold' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: theme.bg2, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: theme.text },
  searchClear: { padding: 4 },
  card: { backgroundColor: theme.card, marginHorizontal: 12, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  customerName: { fontSize: 15, fontWeight: 'bold', color: theme.text },
  customerEmail: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 10 },
  notesBox: { backgroundColor: theme.bg2, borderRadius: 8, padding: 10, marginVertical: 6 },
  notesText: { fontSize: 12, color: theme.textSub, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  actionLabel: { fontSize: 13, color: theme.textMuted },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  pickerBtnText: { fontSize: 13, color: theme.text, fontWeight: '500' },
  bookingId: { fontSize: 10, color: theme.textMuted, textAlign: 'right', marginTop: 10 },
  emptyCard: { alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 16, textAlign: 'center' },
  modalOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 8 },
  modalDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  modalOptionText: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  modalCancel: { marginTop: 4, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: theme.bg2 },
});