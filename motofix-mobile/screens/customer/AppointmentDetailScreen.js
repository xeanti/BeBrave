import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;

function generateTimeSlots() {
  const slots = [];
  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

const timeSlots = generateTimeSlots();

function formatTimeSlot(slot) {
  if (!slot) return '—';
  const [h, m] = slot.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function toISODateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function AppointmentDetailScreen({ route, navigation }) {
  const { theme, isDark } = useTheme();
  const [booking, setBooking] = useState(route?.params?.booking);
  const [loading, setLoading] = useState(false);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState(null);
  const [newTime, setNewTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const s = styles(theme);

  if (!booking) {
    return (
      <View style={s.centered}>
        <Text style={s.emptyText}>Booking not found.</Text>
      </View>
    );
  }

  const canModify = ['pending', 'confirmed'].includes(booking.status);

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

  async function handleCancel() {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const { error } = await supabase
              .from('bookings')
              .update({ status: 'cancelled' })
              .eq('id', booking.id);
            setLoading(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setBooking({ ...booking, status: 'cancelled' });
              Alert.alert('Booking Cancelled', 'Your booking has been cancelled.');
            }
          },
        },
      ]
    );
  }

  async function handleReschedule() {
    if (!newDate) {
      Alert.alert('Error', 'Please select a new date.');
      return;
    }
    if (!newTime) {
      Alert.alert('Error', 'Please select a new time slot.');
      return;
    }

    setLoading(true);
    const dateStr = toISODateString(newDate);
    const { error } = await supabase
      .from('bookings')
      .update({ booking_date: dateStr, booking_time: newTime, status: 'pending' })
      .eq('id', booking.id);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setBooking({ ...booking, booking_date: dateStr, booking_time: newTime, status: 'pending' });
      setShowReschedule(false);
      setNewDate(null);
      setNewTime('');
      Alert.alert('Rescheduled!', 'Your booking has been rescheduled and is pending confirmation.');
    }
  }

  function onChangeDate(event, selectedDate) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) setNewDate(selectedDate);
    } else {
      if (selectedDate) setNewDate(selectedDate);
    }
  }

  const total = booking.total_amount || booking.services?.base_price || 0;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* Status Badge */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.serviceName}>{booking.services?.name || 'Service'}</Text>
          <Text style={s.refText}>#{booking.id?.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: statusColor(booking.status) + '22' }]}>
          <Text style={[s.badgeText, { color: statusColor(booking.status) }]}>
            {booking.status?.replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Details Card */}
      <View style={s.card}>
        <DetailRow label="📅 Date" value={booking.booking_date || '—'} theme={theme} />
        <DetailRow label="🕐 Time" value={formatTimeSlot(booking.booking_time)} theme={theme} />
        <DetailRow
          label="💰 Total"
          value={`₱${Number(total).toFixed(2)}`}
          theme={theme}
          highlight
        />
        {booking.notes ? (
          <DetailRow label="📝 Notes" value={booking.notes} theme={theme} last />
        ) : null}
      </View>

      {/* Actions */}
      {canModify && !showReschedule && (
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: '#3b82f644', backgroundColor: '#3b82f618' }]}
            onPress={() => setShowReschedule(true)}
            disabled={loading}
          >
            <Text style={[s.actionBtnText, { color: '#3b82f6' }]}>📅 Reschedule</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: theme.danger + '44', backgroundColor: theme.danger + '18' }]}
            onPress={handleCancel}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={theme.danger} />
              : <Text style={[s.actionBtnText, { color: theme.danger }]}>✕ Cancel Booking</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Reschedule Panel */}
      {showReschedule && (
        <View style={s.reschedulePanel}>
          <Text style={s.reschedulTitle}>Pick a New Date & Time</Text>

          <TouchableOpacity style={s.dateCard} onPress={() => setShowDatePicker(true)}>
            <Text style={s.dateCardIcon}>📅</Text>
            <Text style={newDate ? s.dateCardText : s.dateCardPlaceholder}>
              {newDate ? formatDisplayDate(newDate) : 'Tap to choose a date'}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={newDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={onChangeDate}
              themeVariant={isDark ? 'dark' : 'light'}
              accentColor={theme.primary}
            />
          )}
          {Platform.OS === 'ios' && showDatePicker && (
            <TouchableOpacity style={s.dateDoneBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={s.dateDoneBtnText}>Done</Text>
            </TouchableOpacity>
          )}

          <Text style={s.timeLabel}>Select Time</Text>
          <View style={s.timeGrid}>
            {timeSlots.map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.timeChip, newTime === t && s.timeChipActive]}
                onPress={() => setNewTime(t)}
              >
                <Text style={[s.timeChipText, newTime === t && s.timeChipTextActive]}>
                  {formatTimeSlot(t)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.rescheduleActions}>
            <TouchableOpacity
              style={s.cancelRescheduleBtn}
              onPress={() => { setShowReschedule(false); setNewDate(null); setNewTime(''); }}
            >
              <Text style={s.cancelRescheduleBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.confirmRescheduleBtn, loading && { opacity: 0.6 }]}
              onPress={handleReschedule}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.confirmRescheduleBtnText}>Confirm Reschedule</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function DetailRow({ label, value, theme, highlight, last }) {
  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: theme.border,
    }}>
      <Text style={{ fontSize: 13, color: theme.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 14, color: highlight ? theme.primaryLight : theme.text, fontWeight: highlight ? 'bold' : '500' }}>
        {value}
      </Text>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 10 },
  serviceName: { fontSize: 20, fontWeight: 'bold', color: theme.text },
  refText: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  badge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 12, fontWeight: 'bold', textTransform: 'capitalize' },
  card: { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 20, overflow: 'hidden' },
  actionsRow: { gap: 10 },
  actionBtn: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 10 },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  emptyText: { color: theme.textSub, fontSize: 14 },
  reschedulePanel: { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 16, marginBottom: 20 },
  reschedulTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text, marginBottom: 16 },
  dateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 16 },
  dateCardIcon: { fontSize: 18, marginRight: 10 },
  dateCardText: { color: theme.text, fontSize: 15, fontWeight: '600' },
  dateCardPlaceholder: { color: theme.textMuted, fontSize: 15 },
  dateDoneBtn: { alignSelf: 'flex-end', backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16 },
  dateDoneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  timeLabel: { fontSize: 13, fontWeight: '600', color: theme.textSub, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  timeChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  timeChipText: { color: theme.textSub, fontSize: 13 },
  timeChipTextActive: { color: '#fff', fontWeight: 'bold' },
  rescheduleActions: { flexDirection: 'row', gap: 10 },
  cancelRescheduleBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center' },
  cancelRescheduleBtnText: { color: theme.text, fontWeight: '600' },
  confirmRescheduleBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center' },
  confirmRescheduleBtnText: { color: '#fff', fontWeight: 'bold' },
});