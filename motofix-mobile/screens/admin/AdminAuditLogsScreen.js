import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'services', label: 'Services' },
  { key: 'settings', label: 'Settings' },
  { key: 'pre_assessments', label: 'Assessments' },
  { key: 'profiles', label: 'Users' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'orders', label: 'Orders' },
];

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getThemeValue(theme, key, fallback) {
  return theme?.[key] || fallback;
}

function getAdminName(profile) {
  if (!profile) return 'Admin';

  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

  return name || profile.full_name || profile.email || 'Admin';
}

function getActionIcon(action = '') {
  const value = String(action).toLowerCase();

  if (value.includes('create')) return 'add-circle';
  if (value.includes('update')) return 'create';
  if (value.includes('delete')) return 'trash';
  if (value.includes('toggle')) return 'swap-horizontal';
  if (value.includes('password')) return 'key';
  if (value.includes('status')) return 'checkmark-circle';
  if (value.includes('setting')) return 'settings';

  return 'document-text';
}

function readableAction(action = '') {
  return String(action || 'Action')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeDetails(details) {
  if (!details) return '';

  try {
    if (typeof details === 'string') return details;
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export default function AdminAuditLogsScreen() {
  const { theme } = useTheme();
  const s = styles(theme);

  const [logs, setLogs] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return logs.filter((log) => {
      const entity = String(log.entity || '').toLowerCase();

      if (filter !== 'all' && entity !== filter) return false;

      if (!query) return true;

      const profile = profilesById[log.performed_by];
      const adminName = getAdminName(profile).toLowerCase();
      const action = String(log.action || '').toLowerCase();
      const entityId = String(log.entity_id || '').toLowerCase();
      const details = safeDetails(log.details).toLowerCase();

      return (
        adminName.includes(query) ||
        action.includes(query) ||
        entity.includes(query) ||
        entityId.includes(query) ||
        details.includes(query)
      );
    });
  }, [logs, filter, search, profilesById]);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      services: logs.filter((item) => item.entity === 'services').length,
      settings: logs.filter((item) => item.entity === 'settings').length,
      assessments: logs.filter((item) => item.entity === 'pre_assessments').length,
    };
  }, [logs]);

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel('mobile-admin-audit-logs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audit_logs',
        },
        () => fetchLogs(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLogs(false);
    }, [])
  );

  async function fetchLogs(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setLogs([]);
      setProfilesById({});
      setLoading(false);
      setRefreshing(false);
      Alert.alert('Audit Logs Error', error.message);
      return;
    }

    const rows = data || [];
    setLogs(rows);

    await fetchProfiles(rows);

    setLoading(false);
    setRefreshing(false);
  }

  async function fetchProfiles(rows) {
    const ids = [
      ...new Set(rows.map((item) => item.performed_by).filter(Boolean)),
    ];

    if (ids.length === 0) {
      setProfilesById({});
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email, role')
      .in('id', ids);

    if (error) {
      console.log('Fetch audit profile error:', error.message);
      setProfilesById({});
      return;
    }

    const map = {};
    (data || []).forEach((profile) => {
      map[profile.id] = profile;
    });

    setProfilesById(map);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchLogs(false);
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading audit logs...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={YELLOW}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="shield-checkmark" size={26} color="#111827" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.title}>Audit Logs</Text>
          <Text style={s.subtitle}>
            Track admin actions for accountability, system monitoring, and record transparency.
          </Text>
        </View>
      </View>

      <View style={s.statsGrid}>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Total Logs</Text>
          <Text style={s.statValue}>{stats.total}</Text>
        </View>

        <View style={s.statCard}>
          <Text style={s.statLabel}>Services</Text>
          <Text style={s.statValue}>{stats.services}</Text>
        </View>

        <View style={s.statCard}>
          <Text style={s.statLabel}>Settings</Text>
          <Text style={s.statValue}>{stats.settings}</Text>
        </View>

        <View style={s.statCard}>
          <Text style={s.statLabel}>Assessments</Text>
          <Text style={s.statValue}>{stats.assessments}</Text>
        </View>
      </View>

      <View style={s.searchBox}>
        <Ionicons
          name="search"
          size={18}
          color={getThemeValue(theme, 'textMuted', '#9ca3af')}
        />

        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search action, admin, entity, details..."
          placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
        />

        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons
              name="close-circle"
              size={20}
              color={getThemeValue(theme, 'textMuted', '#9ca3af')}
            />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {FILTERS.map((item) => {
          const active = filter === item.key;

          return (
            <TouchableOpacity
              key={item.key}
              style={[s.filterButton, active && s.filterButtonActive]}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, active && s.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.listHeader}>
        <Text style={s.listTitle}>Recent Activity</Text>
        <Text style={s.listCount}>
          {filteredLogs.length} of {logs.length}
        </Text>
      </View>

      {filteredLogs.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons
            name="document-lock-outline"
            size={42}
            color={getThemeValue(theme, 'textMuted', '#9ca3af')}
          />
          <Text style={s.emptyTitle}>No audit logs found</Text>
          <Text style={s.emptyText}>
            Admin actions will appear here after services, settings, users, or assessment updates.
          </Text>
        </View>
      ) : (
        filteredLogs.map((log) => {
          const profile = profilesById[log.performed_by];
          const detailsText = safeDetails(log.details);

          return (
            <View key={log.id} style={s.logCard}>
              <View style={s.logTop}>
                <View style={s.logIcon}>
                  <Ionicons
                    name={getActionIcon(log.action)}
                    size={20}
                    color={YELLOW}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.actionText}>{readableAction(log.action)}</Text>
                  <Text style={s.metaText}>
                    {String(log.entity || 'record').replace(/_/g, ' ')} ·{' '}
                    {formatDateTime(log.created_at)}
                  </Text>
                </View>
              </View>

              <View style={s.infoBox}>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Performed By</Text>
                  <Text style={s.infoValue}>{getAdminName(profile)}</Text>
                </View>

                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Role</Text>
                  <Text style={s.infoValue}>
                    {profile?.role ? String(profile.role).toUpperCase() : '—'}
                  </Text>
                </View>

                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Entity ID</Text>
                  <Text style={s.infoValue}>
                    {log.entity_id ? String(log.entity_id).slice(0, 12) : '—'}
                  </Text>
                </View>
              </View>

              {!!detailsText && (
                <View style={s.detailsBox}>
                  <Text style={s.detailsLabel}>Details</Text>
                  <Text style={s.detailsText} numberOfLines={8}>
                    {detailsText}
                  </Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = (theme) => {
  const bg = getThemeValue(theme, 'bg', '#0f172a');
  const bg2 = getThemeValue(theme, 'bg2', '#111827');
  const card = getThemeValue(theme, 'card', '#1f2937');
  const border = getThemeValue(theme, 'border', '#374151');
  const text = getThemeValue(theme, 'text', '#f9fafb');
  const textSub = getThemeValue(theme, 'textSub', '#d1d5db');
  const textMuted = getThemeValue(theme, 'textMuted', '#9ca3af');

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: bg,
    },
    content: {
      padding: 16,
      paddingBottom: 42,
    },
    centered: {
      flex: 1,
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: textMuted,
      marginTop: 10,
      fontWeight: '600',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
    },
    headerIcon: {
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: text,
      fontSize: 25,
      fontWeight: '900',
    },
    subtitle: {
      color: textSub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 14,
    },
    statCard: {
      width: '48%',
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 16,
      padding: 14,
    },
    statLabel: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginBottom: 5,
    },
    statValue: {
      color: text,
      fontSize: 24,
      fontWeight: '900',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 15,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      color: text,
      paddingVertical: 13,
      fontSize: 14,
      fontWeight: '600',
    },
    filterRow: {
      gap: 9,
      paddingBottom: 14,
    },
    filterButton: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    filterButtonActive: {
      backgroundColor: YELLOW,
      borderColor: YELLOW,
    },
    filterText: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '900',
    },
    filterTextActive: {
      color: '#111827',
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    listTitle: {
      color: text,
      fontSize: 17,
      fontWeight: '900',
    },
    listCount: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    emptyCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      padding: 28,
      alignItems: 'center',
    },
    emptyTitle: {
      color: text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 12,
    },
    emptyText: {
      color: textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 6,
    },
    logCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      padding: 15,
      marginBottom: 13,
    },
    logTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 13,
    },
    logIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: YELLOW + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionText: {
      color: text,
      fontSize: 15,
      fontWeight: '900',
    },
    metaText: {
      color: textMuted,
      fontSize: 12,
      marginTop: 3,
      textTransform: 'capitalize',
    },
    infoBox: {
      backgroundColor: bg2,
      borderRadius: 14,
      padding: 12,
      gap: 8,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    infoLabel: {
      color: textMuted,
      fontSize: 12,
      flex: 1,
    },
    infoValue: {
      color: text,
      fontSize: 12,
      fontWeight: '900',
      flex: 1.3,
      textAlign: 'right',
    },
    detailsBox: {
      backgroundColor: bg2,
      borderRadius: 14,
      padding: 12,
      marginTop: 11,
    },
    detailsLabel: {
      color: text,
      fontSize: 12,
      fontWeight: '900',
      marginBottom: 5,
    },
    detailsText: {
      color: textSub,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
  });
};