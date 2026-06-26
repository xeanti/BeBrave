import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

function formatDateTime(value) {
  if (!value) return '';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNotificationIcon(type = '') {
  const normalized = String(type || '').toLowerCase();

  if (normalized.includes('booking')) return 'calendar';
  if (normalized.includes('payment')) return 'card';
  if (normalized.includes('receipt')) return 'receipt';
  if (normalized.includes('invoice')) return 'document-text';
  if (normalized.includes('order')) return 'cart';
  if (normalized.includes('chat')) return 'chatbubbles';
  if (normalized.includes('progress')) return 'construct';
  if (normalized.includes('inventory')) return 'cube';

  return 'notifications';
}

function getReadableType(type = '') {
  if (!type) return 'Notification';

  return String(type)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function NotificationsScreen({ navigation }) {
  const { theme } = useTheme();

  const [userId, setUserId] = useState(null);
  const [role, setRole] = useState('customer');
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((item) => !item.is_read);
    }

    return notifications;
  }, [filter, notifications]);

  async function loadCurrentUser() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.id) {
      setUserId(null);
      return null;
    }

    setUserId(user.id);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role) {
      setRole(profile.role);
    }

    return user.id;
  }

  async function fetchNotifications(showLoader = true) {
    if (showLoader) setLoading(true);

    const activeUserId = userId || (await loadCurrentUser());

    if (!activeUserId) {
      setNotifications([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', activeUserId)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Notifications Error', error.message);
      setNotifications([]);
    } else {
      setNotifications(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    let channel = null;
    let mounted = true;

    async function setup() {
      const activeUserId = await loadCurrentUser();

      if (!activeUserId || !mounted) {
        setLoading(false);
        return;
      }

      await fetchNotifications(true);

      channel = supabase
        .channel(`notifications-screen-${activeUserId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${activeUserId}`,
          },
          () => fetchNotifications(false)
        )
        .subscribe();
    }

    setup();

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications(false);
    }, [userId])
  );

  async function markAsRead(notification) {
    if (!notification?.id || notification.is_read) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id ? { ...item, is_read: true } : item
      )
    );
  }

  async function markAllAsRead() {
    const activeUserId = userId || (await loadCurrentUser());

    if (!activeUserId) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', activeUserId)
      .eq('is_read', false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
  }

  async function handleNotificationPress(notification) {
    await markAsRead(notification);

    const relatedTable = String(notification?.related_table || '').toLowerCase();
    const notificationType = String(notification?.type || '').toLowerCase();
    const relatedId = notification?.related_id;

    if (relatedTable === 'bookings' && relatedId) {
      if (role === 'mechanic') {
        navigation.navigate('JobDetail', {
          bookingId: relatedId,
          id: relatedId,
        });
        return;
      }

      navigation.navigate('AppointmentDetail', {
        bookingId: relatedId,
        id: relatedId,
      });
      return;
    }

    if (relatedTable === 'orders') {
      if (role === 'admin') {
        navigation.navigate('More', { screen: 'AdminOrders' });
        return;
      }

      if (role === 'staff') {
        navigation.navigate('Payments');
        return;
      }

      navigation.navigate('Shop', { screen: 'OrderHistory' });
      return;
    }

    if (notificationType.includes('payment') || relatedTable === 'payments') {
      if (role === 'staff') {
        navigation.navigate('Payments');
        return;
      }

      if (relatedId) {
        navigation.navigate('AppointmentDetail', {
          bookingId: relatedId,
          id: relatedId,
        });
      }
      return;
    }

    if (relatedTable === 'inventory_movements' || relatedTable === 'parts') {
      if (role === 'admin') {
        navigation.navigate('More', { screen: 'AdminInv' });
        return;
      }

      if (role === 'staff') {
        navigation.navigate('Inventory');
      }
      return;
    }

    if (
      relatedTable === 'chat_conversations' ||
      relatedTable === 'chat_messages' ||
      notificationType.includes('chat')
    ) {
      navigation.navigate('Chat');
    }
  }

  function onRefresh() {
    setRefreshing(true);
    fetchNotifications(false);
  }

  function renderNotification({ item }) {
    const isUnread = !item.is_read;
    const iconName = getNotificationIcon(item.type);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderColor: isUnread ? YELLOW : theme.border,
          },
        ]}
        activeOpacity={0.78}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={styles.cardTop}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isUnread ? YELLOW + '22' : theme.bg,
                borderColor: isUnread ? YELLOW + '55' : theme.border,
              },
            ]}
          >
            <Ionicons
              name={iconName}
              size={20}
              color={isUnread ? YELLOW : theme.textMuted}
            />
          </View>

          <View style={styles.cardContent}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.title,
                  { color: theme.text },
                  isUnread && styles.unreadTitle,
                ]}
                numberOfLines={2}
              >
                {item.title || 'MotoFix Notification'}
              </Text>

              {isUnread && <View style={styles.unreadDot} />}
            </View>

            {!!item.message && (
              <Text
                style={[styles.message, { color: theme.textMuted }]}
                numberOfLines={3}
              >
                {item.message}
              </Text>
            )}

            <View style={styles.metaRow}>
              <Text style={[styles.typePill, { color: YELLOW }]}>
                {getReadableType(item.type)}
              </Text>

              <Text style={[styles.dateText, { color: theme.textMuted }]}>
                {formatDateTime(item.created_at)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>
          Loading notifications...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.heading, { color: theme.text }]}>
            Notifications
          </Text>
          <Text style={[styles.subheading, { color: theme.textMuted }]}>
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
              : 'You are all caught up'}
          </Text>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            activeOpacity={0.78}
            onPress={markAllAsRead}
          >
            <Ionicons name="checkmark-done" size={16} color="#111827" />
            <Text style={styles.markAllText}>Read all</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            {
              backgroundColor: filter === 'all' ? YELLOW : theme.card,
              borderColor: filter === 'all' ? YELLOW : theme.border,
            },
          ]}
          onPress={() => setFilter('all')}
          activeOpacity={0.78}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'all' ? '#111827' : theme.textMuted },
            ]}
          >
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            {
              backgroundColor: filter === 'unread' ? YELLOW : theme.card,
              borderColor: filter === 'unread' ? YELLOW : theme.border,
            },
          ]}
          onPress={() => setFilter('unread')}
          activeOpacity={0.78}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'unread' ? '#111827' : theme.textMuted },
            ]}
          >
            Unread
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredNotifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        contentContainerStyle={[
          styles.list,
          filteredNotifications.length === 0 && styles.emptyList,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={YELLOW}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name={filter === 'unread' ? 'checkmark-circle' : 'notifications-off'}
                size={34}
                color={YELLOW}
              />
            </View>

            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {filter === 'unread'
                ? 'No unread notifications'
                : 'No notifications yet'}
            </Text>

            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Booking updates, service progress, payments, receipts, inventory,
              orders, and chat alerts will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: {
    fontSize: 24,
    fontWeight: '900',
  },
  subheading: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: YELLOW,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  markAllText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '900',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  unreadTitle: {
    fontWeight: '900',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: YELLOW,
    marginTop: 6,
  },
  message: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  typePill: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
});
