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
import { supabase } from '../../lib/supabase';
import { notifyRole, notifyUser } from '../../lib/notifications';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'repairing', label: 'Repairing' },
  { key: 'quality_check', label: 'Quality Check' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const ACTION_STATUSES = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'repairing', label: 'Repairing' },
  { key: 'quality_check', label: 'Quality Check' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed', label: 'Completed' },
];

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

function formatTime(value) {
  if (!value) return '—';

  const [h, m] = String(value).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m || '00'} ${ampm}`;
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
    const result = {
      all: bookings.length,
    };

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
    return bookings.filter((booking) => {
      const bookingStatus = normalizeStatus(booking.status);
      const matchesStatus =
        statusFilter === 'all' || bookingStatus === statusFilter;

      const customerName = `${booking.profiles?.first_name || ''} ${
        booking.profiles?.last_name || ''
      }`.toLowerCase();

      const serviceName = (booking.services?.name || '').toLowerCase();
      const query = search.trim().toLowerCase();

      const matchesSearch =
        query === '' ||
        customerName.includes(query) ||
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
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', booking.id)
      .eq('mechanic_id', user.id);

    if (updateError) throw updateError;

    await supabase.from('service_progress_events').insert({
      booking_id: booking.id,
      status,
      notes: null,
    });
  }

  async function updateStatus(booking, status) {
    if (!booking?.id || !user?.id) return;

    Alert.alert(
      'Update Job Status',
      `Mark this job as "${humanize(status)}"?`,
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
                p_status: status,
                p_notes: null,
              }
            );

            if (rpcError) {
              try {
                await fallbackUpdateStatus(booking, status);
              } catch (fallbackError) {
                setUpdatingId(null);
                Alert.alert('Error', fallbackError.message || rpcError.message);
                return;
              }
            }

            setBookings((prev) =>
              prev.map((item) =>
                item.id === booking.id ? { ...item, status } : item
              )
            );

            setUpdatingId(null);

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
          },
        },
      ]
    );
  }

  function getAvailableActions(booking) {
    const current = normalizeStatus(booking.status);

    if (TERMINAL_STATUSES.includes(current)) {
      return [];
    }

    return ACTION_STATUSES.filter((status) => status.key !== current);
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
                  s.statChipNum,
                  statusFilter === filter.key && s.statChipNumActive,
                ]}
              >
                {counts[filter.key] ?? 0}
              </Text>

              <Text
                style={[
                  s.statChipLabel,
                  statusFilter === filter.key && s.statChipLabelActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by customer, service, or booking ID..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
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
              Bookings assigned to you will show up here.
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
            const availableActions = getAvailableActions(booking);
            const isUpdating = updatingId === booking.id;

            return (
              <View key={booking.id} style={s.card}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('JobDetail', { booking })
                  }
                  activeOpacity={0.7}
                >
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.serviceName}>
                        {booking.services?.name || 'Service'}
                      </Text>
                      <Text style={s.refText}>
                        #{booking.id?.slice(0, 8).toUpperCase()}
                      </Text>
                    </View>

                    <View
                      style={[
                        s.badge,
                        {
                          backgroundColor:
                            statusColor(booking.status) + '22',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.badgeText,
                          { color: statusColor(booking.status) },
                        ]}
                      >
                        {humanize(booking.status)}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.dateText}>
                    📅 {booking.booking_date || '—'} at{' '}
                    {formatTime(booking.booking_time)}
                  </Text>

                  {booking.profiles && (
                    <Text style={s.customerText}>
                      👤 {booking.profiles.first_name}{' '}
                      {booking.profiles.last_name}
                      {booking.profiles.phone
                        ? ` · ${booking.profiles.phone}`
                        : ''}
                    </Text>
                  )}

                  {booking.notes ? (
                    <Text style={s.notesText}>"{booking.notes}"</Text>
                  ) : null}
                </TouchableOpacity>

                <View style={s.divider} />

                <View style={s.footerRow}>
                  <Text style={s.updateLabel}>Quick status update</Text>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('JobDetail', { booking })}
                  >
                    <Text style={s.detailsLink}>View details</Text>
                  </TouchableOpacity>
                </View>

                {availableActions.length === 0 ? (
                  <Text style={s.noActionText}>
                    No more quick actions available.
                  </Text>
                ) : (
                  <View style={s.statusRow}>
                    {availableActions.map((status) => (
                      <TouchableOpacity
                        key={status.key}
                        disabled={isUpdating}
                        onPress={() => updateStatus(booking, status.key)}
                        style={[
                          s.statusBtn,
                          {
                            borderColor: statusColor(status.key) + '55',
                            opacity: isUpdating ? 0.5 : 1,
                          },
                        ]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator size="small" color={theme.text} />
                        ) : (
                          <Text
                            style={[
                              s.statusBtnText,
                              { color: statusColor(status.key) },
                            ]}
                          >
                            {status.label}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
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
    },
    statBarContent: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      gap: 8,
    },
    statChip: {
      minWidth: 92,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
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
    statChipNum: {
      fontSize: 15,
      fontWeight: 'bold',
      color: theme.text,
      lineHeight: 18,
    },
    statChipNumActive: { color: '#fff' },
    statChipLabel: {
      fontSize: 11,
      color: theme.textSub || theme.textMuted,
      marginTop: 2,
      lineHeight: 14,
      textAlign: 'center',
    },
    statChipLabelActive: { color: 'rgba(255,255,255,0.9)' },
    searchWrap: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 6,
    },
    searchInput: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      color: theme.text,
    },
    card: {
      backgroundColor: theme.card,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
      gap: 8,
    },
    serviceName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.text,
    },
    refText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
    badge: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: 'bold',
      textTransform: 'capitalize',
    },
    dateText: {
      fontSize: 13,
      color: theme.textSub || theme.textMuted,
      marginBottom: 4,
    },
    customerText: {
      fontSize: 13,
      color: theme.textSub || theme.textMuted,
      marginBottom: 4,
    },
    notesText: {
      fontSize: 13,
      color: theme.textMuted,
      fontStyle: 'italic',
      marginTop: 4,
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 12,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    updateLabel: {
      fontSize: 11,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontWeight: '800',
    },
    detailsLink: {
      color: theme.primaryLight || YELLOW,
      fontSize: 12,
      fontWeight: '800',
    },
    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    statusBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      backgroundColor: theme.bg2,
    },
    statusBtnText: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    noActionText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
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
    },
    clearLink: {
      fontSize: 14,
      color: theme.primaryLight || YELLOW,
      fontWeight: '600',
    },
  });