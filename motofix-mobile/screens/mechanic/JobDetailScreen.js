import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { notifyRole, notifyUser } from '../../lib/notifications';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const STATUS_FLOW = [
  { key: 'pending', label: 'Pending', icon: 'time' },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle' },
  { key: 'in_progress', label: 'In Progress', icon: 'play-circle' },
  { key: 'inspection', label: 'Inspection', icon: 'search' },
  { key: 'repairing', label: 'Repairing', icon: 'construct' },
  { key: 'quality_check', label: 'Quality Check', icon: 'shield-checkmark' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup', icon: 'bag-check' },
  { key: 'completed', label: 'Completed', icon: 'checkmark-done-circle' },
];

const ACTION_STATUSES = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'repairing', label: 'Repairing' },
  { key: 'quality_check', label: 'Quality Check' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
  { key: 'completed', label: 'Completed' },
];

const TERMINAL_STATUSES = ['cancelled', 'rejected', 'no_show'];

function normalizeStatus(status) {
  return String(status || '').toLowerCase();
}

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function peso(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(value) {
  if (!value) return '—';

  const [h, m] = String(value).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m || '00'} ${ampm}`;
}

export default function JobDetailScreen({ route, navigation }) {
  const { theme } = useTheme();

  const initialBooking = route?.params?.booking || null;
  const routeBookingId =
    route?.params?.bookingId || route?.params?.id || initialBooking?.id || null;

  const [booking, setBooking] = useState(initialBooking);
  const [progressEvents, setProgressEvents] = useState([]);
  const [statusNotes, setStatusNotes] = useState('');
  const [loading, setLoading] = useState(!initialBooking);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);

  const s = styles(theme);

  const bookingId = booking?.id || routeBookingId;

  useEffect(() => {
    navigation.setOptions({
      headerBackTitle: 'My Jobs',
      title: 'Job Details',
    });
  }, [navigation]);

  const basePrice = Number(booking?.services?.base_price || booking?.total_amount || 0);
  const laborCost = Number(booking?.services?.labor_cost || 0);
  const total = Number(booking?.total_amount || basePrice + laborCost || 0);
  const duration = booking?.services?.estimated_duration_minutes || null;

  const currentStepIndex = useMemo(() => {
    const current = normalizeStatus(booking?.status);
    return STATUS_FLOW.findIndex((item) => item.key === current);
  }, [booking?.status]);

  const availableStatusActions = useMemo(() => {
    const current = normalizeStatus(booking?.status);

    if (TERMINAL_STATUSES.includes(current) || current === 'completed') {
      return [];
    }

    return ACTION_STATUSES.filter((item) => item.key !== current);
  }, [booking?.status]);

  const fetchDetails = useCallback(
    async (showMainLoader = false) => {
      if (!bookingId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showMainLoader) setLoading(true);

      const bookingQuery = supabase
        .from('bookings')
        .select(
          `
          *,
          services (
            id,
            name,
            base_price,
            labor_cost,
            estimated_duration_minutes
          ),
          profiles!bookings_customer_id_fkey (
            id,
            first_name,
            last_name,
            phone,
            email
          )
        `
        )
        .eq('id', bookingId)
        .maybeSingle();

      const progressQuery = supabase
        .from('service_progress_events')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });

      const [bookingResult, progressResult] = await Promise.all([
        bookingQuery,
        progressQuery,
      ]);

      if (bookingResult.error) {
        Alert.alert('Error', bookingResult.error.message);
      } else if (bookingResult.data) {
        setBooking(bookingResult.data);
      }

      if (!progressResult.error) {
        setProgressEvents(progressResult.data || []);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [bookingId]
  );

  useEffect(() => {
    fetchDetails(!initialBooking);
  }, [fetchDetails, initialBooking]);

  useFocusEffect(
    useCallback(() => {
      fetchDetails(false);
    }, [fetchDetails])
  );

  function statusColor(status) {
    switch (normalizeStatus(status)) {
      case 'confirmed':
        return theme.success;
      case 'pending':
        return theme.warning;
      case 'in_progress':
        return '#3b82f6';
      case 'inspection':
        return '#6366f1';
      case 'repairing':
        return '#f97316';
      case 'quality_check':
        return '#06b6d4';
      case 'ready_for_pickup':
        return '#22c55e';
      case 'completed':
        return theme.success;
      case 'cancelled':
      case 'rejected':
      case 'no_show':
        return theme.danger;
      default:
        return theme.textMuted;
    }
  }

  async function fallbackUpdateStatus(status, notesValue) {
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', booking.id);

    if (updateError) throw updateError;

    await supabase.from('service_progress_events').insert({
      booking_id: booking.id,
      status,
      notes: notesValue || null,
    });
  }

  async function updateStatus(status) {
    if (!booking?.id) return;

    Alert.alert(
      'Update Service Progress',
      `Mark this job as "${humanize(status)}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setUpdating(true);

            const notesValue = statusNotes.trim();

            const { error: rpcError } = await supabase.rpc(
              'update_booking_service_progress',
              {
                p_booking_id: booking.id,
                p_status: status,
                p_notes: notesValue || null,
              }
            );

            if (rpcError) {
              try {
                await fallbackUpdateStatus(status, notesValue);
              } catch (fallbackError) {
                setUpdating(false);
                Alert.alert('Error', fallbackError.message || rpcError.message);
                return;
              }
            }

            const updatedBooking = { ...booking, status };
            setBooking(updatedBooking);
            navigation.setParams({ booking: updatedBooking });
            setStatusNotes('');
            setUpdating(false);

            await fetchDetails(false);

            if (booking.customer_id) {
              await notifyUser({
                userId: booking.customer_id,
                title: 'Service Progress Updated',
                message: `Your booking is now marked as ${humanize(status)}.`,
                type: 'service_progress',
                relatedTable: 'bookings',
                relatedId: booking.id,
              });
            }

            await notifyRole({
              role: 'admin',
              title: 'Service Progress Updated',
              message: `A mechanic updated a booking to ${humanize(status)}.`,
              type: 'service_progress',
              relatedTable: 'bookings',
              relatedId: booking.id,
            });

            await notifyRole({
              role: 'staff',
              title: 'Service Progress Updated',
              message: `A mechanic updated a booking to ${humanize(status)}.`,
              type: 'service_progress',
              relatedTable: 'bookings',
              relatedId: booking.id,
            });

            Alert.alert('Updated', `Job status changed to ${humanize(status)}.`);
          },
        },
      ]
    );
  }

  function callCustomer() {
    if (booking?.profiles?.phone) {
      Linking.openURL(`tel:${booking.profiles.phone}`);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchDetails(false);
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading job details...</Text>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={s.centered}>
        <Text style={s.emptyIcon}>🔧</Text>
        <Text style={s.emptyTitle}>No job selected</Text>
        <Text style={s.emptyText}>
          Open a job from "My Jobs" to see its details here.
        </Text>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => navigation.navigate('MechanicMain')}
        >
          <Text style={s.backBtnText}>Go to My Jobs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={YELLOW}
        />
      }
    >
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{booking.services?.name || 'Service'}</Text>
          <Text style={s.refText}>
            Booking #{booking.id?.slice(0, 8).toUpperCase()}
          </Text>
        </View>

        <View
          style={[
            s.statusPill,
            { backgroundColor: statusColor(booking.status) + '22' },
          ]}
        >
          <Text style={[s.statusPillText, { color: statusColor(booking.status) }]}>
            {humanize(booking.status)}
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <Row
          theme={theme}
          icon="calendar-outline"
          label="Date"
          value={booking.booking_date || '—'}
        />
        <Row
          theme={theme}
          icon="time-outline"
          label="Time"
          value={formatTime(booking.booking_time)}
        />
        {duration ? (
          <Row
            theme={theme}
            icon="hourglass-outline"
            label="Est. Duration"
            value={`${duration} mins`}
            last
          />
        ) : (
          <Row
            theme={theme}
            icon="hourglass-outline"
            label="Est. Duration"
            value="Not specified"
            last
          />
        )}
      </View>

      <Text style={s.sectionLabel}>Customer</Text>
      <View style={s.card}>
        <Row
          theme={theme}
          icon="person-outline"
          label="Name"
          value={
            `${booking.profiles?.first_name || ''} ${
              booking.profiles?.last_name || ''
            }`.trim() || '—'
          }
        />

        {booking.profiles?.phone ? (
          <TouchableOpacity onPress={callCustomer}>
            <Row
              theme={theme}
              icon="call-outline"
              label="Phone"
              value={booking.profiles.phone}
              valueColor={theme.primaryLight || YELLOW}
              last
              action
            />
          </TouchableOpacity>
        ) : (
          <Row
            theme={theme}
            icon="call-outline"
            label="Phone"
            value="Not provided"
            last
          />
        )}
      </View>

      {booking.notes ? (
        <>
          <Text style={s.sectionLabel}>Customer Notes</Text>
          <View style={s.card}>
            <Text style={s.notesText}>"{booking.notes}"</Text>
          </View>
        </>
      ) : null}

      <Text style={s.sectionLabel}>Cost Breakdown</Text>
      <View style={s.card}>
        <Row
          theme={theme}
          icon="pricetag-outline"
          label="Base Price"
          value={peso(basePrice)}
        />
        <Row
          theme={theme}
          icon="construct-outline"
          label="Labor Cost"
          value={peso(laborCost)}
        />

        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalValue}>{peso(total)}</Text>
        </View>

        {booking.down_payment ? (
          <View style={s.downPaymentNote}>
            <Text style={s.downPaymentText}>
              Down payment of {peso(booking.down_payment)} already collected
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={s.sectionLabel}>Service Progress Timeline</Text>
      <View style={s.card}>
        {TERMINAL_STATUSES.includes(normalizeStatus(booking.status)) ? (
          <View style={s.terminalBox}>
            <Ionicons
              name="alert-circle"
              size={20}
              color={statusColor(booking.status)}
            />
            <Text style={[s.terminalText, { color: statusColor(booking.status) }]}>
              This booking is marked as {humanize(booking.status)}.
            </Text>
          </View>
        ) : (
          <View style={s.timelineWrap}>
            {STATUS_FLOW.map((step, index) => {
              const isDone =
                currentStepIndex >= index ||
                normalizeStatus(booking.status) === 'completed';
              const isCurrent = currentStepIndex === index;
              const matchedEvent = progressEvents.find(
                (event) =>
                  normalizeStatus(event.status || event.stage) === step.key
              );

              return (
                <View key={step.key} style={s.stepRow}>
                  <View style={s.stepMarkerColumn}>
                    <View
                      style={[
                        s.stepCircle,
                        {
                          backgroundColor: isDone ? YELLOW : theme.bg2,
                          borderColor: isDone ? YELLOW : theme.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={step.icon}
                        size={15}
                        color={isDone ? '#111827' : theme.textMuted}
                      />
                    </View>

                    {index < STATUS_FLOW.length - 1 && (
                      <View
                        style={[
                          s.stepLine,
                          {
                            backgroundColor:
                              currentStepIndex > index ? YELLOW : theme.border,
                          },
                        ]}
                      />
                    )}
                  </View>

                  <View style={s.stepContent}>
                    <View style={s.stepTitleRow}>
                      <Text
                        style={[
                          s.stepTitle,
                          { color: isDone ? theme.text : theme.textMuted },
                        ]}
                      >
                        {step.label}
                      </Text>

                      {isCurrent && (
                        <View style={s.currentPill}>
                          <Text style={s.currentPillText}>Current</Text>
                        </View>
                      )}
                    </View>

                    <Text style={s.stepMeta}>
                      {matchedEvent
                        ? formatDateTime(matchedEvent.created_at)
                        : isDone
                          ? 'Updated'
                          : 'Waiting'}
                    </Text>

                    {!!matchedEvent?.notes && (
                      <Text style={s.stepNote}>{matchedEvent.notes}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text style={s.sectionLabel}>Update Service Progress</Text>
      <View style={s.card}>
        <View style={s.noteBox}>
          <Text style={s.noteLabel}>Progress note optional</Text>
          <TextInput
            style={s.noteInput}
            placeholder="Example: Inspection started, parts installed, ready for pickup..."
            placeholderTextColor={theme.textMuted}
            value={statusNotes}
            onChangeText={setStatusNotes}
            multiline
          />
        </View>

        {availableStatusActions.length === 0 ? (
          <View style={s.noActionBox}>
            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
            <Text style={s.noActionText}>
              No more progress actions available for this booking.
            </Text>
          </View>
        ) : (
          <View style={s.statusRow}>
            {availableStatusActions.map((st) => (
              <TouchableOpacity
                key={st.key}
                disabled={updating}
                style={[s.statusBtn, { opacity: updating ? 0.5 : 1 }]}
                onPress={() => updateStatus(st.key)}
              >
                {updating ? (
                  <ActivityIndicator size="small" color={theme.text} />
                ) : (
                  <Text style={s.statusBtnText}>{st.label}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function Row({ theme, icon, label, value, valueColor, last, action }) {
  const s = styles(theme);

  return (
    <View style={[s.infoRow, !last && s.infoRowBorder]}>
      <Ionicons
        name={icon}
        size={18}
        color={theme.textMuted}
        style={{ marginRight: 12 }}
      />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
      {action && (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={theme.textMuted}
          style={{ marginLeft: 6 }}
        />
      )}
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 12,
    },
    content: { padding: 20 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 20,
      gap: 10,
    },
    title: { fontSize: 21, fontWeight: 'bold', color: theme.text },
    refText: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    statusPill: {
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: 'bold',
      textTransform: 'capitalize',
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: 'bold',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 4,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 20,
      overflow: 'hidden',
    },
    infoRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    infoRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    infoLabel: {
      fontSize: 13,
      color: theme.textSub || theme.textMuted,
      flex: 1,
    },
    infoValue: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '600',
      textAlign: 'right',
      flexShrink: 1,
    },
    notesText: {
      fontSize: 14,
      color: theme.text,
      fontStyle: 'italic',
      padding: 16,
      lineHeight: 20,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg2,
    },
    totalLabel: { fontSize: 14, fontWeight: 'bold', color: theme.text },
    totalValue: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.primaryLight || YELLOW,
    },
    downPaymentNote: {
      padding: 12,
      backgroundColor: (theme.accent || YELLOW) + '15',
    },
    downPaymentText: {
      fontSize: 12,
      color: theme.accent || YELLOW,
      fontWeight: '500',
    },
    timelineWrap: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4,
    },
    stepRow: {
      flexDirection: 'row',
      minHeight: 70,
    },
    stepMarkerColumn: {
      width: 34,
      alignItems: 'center',
    },
    stepCircle: {
      width: 30,
      height: 30,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    stepLine: {
      width: 2,
      flex: 1,
      marginVertical: 3,
    },
    stepContent: {
      flex: 1,
      paddingLeft: 10,
      paddingBottom: 16,
    },
    stepTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    stepTitle: {
      fontSize: 14,
      fontWeight: '900',
    },
    stepMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 3,
      fontWeight: '500',
    },
    stepNote: {
      color: theme.text,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 6,
    },
    currentPill: {
      backgroundColor: YELLOW,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    currentPillText: {
      color: '#111827',
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    terminalBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 16,
    },
    terminalText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
    },
    noteBox: {
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    noteLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    noteInput: {
      minHeight: 76,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      color: theme.text,
      fontSize: 13,
      textAlignVertical: 'top',
    },
    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 14,
    },
    statusBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
    },
    statusBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      textTransform: 'capitalize',
    },
    noActionBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 14,
    },
    noActionText: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 13,
      color: theme.textSub || theme.textMuted,
      textAlign: 'center',
      marginBottom: 20,
    },
    backBtn: {
      backgroundColor: theme.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 10,
    },
    backBtnText: { color: '#fff', fontWeight: 'bold' },
  });