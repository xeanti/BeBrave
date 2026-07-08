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

const CONCERN_TYPES = [
  { key: 'diagnostic', label: 'Diagnostic', icon: 'search' },
  { key: 'maintenance', label: 'Maintenance', icon: 'construct' },
  { key: 'repair', label: 'Repair', icon: 'hammer' },
  { key: 'electrical', label: 'Electrical', icon: 'flash' },
  { key: 'brake_tire', label: 'Brake / Tire', icon: 'disc' },
  { key: 'customization', label: 'Customization', icon: 'color-palette' },
];

const URGENCY_LEVELS = [
  { key: 'normal', label: 'Normal', helper: 'Can wait for review' },
  { key: 'urgent', label: 'Urgent', helper: 'Needs faster checking' },
];

const CONCERN_SERVICE_KEYWORDS = {
  diagnostic: [
    'diagnostic',
    'diagnosis',
    'inspect',
    'inspection',
    'check',
    'troubleshoot',
    'assessment',
    'general',
  ],
  maintenance: [
    'maintenance',
    'pms',
    'preventive',
    'oil',
    'change oil',
    'tune',
    'tune up',
    'cleaning',
    'filter',
  ],
  repair: [
    'repair',
    'replace',
    'fix',
    'engine',
    'overhaul',
    'leak',
    'noise',
    'broken',
    'damage',
  ],
  electrical: [
    'electrical',
    'battery',
    'wiring',
    'light',
    'headlight',
    'signal',
    'starter',
    'horn',
    'charging',
  ],
  brake_tire: [
    'brake',
    'preno',
    'tire',
    'tyre',
    'gulong',
    'wheel',
    'mags',
    'disc',
    'pad',
    'rotor',
    'caliper',
  ],
  customization: [
    'custom',
    'customization',
    'modify',
    'upgrade',
    'accessory',
    'accessories',
    'mags',
    'exhaust',
    'seat',
    'mirror',
    'handle',
    'body',
  ],
};

const ISSUE_DETECTION_RULES = [
  {
    reason: 'Brake or tire concern detected',
    issueKeywords: ['brake', 'preno', 'pad', 'disc', 'rotor', 'caliper', 'tire', 'tyre', 'gulong', 'flat', 'wheel', 'mags'],
    serviceKeywords: ['brake', 'preno', 'tire', 'tyre', 'wheel', 'mags', 'disc', 'pad', 'rotor', 'caliper'],
  },
  {
    reason: 'Electrical concern detected',
    issueKeywords: ['battery', 'baterya', 'wiring', 'wire', 'ilaw', 'light', 'headlight', 'signal', 'horn', 'starter', 'charging', 'kuryente'],
    serviceKeywords: ['electrical', 'battery', 'wiring', 'light', 'headlight', 'signal', 'horn', 'starter', 'charging'],
  },
  {
    reason: 'Maintenance concern detected',
    issueKeywords: ['change oil', 'oil', 'tune up', 'tune-up', 'maintenance', 'pms', 'filter', 'cleaning', 'linis'],
    serviceKeywords: ['maintenance', 'pms', 'oil', 'tune', 'filter', 'cleaning'],
  },
  {
    reason: 'Engine or repair concern detected',
    issueKeywords: ['engine', 'makina', 'overheat', 'leak', 'tagas', 'noise', 'ingay', 'vibration', 'stall', 'ayaw', 'broken', 'sira', 'repair'],
    serviceKeywords: ['repair', 'engine', 'overhaul', 'diagnostic', 'inspection', 'troubleshoot'],
  },
  {
    reason: 'Customization concern detected',
    issueKeywords: ['custom', 'customize', 'modify', 'upgrade', 'accessory', 'mags', 'exhaust', 'seat', 'mirror', 'color', 'body kit'],
    serviceKeywords: ['custom', 'customization', 'upgrade', 'accessory', 'mags', 'exhaust', 'seat', 'mirror'],
  },
];

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textHasAny(text, keywords = []) {
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    return normalizedKeyword && text.includes(normalizedKeyword);
  });
}

function getServiceSearchText(service) {
  return normalizeSearchText([
    service?.name,
    service?.description,
    service?.category,
  ].filter(Boolean).join(' '));
}

function getPredictionConfidence(score) {
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  return 'Low';
}

