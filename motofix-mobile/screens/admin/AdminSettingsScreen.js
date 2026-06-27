import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

const SETTINGS = {
  down_payment_percent: {
    label: 'Down Payment Percentage',
    description:
      'Required down payment shown across bookings, parts orders, and pre-assessments.',
    suffix: '%',
    min: 0,
    max: 100,
    defaultValue: '15',
    icon: 'wallet',
  },
  cancellation_window_hours: {
    label: 'Cancellation Window',
    description:
      'Number of hours before the appointment when customers are still allowed to cancel.',
    suffix: 'hours',
    min: 0,
    max: 720,
    defaultValue: '24',
    icon: 'close-circle',
  },
  reschedule_window_hours: {
    label: 'Reschedule Window',
    description:
      'Number of hours before the appointment when customers are still allowed to reschedule.',
    suffix: 'hours',
    min: 0,
    max: 720,
    defaultValue: '12',
    icon: 'calendar',
  },
  max_reschedules: {
    label: 'Maximum Reschedules',
    description: 'Maximum number of times a customer can reschedule one booking.',
    suffix: 'times',
    min: 0,
    max: 10,
    defaultValue: '1',
    icon: 'repeat',
  },
  no_show_penalty_amount: {
    label: 'No-show Penalty',
    description: 'Penalty amount applied when admin marks a customer booking as no-show.',
    suffix: 'PHP',
    min: 0,
    max: 100000,
    defaultValue: '100',
    icon: 'alert-circle',
  },
  refund_percent_before_window: {
    label: 'Refund Before Cancellation Window',
    description:
      'Refund percentage if the customer cancels before the allowed cancellation window ends.',
    suffix: '%',
    min: 0,
    max: 100,
    defaultValue: '100',
    icon: 'cash',
  },
  refund_percent_after_window: {
    label: 'Refund After Cancellation Window',
    description:
      'Refund percentage if the customer cancels too late or outside the allowed window.',
    suffix: '%',
    min: 0,
    max: 100,
    defaultValue: '0',
    icon: 'cash-outline',
  },
};

const SETTING_KEYS = Object.keys(SETTINGS);
const PRESET_PERCENTAGES = [10, 15, 20, 25, 30];

function createDefaultValues() {
  return SETTING_KEYS.reduce((result, key) => {
    result[key] = SETTINGS[key].defaultValue;
    return result;
  }, {});
}

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

