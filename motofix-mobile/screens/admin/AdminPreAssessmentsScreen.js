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
  { key: 'pending', label: 'Pending' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'converted', label: 'Converted' },
];

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
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

function getStatusConfig(theme, status) {
  const value = String(status || 'pending').toLowerCase();

  switch (value) {
    case 'reviewed':
      return {
        label: 'Reviewed',
        icon: 'checkmark-circle',
        color: '#3b82f6',
        bg: 'rgba(59, 130, 246, 0.14)',
      };
case 'converted':
  return {
    label: 'Converted',
    icon: 'swap-horizontal',
    color: getThemeValue(theme, 'success', '#22c55e'),
    bg: 'rgba(34, 197, 94, 0.14)',
  };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: 'close-circle',
        color: getThemeValue(theme, 'danger', '#ef4444'),
        bg: 'rgba(239, 68, 68, 0.14)',
      };
    default:
      return {
        label: 'Pending',
        icon: 'time',
        color: getThemeValue(theme, 'warning', '#f59e0b'),
        bg: 'rgba(245, 158, 11, 0.14)',
      };
  }
}

function getCustomerName(profile) {
  if (!profile) return 'Customer';

  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

  return fullName || profile.full_name || profile.email || 'Customer';
}

export default function AdminPreAssessmentsScreen() {
  const { theme } = useTheme();
  const s = styles(theme);

  const [assessments, setAssessments] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const stats = useMemo(() => {
    return {
      total: assessments.length,
      pending: assessments.filter((item) => item.status === 'pending' || !item.status)
        .length,
      reviewed: assessments.filter((item) => item.status === 'reviewed').length,
      converted: assessments.filter((item) => item.status === 'converted').length,
      cancelled: assessments.filter((item) => item.status === 'cancelled').length,
    };
  }, [assessments]);

  const filteredAssessments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assessments.filter((assessment) => {
      const status = String(assessment.status || 'pending').toLowerCase();

      if (filter !== 'all' && status !== filter) return false;

      if (!query) return true;

      const profile = profilesById[assessment.customer_id];
      const customerName = getCustomerName(profile).toLowerCase();
      const motorcycle = `${assessment.motorcycle_make || ''} ${
        assessment.motorcycle_model || ''
      } ${assessment.motorcycle_year || ''}`.toLowerCase();
      const serviceName = String(assessment.services?.name || '').toLowerCase();
      const issue = String(assessment.issue_description || '').toLowerCase();

      return (
        customerName.includes(query) ||
        motorcycle.includes(query) ||
        serviceName.includes(query) ||
        issue.includes(query)
      );
    });
  }, [assessments, filter, search, profilesById]);

  useEffect(() => {
    fetchAssessments();

    const channel = supabase
      .channel('mobile-admin-pre-assessments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pre_assessments',
        },
        () => fetchAssessments(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAssessments(false);
    }, [])
  );

  async function fetchAssessments(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('pre_assessments')
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
        )
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      setAssessments([]);
      setProfilesById({});
      setLoading(false);
      setRefreshing(false);
      Alert.alert('Pre-Assessments Error', error.message);
      return;
    }

    const rows = data || [];
    setAssessments(rows);

    await fetchProfiles(rows);

    setLoading(false);
    setRefreshing(false);
  }

  async function fetchProfiles(rows) {
    const ids = [
      ...new Set(rows.map((item) => item.customer_id).filter(Boolean)),
    ];

    if (ids.length === 0) {
      setProfilesById({});
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email, phone')
      .in('id', ids);

    if (error) {
      console.log('Fetch assessment profiles error:', error.message);
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
    fetchAssessments(false);
  }

  async function insertAuditLog(action, assessment, details = {}) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'pre_assessments',
      entity_id: assessment.id,
      performed_by: user.id,
      details,
    });
  }

async function sendCustomerNotification(assessment, nextStatus) {
  if (!assessment?.customer_id) return;

  const statusLabel =
    nextStatus === 'reviewed'
      ? 'reviewed'
      : nextStatus === 'converted'
      ? 'converted'
      : nextStatus;

  await supabase.from('notifications').insert({
    user_id: assessment.customer_id,
    title: 'Pre-Assessment Update',
    message: `Your pre-assessment for ${
      assessment.services?.name || 'your service'
    } was marked as ${statusLabel}.`,
    type: 'pre_assessment_update',
    related_table: 'pre_assessments',
    related_id: assessment.id,
    is_read: false,
  });
}