function predictPreferredService({ services, concernType, issueDescription }) {
  if (!Array.isArray(services) || services.length === 0) return null;

  const issueText = normalizeSearchText(issueDescription);
  const concernKeywords = CONCERN_SERVICE_KEYWORDS[concernType] || [];
  const concernLabel =
    CONCERN_TYPES.find((item) => item.key === concernType)?.label || 'Diagnostic';

  const scored = services
    .map((service) => {
      const serviceText = getServiceSearchText(service);
      let score = 0;
      const reasons = [];

      if (textHasAny(serviceText, concernKeywords)) {
        score += 4;
        reasons.push(`${concernLabel} category match`);
      }

      ISSUE_DETECTION_RULES.forEach((rule) => {
        const issueMatches = textHasAny(issueText, rule.issueKeywords);
        const serviceMatches = textHasAny(serviceText, rule.serviceKeywords);

        if (issueMatches && serviceMatches) {
          score += 7;
          reasons.push(rule.reason);
        }
      });

      const directIssueWords = issueText
        .split(' ')
        .filter((word) => word.length >= 4);

      const directMatches = directIssueWords.filter((word) => serviceText.includes(word));

      if (directMatches.length > 0) {
        score += Math.min(directMatches.length * 2, 6);
        reasons.push('Matches words from your issue description');
      }

      return {
        service,
        score,
        reason: reasons[0] || 'Best available match based on your diagnostic details',
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const top = scored[0];

  return {
    ...top,
    confidence: getPredictionConfidence(top.score),
  };
}

export default function PreAssessmentScreen({ navigation }) {
  const { theme } = useTheme();
  const s = styles(theme);

  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);

  const [concernType, setConcernType] = useState('diagnostic');
  const [urgencyLevel, setUrgencyLevel] = useState('normal');
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

  const preferredServicePrediction = useMemo(
    () =>
      predictPreferredService({
        services,
        concernType,
        issueDescription,
      }),
    [services, concernType, issueDescription]
  );

  const predictionIsSelected =
    preferredServicePrediction?.service?.id &&
    selectedService?.id === preferredServicePrediction.service.id;

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    setUser(currentUser || null);

    if (!currentUser?.id) {
      setServices([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [profileResult, servicesResult, settingResult] = await Promise.all([
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
      notes: [
        `Concern Type: ${CONCERN_TYPES.find((item) => item.key === concernType)?.label || concernType}`,
        `Urgency: ${URGENCY_LEVELS.find((item) => item.key === urgencyLevel)?.label || urgencyLevel}`,
        preferredServicePrediction?.service?.name
          ? `System Suggested Service: ${preferredServicePrediction.service.name}`
          : 'System Suggested Service: No clear prediction',
        preferredServicePrediction?.confidence
          ? `Prediction Confidence: ${preferredServicePrediction.confidence}`
          : null,
        'Submitted as diagnostic pre-assessment only. Admin must review before conversion to booking.',
      ].filter(Boolean).join('\n'),
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

    setIssueDescription('');
    setSelectedService(null);

    Alert.alert(
      'Assessment Submitted',
      'Your diagnostic estimate request was sent to the shop for review. It is not a booking yet. Please wait for admin approval or conversion.'
    );
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
            Describe your motorcycle concern and MotoFix will suggest the preferred service before admin review.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={s.historyButton}
        onPress={() => navigation.navigate('MyPreAssessments')}
        activeOpacity={0.85}
      >
        <View style={s.historyButtonIcon}>
          <Ionicons name="documents" size={20} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.historyButtonTitle}>My Assessment Requests</Text>
          <Text style={s.historyButtonText}>
            View submitted requests, review status, and booking conversion updates.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </TouchableOpacity>

      <View style={s.section}>
        <Text style={s.sectionTitle}>1. Assessment Details</Text>
        <Text style={s.fieldHint}>
          Choose the type of concern so the shop can triage your request before creating a booking.
        </Text>

        <View style={s.chipGrid}>
          {CONCERN_TYPES.map((item) => {
            const active = concernType === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[s.choiceChip, active && s.choiceChipActive]}
                onPress={() => setConcernType(item.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={active ? '#fff' : theme.textSub}
                />
                <Text style={[s.choiceChipText, active && s.choiceChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[s.fieldHint, { marginTop: 12 }]}>Urgency level</Text>
        <View style={s.urgencyGrid}>
          {URGENCY_LEVELS.map((item) => {
            const active = urgencyLevel === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[s.urgencyCard, active && s.urgencyCardActive]}
                onPress={() => setUrgencyLevel(item.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.urgencyLabel, active && s.urgencyLabelActive]}>
                  {item.label}
                </Text>
                <Text style={[s.urgencyHelper, active && s.urgencyHelperActive]}>
                  {item.helper}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>2. Motorcycle Info</Text>

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
        <Text style={s.sectionTitle}>3. Issue / Concern</Text>

        <TextInput
          style={[s.input, s.textArea]}
          value={issueDescription}
          onChangeText={setIssueDescription}
          placeholder="Describe symptoms, sounds, visible damage, or what you want the shop to inspect..."
          placeholderTextColor={theme.textMuted}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>4. Preferred Service Category</Text>
        <Text style={s.fieldHint}>
          MotoFix will suggest a preferred service based on your concern type and issue description. You can still choose manually.
        </Text>

        {preferredServicePrediction && (
          <View style={s.predictionCard}>
            <View style={s.predictionHeader}>
              <View style={s.predictionIcon}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={s.predictionTitle}>Suggested Preferred Service</Text>
                <Text style={s.predictionName}>
                  {preferredServicePrediction.service.name}
                </Text>
                <Text style={s.predictionMeta}>
                  {preferredServicePrediction.reason} · {preferredServicePrediction.confidence} confidence
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                s.predictionButton,
                predictionIsSelected && s.predictionButtonSelected,
              ]}
              onPress={() => setSelectedService(preferredServicePrediction.service)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  s.predictionButtonText,
                  predictionIsSelected && s.predictionButtonTextSelected,
                ]}
              >
                {predictionIsSelected ? 'Suggestion Applied ✓' : 'Use Suggested Service'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!preferredServicePrediction && issueDescription.trim().length > 0 && (
          <View style={s.predictionEmptyCard}>
            <Ionicons name="help-circle" size={18} color={theme.textMuted} />
            <Text style={s.predictionEmptyText}>
              No clear suggested service yet. Add more symptoms or choose a service manually.
            </Text>
          </View>
        )}

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

                  {preferredServicePrediction?.service?.id === service.id && (
                    <View style={s.recommendedPill}>
                      <Ionicons name="sparkles" size={11} color={theme.primary} />
                      <Text style={s.recommendedPillText}>Recommended</Text>
                    </View>
                  )}
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
            <Text style={s.submitText}>Submit Diagnostic Request</Text>
          </>
        )}
      </TouchableOpacity>

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
    fieldHint: {
      color: theme.textSub,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 10,
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    choiceChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    choiceChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    choiceChipText: {
      color: theme.textSub,
      fontSize: 12,
      fontWeight: '900',
    },
    choiceChipTextActive: {
      color: '#fff',
    },
    urgencyGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    urgencyCard: {
      flex: 1,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
    },
    urgencyCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.bg3,
    },
    urgencyLabel: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    urgencyLabelActive: {
      color: theme.primaryLight,
    },
    urgencyHelper: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 3,
      lineHeight: 15,
    },
    urgencyHelperActive: {
      color: theme.textSub,
    },
    historyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
    },
    historyButtonIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.bg2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyButtonTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '900',
    },
    historyButtonText: {
      color: theme.textSub,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
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
    predictionCard: {
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    predictionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    predictionIcon: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    predictionTitle: {
      color: theme.textSub,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    predictionName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '900',
      marginTop: 2,
    },
    predictionMeta: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
    },
    predictionButton: {
      marginTop: 12,
      height: 42,
      borderRadius: 12,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    predictionButtonSelected: {
      backgroundColor: theme.bg3,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    predictionButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '900',
    },
    predictionButtonTextSelected: {
      color: theme.primaryLight,
    },
    predictionEmptyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.bg2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
    },
    predictionEmptyText: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      flex: 1,
    },
    recommendedPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.primary + '14',
      borderWidth: 1,
      borderColor: theme.primary,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginTop: 7,
    },
    recommendedPillText: {
      color: theme.primaryLight,
      fontSize: 10,
      fontWeight: '900',
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