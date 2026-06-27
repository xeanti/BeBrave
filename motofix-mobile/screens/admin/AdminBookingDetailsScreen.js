import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
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
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
  'ready_for_pickup',
  'completed',
  'cancelled',
  'rejected',
  'no_show',
];

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

const DEFAULT_PROGRESS_BY_STATUS = {
  pending: 10,
  confirmed: 25,
  in_progress: 40,
  inspection: 50,
  repairing: 70,
  quality_check: 85,
  ready_for_pickup: 95,
  completed: 100,
  cancelled: 0,
  rejected: 0,
  no_show: 0,
};

function normalizeStatus(status) {
  return String(status || 'pending').toLowerCase();
}

function humanize(value) {
  if (!value) return '—';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function peso(value) {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  const [year, month, day] = String(value).split('-').map(Number);

  if (year && month && day) {
    return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return String(value);
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

  const normalized = String(value).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);

  if (Number.isNaN(hour)) return normalized;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function getName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return name || 'Unknown';
}

function getInitials(profile) {
  return `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim() || '?';
}

function getStatusColor(theme, status) {
  switch (normalizeStatus(status)) {
    case 'pending':
      return theme.warning || '#eab308';
    case 'confirmed':
      return theme.success || '#22c55e';
    case 'in_progress':
      return '#3b82f6';
    case 'inspection':
      return '#6366f1';
    case 'repairing':
      return '#f97316';
    case 'quality_check':
      return '#06b6d4';
    case 'ready_for_pickup':
      return '#10b981';
    case 'completed':
      return theme.textMuted || '#9ca3af';
    case 'cancelled':
    case 'rejected':
    case 'no_show':
      return theme.danger || '#ef4444';
    default:
      return theme.textMuted || '#9ca3af';
  }
}

function getServiceTotal(booking) {
  const savedTotal = Number(booking?.total_amount);

  if (Number.isFinite(savedTotal) && savedTotal > 0) {
    return savedTotal;
  }

  return (
    (Number(booking?.services?.base_price) || 0) +
    (Number(booking?.services?.labor_cost) || 0)
  );
}

export default function AdminBookingDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const initialBooking = route?.params?.booking || null;
  const bookingId =
    route?.params?.bookingId ||
    route?.params?.id ||
    initialBooking?.id ||
    null;

  const [viewerId, setViewerId] = useState(null);
  const [viewerRole, setViewerRole] = useState(null);
  const [booking, setBooking] = useState(initialBooking);
  const [payments, setPayments] = useState([]);
  const [progressEvents, setProgressEvents] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(!initialBooking);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [mechanicModalOpen, setMechanicModalOpen] = useState(false);
  const [progressNote, setProgressNote] = useState('');

  const customer = booking?.customer || booking?.profiles || null;
  const mechanic = booking?.mechanic || null;

  const serviceTotal = useMemo(() => getServiceTotal(booking), [booking]);
  const paymentSummary = useMemo(() => summarizePayments(payments || []), [payments]);
  const totalPaid = Number(paymentSummary?.totalPaid) || 0;
  const balance = Math.max(serviceTotal - totalPaid, 0);
  const paymentPercent =
    serviceTotal > 0 ? Math.min(Math.round((totalPaid / serviceTotal) * 100), 100) : 0;

  const latestProgress =
    progressEvents.length > 0 ? progressEvents[progressEvents.length - 1] : null;

  const progressPercent =
    Number(latestProgress?.progress_percent) ||
    DEFAULT_PROGRESS_BY_STATUS[normalizeStatus(booking?.status)] ||
    0;

  useEffect(() => {
    navigation.setOptions({
      title: 'Booking Details',
      headerBackTitle: 'Bookings',
    });
  }, [navigation]);

  const fetchViewer = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    setViewerId(userId);

    if (!userId) return { userId: null, role: null };

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const role = profile?.role || null;
    setViewerRole(role);

    return { userId, role };
  }, []);

  const fetchMechanics = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone, profile_photo_url, specialization')
      .eq('role', 'mechanic')
      .order('first_name', { ascending: true });

    if (!error) {
      setMechanics(data || []);
    }
  }, []);

  const fetchProgressEvents = useCallback(async () => {
    if (!bookingId) {
      setProgressEvents([]);
      return;
    }

    const { data, error } = await supabase
      .from('service_progress_events')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (error) {
      console.log('Progress events unavailable:', error.message);
      setProgressEvents([]);
      return;
    }

    setProgressEvents(data || []);
  }, [bookingId]);

  const fetchPayments = useCallback(async () => {
    if (!bookingId) {
      setPayments([]);
      return;
    }

    const list = await fetchPaymentsFor({ bookingIds: [bookingId] });
    setPayments(list || []);
  }, [bookingId]);

  const fetchBookingDetails = useCallback(
    async (showMainLoader = false) => {
      if (!bookingId) {
        setFetchError('Missing booking ID.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showMainLoader) setLoading(true);
      setFetchError('');

      const { userId, role } = await fetchViewer();

      if (!userId) {
        setFetchError('Please log in again to view this booking.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          *,
          services (
            id,
            name,
            description,
            base_price,
            labor_cost,
            estimated_duration_minutes
          ),
          customer:profiles!bookings_customer_id_fkey (
            id,
            first_name,
            last_name,
            email,
            phone,
            profile_photo_url
          ),
          mechanic:profiles!bookings_mechanic_id_fkey (
            id,
            first_name,
            last_name,
            email,
            phone,
            profile_photo_url,
            specialization
          )
        `
        )
        .eq('id', bookingId)
        .maybeSingle();

      if (error) {
        setFetchError(error.message);
        setBooking(null);
      } else if (!data) {
        setFetchError('Booking not found.');
        setBooking(null);
      } else {
        const allowed =
          role === 'admin' ||
          role === 'staff' ||
          data.mechanic_id === userId;

        if (!allowed) {
          setFetchError('You do not have permission to view this booking.');
          setBooking(null);
        } else {
          setBooking(data);
          navigation.setParams({ booking: data, bookingId: data.id });
        }
      }

      await Promise.all([fetchPayments(), fetchProgressEvents(), fetchMechanics()]);

      setLoading(false);
      setRefreshing(false);
    },
    [
      bookingId,
      fetchMechanics,
      fetchPayments,
      fetchProgressEvents,
      fetchViewer,
      navigation,
    ]
  );

  useEffect(() => {
    fetchBookingDetails(!initialBooking);
  }, [fetchBookingDetails, initialBooking]);

  useFocusEffect(
    useCallback(() => {
      fetchBookingDetails(false);
    }, [fetchBookingDetails])
  );

  useEffect(() => {
    if (!bookingId) return;

    const bookingChannel = supabase
      .channel(`admin-mobile-booking-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        () => fetchBookingDetails(false)
      )
      .subscribe();

    const progressChannel = supabase
      .channel(`admin-mobile-booking-progress-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_progress_events',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => fetchProgressEvents()
      )
      .subscribe();

    const paymentChannel = supabase
      .channel(`admin-mobile-booking-payments-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => fetchPayments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingChannel);
      supabase.removeChannel(progressChannel);
      supabase.removeChannel(paymentChannel);
    };
  }, [bookingId, fetchBookingDetails, fetchPayments, fetchProgressEvents]);

  function onRefresh() {
    setRefreshing(true);
    fetchBookingDetails(false);
  }

  async function writeAuditLog(action, details = {}) {
    try {
      await supabase.from('audit_logs').insert({
        action,
        entity: 'bookings',
        entity_id: bookingId,
        performed_by: viewerId,
        details,
      });
    } catch (error) {
      console.log('Audit log skipped:', error?.message || error);
    }
  }

  async function fallbackProgressUpdate(nextStatus, noteValue) {
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: nextStatus })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    await supabase.from('service_progress_events').insert({
      booking_id: bookingId,
      status: nextStatus,
      title: humanize(nextStatus),
      description: noteValue || `Booking status updated to ${humanize(nextStatus)}.`,
      progress_percent: DEFAULT_PROGRESS_BY_STATUS[nextStatus] || 0,
      event_type: 'status_update',
      notes: noteValue || null,
      created_by: viewerId,
    });
  }

  async function updateStatus(nextStatus) {
    if (!booking?.id) return;

    Alert.alert(
      'Update Booking Status',
      `Change this booking to "${humanize(nextStatus)}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setSaving(true);
            const noteValue = progressNote.trim();

            try {
              const { error: rpcError } = await supabase.rpc(
                'update_booking_service_progress',
                {
                  p_booking_id: booking.id,
                  p_status: nextStatus,
                  p_notes: noteValue || null,
                }
              );

              if (rpcError) {
                await fallbackProgressUpdate(nextStatus, noteValue);
              }

              await writeAuditLog('UPDATE_BOOKING_STATUS', {
                old_status: booking.status,
                new_status: nextStatus,
                note: noteValue || null,
              });

              if (booking.customer_id) {
                await notifyUser({
                  userId: booking.customer_id,
                  title: 'Booking Status Updated',
                  message: `Your booking is now ${humanize(nextStatus)}.`,
                  type: 'booking',
                  relatedTable: 'bookings',
                  relatedId: booking.id,
                });
              }

              await notifyRole({
                role: 'staff',
                title: 'Booking Status Updated',
                message: `Admin updated a booking to ${humanize(nextStatus)}.`,
                type: 'booking',
                relatedTable: 'bookings',
                relatedId: booking.id,
              });

              if (booking.mechanic_id) {
                await notifyUser({
                  userId: booking.mechanic_id,
                  title: 'Assigned Booking Updated',
                  message: `A booking assigned to you is now ${humanize(nextStatus)}.`,
                  type: 'booking',
                  relatedTable: 'bookings',
                  relatedId: booking.id,
                });
              }

              setProgressNote('');
              setStatusModalOpen(false);
              await fetchBookingDetails(false);
              Alert.alert('Updated', `Booking changed to ${humanize(nextStatus)}.`);
            } catch (error) {
              Alert.alert('Error', error.message || 'Could not update booking.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  async function assignMechanic(mechanicId) {
    if (!booking?.id) return;

    setSaving(true);

    try {
      const oldMechanicId = booking.mechanic_id || null;

      const { error } = await supabase
        .from('bookings')
        .update({ mechanic_id: mechanicId || null })
        .eq('id', booking.id);

      if (error) throw error;

      await writeAuditLog('ASSIGN_BOOKING_MECHANIC', {
        old_mechanic_id: oldMechanicId,
        new_mechanic_id: mechanicId || null,
      });

      if (mechanicId) {
        await notifyUser({
          userId: mechanicId,
          title: 'New Assigned Booking',
          message: 'An admin assigned you to a service booking.',
          type: 'booking',
          relatedTable: 'bookings',
          relatedId: booking.id,
        });
      }

      if (booking.customer_id) {
        const selected = mechanics.find((m) => m.id === mechanicId);
        await notifyUser({
          userId: booking.customer_id,
          title: 'Mechanic Assignment Updated',
          message: selected
            ? `${getName(selected)} has been assigned to your booking.`
            : 'Your booking mechanic assignment was removed.',
          type: 'booking',
          relatedTable: 'bookings',
          relatedId: booking.id,
        });
      }

      setMechanicModalOpen(false);
      await fetchBookingDetails(false);
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not assign mechanic.');
    } finally {
      setSaving(false);
    }
  }

  function callCustomer() {
    if (customer?.phone) {
      Linking.openURL(`tel:${customer.phone}`);
    }
  }

  function emailCustomer() {
    if (customer?.email) {
      Linking.openURL(`mailto:${customer.email}`);
    }
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight || YELLOW} />
        <Text style={s.loadingText}>Loading booking details...</Text>
      </View>
    );
  }

  if (fetchError || !booking) {
    return (
      <View style={s.centered}>
        <Ionicons name="warning" size={42} color={theme.danger || '#ef4444'} />
        <Text style={s.emptyTitle}>Cannot open booking</Text>
        <Text style={s.emptyText}>{fetchError || 'Booking not found.'}</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={s.primaryBtnText}>Back to Bookings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = getStatusColor(theme, booking.status);
  const canAdminUpdate = viewerRole === 'admin' || viewerRole === 'staff';

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight || YELLOW}
          />
        }
      >
        <View style={s.headerCard}>
          <View style={s.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>Admin Booking Details</Text>
              <Text style={s.title}>{booking.services?.name || 'Service Booking'}</Text>
              <Text style={s.reference}>
                #{booking.id?.slice(0, 8).toUpperCase()} · Created{' '}
                {formatDateTime(booking.created_at)}
              </Text>
            </View>

            <View style={[s.statusPill, { backgroundColor: statusColor + '22' }]}>
              <Text style={[s.statusPillText, { color: statusColor }]}>
                {humanize(booking.status)}
              </Text>
            </View>
          </View>

          <View style={s.progressOuter}>
            <View
              style={[
                s.progressInner,
                {
                  width: `${Math.max(0, Math.min(100, progressPercent))}%`,
                  backgroundColor: statusColor,
                },
              ]}
            />
          </View>

          <Text style={s.progressText}>
            Service progress: {Math.max(0, Math.min(100, progressPercent))}%
          </Text>
        </View>

        <Text style={s.sectionTitle}>Customer</Text>
        <View style={s.card}>
          <ProfileHeader
            theme={theme}
            profile={customer}
            title={getName(customer)}
            subtitle={customer?.email || 'No email'}
          />

          <InfoRow
            theme={theme}
            icon="call"
            label="Phone"
            value={customer?.phone || 'No phone'}
            action={customer?.phone ? callCustomer : null}
          />
          <InfoRow
            theme={theme}
            icon="mail"
            label="Email"
            value={customer?.email || 'No email'}
            action={customer?.email ? emailCustomer : null}
            last
          />
        </View>

        <Text style={s.sectionTitle}>Schedule & Service</Text>
        <View style={s.card}>
          <InfoRow
            theme={theme}
            icon="calendar"
            label="Booking Date"
            value={formatDate(booking.booking_date)}
          />
          <InfoRow
            theme={theme}
            icon="time"
            label="Booking Time"
            value={formatTime(booking.booking_time)}
          />
          <InfoRow
            theme={theme}
            icon="construct"
            label="Service"
            value={booking.services?.name || 'Service'}
          />
          <InfoRow
            theme={theme}
            icon="hourglass"
            label="Duration"
            value={
              booking.services?.estimated_duration_minutes
                ? `${booking.services.estimated_duration_minutes} minutes`
                : '—'
            }
            last
          />

          {!!booking.services?.description && (
            <View style={s.noteBox}>
              <Text style={s.noteLabel}>Service Description</Text>
              <Text style={s.noteText}>{booking.services.description}</Text>
            </View>
          )}

          {!!booking.notes && (
            <View style={s.noteBox}>
              <Text style={s.noteLabel}>Customer Notes</Text>
              <Text style={s.noteText}>{booking.notes}</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Assigned Mechanic</Text>
        <View style={s.card}>
          {mechanic ? (
            <ProfileHeader
              theme={theme}
              profile={mechanic}
              title={getName(mechanic)}
              subtitle={mechanic.specialization || mechanic.email || 'Mechanic'}
            />
          ) : (
            <View style={s.unassignedBox}>
              <Ionicons name="person-add" size={28} color={theme.textMuted} />
              <Text style={s.unassignedTitle}>No mechanic assigned</Text>
              <Text style={s.unassignedText}>
                Assign a mechanic so the job appears in their mobile jobs page.
              </Text>
            </View>
          )}

          {canAdminUpdate && (
            <TouchableOpacity
              style={s.outlineBtn}
              onPress={() => setMechanicModalOpen(true)}
              disabled={saving}
            >
              <Ionicons name="people" size={16} color={theme.text} />
              <Text style={s.outlineBtnText}>
                {mechanic ? 'Change Mechanic' : 'Assign Mechanic'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.sectionTitle}>Payment Summary</Text>
        <View style={s.card}>
          <MoneyRow theme={theme} label="Service Total" value={peso(serviceTotal)} />
          {booking.down_payment !== null && booking.down_payment !== undefined && (
            <MoneyRow theme={theme} label="Required Down Payment" value={peso(booking.down_payment)} />
          )}
          <MoneyRow theme={theme} label="Total Paid" value={peso(totalPaid)} />
          <MoneyRow
            theme={theme}
            label="Balance"
            value={peso(balance)}
            valueColor={balance <= 0 ? theme.success : theme.danger}
            last
          />

          <View style={s.paymentBarOuter}>
            <View style={[s.paymentBarInner, { width: `${paymentPercent}%` }]} />
          </View>
          <Text style={s.paymentPercent}>{paymentPercent}% paid</Text>

          <View style={s.paymentHistory}>
            <Text style={s.paymentHistoryTitle}>Payment History</Text>
            {payments.length === 0 ? (
              <Text style={s.mutedText}>No payment records yet.</Text>
            ) : (
              payments.map((payment) => (
                <View key={payment.id} style={s.paymentItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.paymentAmount}>{peso(payment.amount)}</Text>
                    <Text style={s.paymentMeta}>
                      {humanize(payment.payment_type || 'payment')} ·{' '}
                      {humanize(payment.method || 'cash')}
                    </Text>
                    {!!payment.receipt_number && (
                      <Text style={s.paymentReceipt}>OR {payment.receipt_number}</Text>
                    )}
                  </View>
                  <Text style={s.paymentDate}>{formatDateTime(payment.created_at)}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <Text style={s.sectionTitle}>Service Timeline</Text>
        <View style={s.card}>
          {progressEvents.length === 0 ? (
            <View style={s.emptyTimeline}>
              <Ionicons name="trail-sign" size={26} color={theme.textMuted} />
              <Text style={s.mutedText}>No timeline updates yet.</Text>
            </View>
          ) : (
            progressEvents.map((event, index) => {
              const eventStatus = normalizeStatus(event.status || event.stage);
              const color = getStatusColor(theme, eventStatus);
              const isLast = index === progressEvents.length - 1;

              return (
                <View key={event.id || `${eventStatus}-${index}`} style={s.timelineRow}>
                  <View style={s.timelineMarkerCol}>
                    <View style={[s.timelineDot, { backgroundColor: color }]}>
                      <Ionicons
                        name={
                          STATUS_FLOW.find((item) => item.key === eventStatus)?.icon ||
                          'ellipse'
                        }
                        size={14}
                        color="#fff"
                      />
                    </View>
                    {!isLast && <View style={s.timelineLine} />}
                  </View>

                  <View style={s.timelineContent}>
                    <Text style={s.timelineTitle}>
                      {event.title || humanize(eventStatus)}
                    </Text>
                    {!!event.description && (
                      <Text style={s.timelineDescription}>{event.description}</Text>
                    )}
                    {!!event.notes && <Text style={s.timelineDescription}>{event.notes}</Text>}
                    <Text style={s.timelineMeta}>
                      {formatDateTime(event.created_at)}
                      {event.progress_percent !== null &&
                      event.progress_percent !== undefined
                        ? ` · ${event.progress_percent}%`
                        : ''}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {canAdminUpdate && (
          <>
            <Text style={s.sectionTitle}>Admin Actions</Text>
            <View style={s.card}>
              <Text style={s.inputLabel}>Progress note optional</Text>
              <TextInput
                style={s.textArea}
                value={progressNote}
                onChangeText={setProgressNote}
                placeholder="Example: Customer was informed, mechanic started inspection..."
                placeholderTextColor={theme.textMuted}
                multiline
              />

              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => setStatusModalOpen(true)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color="#fff" />
                    <Text style={s.primaryBtnText}>Update Status</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={statusModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusModalOpen(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setStatusModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <Text style={s.modalTitle}>Update Booking Status</Text>

            {BOOKING_STATUSES.map((status) => {
              const color = getStatusColor(theme, status);
              const active = normalizeStatus(booking.status) === status;

              return (
                <TouchableOpacity
                  key={status}
                  style={[
                    s.modalOption,
                    active && { borderColor: color, backgroundColor: color + '16' },
                  ]}
                  onPress={() => updateStatus(status)}
                  disabled={saving}
                >
                  <View style={[s.modalDot, { backgroundColor: color }]} />
                  <Text style={[s.modalOptionText, { color: theme.text }]}>
                    {humanize(status)}
                  </Text>
                  {active && <Text style={s.currentText}>Current</Text>}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={s.modalCancel} onPress={() => setStatusModalOpen(false)}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={mechanicModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMechanicModalOpen(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setMechanicModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <Text style={s.modalTitle}>Assign Mechanic</Text>

            <TouchableOpacity
              style={s.mechanicOption}
              onPress={() => assignMechanic(null)}
              disabled={saving}
            >
              <View style={s.avatarFallback}>
                <Ionicons name="close" size={18} color={theme.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.mechanicOptionName}>Unassigned</Text>
                <Text style={s.mechanicOptionSub}>Remove assigned mechanic</Text>
              </View>
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 360 }}>
              {mechanics.map((item) => {
                const active = item.id === booking.mechanic_id;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      s.mechanicOption,
                      active && {
                        borderColor: theme.primary,
                        backgroundColor: theme.primary + '12',
                      },
                    ]}
                    onPress={() => assignMechanic(item.id)}
                    disabled={saving}
                  >
                    {item.profile_photo_url ? (
                      <Image source={{ uri: item.profile_photo_url }} style={s.avatar} />
                    ) : (
                      <View style={s.avatarFallback}>
                        <Text style={s.avatarInitials}>{getInitials(item)}</Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={s.mechanicOptionName}>{getName(item)}</Text>
                      <Text style={s.mechanicOptionSub}>
                        {item.specialization || item.email || 'Mechanic'}
                      </Text>
                    </View>

                    {active && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={s.modalCancel} onPress={() => setMechanicModalOpen(false)}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function ProfileHeader({ theme, profile, title, subtitle }) {
  const s = styles(theme);

  return (
    <View style={s.profileHeader}>
      {profile?.profile_photo_url ? (
        <Image source={{ uri: profile.profile_photo_url }} style={s.profileAvatar} />
      ) : (
        <View style={s.profileAvatarFallback}>
          <Text style={s.profileInitials}>{getInitials(profile)}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text style={s.profileTitle}>{title}</Text>
        <Text style={s.profileSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function InfoRow({ theme, icon, label, value, action, last }) {
  const s = styles(theme);

  return (
    <TouchableOpacity
      activeOpacity={action ? 0.7 : 1}
      onPress={action || undefined}
      style={[s.infoRow, !last && s.infoRowBorder]}
    >
      <Ionicons name={icon} size={18} color={theme.primaryLight || YELLOW} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
      {action && <Ionicons name="open-outline" size={15} color={theme.textMuted} />}
    </TouchableOpacity>
  );
}

function MoneyRow({ theme, label, value, valueColor, last }) {
  const s = styles(theme);

  return (
    <View style={[s.moneyRow, !last && s.moneyRowBorder]}>
      <Text style={s.moneyLabel}>{label}</Text>
      <Text style={[s.moneyValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 28,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: 12,
      fontWeight: '600',
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    headerCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 18,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '900',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    title: {
      fontSize: 21,
      fontWeight: '900',
      color: theme.text,
      lineHeight: 27,
    },
    reference: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    progressOuter: {
      height: 8,
      backgroundColor: theme.bg2,
      borderRadius: 999,
      overflow: 'hidden',
      marginTop: 16,
    },
    progressInner: {
      height: '100%',
      borderRadius: 999,
    },
    progressText: {
      marginTop: 8,
      fontSize: 12,
      color: theme.textSub || theme.textMuted,
      fontWeight: '600',
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 18,
      overflow: 'hidden',
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 12,
    },
    profileAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
    },
    profileAvatarFallback: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.primary + '22',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.primary + '44',
    },
    profileInitials: {
      color: theme.primaryLight || YELLOW,
      fontSize: 16,
      fontWeight: '900',
    },
    profileTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    profileSubtitle: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
    },
    infoRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    infoLabel: {
      flex: 1,
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    infoValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'right',
      flexShrink: 1,
      maxWidth: '55%',
    },
    noteBox: {
      padding: 14,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg2,
    },
    noteLabel: {
      fontSize: 11,
      color: theme.textMuted,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 5,
    },
    noteText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 19,
      fontStyle: 'italic',
    },
    unassignedBox: {
      alignItems: 'center',
      padding: 20,
      gap: 6,
    },
    unassignedTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    unassignedText: {
      color: theme.textMuted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
    },
    outlineBtn: {
      margin: 14,
      marginTop: 0,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    outlineBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    moneyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 14,
    },
    moneyRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    moneyLabel: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    moneyValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    paymentBarOuter: {
      height: 8,
      backgroundColor: theme.bg2,
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 999,
      overflow: 'hidden',
    },
    paymentBarInner: {
      height: '100%',
      backgroundColor: theme.success || '#22c55e',
      borderRadius: 999,
    },
    paymentPercent: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginHorizontal: 14,
      marginTop: 6,
      marginBottom: 12,
    },
    paymentHistory: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
      padding: 14,
    },
    paymentHistoryTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
      marginBottom: 10,
    },
    paymentItem: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    paymentAmount: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    paymentMeta: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    paymentReceipt: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 2,
    },
    paymentDate: {
      color: theme.textMuted,
      fontSize: 11,
      textAlign: 'right',
      maxWidth: 110,
    },
    mutedText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    emptyTimeline: {
      padding: 18,
      alignItems: 'center',
      gap: 8,
    },
    timelineRow: {
      flexDirection: 'row',
      paddingHorizontal: 14,
      paddingTop: 14,
    },
    timelineMarkerCol: {
      width: 34,
      alignItems: 'center',
    },
    timelineDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    timelineLine: {
      width: 2,
      flex: 1,
      backgroundColor: theme.border,
      marginVertical: 4,
    },
    timelineContent: {
      flex: 1,
      paddingBottom: 18,
    },
    timelineTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    timelineDescription: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 4,
      lineHeight: 18,
    },
    timelineMeta: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 5,
      fontWeight: '600',
    },
    inputLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '900',
      marginHorizontal: 14,
      marginTop: 14,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    textArea: {
      marginHorizontal: 14,
      minHeight: 88,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      padding: 12,
      color: theme.text,
      fontSize: 13,
      textAlignVertical: 'top',
    },
    primaryBtn: {
      margin: 14,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 12,
    },
    emptyText: {
      color: theme.textSub || theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 6,
      marginBottom: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 20,
      maxHeight: '90%',
    },
    modalTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 16,
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 13,
      marginBottom: 8,
      backgroundColor: theme.bg2,
    },
    modalDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    modalOptionText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '800',
    },
    currentText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    modalCancel: {
      marginTop: 8,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: theme.bg2,
    },
    modalCancelText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    mechanicOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      backgroundColor: theme.bg2,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: theme.border,
    },
    avatarFallback: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.primary + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      color: theme.primaryLight || YELLOW,
      fontSize: 14,
      fontWeight: '900',
    },
    mechanicOptionName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    mechanicOptionSub: {
      color: theme.textSub || theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
  });