export default function AdminSettingsScreen() {
  const { theme } = useTheme();
  const s = styles(theme);

  const [values, setValues] = useState(createDefaultValues);
  const [originalValues, setOriginalValues] = useState(createDefaultValues);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasChanges = useMemo(() => {
    return SETTING_KEYS.some(
      (key) => String(values[key]) !== String(originalValues[key])
    );
  }, [values, originalValues]);

  const downPaymentPercent = Number(values.down_payment_percent);
  const validDownPayment =
    Number.isFinite(downPaymentPercent) &&
    downPaymentPercent >= 0 &&
    downPaymentPercent <= 100;

  const previewRows = useMemo(() => {
    const samples = [500, 1000, 2500, 5000];

    return samples.map((amount) => {
      const downPayment = validDownPayment
        ? amount * (downPaymentPercent / 100)
        : 0;

      return {
        amount,
        downPayment,
        remaining: amount - downPayment,
      };
    });
  }, [downPaymentPercent, validDownPayment]);

  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel('mobile-admin-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settings',
        },
        () => fetchSettings(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSettings(false);
    }, [])
  );

  async function fetchSettings(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('settings')
      .select('key, value, updated_at')
      .in('key', SETTING_KEYS);

    if (error) {
      setLoading(false);
      setRefreshing(false);
      Alert.alert('Settings Error', error.message);
      return;
    }

    const nextValues = createDefaultValues();
    let latestDate = null;

    (data || []).forEach((item) => {
      if (SETTING_KEYS.includes(item.key)) {
        nextValues[item.key] = String(
          item.value ?? SETTINGS[item.key].defaultValue
        );
      }

      if (item.updated_at) {
        const currentDate = new Date(item.updated_at);
        if (!latestDate || currentDate > latestDate) {
          latestDate = currentDate;
        }
      }
    });

    setValues(nextValues);
    setOriginalValues(nextValues);
    setLastUpdated(latestDate || null);

    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchSettings(false);
  }

  function updateValue(key, value) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function validateSettings() {
    for (const key of SETTING_KEYS) {
      const config = SETTINGS[key];
      const number = Number(values[key]);

      if (!Number.isFinite(number)) {
        return `${config.label}: enter a valid number.`;
      }

      if (number < config.min || number > config.max) {
        return `${config.label}: value must be between ${config.min} and ${config.max}.`;
      }

      if (key === 'max_reschedules' && !Number.isInteger(number)) {
        return 'Maximum Reschedules must be a whole number.';
      }
    }

    return '';
  }

  async function insertAuditLogs(changedRows) {
    if (changedRows.length === 0) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return;

    const logs = changedRows.map((row) => ({
      action: 'UPDATE_SYSTEM_SETTING',
      entity: 'settings',
      entity_id: row.key,
      performed_by: user.id,
      details: {
        key: row.key,
        old_value: originalValues[row.key],
        new_value: row.value,
      },
    }));

    await supabase.from('audit_logs').insert(logs);
  }

  async function saveSettings() {
    const validationError = validateSettings();

    if (validationError) {
      Alert.alert('Invalid Settings', validationError);
      return;
    }

    const now = new Date().toISOString();

    const rows = SETTING_KEYS.map((key) => ({
      key,
      value: String(Number(values[key])),
      updated_at: now,
    }));

    const changedRows = rows.filter(
      (row) => String(row.value) !== String(originalValues[row.key])
    );

    if (changedRows.length === 0) {
      Alert.alert('No Changes', 'All settings are already saved.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('settings').upsert(rows, {
      onConflict: 'key',
    });

    if (error) {
      setSaving(false);
      Alert.alert('Save Failed', error.message);
      return;
    }

    await insertAuditLogs(changedRows);

    const savedValues = rows.reduce((result, row) => {
      result[row.key] = row.value;
      return result;
    }, {});

    setValues(savedValues);
    setOriginalValues(savedValues);
    setLastUpdated(new Date());

    setSaving(false);

    Alert.alert('Settings Saved', 'Booking rules and system settings were updated.');
  }

  function resetSettings() {
    setValues(originalValues);
  }

  function renderSettingInput(key) {
    const config = SETTINGS[key];

    return (
      <View key={key} style={s.settingCard}>
        <View style={s.settingHeader}>
          <View style={s.settingIcon}>
            <Ionicons name={config.icon} size={20} color={YELLOW} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.settingLabel}>{config.label}</Text>
            <Text style={s.settingDescription}>{config.description}</Text>
          </View>
        </View>

        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            value={values[key]}
            onChangeText={(value) => updateValue(key, value)}
            keyboardType="decimal-pad"
            placeholder={config.defaultValue}
            placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
          />

          <Text style={s.inputSuffix}>{config.suffix}</Text>
        </View>

        <Text style={s.rangeText}>
          Allowed range: {config.min} to {config.max}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <View style={s.headerIcon}>
            <Ionicons name="settings" size={26} color="#111827" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.title}>Booking Rules</Text>
            <Text style={s.subtitle}>
              Configure payment, cancellation, reschedule, refund, and no-show rules.
            </Text>

            <Text style={s.lastUpdated}>
              Last updated: {formatDateTime(lastUpdated)}
            </Text>
          </View>
        </View>

        <View style={s.statusCard}>
          <View>
            <Text style={s.statusLabel}>Settings Status</Text>
            <Text style={s.statusValue}>
              {hasChanges ? 'Unsaved changes' : 'All settings saved'}
            </Text>
          </View>

          <Ionicons
            name={hasChanges ? 'alert-circle' : 'checkmark-circle'}
            size={26}
            color={hasChanges ? '#f59e0b' : '#22c55e'}
          />
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Down Payment</Text>
          <Text style={s.sectionText}>
            This controls the required down payment shown in booking, orders, and pre-assessment.
          </Text>
        </View>

        {renderSettingInput('down_payment_percent')}

        <Text style={s.quickTitle}>Quick Presets</Text>
        <View style={s.presetRow}>
          {PRESET_PERCENTAGES.map((preset) => {
            const active = Number(values.down_payment_percent) === preset;

            return (
              <TouchableOpacity
                key={preset}
                style={[s.presetButton, active && s.presetButtonActive]}
                onPress={() => updateValue('down_payment_percent', String(preset))}
                activeOpacity={0.8}
              >
                <Text style={[s.presetText, active && s.presetTextActive]}>
                  {preset}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.previewCard}>
          <View style={s.previewHeader}>
            <Ionicons name="calculator" size={20} color={YELLOW} />
            <Text style={s.previewTitle}>Down Payment Preview</Text>
          </View>

          {previewRows.map((row) => (
            <View key={row.amount} style={s.previewRow}>
              <Text style={s.previewAmount}>{formatPeso(row.amount)}</Text>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.previewDown}>
                  {validDownPayment ? formatPeso(row.downPayment) : 'Invalid'}
                </Text>
                <Text style={s.previewRemaining}>
                  Remaining: {validDownPayment ? formatPeso(row.remaining) : 'Invalid'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Booking Policy Settings</Text>
          <Text style={s.sectionText}>
            Configure cancellation, rescheduling, refund, and no-show rules used by customer appointments.
          </Text>
        </View>

        {SETTING_KEYS.filter((key) => key !== 'down_payment_percent').map(
          (key) => renderSettingInput(key)
        )}

        <View style={s.actionBar}>
          <TouchableOpacity
            style={[s.resetButton, !hasChanges && s.disabledButton]}
            onPress={resetSettings}
            disabled={!hasChanges || saving}
            activeOpacity={0.8}
          >
            <Text style={s.resetText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.saveButton, (!hasChanges || saving) && s.disabledButton]}
            onPress={saveSettings}
            disabled={!hasChanges || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <>
                <Ionicons name="save" size={17} color="#111827" />
                <Text style={s.saveText}>Save Settings</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    keyboardView: {
      flex: 1,
      backgroundColor: bg,
    },
    container: {
      flex: 1,
      backgroundColor: bg,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
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
    lastUpdated: {
      color: textMuted,
      fontSize: 11,
      marginTop: 7,
      fontWeight: '700',
    },
    statusCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 16,
      padding: 15,
      marginBottom: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statusLabel: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginBottom: 4,
    },
    statusValue: {
      color: text,
      fontSize: 16,
      fontWeight: '900',
    },
    sectionHeader: {
      marginBottom: 12,
      marginTop: 4,
    },
    sectionTitle: {
      color: text,
      fontSize: 18,
      fontWeight: '900',
    },
    sectionText: {
      color: textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    settingCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 17,
      padding: 15,
      marginBottom: 12,
    },
    settingHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    settingIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: YELLOW + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingLabel: {
      color: text,
      fontSize: 15,
      fontWeight: '900',
    },
    settingDescription: {
      color: textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 3,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      paddingHorizontal: 12,
    },
    input: {
      flex: 1,
      color: text,
      fontSize: 15,
      fontWeight: '900',
      paddingVertical: 12,
    },
    inputSuffix: {
      color: YELLOW,
      fontSize: 12,
      fontWeight: '900',
      marginLeft: 10,
      textTransform: 'uppercase',
    },
    rangeText: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 8,
    },
    quickTitle: {
      color: text,
      fontSize: 14,
      fontWeight: '900',
      marginBottom: 9,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
      marginBottom: 14,
    },
    presetButton: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    presetButtonActive: {
      backgroundColor: YELLOW,
      borderColor: YELLOW,
    },
    presetText: {
      color: textMuted,
      fontWeight: '900',
      fontSize: 12,
    },
    presetTextActive: {
      color: '#111827',
    },
    previewCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: YELLOW + '55',
      borderRadius: 17,
      padding: 15,
      marginBottom: 18,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    previewTitle: {
      color: text,
      fontSize: 15,
      fontWeight: '900',
    },
    previewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 9,
      borderTopWidth: 1,
      borderTopColor: border,
      gap: 12,
    },
    previewAmount: {
      color: text,
      fontWeight: '900',
      fontSize: 13,
    },
    previewDown: {
      color: YELLOW,
      fontWeight: '900',
      fontSize: 13,
    },
    previewRemaining: {
      color: textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    actionBar: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 8,
      marginBottom: 20,
    },
    resetButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resetText: {
      color: textSub,
      fontWeight: '900',
    },
    saveButton: {
      flex: 1.5,
      backgroundColor: YELLOW,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
    },
    saveText: {
      color: '#111827',
      fontWeight: '900',
    },
    disabledButton: {
      opacity: 0.5,
    },
  });
};