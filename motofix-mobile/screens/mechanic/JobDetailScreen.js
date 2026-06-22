import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const STATUS_FLOW = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

export default function JobDetailScreen({ route, navigation }) {
  const { theme } = useTheme();
  const booking = route?.params?.booking;
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerBackTitle: 'My Jobs',
      title: 'Job Details',
    });
  }, []);

  const s = styles(theme);

  if (!booking) {
    return (
      <View style={s.centered}>
        <Text style={s.emptyIcon}>🔧</Text>
        <Text style={s.emptyTitle}>No job selected</Text>
        <Text style={s.emptyText}>Open a job from "My Jobs" to see its details here.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('MechanicMain')}>
          <Text style={s.backBtnText}>Go to My Jobs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const basePrice = booking.services?.base_price || 0;
  const laborCost = booking.services?.labor_cost || 0;
  const total = basePrice + laborCost;
  const duration = booking.services?.estimated_duration_minutes;

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

  async function updateStatus(status) {
    setUpdating(true);
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', booking.id);
    setUpdating(false);
    if (!error) {
      navigation.setParams({ booking: { ...booking, status } });
    }
  }

  function callCustomer() {
    if (booking.profiles?.phone) {
      Linking.openURL(`tel:${booking.profiles.phone}`);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{booking.services?.name || 'Service'}</Text>
          <Text style={s.refText}>Booking #{booking.id?.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: statusColor(booking.status) + '22' }]}>
          <Text style={[s.statusPillText, { color: statusColor(booking.status) }]}>
            {booking.status?.replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Schedule */}
      <View style={s.card}>
        <Row theme={theme} icon="calendar-outline" label="Date" value={booking.booking_date || '—'} />
        <Row theme={theme} icon="time-outline" label="Time" value={booking.booking_time || '—'} />
        {duration ? <Row theme={theme} icon="hourglass-outline" label="Est. Duration" value={`${duration} mins`} last /> : null}
      </View>

      {/* Customer */}
      <Text style={s.sectionLabel}>Customer</Text>
      <View style={s.card}>
        <Row
          theme={theme}
          icon="person-outline"
          label="Name"
          value={`${booking.profiles?.first_name || ''} ${booking.profiles?.last_name || ''}`.trim() || '—'}
        />
        {booking.profiles?.phone ? (
          <TouchableOpacity onPress={callCustomer}>
            <Row theme={theme} icon="call-outline" label="Phone" value={booking.profiles.phone} valueColor={theme.primaryLight} last action />
          </TouchableOpacity>
        ) : (
          <Row theme={theme} icon="call-outline" label="Phone" value="Not provided" last />
        )}
      </View>

      {/* Notes */}
      {booking.notes ? (
        <>
          <Text style={s.sectionLabel}>Notes</Text>
          <View style={s.card}>
            <Text style={s.notesText}>"{booking.notes}"</Text>
          </View>
        </>
      ) : null}

      {/* Cost breakdown */}
      <Text style={s.sectionLabel}>Cost Breakdown</Text>
      <View style={s.card}>
        <Row theme={theme} icon="pricetag-outline" label="Base Price" value={`₱${basePrice.toFixed(2)}`} />
        <Row theme={theme} icon="construct-outline" label="Labor Cost" value={`₱${laborCost.toFixed(2)}`} />
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalValue}>₱{total.toFixed(2)}</Text>
        </View>
        {booking.down_payment ? (
          <View style={s.downPaymentNote}>
            <Text style={s.downPaymentText}>
              Down payment of ₱{Number(booking.down_payment).toFixed(2)} already collected
            </Text>
          </View>
        ) : null}
      </View>

      {/* Status update */}
      <Text style={s.sectionLabel}>Update Status</Text>
      <View style={s.statusRow}>
        {STATUS_FLOW.filter((st) => st !== booking.status).map((st) => (
          <TouchableOpacity
            key={st}
            disabled={updating}
            style={[s.statusBtn, { opacity: updating ? 0.5 : 1 }]}
            onPress={() => updateStatus(st)}
          >
            <Text style={s.statusBtnText}>{st.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function Row({ theme, icon, label, value, valueColor, last, action }) {
  const s = styles(theme);
  return (
    <View style={[s.infoRow, !last && s.infoRowBorder]}>
      <Ionicons name={icon} size={18} color={theme.textMuted} style={{ marginRight: 12 }} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
      {action && <Ionicons name="chevron-forward" size={14} color={theme.textMuted} style={{ marginLeft: 6 }} />}
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },
  content: { padding: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 10 },
  title: { fontSize: 21, fontWeight: 'bold', color: theme.text },
  refText: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  statusPill: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  statusPillText: { fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' },
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 20, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.border },
  infoLabel: { fontSize: 13, color: theme.textSub, flex: 1 },
  infoValue: { fontSize: 14, color: theme.text, fontWeight: '600', textAlign: 'right' },
  notesText: { fontSize: 14, color: theme.text, fontStyle: 'italic', padding: 16, lineHeight: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.bg2 },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: theme.text },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: theme.primaryLight },
  downPaymentNote: { padding: 12, backgroundColor: theme.accent + '15' },
  downPaymentText: { fontSize: 12, color: theme.accent, fontWeight: '500' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bg2 },
  statusBtnText: { fontSize: 13, fontWeight: '600', color: theme.text, textTransform: 'capitalize' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: theme.text, marginBottom: 8 },
  emptyText: { fontSize: 13, color: theme.textSub, textAlign: 'center', marginBottom: 20 },
  backBtn: { backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  backBtnText: { color: '#fff', fontWeight: 'bold' },
});