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

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

function peso(value) {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
      };
    case 'converted':
      return {
        label: 'Booked',
        icon: 'calendar',
        color: theme.success,
        bg: 'rgba(34, 197, 94, 0.12)',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: 'close-circle',
        color: theme.danger,
        bg: 'rgba(239, 68, 68, 0.12)',
      };
    default:
      return {
        label: 'Pending',
        icon: 'time',
        color: theme.warning,
        bg: 'rgba(234, 179, 8, 0.12)',
      };
  }
}

export default function PreAssessmentScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [assessments, setAssessments] = useState([]);

  const [motorcycleMake, setMotorcycleMake] = useState('');
  const [motorcycleModel, setMotorcycleModel] = useState('');
  const [motorcycleYear, setMotorcycleYear] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [selectedService, setSelectedService] = useState(null);

  const [downPaymentRate, setDownPaymentRate] = useState(0.15);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const estimate = useMemo(() => {
    if (!selectedService) return null;

    const baseCost = cleanNumber(selectedService.base_price);
    const laborCost = cleanNumber(selectedService.labor_cost);
    const total = baseCost + laborCost;
    const downPayment = total * downPaymentRate;

    return {
      baseCost,
      laborCost,
      total,
      downPayment,
      duration: selectedService.estimated_duration_minutes || 0,
    };
  }, [selectedService, downPaymentRate]);

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    setUser(currentUser || null);

    if (!currentUser?.id) {
      setServices([]);
      setAssessments([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [
      profileResult,
      servicesResult,
      assessmentsResult,
      settingResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('moto_make, moto_model, moto_year')
        .eq('id', currentUser.id)
        .maybeSingle(),

      supabase
        .from('services')
        .select('id, name, description, base_price, labor_cost, estimated_duration_minutes')
        .eq('is_active', true)
        .order('name', { ascending: true }),

      supabase
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
        .eq('customer_id', currentUser.id)
        .order('created_at', { ascending: false }),

      supabase
        .from('settings')
        .select('value')
        .eq('key', 'down_payment_percent')
        .maybeSingle(),
    ]);

    if (profileResult.data) {
      setMotorcycleMake((prev) => prev || profileResult.data.moto_make || '');
      setMotorcycleModel((prev) => prev || profileResult.data.moto_model || '');
      setMotorcycleYear((prev) =>
        prev || String(profileResult.data.moto_year || '')
      );
    }

    if (servicesResult.error) {
      Alert.alert('Services Error', servicesResult.error.message);
    } else {
      setServices(servicesResult.data || []);
    }

    if (assessmentsResult.error) {
      Alert.alert('Assessments Error', assessmentsResult.error.message);
    } else {
      setAssessments(assessmentsResult.data || []);
    }

    if (settingResult.data?.value) {
      const rate = Number(settingResult.data.value);
      if (Number.isFinite(rate) && rate > 0) {
        setDownPaymentRate(rate / 100);
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();

    let channel = null;

    async function setupRealtime() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser?.id) return;

      channel = supabase
        .channel(`mobile-pre-assessments-${currentUser.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'pre_assessments',
            filter: `customer_id=eq.${currentUser.id}`,
          },
          () => fetchData(false)
        )
        .subscribe();
    }

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchData]);

  function onRefresh() {
    setRefreshing(true);
    fetchData(false);
  }

  function validateForm() {
    if (!motorcycleMake.trim()) {
      Alert.alert('Missing Info', 'Please enter the motorcycle make.');
      return false;
    }

    if (!motorcycleModel.trim()) {
      Alert.alert('Missing Info', 'Please enter the motorcycle model.');
      return false;
    }

    if (!issueDescription.trim()) {
      Alert.alert('Missing Info', 'Please describe the issue or service concern.');
      return false;
    }

    if (!selectedService) {
      Alert.alert('Missing Service', 'Please select a service to estimate.');
      return false;
    }

    return true;
  }

  async function handleSubmit() {
    if (!user?.id) {
      Alert.alert('Login Required', 'Please login first.');
      return;
    }

    if (!validateForm()) return;

    setSubmitting(true);

    const payload = {
      customer_id: user.id,
      motorcycle_make: motorcycleMake.trim(),
      motorcycle_model: motorcycleModel.trim(),
      motorcycle_year: motorcycleYear ? parseInt(motorcycleYear, 10) : null,
      issue_description: issueDescription.trim(),
      service_id: selectedService.id,
      estimated_labor_cost: estimate.laborCost,
      estimated_parts_cost: 0,
      estimated_total: estimate.total,
      down_payment_required: estimate.downPayment,
      status: 'pending',
    };

    const { data, error } = await supabase
      .from('pre_assessments')
      .insert(payload)
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
      .single();

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setAssessments((prev) => [data, ...prev]);
    setIssueDescription('');
    setSelectedService(null);

    Alert.alert(
      'Assessment Submitted',
      'Your estimated cost was saved. You can now proceed to booking.',
      [
        {
          text: 'Book Now',
          onPress: () => {
            navigation.navigate('Booking', {
              preselectedService: data.services || selectedService,
              preAssessmentId: data.id,
              estimatedTotal: data.estimated_total,
              downPayment: data.down_payment_required,
            });
          },
        },
        { text: 'OK' },
      ]
    );
  }

  function bookAssessment(assessment) {
    if (!assessment?.services) {
      Alert.alert('Service Missing', 'The selected service is no longer available.');
      return;
    }

    navigation.navigate('Booking', {
      preselectedService: assessment.services,
      preAssessmentId: assessment.id,
      estimatedTotal: assessment.estimated_total,
      downPayment: assessment.down_payment_required,
    });
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
        <Text style={s.loadingText}>Loading pre-assessment...</Text>
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
          <Ionicons name="calculator" size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>Pre-Assessment</Text>
          <Text style={s.heroText}>
            Get an estimated service cost before booking your appointment.
          </Text>
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>1. Motorcycle Info</Text>

        <TextInput
          style={s.input}
          value={motorcycleMake}
          onChangeText={setMotorcycleMake}
          placeholder="Make, e.g. Yamaha"
          placeholderTextColor={theme.textMuted}
        />

        <TextInput
          style={s.input}
          value={motorcycleModel}
          onChangeText={setMotorcycleModel}
          placeholder="Model, e.g. NMAX"
          placeholderTextColor={theme.textMuted}
        />

        <TextInput
          style={s.input}
          value={motorcycleYear}
          onChangeText={setMotorcycleYear}
          placeholder="Year, e.g. 2022"
          placeholderTextColor={theme.textMuted}
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>2. Issue / Concern</Text>

        <TextInput
          style={[s.input, s.textArea]}
          value={issueDescription}
          onChangeText={setIssueDescription}
          placeholder="Describe the issue, service need, or customization concern..."
          placeholderTextColor={theme.textMuted}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>3. Select Service</Text>

        {services.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="construct-outline" size={24} color={theme.textMuted} />
            <Text style={s.emptyText}>No active services available.</Text>
          </View>
        ) : (
          services.map((service) => {
            const active = selectedService?.id === service.id;

            return (
              <TouchableOpacity
                key={service.id}
                style={[s.serviceCard, active && s.serviceCardActive]}
                onPress={() => setSelectedService(service)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.serviceName}>{service.name}</Text>
                  {!!service.description && (
                    <Text style={s.serviceDesc} numberOfLines={2}>
                      {service.description}
                    </Text>
                  )}
                  <Text style={s.serviceMeta}>
                    {service.estimated_duration_minutes || 0} mins
                  </Text>
                </View>

                <View style={s.serviceRight}>
                  <Text style={s.servicePrice}>
                    {peso(cleanNumber(service.base_price) + cleanNumber(service.labor_cost))}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {estimate && (
        <View style={s.estimateCard}>
          <Text style={s.estimateTitle}>Cost Estimate</Text>

          <View style={s.row}>
            <Text style={s.rowLabel}>Base Price</Text>
            <Text style={s.rowValue}>{peso(estimate.baseCost)}</Text>
          </View>

          <View style={s.row}>
            <Text style={s.rowLabel}>Labor Cost</Text>
            <Text style={s.rowValue}>{peso(estimate.laborCost)}</Text>
          </View>

          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.totalLabel}>Estimated Total</Text>
            <Text style={s.totalValue}>{peso(estimate.total)}</Text>
          </View>

          <View style={s.row}>
            <Text style={s.downLabel}>
              Required Down Payment ({Math.round(downPaymentRate * 100)}%)
            </Text>
            <Text style={s.downValue}>{peso(estimate.downPayment)}</Text>
          </View>

          <Text style={s.note}>
            This is a preliminary estimate only. Final cost may change after actual mechanic inspection.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.submitButton, (!selectedService || submitting) && s.submitDisabled]}
        onPress={handleSubmit}
        disabled={!selectedService || submitting}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={s.submitText}>Submit Pre-Assessment</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={s.historyHeader}>
        <Text style={s.historyTitle}>My Assessments</Text>
        <Text style={s.historyCount}>{assessments.length}</Text>
      </View>

      {assessments.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="document-text-outline" size={28} color={theme.textMuted} />
          <Text style={s.emptyText}>No pre-assessments yet.</Text>
        </View>
      ) : (
        assessments.map((assessment) => {
          const config = getStatusConfig(theme, assessment.status);

          return (
            <View key={assessment.id} style={s.assessmentCard}>
              <View style={s.assessmentTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.assessmentService}>
                    {assessment.services?.name || 'Service'}
                  </Text>
                  <Text style={s.assessmentMotor}>
                    {assessment.motorcycle_make} {assessment.motorcycle_model}
                    {assessment.motorcycle_year ? ` (${assessment.motorcycle_year})` : ''}
                  </Text>
                </View>

                <View style={[s.statusBadge, { backgroundColor: config.bg }]}>
                  <Ionicons name={config.icon} size={13} color={config.color} />
                  <Text style={[s.statusText, { color: config.color }]}>
                    {config.label}
                  </Text>
                </View>
              </View>

              {!!assessment.issue_description && (
                <Text style={s.assessmentIssue} numberOfLines={2}>
                  “{assessment.issue_description}”
                </Text>
              )}

              <View style={s.assessmentPrices}>
                <View>
                  <Text style={s.miniLabel}>Estimated Total</Text>
                  <Text style={s.miniValue}>{peso(assessment.estimated_total)}</Text>
                </View>

                <View>
                  <Text style={s.miniLabel}>Down Payment</Text>
                  <Text style={s.miniValue}>{peso(assessment.down_payment_required)}</Text>
                </View>
              </View>

              <View style={s.assessmentFooter}>
                <Text style={s.dateText}>{getDateLabel(assessment.created_at)}</Text>

                {assessment.status !== 'converted' && (
                  <TouchableOpacity
                    style={s.bookButton}
                    onPress={() => bookAssessment(assessment)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.bookButtonText}>Book</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
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
      fontSize: 22,
      fontWeight: '800',
    },
    heroText: {
      color: theme.textSub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    section: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 12,
    },
    input: {
      backgroundColor: theme.bg2,
      color: theme.text,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      marginBottom: 10,
    },
    textArea: {
      minHeight: 110,
      lineHeight: 20,
    },
    serviceCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    serviceCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.bg3,
    },
    serviceName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '800',
    },
    serviceDesc: {
      color: theme.textSub,
      fontSize: 12,
      marginTop: 4,
      lineHeight: 17,
    },
    serviceMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 6,
    },
    serviceRight: {
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      minWidth: 90,
    },
    servicePrice: {
      color: theme.primaryLight,
      fontWeight: '800',
      fontSize: 13,
    },
    estimateCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    estimateTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 9,
    },
    rowLabel: {
      color: theme.textSub,
      fontSize: 13,
    },
    rowValue: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 8,
    },
    totalLabel: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    totalValue: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    downLabel: {
      color: theme.warning,
      fontSize: 13,
      fontWeight: '800',
      flex: 1,
    },
    downValue: {
      color: theme.warning,
      fontSize: 13,
      fontWeight: '900',
    },
    note: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 8,
    },
    submitButton: {
      height: 52,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 22,
    },
    submitDisabled: {
      opacity: 0.55,
    },
    submitText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '900',
    },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    historyTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '900',
    },
    historyCount: {
      color: '#fff',
      backgroundColor: theme.primary,
      overflow: 'hidden',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
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
    assessmentPrices: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 14,
    },
    miniLabel: {
      color: theme.textMuted,
      fontSize: 11,
      marginBottom: 3,
    },
    miniValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    assessmentFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
    },
    dateText: {
      color: theme.textMuted,
      fontSize: 11,
    },
    bookButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    bookButtonText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 12,
    },
    emptyCard: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
  });