async function updateAssessmentStatus(assessment, nextStatus) {
  if (!assessment?.id) return;

  const currentStatus = String(assessment.status || 'pending').toLowerCase();

  if (currentStatus === nextStatus) {
    Alert.alert('No Change', `This assessment is already ${nextStatus}.`);
    return;
  }

  setUpdatingId(assessment.id);

  const { error } = await supabase
    .from('pre_assessments')
    .update({
      status: nextStatus,
    })
    .eq('id', assessment.id);

  if (error) {
    setUpdatingId(null);
    Alert.alert('Update Failed', error.message);
    return;
  }

  await insertAuditLog('UPDATE_PRE_ASSESSMENT_STATUS', assessment, {
    old_status: currentStatus,
    new_status: nextStatus,
    service: assessment.services?.name || null,
  });

  await sendCustomerNotification(assessment, nextStatus);

  setAssessments((prev) =>
    prev.map((item) =>
      item.id === assessment.id
        ? {
            ...item,
            status: nextStatus,
          }
        : item
    )
  );

  setUpdatingId(null);
}

function confirmMarkConverted(assessment) {
  Alert.alert(
    'Mark as Converted',
    'Use this when the pre-assessment has already been converted to the next transaction or booking step.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Converted',
        onPress: () => updateAssessmentStatus(assessment, 'converted'),
      },
    ]
  );
}

