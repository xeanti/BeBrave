import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert } from 'react-native';
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

export default function JobDetailScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const { booking: initial, onUpdate } = route.params;
  const [booking, setBooking] = useState(initial);
  const [updating, setUpdating] = useState(false);

  async function handleStatusChange(newStatus) {
    if (newStatus === booking.status) return;

    Alert.alert(
      'Update Status',
      `Change status to "${newStatus.replace('_', ' ')}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setUpdating(true);
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
              .from('bookings')
              .update({ status: newStatus })
              .eq('id', booking.id)
              .eq('mechanic_id', user.id);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setBooking(prev => ({ ...prev, status: newStatus }));
              onUpdate?.();
            }
            setUpdating(false);
          }
        }
      ]
    );
  }

  const s = styles(theme);

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

        {/* Status Banner */}
        <View style={[s.statusBanner, { backgroundColor: STATUS_COLORS[booking.status] + '18', borderColor: STATUS_COLORS[booking.status] + '55' }]}>
          <Text style={[s.statusBannerText, { color: STATUS_COLORS[booking.status] }]}>
            {booking.status?.replace('_', ' ').toUpperCase()}
          </Text>
        </View>

        {/* Service Info */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🔧 Service</Text>
          <View style={s.infoCard}>
            <InfoRow label="Service" value={booking.services?.name || '—'} theme={theme} />
            <InfoRow label="Date" value={booking.booking_date || '—'} theme={theme} />
            <InfoRow label="Time" value={booking.booking_time?.slice(0, 5) || '—'} theme={theme} />
            {booking.services?.base_price && (
              <InfoRow label="Price" value={`₱${booking.services.base_price}`} theme={theme} highlight />
            )}
          </View>
        </View>

        {/* Customer Info */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>👤 Customer</Text>
          <View style={s.infoCard}>
            <InfoRow label="Name" value={`${booking.profiles?.first_name || ''} ${booking.profiles?.last_name || ''}`} theme={theme} />
            {booking.profiles?.phone && (
              <InfoRow label="Phone" value={booking.profiles.phone} theme={theme} />
            )}
          </View>
        </View>

        {/* Notes */}
        {booking.notes && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>📝 Notes</Text>
            <View style={s.notesCard}>
              <Text style={s.notesText}>"{booking.notes}"</Text>
            </View>
          </View>
        )}

        {/* Update Status */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>⚡ Update Status</Text>
          <View style={s.statusGrid}>
            {ALL_STATUSES.map(st => (
              <TouchableOpacity
                key={st}
                style={[
                  s.statusBtn,
                  { borderColor: STATUS_COLORS[st] + '55' },
                  booking.status === st && { backgroundColor: STATUS_COLORS[st] + '22', borderColor: STATUS_COLORS[st] }
                ]}
                onPress={() => handleStatusChange(st)}
                disabled={updating || booking.status === st}
              >
                {booking.status === st && (
                  <Text style={{ color: STATUS_COLORS[st], fontSize: 10, marginBottom: 2 }}>✓ Current</Text>
                )}
                <Text style={[
                  s.statusBtnText,
                  { color: booking.status === st ? STATUS_COLORS[st] : theme.textSub }
                ]}>
                  {st.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Booking ID */}
        <Text style={s.bookingId}>Booking #{booking.id?.slice(0, 8).toUpperCase()}</Text>

      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value, theme, highlight }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
      <Text style={{ fontSize: 13, color: theme.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 13, color: highlight ? theme.accent : theme.text, fontWeight: highlight ? 'bold' : '500' }}>{value}</Text>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 40 },
  statusBanner: { borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 20, borderWidth: 1 },
  statusBannerText: { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: theme.textSub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  infoCard: { backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.border },
  notesCard: { backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border },
  notesText: { fontSize: 14, color: theme.textSub, fontStyle: 'italic', lineHeight: 20 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, backgroundColor: theme.bg2, alignItems: 'center', minWidth: '30%' },
  statusBtnText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  bookingId: { textAlign: 'center', fontSize: 11, color: theme.textMuted, marginTop: 8 },
});