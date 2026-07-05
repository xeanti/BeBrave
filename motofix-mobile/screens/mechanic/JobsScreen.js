import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { notifyRole, notifyUser } from '../../lib/notifications';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Approved' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'repairing', label: 'Repairing' },
  { key: 'quality_check', label: 'Quality Check' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const MECHANIC_PROGRESS_FLOW = {
  confirmed: { next: 'in_progress', label: 'Start Service', icon: 'play-circle' },
  in_progress: { next: 'inspection', label: 'Move to Inspection', icon: 'search' },
  inspection: { next: 'repairing', label: 'Start Repair', icon: 'construct' },
  repairing: { next: 'quality_check', label: 'Quality Check', icon: 'shield-checkmark' },
  quality_check: { next: 'ready_for_pickup', label: 'Ready for Pickup', icon: 'bag-check' },
  ready_for_pickup: { next: 'completed', label: 'Complete Service', icon: 'checkmark-done-circle' },
};

const TERMINAL_STATUSES = ['completed', 'cancelled', 'rejected', 'no_show'];

function normalizeStatus(status) {
  return String(status || '').toLowerCase();
}

function humanize(value) {
  if (!value) return '—';

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return '—';

  const parts = String(value).split('-');

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);

    return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return String(value);
}

function formatTime(value) {
  if (!value) return '—';

  const [h, m] = String(value).slice(0, 5).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m || '00'} ${ampm}`;
}

function getCustomerName(booking) {
  const profile = booking?.profiles || {};
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

  return name || profile.email || profile.phone || 'Customer';
}

function getCustomerContact(booking) {
  const profile = booking?.profiles || {};

  return profile.phone || profile.email || '—';
}

function getBookingServiceRows(booking) {
  const rows = Array.isArray(booking?.booking_services) ? booking.booking_services : [];

  if (rows.length > 0) {
    return rows.map((row) => ({
      ...row,
      service_name: row.service_name || row.services?.name || 'Service',
      estimated_duration_minutes:
        Number(row.estimated_duration_minutes ?? row.services?.estimated_duration_minutes ?? 30) || 30,
      quantity: Number(row.quantity) || 1,
    }));
  }

  if (booking?.services_summary && String(booking.services_summary).includes(',')) {
    return String(booking.services_summary)
      .split(',')
      .map((name, index) => ({
        id: `summary-${index}`,
        service_name: name.trim(),
        estimated_duration_minutes: 30,
        quantity: 1,
      }))
      .filter((row) => row.service_name);
  }

  if (booking?.services?.name || booking?.services_summary) {
    return [
      {
        id: booking?.service_id || 'single-service',
        service_name: booking.services_summary || booking.services?.name || 'Service',
        estimated_duration_minutes: Number(booking?.services?.estimated_duration_minutes) || 30,
        quantity: 1,
      },
    ];
  }

  return [];
}

function getServiceTitle(booking) {
  const rows = getBookingServiceRows(booking);

  if (rows.length > 0) {
    return rows.map((row) => row.service_name).join(', ');
  }

  return booking?.services_summary || booking?.services?.name || 'Service';
}

function getServiceCount(booking) {
  const rows = getBookingServiceRows(booking);

  if (rows.length > 0) {
    return rows.reduce((sum, row) => sum + (Number(row.quantity) || 1), 0);
  }

  return booking?.service_id ? 1 : 0;
}

function getServiceDuration(booking) {
  const rows = getBookingServiceRows(booking);

  if (rows.length > 0) {
    return rows.reduce(
      (sum, row) =>
        sum +
        ((Number(row.estimated_duration_minutes) || 30) *
          (Number(row.quantity) || 1)),
      0
    );
  }

  return Number(booking?.services?.estimated_duration_minutes) || 30;
}

function getNextMechanicAction(booking) {
  const current = normalizeStatus(booking?.status);
  return MECHANIC_PROGRESS_FLOW[current] || null;
}

function canMechanicUpdateProgress(booking) {
  const current = normalizeStatus(booking?.status);

  if (current === 'pending') return false;
  if (TERMINAL_STATUSES.includes(current)) return false;

  return Boolean(getNextMechanicAction(booking));
}

export default function JobsScreen({ navigation }) {
  const { theme, isDark } = useTheme();

  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);

  const s = styles(theme);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    setUser(currentUser);
    await fetchBookings(currentUser?.id);
  }

  async function fetchBookings(userId) {
    const id = userId || user?.id;

    if (!id) {
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
          base_price,
          labor_cost,
          estimated_duration_minutes
        ),
        booking_services (
          id,
          service_id,
          service_name,
          base_price,
          labor_cost,
          estimated_duration_minutes,
          quantity,
          services (
            name,
            estimated_duration_minutes
          )
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
      .eq('mechanic_id', id)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setBookings(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookings();
  }, [user]);

  const counts = useMemo(() => {
    const result = { all: bookings.length };

    FILTERS.forEach((filter) => {
      if (filter.key !== 'all') {
        result[filter.key] = bookings.filter(
          (booking) => normalizeStatus(booking.status) === filter.key
        ).length;
      }
    });

    return result;
  }, [bookings]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      const bookingStatus = normalizeStatus(booking.status);
      const matchesStatus =
        statusFilter === 'all' || bookingStatus === statusFilter;

      const customerName = getCustomerName(booking).toLowerCase();
      const customerContact = getCustomerContact(booking).toLowerCase();
      const serviceName = getServiceTitle(booking).toLowerCase();

      const matchesSearch =
        query === '' ||
        customerName.includes(query) ||
        customerContact.includes(query) ||
        serviceName.includes(query) ||
        String(booking.id || '').toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [bookings, search, statusFilter]);

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

  async function fallbackUpdateStatus(booking, status) {
    const current = normalizeStatus(booking.status);
    const allowedNext = MECHANIC_PROGRESS_FLOW[current]?.next;

    if (status !== allowedNext) {
      throw new Error('Mechanics can only update service progress after staff/admin approval.');
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', booking.id)
      .eq('mechanic_id', user.id);

    if (updateError) throw updateError;

    await supabase.from('service_progress_events').insert({
      booking_id: booking.id,
      customer_id: booking.customer_id || null,
      mechanic_id: user.id,
      service_id: booking.service_id || null,
      status,
      title: humanize(status),
      description: `Mechanic updated service progress to ${humanize(status)}.`,
      progress_percent:
        status === 'in_progress'
          ? 40
          : status === 'inspection'
            ? 50
            : status === 'repairing'
              ? 70
              : status === 'quality_check'
                ? 85
                : status === 'ready_for_pickup'
                  ? 95
                  : status === 'completed'
                    ? 100
                    : 25,
      event_type: 'service_progress',
    });
  }

  async function updateStatus(booking) {
    if (!booking?.id || !user?.id) return;

    const action = getNextMechanicAction(booking);

    if (!action) {
      Alert.alert(
        'Not Allowed',
        normalizeStatus(booking.status) === 'pending'
          ? 'This booking is still pending. Only staff or admin can approve bookings first.'
          : 'No service progress update is available for this booking.'
      );
      return;
    }

    Alert.alert(
      'Update Service Progress',
      `Move this job to "${humanize(action.next)}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setUpdatingId(booking.id);

            const { error: rpcError } = await supabase.rpc(
              'update_booking_service_progress',
              {
                p_booking_id: booking.id,
                p_status: action.next,
                p_notes: null,
              }
            );

            if (rpcError) {
              try {
                await fallbackUpdateStatus(booking, action.next);
              } catch (fallbackError) {
                setUpdatingId(null);
                Alert.alert('Error', fallbackError.message || rpcError.message);
                return;
              }
            }

            setBookings((prev) =>
              prev.map((item) =>
                item.id === booking.id ? { ...item, status: action.next } : item
              )
            );

            setUpdatingId(null);

            if (booking.customer_id) {
              await notifyUser({
                userId: booking.customer_id,
                title: 'Service Progress Updated',
                message: `Your booking is now marked as ${humanize(action.next)}.`,
                type: 'service_progress',
                relatedTable: 'bookings',
                relatedId: booking.id,
              });
            }

            await notifyRole({
              role: 'admin',
              title: 'Service Progress Updated',
              message: `A mechanic updated a booking to ${humanize(action.next)}.`,
              type: 'service_progress',
              relatedTable: 'bookings',
              relatedId: booking.id,
            });

            await notifyRole({
              role: 'staff',
              title: 'Service Progress Updated',
              message: `A mechanic updated a booking to ${humanize(action.next)}.`,
              type: 'service_progress',
              relatedTable: 'bookings',
              relatedId: booking.id,
            });
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight || YELLOW} />
        <Text style={s.loadingText}>Loading assigned jobs...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.statBarOuter}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statBarContent}
        >
          {FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                s.statChip,
                statusFilter === filter.key && s.statChipActive,
              ]}
              onPress={() => setStatusFilter(filter.key)}
            >
              <Text
                style={[
                  s.statChipLabel,
                  statusFilter === filter.key && s.statChipLabelActive,
                ]}
              >
                {filter.label} ({counts[filter.key] ?? 0})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search customer, service, phone, or booking ID..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />

        {(search || statusFilter !== 'all') && (
          <TouchableOpacity
            onPress={() => {
              setSearch('');
              setStatusFilter('all');
            }}
          >
            <Text style={s.clearSmall}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryLight || YELLOW}
          />
        }
      >
        {bookings.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔧</Text>
            <Text style={s.emptyTitle}>No bookings assigned</Text>
            <Text style={s.emptyText}>
              Staff or admin assigned jobs will show up here.
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>No matches</Text>
            <TouchableOpacity
              onPress={() => {
                setSearch('');
                setStatusFilter('all');
              }}
            >
              <Text style={s.clearLink}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((booking) => {
            const current = normalizeStatus(booking.status);
            const action = getNextMechanicAction(booking);
            const canUpdate = canMechanicUpdateProgress(booking);
            const isUpdating = updatingId === booking.id;
            const serviceCount = getServiceCount(booking);
            const duration = getServiceDuration(booking);

            return (
              <View key={booking.id} style={s.card}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('JobDetail', { booking })}
                  activeOpacity={0.7}
                >
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.serviceName}>{getServiceTitle(booking)}</Text>
                      <Text style={s.refText}>
                        #{booking.id?.slice(0, 8).toUpperCase()} · {serviceCount} service{serviceCount > 1 ? 's' : ''} · {duration} mins
                      </Text>
                    </View>

                    <View
                      style={[
                        s.badge,
                        {
                          backgroundColor: statusColor(booking.status) + '22',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.badgeText,
                          { color: statusColor(booking.status) },
                        ]}
                      >
                        {current === 'confirmed' ? 'Approved' : humanize(booking.status)}
                      </Text>
                    </View>
                  </View>

                  <View style={s.infoGrid}>
                    <View style={s.infoBox}>
                      <Text style={s.infoLabel}>Schedule</Text>
                      <Text style={s.infoValue}>
                        {formatDate(booking.booking_date)}
                      </Text>
                      <Text style={s.infoSub}>{formatTime(booking.booking_time)}</Text>
                    </View>

                    <View style={s.infoBox}>
                      <Text style={s.infoLabel}>Customer</Text>
                      <Text style={s.infoValue}>{getCustomerName(booking)}</Text>
                      <Text style={s.infoSub}>{getCustomerContact(booking)}</Text>
                    </View>
                  </View>

                  {booking.notes ? (
                    <Text style={s.notesText}>"{booking.notes}"</Text>
                  ) : null}
                </TouchableOpacity>

                <View style={s.divider} />

                <View style={s.footerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.updateLabel}>Mechanic action</Text>
                    <Text style={s.actionHint}>
                      {current === 'pending'
                        ? 'Waiting for staff/admin approval'
                        : TERMINAL_STATUSES.includes(current)
                          ? 'Job is already closed'
                          : action
                            ? `Next: ${humanize(action.next)}`
                            : 'No next step available'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('JobDetail', { booking })}
                  >
                    <Text style={s.detailsLink}>View details</Text>
                  </TouchableOpacity>
                </View>

                {canUpdate && action ? (
                  <TouchableOpacity
                    disabled={isUpdating}
                    onPress={() => updateStatus(booking)}
                    style={[
                      s.primaryActionBtn,
                      {
                        opacity: isUpdating ? 0.6 : 1,
                        backgroundColor: statusColor(action.next),
                      },
                    ]}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name={action.icon} size={17} color="#fff" />
                        <Text style={s.primaryActionText}>{action.label}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View
                    style={[
                      s.lockedBox,
                      {
                        borderColor:
                          current === 'pending'
                            ? theme.warning + '44'
                            : theme.border,
                        backgroundColor:
                          current === 'pending'
                            ? theme.warning + '12'
                            : theme.bg2,
                      },
                    ]}
                  >
                    <Ionicons
                      name={current === 'pending' ? 'lock-closed-outline' : 'checkmark-circle-outline'}
                      size={17}
                      color={current === 'pending' ? theme.warning : theme.textMuted}
                    />
                    <Text
                      style={[
                        s.lockedText,
                        { color: current === 'pending' ? theme.warning : theme.textMuted },
                      ]}
                    >
                      {current === 'pending'
                        ? 'Waiting for staff/admin approval.'
                        : 'No quick action available.'}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}


const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.bg,
      padding: 24,
    },
    loadingText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 12,
    },
    statBarOuter: {
      backgroundColor: theme.bg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingTop: 4,
    },
    statBarContent: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      gap: 8,
    },
    statChip: {
      minWidth: 96,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    statChipLabel: {
      fontSize: 11,
      color: theme.textSub || theme.textMuted,
      marginTop: 2,
      lineHeight: 14,
      textAlign: 'center',
    },
    statChipLabelActive: { color: 'rgba(255,255,255,0.9)' },
    searchWrap: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 2,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 11,
      fontSize: 14,
      color: theme.text,
      fontWeight: '600',
    },
    clearSmall: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '900',
    },
    card: {
      backgroundColor: theme.card,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
      gap: 10,
    },
    serviceName: {
      fontSize: 16,
      fontWeight: '900',
      color: theme.text,
      lineHeight: 22,
    },
    refText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 4,
      lineHeight: 16,
    },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      maxWidth: 105,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'capitalize',
      textAlign: 'center',
      lineHeight: 14,
    },
    infoGrid: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    infoBox: {
      flex: 1,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    infoLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    infoValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
      lineHeight: 17,
    },
    infoSub: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 3,
      lineHeight: 15,
    },
    notesText: {
      fontSize: 13,
      color: theme.textMuted,
      fontStyle: 'italic',
      marginTop: 10,
      lineHeight: 18,
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 12,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 10,
    },
    updateLabel: {
      fontSize: 11,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontWeight: '900',
    },
    actionHint: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 3,
      lineHeight: 17,
    },
    detailsLink: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '900',
    },
    primaryActionBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryActionText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '900',
    },
    lockedBox: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    lockedText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 17,
    },
    emptyCard: {
      alignItems: 'center',
      padding: 48,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: theme.textSub || theme.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    clearLink: {
      fontSize: 14,
      color: theme.primaryLight || YELLOW,
      fontWeight: '600',
    },
  });