function renderActionButtons(assessment) {
  const status = String(assessment.status || 'pending').toLowerCase();
  const busy = updatingId === assessment.id;

  if (busy) {
    return (
      <View style={s.loadingAction}>
        <ActivityIndicator color={YELLOW} />
        <Text style={s.loadingActionText}>Updating...</Text>
      </View>
    );
  }

  if (status === 'converted') {
    return (
      <View style={s.convertedNotice}>
        <Ionicons name="swap-horizontal" size={16} color="#22c55e" />
        <Text style={s.convertedNoticeText}>Already marked as converted</Text>
      </View>
    );
  }

  return (
    <View style={s.actions}>
      {status !== 'reviewed' && (
        <TouchableOpacity
          style={s.primaryButton}
          onPress={() => updateAssessmentStatus(assessment, 'reviewed')}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark" size={15} color="#111827" />
          <Text style={s.primaryButtonText}>Mark Reviewed</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={s.secondaryButton}
        onPress={() => confirmMarkConverted(assessment)}
        activeOpacity={0.8}
      >
        <Ionicons name="swap-horizontal" size={15} color={YELLOW} />
        <Text style={s.secondaryButtonText}>Mark Converted</Text>
      </TouchableOpacity>
    </View>
  );
}

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading pre-assessments...</Text>
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
          <Ionicons name="clipboard" size={26} color="#111827" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.title}>Pre-Assessments</Text>
          <Text style={s.subtitle}>
            Review customer cost estimates before they proceed to actual booking.
          </Text>
        </View>
      </View>

      <View style={s.statsGrid}>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Total</Text>
          <Text style={s.statValue}>{stats.total}</Text>
        </View>

        <View style={s.statCard}>
          <Text style={s.statLabel}>Pending</Text>
          <Text style={s.statValue}>{stats.pending}</Text>
        </View>

        <View style={s.statCard}>
          <Text style={s.statLabel}>Reviewed</Text>
          <Text style={s.statValue}>{stats.reviewed}</Text>
        </View>

        <View style={s.statCard}>
          <Text style={s.statLabel}>Converted</Text>
          <Text style={s.statValue}>{stats.converted}</Text>
        </View>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color={getThemeValue(theme, 'textMuted', '#9ca3af')} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search customer, motorcycle, service, issue..."
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
        <Text style={s.listTitle}>Assessment List</Text>
        <Text style={s.listCount}>
          {filteredAssessments.length} of {assessments.length}
        </Text>
      </View>

      {filteredAssessments.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons
            name="document-text-outline"
            size={42}
            color={getThemeValue(theme, 'textMuted', '#9ca3af')}
          />
          <Text style={s.emptyTitle}>No pre-assessments found</Text>
          <Text style={s.emptyText}>
            Customer submitted pre-assessments will appear here.
          </Text>
        </View>
      ) : (
        filteredAssessments.map((assessment) => {
          const profile = profilesById[assessment.customer_id];
          const status = getStatusConfig(theme, assessment.status);
          const motorcycle = `${assessment.motorcycle_make || ''} ${
            assessment.motorcycle_model || ''
          }${assessment.motorcycle_year ? ` (${assessment.motorcycle_year})` : ''}`.trim();

          return (
            <View key={assessment.id} style={s.assessmentCard}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
                    <Ionicons name={status.icon} size={13} color={status.color} />
                    <Text style={[s.statusText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>

                  <Text style={s.customerName}>{getCustomerName(profile)}</Text>
                  <Text style={s.dateText}>{formatDate(assessment.created_at)}</Text>
                </View>

                <Text style={s.totalText}>
                  {formatPeso(assessment.estimated_total)}
                </Text>
              </View>

              <View style={s.infoBox}>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Motorcycle</Text>
                  <Text style={s.infoValue}>{motorcycle || '—'}</Text>
                </View>

                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Service</Text>
                  <Text style={s.infoValue}>
                    {assessment.services?.name || '—'}
                  </Text>
                </View>

                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Down Payment</Text>
                  <Text style={s.infoValue}>
                    {formatPeso(assessment.down_payment_required)}
                  </Text>
                </View>

                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Labor Estimate</Text>
                  <Text style={s.infoValue}>
                    {formatPeso(assessment.estimated_labor_cost)}
                  </Text>
                </View>

                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Parts Estimate</Text>
                  <Text style={s.infoValue}>
                    {formatPeso(assessment.estimated_parts_cost)}
                  </Text>
                </View>
              </View>

              {!!assessment.issue_description && (
                <View style={s.issueBox}>
                  <Text style={s.issueLabel}>Customer Concern</Text>
                  <Text style={s.issueText}>{assessment.issue_description}</Text>
                </View>
              )}

              {profile?.phone || profile?.email ? (
                <View style={s.contactBox}>
                  {!!profile?.phone && (
                    <Text style={s.contactText}>Phone: {profile.phone}</Text>
                  )}
                  {!!profile?.email && (
                    <Text style={s.contactText}>Email: {profile.email}</Text>
                  )}
                </View>
              ) : null}

              {renderActionButtons(assessment)}
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
    assessmentCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      padding: 15,
      marginBottom: 13,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 13,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      marginBottom: 8,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    customerName: {
      color: text,
      fontSize: 16,
      fontWeight: '900',
    },
    dateText: {
      color: textMuted,
      fontSize: 12,
      marginTop: 3,
    },
    totalText: {
      color: YELLOW,
      fontSize: 16,
      fontWeight: '900',
    },
    infoBox: {
      backgroundColor: bg2,
      borderRadius: 14,
      padding: 12,
      gap: 8,
      marginBottom: 11,
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
    issueBox: {
      backgroundColor: bg2,
      borderRadius: 14,
      padding: 12,
      marginBottom: 11,
    },
    issueLabel: {
      color: text,
      fontSize: 12,
      fontWeight: '900',
      marginBottom: 5,
    },
    issueText: {
      color: textSub,
      fontSize: 13,
      lineHeight: 19,
    },
    contactBox: {
      backgroundColor: bg2,
      borderRadius: 14,
      padding: 12,
      marginBottom: 11,
      gap: 4,
    },
    contactText: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    primaryButton: {
      flexGrow: 1,
      backgroundColor: YELLOW,
      borderRadius: 13,
      paddingVertical: 11,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    primaryButtonText: {
      color: '#111827',
      fontWeight: '900',
      fontSize: 12,
    },
    secondaryButton: {
      flexGrow: 1,
      backgroundColor: YELLOW + '16',
      borderWidth: 1,
      borderColor: YELLOW + '55',
      borderRadius: 13,
      paddingVertical: 11,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    secondaryButtonText: {
      color: YELLOW,
      fontWeight: '900',
      fontSize: 12,
    },
    dangerButton: {
      flexGrow: 1,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.35)',
      borderRadius: 13,
      paddingVertical: 11,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    dangerButtonText: {
      color: '#ef4444',
      fontWeight: '900',
      fontSize: 12,
    },
    loadingAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: bg2,
      borderRadius: 13,
      paddingVertical: 12,
    },
    loadingActionText: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    convertedNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: 'rgba(34, 197, 94, 0.12)',
      borderRadius: 13,
      paddingVertical: 12,
    },
    convertedNoticeText: {
      color: '#22c55e',
      fontSize: 12,
      fontWeight: '900',
    },
  });
};