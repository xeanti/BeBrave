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
  id: null,
  category: 'general',
  intent: '',
  title: '',
  question: '',
  answer: '',
  response: '',
  keywordsText: '',
  priority: '100',
  is_active: true,
};

const CATEGORIES = [
  'general',
  'booking',
  'payment',
  'orders',
  'customization',
  'parts',
  'pre-assessment',
];

function getThemeValue(theme, key, fallback) {
  return theme?.[key] || fallback;
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

function normalizeIntent(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function keywordsToText(keywords) {
  if (Array.isArray(keywords)) return keywords.join(', ');
  if (typeof keywords === 'string') return keywords;
  return '';
}

function textToKeywords(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminChatbotTemplatesScreen() {
  const { theme } = useTheme();
  const s = styles(theme);

  const [templates, setTemplates] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [modalVisible, setModalVisible] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const stats = useMemo(() => {
    return {
      total: templates.length,
      active: templates.filter((item) => item.is_active).length,
      inactive: templates.filter((item) => !item.is_active).length,
    };
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates.filter((template) => {
      const category = String(template.category || 'general').toLowerCase();

      if (filter !== 'all' && category !== filter) return false;

      if (!query) return true;

      const keywords = keywordsToText(template.keywords).toLowerCase();

      return (
        String(template.intent || '').toLowerCase().includes(query) ||
        String(template.title || '').toLowerCase().includes(query) ||
        String(template.question || '').toLowerCase().includes(query) ||
        String(template.answer || '').toLowerCase().includes(query) ||
        String(template.response || '').toLowerCase().includes(query) ||
        keywords.includes(query)
      );
    });
  }, [templates, filter, search]);

  useEffect(() => {
    fetchTemplates();

    const channel = supabase
      .channel('mobile-admin-chatbot-templates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chatbot_templates',
        },
        () => fetchTemplates(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTemplates(false);
    }, [])
  );

  async function fetchTemplates(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('chatbot_templates')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      setTemplates([]);
      setLoading(false);
      setRefreshing(false);
      Alert.alert('Chatbot Templates Error', error.message);
      return;
    }

    setTemplates(data || []);
    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchTemplates(false);
  }

  function openAddModal() {
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEditModal(template) {
    setForm({
      id: template.id,
      category: template.category || 'general',
      intent: template.intent || '',
      title: template.title || '',
      question: template.question || template.title || '',
      answer: template.answer || template.response || '',
      response: template.response || template.answer || '',
      keywordsText: keywordsToText(template.keywords),
      priority: String(template.priority ?? 100),
      is_active: Boolean(template.is_active),
    });

    setModalVisible(true);
  }

  function updateForm(key, value) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === 'title' && !prev.question) {
        next.question = value;
      }

      if (key === 'answer') {
        next.response = value;
      }

      if (key === 'question' && !prev.title) {
        next.title = value;
      }

      if (key === 'intent') {
        next.intent = normalizeIntent(value);
      }

      return next;
    });
  }

  function validateForm() {
    const title = form.title.trim() || form.question.trim();
    const question = form.question.trim() || form.title.trim();
    const answer = form.answer.trim() || form.response.trim();
    const response = form.response.trim() || form.answer.trim();
    const intent = normalizeIntent(form.intent || title);

    if (!intent) {
      Alert.alert('Missing Intent', 'Please enter an intent/key for this template.');
      return null;
    }

    if (!title) {
      Alert.alert('Missing Title', 'Please enter a title.');
      return null;
    }

    if (!question) {
      Alert.alert('Missing Question', 'Please enter the customer question.');
      return null;
    }

    if (!answer || !response) {
      Alert.alert('Missing Answer', 'Please enter the chatbot answer.');
      return null;
    }

    return {
      category: form.category || 'general',
      intent,
      title,
      question,
      answer,
      response,
      keywords: textToKeywords(form.keywordsText),
      priority: Number(form.priority) || 100,
      is_active: Boolean(form.is_active),
    };
  }

  async function insertAuditLog(action, entityId, details = {}) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'chatbot_templates',
      entity_id: entityId,
      performed_by: user.id,
      details,
    });
  }

  async function saveTemplate() {
    const payload = validateForm();
    if (!payload) return;

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (form.id) {
      const { error } = await supabase
        .from('chatbot_templates')
        .update({
          ...payload,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', form.id);

      if (error) {
        setSaving(false);
        Alert.alert('Update Failed', error.message);
        return;
      }

      await insertAuditLog('UPDATE_CHATBOT_TEMPLATE', form.id, {
        intent: payload.intent,
        title: payload.title,
      });
    } else {
      const { data, error } = await supabase
        .from('chatbot_templates')
        .insert({
          ...payload,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        })
        .select()
        .single();

      if (error) {
        setSaving(false);
        Alert.alert('Create Failed', error.message);
        return;
      }

      await insertAuditLog('CREATE_CHATBOT_TEMPLATE', data?.id, {
        intent: payload.intent,
        title: payload.title,
      });
    }

    setSaving(false);
    setModalVisible(false);
    setForm(EMPTY_FORM);
    fetchTemplates(false);
  }

  async function toggleActive(template) {
    const nextValue = !template.is_active;

    const { error } = await supabase
      .from('chatbot_templates')
      .update({
        is_active: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', template.id);

    if (error) {
      Alert.alert('Update Failed', error.message);
      return;
    }

    await insertAuditLog('TOGGLE_CHATBOT_TEMPLATE', template.id, {
      intent: template.intent,
      is_active: nextValue,
    });

    setTemplates((prev) =>
      prev.map((item) =>
        item.id === template.id ? { ...item, is_active: nextValue } : item
      )
    );
  }

  function confirmDelete(template) {
    Alert.alert(
      'Delete Template',
      `Delete "${template.title || template.intent}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteTemplate(template),
        },
      ]
    );
  }

  async function deleteTemplate(template) {
    setDeletingId(template.id);

    const { error } = await supabase
      .from('chatbot_templates')
      .delete()
      .eq('id', template.id);

    if (error) {
      setDeletingId(null);
      Alert.alert('Delete Failed', error.message);
      return;
    }

    await insertAuditLog('DELETE_CHATBOT_TEMPLATE', template.id, {
      intent: template.intent,
      title: template.title,
    });

    setTemplates((prev) => prev.filter((item) => item.id !== template.id));
    setDeletingId(null);
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading chatbot templates...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
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
            <Ionicons name="sparkles" size={26} color="#111827" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.title}>Chatbot Templates</Text>
            <Text style={s.subtitle}>
              Manage AI Assistant responses for bookings, payments, orders, parts, and MotoFix FAQs.
            </Text>
          </View>
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
        </View>

        <TouchableOpacity
          style={s.addButton}
          onPress={openAddModal}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={20} color="#111827" />
          <Text style={s.addButtonText}>Add Chatbot Template</Text>
        </TouchableOpacity>

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
            placeholder="Search intent, title, question, keywords..."
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
          {['all', ...CATEGORIES].map((category) => {
            const active = filter === category;

            return (
              <TouchableOpacity
                key={category}
                style={[s.filterButton, active && s.filterButtonActive]}
                onPress={() => setFilter(category)}
                activeOpacity={0.8}
              >
                <Text style={[s.filterText, active && s.filterTextActive]}>
                  {category === 'all' ? 'All' : category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.listHeader}>
          <Text style={s.listTitle}>Templates</Text>
          <Text style={s.listCount}>
            {filteredTemplates.length} of {templates.length}
          </Text>
        </View>

        {filteredTemplates.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={42}
              color={getThemeValue(theme, 'textMuted', '#9ca3af')}
            />
            <Text style={s.emptyTitle}>No templates found</Text>
            <Text style={s.emptyText}>
              Add templates so the AI Assistant can answer common customer questions.
            </Text>
          </View>
        ) : (
          filteredTemplates.map((template) => (
            <View key={template.id} style={s.templateCard}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <View style={s.badgeRow}>
                    <View style={s.categoryBadge}>
                      <Text style={s.categoryText}>
                        {template.category || 'general'}
                      </Text>
                    </View>

                    <View
                      style={[
                        s.activeBadge,
                        template.is_active ? s.activeOn : s.activeOff,
                      ]}
                    >
                      <Text
                        style={[
                          s.activeText,
                          {
                            color: template.is_active
                              ? '#22c55e'
                              : getThemeValue(theme, 'textMuted', '#9ca3af'),
                          },
                        ]}
                      >
                        {template.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.templateTitle}>
                    {template.title || template.question || template.intent}
                  </Text>

                  <Text style={s.intentText}>{template.intent}</Text>
                </View>

                <Switch
                  value={Boolean(template.is_active)}
                  onValueChange={() => toggleActive(template)}
                  trackColor={{ false: '#4b5563', true: YELLOW + '88' }}
                  thumbColor={template.is_active ? YELLOW : '#9ca3af'}
                />
              </View>

              {!!template.question && (
                <View style={s.qaBox}>
                  <Text style={s.qaLabel}>Question</Text>
                  <Text style={s.qaText}>{template.question}</Text>
                </View>
              )}

              <View style={s.qaBox}>
                <Text style={s.qaLabel}>Answer</Text>
                <Text style={s.qaText}>
                  {template.answer || template.response || 'No response set.'}
                </Text>
              </View>

              {Array.isArray(template.keywords) && template.keywords.length > 0 && (
                <View style={s.keywordWrap}>
                  {template.keywords.map((keyword) => (
                    <View key={keyword} style={s.keywordPill}>
                      <Text style={s.keywordText}>{keyword}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={s.cardFooter}>
                <Text style={s.updatedText}>
                  Updated {formatDateTime(template.updated_at || template.created_at)}
                </Text>

                <View style={s.actions}>
                  <TouchableOpacity
                    style={s.editButton}
                    onPress={() => openEditModal(template)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create" size={15} color={YELLOW} />
                    <Text style={s.editButtonText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.deleteButton}
                    onPress={() => confirmDelete(template)}
                    disabled={deletingId === template.id}
                    activeOpacity={0.8}
                  >
                    {deletingId === template.id ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <>
                        <Ionicons name="trash" size={15} color="#ef4444" />
                        <Text style={s.deleteButtonText}>Delete</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>
                  {form.id ? 'Edit Template' : 'Add Template'}
                </Text>
                <Text style={s.modalSubtitle}>
                  Save both web fields and mobile-friendly fields.
                </Text>
              </View>

              <TouchableOpacity
                style={s.modalClose}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={getThemeValue(theme, 'text', '#fff')} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.inputLabel}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.categoryPicker}
              >
                {CATEGORIES.map((category) => {
                  const active = form.category === category;

                  return (
                    <TouchableOpacity
                      key={category}
                      style={[s.categoryPickButton, active && s.categoryPickActive]}
                      onPress={() => updateForm('category', category)}
                    >
                      <Text
                        style={[
                          s.categoryPickText,
                          active && s.categoryPickTextActive,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={s.inputLabel}>Intent / Key</Text>
              <TextInput
                style={s.formInput}
                value={form.intent}
                onChangeText={(value) => updateForm('intent', value)}
                placeholder="example: booking_service"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
                autoCapitalize="none"
              />

              <Text style={s.inputLabel}>Title</Text>
              <TextInput
                style={s.formInput}
                value={form.title}
                onChangeText={(value) => updateForm('title', value)}
                placeholder="example: How to Book a Service"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
              />

              <Text style={s.inputLabel}>Customer Question</Text>
              <TextInput
                style={s.formInput}
                value={form.question}
                onChangeText={(value) => updateForm('question', value)}
                placeholder="example: How do I book a service?"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
              />

              <Text style={s.inputLabel}>Chatbot Answer</Text>
              <TextInput
                style={[s.formInput, s.multilineInput]}
                value={form.answer}
                onChangeText={(value) => updateForm('answer', value)}
                placeholder="Write the response shown by the chatbot..."
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
                multiline
                textAlignVertical="top"
              />

              <Text style={s.inputLabel}>Keywords</Text>
              <TextInput
                style={s.formInput}
                value={form.keywordsText}
                onChangeText={(value) => updateForm('keywordsText', value)}
                placeholder="booking, appointment, schedule"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
              />

              <Text style={s.inputLabel}>Priority</Text>
              <TextInput
                style={s.formInput}
                value={form.priority}
                onChangeText={(value) => updateForm('priority', value.replace(/[^0-9]/g, ''))}
                placeholder="100"
                placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
                keyboardType="numeric"
              />

              <View style={s.switchRow}>
                <View>
                  <Text style={s.switchTitle}>Active Template</Text>
                  <Text style={s.switchSub}>
                    Active templates can be used by the chatbot.
                  </Text>
                </View>

                <Switch
                  value={form.is_active}
                  onValueChange={(value) => updateForm('is_active', value)}
                  trackColor={{ false: '#4b5563', true: YELLOW + '88' }}
                  thumbColor={form.is_active ? YELLOW : '#9ca3af'}
                />
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity
                style={s.cancelButton}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={s.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.saveButton}
                onPress={saveTemplate}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#111827" />
                ) : (
                  <>
                    <Ionicons name="save" size={18} color="#111827" />
                    <Text style={s.saveButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = (theme) => {
  const bg = getThemeValue(theme, 'bg', '#0f172a');
  const bg2 = getThemeValue(theme, 'bg2', '#111827');
  const bg3 = getThemeValue(theme, 'bg3', '#1f2937');
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
      fontWeight: '700',
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
      fontSize: 24,
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
      gap: 10,
      marginBottom: 14,
    },
    statCard: {
      flex: 1,
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
    addButton: {
      backgroundColor: YELLOW,
      borderRadius: 15,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 13,
    },
    addButtonText: {
      color: '#111827',
      fontWeight: '900',
      fontSize: 14,
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
      textTransform: 'capitalize',
    },
    filterTextActive: {
      color: '#111827',
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
    templateCard: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      padding: 15,
      marginBottom: 13,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      marginBottom: 8,
    },
    categoryBadge: {
      backgroundColor: YELLOW + '20',
      borderWidth: 1,
      borderColor: YELLOW + '55',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    categoryText: {
      color: YELLOW,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    activeBadge: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    activeOn: {
      backgroundColor: 'rgba(34, 197, 94, 0.14)',
    },
    activeOff: {
      backgroundColor: textMuted + '22',
    },
    activeText: {
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    templateTitle: {
      color: text,
      fontSize: 16,
      fontWeight: '900',
    },
    intentText: {
      color: textMuted,
      fontSize: 12,
      marginTop: 3,
      fontWeight: '700',
    },
    qaBox: {
      backgroundColor: bg2,
      borderRadius: 14,
      padding: 12,
      marginBottom: 9,
    },
    qaLabel: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      marginBottom: 5,
    },
    qaText: {
      color: textSub,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
    },
    keywordWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      marginBottom: 11,
    },
    keywordPill: {
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    keywordText: {
      color: textSub,
      fontSize: 11,
      fontWeight: '800',
    },
    cardFooter: {
      borderTopWidth: 1,
      borderTopColor: border,
      paddingTop: 11,
      gap: 10,
    },
    updatedText: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    editButton: {
      flex: 1,
      backgroundColor: YELLOW + '16',
      borderWidth: 1,
      borderColor: YELLOW + '55',
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    editButtonText: {
      color: YELLOW,
      fontWeight: '900',
      fontSize: 12,
    },
    deleteButton: {
      flex: 1,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.35)',
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    deleteButtonText: {
      color: '#ef4444',
      fontWeight: '900',
      fontSize: 12,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '90%',
      borderWidth: 1,
      borderColor: border,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    modalTitle: {
      color: text,
      fontSize: 19,
      fontWeight: '900',
    },
    modalSubtitle: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 3,
    },
    modalClose: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: bg2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalContent: {
      padding: 16,
      paddingBottom: 26,
    },
    inputLabel: {
      color: text,
      fontSize: 12,
      fontWeight: '900',
      marginBottom: 7,
      marginTop: 10,
    },
    categoryPicker: {
      gap: 8,
      paddingBottom: 6,
    },
    categoryPickButton: {
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    categoryPickActive: {
      backgroundColor: YELLOW,
      borderColor: YELLOW,
    },
    categoryPickText: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'capitalize',
    },
    categoryPickTextActive: {
      color: '#111827',
    },
    formInput: {
      backgroundColor: bg3,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      color: text,
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: 14,
      fontWeight: '600',
    },
    multilineInput: {
      minHeight: 120,
      lineHeight: 20,
    },
    switchRow: {
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 15,
      padding: 13,
      marginTop: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: 'center',
    },
    switchTitle: {
      color: text,
      fontSize: 14,
      fontWeight: '900',
    },
    switchSub: {
      color: textMuted,
      fontSize: 12,
      marginTop: 3,
      maxWidth: 210,
    },
    modalFooter: {
      flexDirection: 'row',
      gap: 10,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: border,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    cancelButtonText: {
      color: textSub,
      fontWeight: '900',
    },
    saveButton: {
      flex: 1,
      backgroundColor: YELLOW,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
    },
    saveButtonText: {
      color: '#111827',
      fontWeight: '900',
    },
  });
};