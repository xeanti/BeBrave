import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

function peso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getDateLabel(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusConfig(theme, status) {
  switch (status) {
    case 'reviewed':
      return {
        label: 'Reviewed',
        icon: 'checkmark-circle',
        color: '#3b82f6',
        bg: 'rgba(59, 130, 246, 0.12)',
        helper: 'The shop reviewed your request. Wait for booking conversion or further instructions.',
      };

    case 'converted':
      return {
        label: 'Converted to Booking',
        icon: 'calendar',
        color: theme.success,
        bg: 'rgba(34, 197, 94, 0.12)',
        helper: 'This request was converted by admin into an official booking.',
      };

    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: 'close-circle',
        color: theme.danger,
        bg: 'rgba(239, 68, 68, 0.12)',
        helper: 'This request was cancelled and will not become a booking.',
      };

    default:
      return {
        label: 'Pending Review',
        icon: 'time',
        color: theme.warning,
        bg: 'rgba(234, 179, 8, 0.12)',
        helper: 'The shop has not reviewed this request yet.',
      };
  }
}

function getMotorcycleLabel(assessment) {
  const makeModel = `${assessment.motorcycle_make || ''} ${assessment.motorcycle_model || ''}`.trim();

  if (!makeModel && !assessment.motorcycle_year) return 'Motorcycle not specified';

  return `${makeModel}${assessment.motorcycle_year ? ` (${assessment.motorcycle_year})` : ''}`.trim();
}

export default function MyPreAssessmentsScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAssessments = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setAssessments([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error } = await supabase
      .from('pre_assessments')
      .select(`
        *,
        services (
          id,
          name,
          description,
          base_price,
          labor_cost,
          estimated_duration_minutes
        )
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Assessments Error', error.message);
      setAssessments([]);
    } else {
      setAssessments(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAssessments();

    let channel = null;

    async function setupRealtime() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) return;

      channel = supabase
        .channel(`mobile-my-pre-assessments-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'pre_assessments',
            filter: `customer_id=eq.${user.id}`,
          },
          () => fetchAssessments(false)
        )
        .subscribe();
    }

    setupRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchAssessments]);

  function onRefresh() {
    setRefreshing(true);
    fetchAssessments(false);
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
        <Text style={s.loadingText}>Loading assessment requests...</Text>
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
          tintColor={theme.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={s.heroCard}>
        <View style={s.heroIcon}>
          <Ionicons name="documents" size={25} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>My Assessment Requests</Text>
          <Text style={s.heroText}>
            Track your diagnostic estimate requests before they become official bookings.
          </Text>
        </View>
      </View>

      {assessments.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="document-text-outline" size={34} color={theme.textMuted} />
          <Text style={s.emptyTitle}>No assessment requests yet</Text>
          <Text style={s.emptyText}>
            Submit a diagnostic request first so the shop can review your concern.
          </Text>

          <TouchableOpacity
            style={s.primaryButton}
            onPress={() => navigation.navigate('PreAssessment')}
            activeOpacity={0.85}
          >
            <Text style={s.primaryButtonText}>Create Pre-Assessment</Text>
          </TouchableOpacity>
        </View>
      ) : (
        assessments.map((assessment) => {
          const config = getStatusConfig(theme, assessment.status);

          return (
            <View key={assessment.id} style={s.assessmentCard}>
              <View style={s.assessmentTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.assessmentService}>
                    {assessment.services?.name || 'Service Request'}
                  </Text>
                  <Text style={s.assessmentMotor}>{getMotorcycleLabel(assessment)}</Text>
                </View>

                <View style={[s.statusBadge, { backgroundColor: config.bg }]}>
                  <Ionicons name={config.icon} size={13} color={config.color} />
                  <Text style={[s.statusText, { color: config.color }]}>
                    {config.label}
                  </Text>
                </View>
              </View>

              {!!assessment.issue_description && (
                <Text style={s.assessmentIssue} numberOfLines={4}>
                  “{assessment.issue_description}”
                </Text>
              )}

              {!!assessment.notes && (
                <View style={s.notesBox}>
                  <Text style={s.notesLabel}>Assessment Details</Text>
                  <Text style={s.notesText}>{assessment.notes}</Text>
                </View>
              )}

              <View style={s.priceGrid}>
                <View style={s.priceBox}>
                  <Text style={s.miniLabel}>Estimated Total</Text>
                  <Text style={s.miniValue}>{peso(assessment.estimated_total)}</Text>
                </View>

                <View style={s.priceBox}>
                  <Text style={s.miniLabel}>Required Down Payment</Text>
                  <Text style={s.miniValue}>{peso(assessment.down_payment_required)}</Text>
                </View>
              </View>

              <View style={s.footer}>
                <View style={{ flex: 1 }}>
                  <Text style={s.dateText}>Submitted {getDateLabel(assessment.created_at)}</Text>
                  <Text style={s.statusHelper}>{config.helper}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 36,
    },
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: theme.textSub,
      marginTop: 10,
    },
    heroCard: {
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 18,
      marginBottom: 16,
    },
    heroIcon: {
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      color: theme.text,
      fontSize: 21,
      fontWeight: '900',
    },
    heroText: {
      color: theme.textSub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    emptyCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      padding: 24,
      alignItems: 'center',
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 12,
    },
    emptyText: {
      color: theme.textSub,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 16,
    },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '900',
    },
    assessmentCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    assessmentTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    assessmentService: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    assessmentMotor: {
      color: theme.textSub,
      fontSize: 12,
      marginTop: 3,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '900',
    },
    assessmentIssue: {
      color: theme.textSub,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      padding: 10,
      marginTop: 12,
      fontSize: 12,
      lineHeight: 18,
    },
    notesBox: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 10,
      marginTop: 10,
    },
    notesLabel: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '900',
      marginBottom: 5,
    },
    notesText: {
      color: theme.textSub,
      fontSize: 11,
      lineHeight: 17,
    },
    priceGrid: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    priceBox: {
      flex: 1,
      backgroundColor: theme.bg2,
      borderRadius: 12,
      padding: 10,
    },
    miniLabel: {
      color: theme.textMuted,
      fontSize: 10,
      marginBottom: 4,
    },
    miniValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    footer: {
      marginTop: 14,
    },
    dateText: {
      color: theme.textMuted,
      fontSize: 11,
      marginBottom: 4,
    },
    statusHelper: {
      color: theme.textSub,
      fontSize: 11,
      lineHeight: 16,
    },
  });
