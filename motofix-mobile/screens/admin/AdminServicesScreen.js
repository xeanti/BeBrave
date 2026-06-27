import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
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

const EMPTY_FORM = {
  name: '',
  description: '',
  base_price: '',
  labor_cost: '',
  estimated_duration_minutes: '60',
};

function formatPeso(value) {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(minutes) {
  const total = Number(minutes) || 0;

  if (total < 60) return `${total} min${total === 1 ? '' : 's'}`;

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (!mins) return `${hours} hr${hours === 1 ? '' : 's'}`;

  return `${hours} hr${hours === 1 ? '' : 's'} ${mins} min`;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getThemeValue(theme, key, fallback) {
  return theme?.[key] || fallback;
}

export default function AdminServicesScreen() {
  const { theme } = useTheme();
  const s = styles(theme);

  const [services, setServices] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingService, setEditingService] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return services;

    return services.filter((service) => {
      const name = String(service.name || '').toLowerCase();
      const description = String(service.description || '').toLowerCase();

      return name.includes(query) || description.includes(query);
    });
  }, [services, search]);

  const stats = useMemo(() => {
    const active = services.filter((service) => service.is_active !== false);
    const inactive = services.filter((service) => service.is_active === false);

    const averagePrice =
      active.length > 0
        ? active.reduce((sum, service) => {
            return (
              sum +
              cleanNumber(service.base_price) +
              cleanNumber(service.labor_cost)
            );
          }, 0) / active.length
        : 0;

    return {
      total: services.length,
      active: active.length,
      inactive: inactive.length,
      averagePrice,
    };
  }, [services]);

  useEffect(() => {
    fetchServices();

    const channel = supabase
      .channel('mobile-admin-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
        },
        () => fetchServices(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchServices(false);
    }, [])
  );

  async function fetchServices(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      Alert.alert('Services Error', error.message);
      setServices([]);
    } else {
      setServices(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }

  async function insertAuditLog(action, entityId, details = {}) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'services',
      entity_id: entityId,
      performed_by: user.id,
      details,
    });
  }

  function onRefresh() {
    setRefreshing(true);
    fetchServices(false);
  }

  function openAddModal() {
    setEditingService(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEditModal(service) {
    setEditingService(service);
    setForm({
      name: service.name || '',
      description: service.description || '',
      base_price: String(service.base_price ?? ''),
      labor_cost: String(service.labor_cost ?? '0'),
      estimated_duration_minutes: String(
        service.estimated_duration_minutes ?? '60'
      ),
    });
    setModalVisible(true);
  }

  function closeModal() {
    if (saving) return;

    setModalVisible(false);
    setEditingService(null);
    setForm(EMPTY_FORM);
  }

  function updateForm(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function validateForm() {
    if (!form.name.trim()) {
      Alert.alert('Missing Service Name', 'Please enter the service name.');
      return false;
    }

    const basePrice = Number(form.base_price);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      Alert.alert('Invalid Base Price', 'Please enter a valid base price.');
      return false;
    }

    const laborCost = Number(form.labor_cost || 0);
    if (!Number.isFinite(laborCost) || laborCost < 0) {
      Alert.alert('Invalid Labor Cost', 'Please enter a valid labor cost.');
      return false;
    }

    const duration = Number.parseInt(form.estimated_duration_minutes || '60', 10);
    if (!Number.isFinite(duration) || duration <= 0) {
      Alert.alert('Invalid Duration', 'Duration must be greater than 0 minutes.');
      return false;
    }

    return true;
  }

  async function saveService() {
    if (!validateForm()) return;

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      base_price: Number(form.base_price),
      labor_cost: Number(form.labor_cost || 0),
      estimated_duration_minutes:
        Number.parseInt(form.estimated_duration_minutes || '60', 10) || 60,
    };

    if (editingService?.id) {
      const { error } = await supabase
        .from('services')
        .update(payload)
        .eq('id', editingService.id);

      if (error) {
        setSaving(false);
        Alert.alert('Update Failed', error.message);
        return;
      }

      await insertAuditLog('UPDATE_SERVICE', editingService.id, payload);
      Alert.alert('Service Updated', `${payload.name} was updated successfully.`);
    } else {
      const { data, error } = await supabase
        .from('services')
        .insert({
          ...payload,
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        setSaving(false);
        Alert.alert('Create Failed', error.message);
        return;
      }

      await insertAuditLog('CREATE_SERVICE', data.id, payload);
      Alert.alert('Service Added', `${payload.name} was added successfully.`);
    }

    setSaving(false);
    closeModal();
    fetchServices(false);
  }

  async function toggleServiceActive(service) {
    const nextActive = service.is_active === false;

    const { error } = await supabase
      .from('services')
      .update({ is_active: nextActive })
      .eq('id', service.id);

    if (error) {
      Alert.alert('Update Failed', error.message);
      return;
    }

    await insertAuditLog('TOGGLE_SERVICE_ACTIVE', service.id, {
      is_active: nextActive,
      name: service.name,
    });

    setServices((prev) =>
      prev.map((item) =>
        item.id === service.id ? { ...item, is_active: nextActive } : item
      )
    );
  }

  function confirmDelete(service) {
    Alert.alert(
      'Delete Service',
      `Are you sure you want to delete "${service.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteService(service),
        },
      ]
    );
  }

  async function deleteService(service) {
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', service.id);

    if (error) {
      Alert.alert(
        'Delete Failed',
        error.message ||
          'This service may already be connected to bookings or records.'
      );
      return;
    }

    await insertAuditLog('DELETE_SERVICE', service.id, {
      name: service.name,
    });

    setServices((prev) => prev.filter((item) => item.id !== service.id));
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading services...</Text>
      </View>
    );
  }

  return (
    <>
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
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Services</Text>
            <Text style={s.subtitle}>
              Manage service prices, labor cost, duration, and active status.
            </Text>
          </View>

          <TouchableOpacity
            style={s.addButton}
            onPress={openAddModal}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Total</Text>
            <Text style={s.statValue}>{stats.total}</Text>
          </View>

          <View style={s.statCard}>
            <Text style={s.statLabel}>Active</Text>
            <Text style={s.statValue}>{stats.active}</Text>
          </View>

          <View style={s.statCard}>
            <Text style={s.statLabel}>Inactive</Text>
            <Text style={s.statValue}>{stats.inactive}</Text>
          </View>

          <View style={s.statCard}>
            <Text style={s.statLabel}>Avg. Price</Text>
            <Text style={s.statValueSmall}>{formatPeso(stats.averagePrice)}</Text>
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
            placeholder="Search services..."
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

        <View style={s.listHeader}>
          <Text style={s.listTitle}>Service List</Text>
          <Text style={s.listCount}>
            {filteredServices.length} of {services.length}
          </Text>
        </View>

        {filteredServices.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons
              name="construct-outline"
              size={42}
              color={getThemeValue(theme, 'textMuted', '#9ca3af')}
            />
            <Text style={s.emptyTitle}>No services found</Text>
            <Text style={s.emptyText}>
              Add your first service or adjust your search keyword.
            </Text>
          </View>
        ) : (
          filteredServices.map((service) => {
            const active = service.is_active !== false;
            const totalPrice =
              cleanNumber(service.base_price) + cleanNumber(service.labor_cost);

            return (
              <View key={service.id} style={s.serviceCard}>
                <View style={s.serviceTop}>
                  <View style={{ flex: 1 }}>
                    <View style={s.statusRow}>
                      <View
                        style={[
                          s.statusBadge,
                          active ? s.activeBadge : s.inactiveBadge,
                        ]}
                      >
                        <Ionicons
                          name={active ? 'checkmark-circle' : 'pause-circle'}
                          size={13}
                          color={active ? '#22c55e' : '#9ca3af'}
                        />
                        <Text
                          style={[
                            s.statusText,
                            { color: active ? '#22c55e' : '#9ca3af' },
                          ]}
                        >
                          {active ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </View>

                    <Text style={s.serviceName}>{service.name}</Text>

                    {!!service.description && (
                      <Text style={s.serviceDescription} numberOfLines={2}>
                        {service.description}
                      </Text>
                    )}
                  </View>

                  <Switch
                    value={active}
                    onValueChange={() => toggleServiceActive(service)}
                    trackColor={{ false: '#374151', true: '#eab30866' }}
                    thumbColor={active ? YELLOW : '#9ca3af'}
                  />
                </View>

                <View style={s.priceGrid}>
                  <View style={s.priceBox}>
                    <Text style={s.priceLabel}>Base</Text>
                    <Text style={s.priceValue}>
                      {formatPeso(service.base_price)}
                    </Text>
                  </View>

                  <View style={s.priceBox}>
                    <Text style={s.priceLabel}>Labor</Text>
                    <Text style={s.priceValue}>
                      {formatPeso(service.labor_cost)}
                    </Text>
                  </View>

                  <View style={s.priceBox}>
                    <Text style={s.priceLabel}>Total</Text>
                    <Text style={s.priceValue}>{formatPeso(totalPrice)}</Text>
                  </View>

                  <View style={s.priceBox}>
                    <Text style={s.priceLabel}>Duration</Text>
                    <Text style={s.priceValue}>
                      {formatDuration(service.estimated_duration_minutes)}
                    </Text>
                  </View>
                </View>

                <View style={s.actions}>
                  <TouchableOpacity
                    style={s.editButton}
                    onPress={() => openEditModal(service)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={16} color="#111827" />
                    <Text style={s.editText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.deleteButton}
                    onPress={() => confirmDelete(service)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    <Text style={s.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

<Modal
  visible={modalVisible}
  animationType="slide"
  transparent
  onRequestClose={closeModal}
>
  <KeyboardAvoidingView
    style={s.modalOverlay}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
  >
    <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>
                  {editingService ? 'Edit Service' : 'Add Service'}
                </Text>
                <Text style={s.modalSubtitle}>
                  No category field. Same service fields as web.
                </Text>
              </View>

              <TouchableOpacity onPress={closeModal} disabled={saving}>
                <Ionicons
                  name="close"
                  size={24}
                  color={getThemeValue(theme, 'text', '#f9fafb')}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
  showsVerticalScrollIndicator={false}
  keyboardShouldPersistTaps="handled"
  contentContainerStyle={s.modalScrollContent}
>
              <Text style={s.inputLabel}>Service Name *</Text>
              <TextInput
                style={s.input}
                value={form.name}
                onChangeText={(value) => updateForm('name', value)}
                placeholder="e.g. Oil Change"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
              />

              <Text style={s.inputLabel}>Description</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={form.description}
                onChangeText={(value) => updateForm('description', value)}
                placeholder="Short service description..."
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
                multiline
                textAlignVertical="top"
              />

              <Text style={s.inputLabel}>Base Price *</Text>
              <TextInput
                style={s.input}
                value={form.base_price}
                onChangeText={(value) => updateForm('base_price', value)}
                placeholder="0"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
                keyboardType="decimal-pad"
              />

              <Text style={s.inputLabel}>Labor Cost *</Text>
              <TextInput
                style={s.input}
                value={form.labor_cost}
                onChangeText={(value) => updateForm('labor_cost', value)}
                placeholder="0"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
                keyboardType="decimal-pad"
              />

              <Text style={s.inputLabel}>Estimated Duration Minutes *</Text>
              <TextInput
                style={s.input}
                value={form.estimated_duration_minutes}
                onChangeText={(value) =>
                  updateForm('estimated_duration_minutes', value)
                }
                placeholder="60"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
                keyboardType="number-pad"
              />

              <View style={s.previewBox}>
                <Text style={s.previewLabel}>Total Estimate</Text>
                <Text style={s.previewValue}>
                  {formatPeso(
                    cleanNumber(form.base_price) + cleanNumber(form.labor_cost)
                  )}
                </Text>
              </View>

              <View style={s.modalActions}>
                <TouchableOpacity
                  style={s.cancelButton}
                  onPress={closeModal}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.saveButton, saving && s.disabledButton]}
                  onPress={saveService}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#111827" />
                  ) : (
                    <Text style={s.saveText}>
                      {editingService ? 'Save Changes' : 'Add Service'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>
    </>
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

    modalScrollContent: {
  paddingBottom: 28,
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
      marginBottom: 16,
    },
    title: {
      color: text,
      fontSize: 28,
      fontWeight: '900',
    },
    subtitle: {
      color: textSub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    addButton: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
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
    statValueSmall: {
      color: text,
      fontSize: 17,
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
      marginBottom: 16,
    },
    searchInput: {
      flex: 1,
      color: text,
      paddingVertical: 13,
      fontSize: 14,
      fontWeight: '600',
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    serviceCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      padding: 15,
      marginBottom: 12,
    },
    serviceTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 14,
    },
    statusRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    activeBadge: {
      backgroundColor: 'rgba(34, 197, 94, 0.12)',
    },
    inactiveBadge: {
      backgroundColor: 'rgba(156, 163, 175, 0.12)',
    },
    statusText: {
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    serviceName: {
      color: text,
      fontSize: 17,
      fontWeight: '900',
    },
    serviceDescription: {
      color: textSub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },
    priceGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    priceBox: {
      width: '48%',
      backgroundColor: bg2,
      borderRadius: 13,
      padding: 11,
    },
    priceLabel: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginBottom: 4,
    },
    priceValue: {
      color: text,
      fontSize: 13,
      fontWeight: '900',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    editButton: {
      flex: 1,
      backgroundColor: YELLOW,
      borderRadius: 13,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    editText: {
      color: '#111827',
      fontWeight: '900',
    },
    deleteButton: {
      flex: 1,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderRadius: 13,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    deleteText: {
      color: '#ef4444',
      fontWeight: '900',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      maxHeight: '88%',
      backgroundColor: card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: border,
      padding: 18,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 12,
    },
    modalTitle: {
      color: text,
      fontSize: 22,
      fontWeight: '900',
    },
    modalSubtitle: {
      color: textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    inputLabel: {
      color: text,
      fontSize: 12,
      fontWeight: '900',
      marginBottom: 7,
      marginTop: 10,
    },
    input: {
      backgroundColor: bg2,
      color: text,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontWeight: '600',
    },
    textArea: {
      minHeight: 90,
      lineHeight: 20,
    },
    previewBox: {
      marginTop: 14,
      backgroundColor: bg2,
      borderRadius: 15,
      padding: 14,
      borderWidth: 1,
      borderColor: YELLOW + '55',
    },
    previewLabel: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginBottom: 4,
    },
    previewValue: {
      color: YELLOW,
      fontSize: 22,
      fontWeight: '900',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
      paddingBottom: 10,
    },
    cancelButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    cancelText: {
      color: textSub,
      fontWeight: '900',
    },
    saveButton: {
      flex: 1,
      backgroundColor: YELLOW,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    disabledButton: {
      opacity: 0.6,
    },
    saveText: {
      color: '#111827',
      fontWeight: '900',
    },
  });
};