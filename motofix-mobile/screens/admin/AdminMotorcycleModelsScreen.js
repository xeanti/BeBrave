import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, RefreshControl,
  Modal, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const EMPTY_FORM = {
  make: '',
  model: '',
  year_range: '',
  reference_photo_url: '',
};

export default function AdminMotorcycleModelsScreen() {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [userId, setUserId] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
    fetchModels();
  }, []);

  async function fetchModels() {
    const { data } = await supabase
      .from('motorcycle_models')
      .select('*')
      .order('make', { ascending: true });
    if (data) setModels(data);
    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchModels();
  }

  function openAddModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  }

  function openEditModal(model) {
    setEditingId(model.id);
    setForm({
      make: model.make || '',
      model: model.model || '',
      year_range: model.year_range || '',
      reference_photo_url: model.reference_photo_url || '',
    });
    setFormError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function handleSubmit() {
    if (!form.make.trim()) { setFormError('Make is required.'); return; }
    if (!form.model.trim()) { setFormError('Model is required.'); return; }

    setSaving(true);
    setFormError('');

    const payload = {
      make: form.make.trim(),
      model: form.model.trim(),
      year_range: form.year_range.trim() || null,
      reference_photo_url: form.reference_photo_url.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase
        .from('motorcycle_models')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        setFormError(error.code === '23505' ? 'This make + model already exists.' : error.message);
        setSaving(false);
        return;
      }

      await supabase.from('audit_logs').insert({
        action: 'UPDATE_MOTORCYCLE_MODEL',
        entity: 'motorcycle_models',
        entity_id: editingId,
        performed_by: userId,
        details: { make: payload.make, model: payload.model },
      });
    } else {
      const { data, error } = await supabase
        .from('motorcycle_models')
        .insert(payload)
        .select()
        .single();

      if (error) {
        setFormError(error.code === '23505' ? 'This make + model already exists.' : error.message);
        setSaving(false);
        return;
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_MOTORCYCLE_MODEL',
        entity: 'motorcycle_models',
        entity_id: data.id,
        performed_by: userId,
        details: { make: payload.make, model: payload.model },
      });
    }

    setSaving(false);
    closeModal();
    fetchModels();
  }

  function confirmDelete(model) {
    Alert.alert(
      'Delete Model',
      `Delete "${model.make} ${model.model}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteModel(model),
        },
      ]
    );
  }

  async function deleteModel(model) {
    setDeletingId(model.id);
    await supabase.from('motorcycle_models').delete().eq('id', model.id);
    await supabase.from('audit_logs').insert({
      action: 'DELETE_MOTORCYCLE_MODEL',
      entity: 'motorcycle_models',
      entity_id: model.id,
      performed_by: userId,
      details: { make: model.make, model: model.model },
    });
    setDeletingId(null);
    fetchModels();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.trim().toLowerCase();
    return models.filter(m =>
      m.make.toLowerCase().includes(q) ||
      m.model.toLowerCase().includes(q) ||
      (m.year_range || '').toLowerCase().includes(q)
    );
  }, [models, search]);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Search + Add */}
      <View style={s.topBar}>
        <View style={s.searchWrap}>
          <TextInput
            style={s.searchInput}
            placeholder="Search make, model, year..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={s.searchClear}>
              <Text style={{ color: theme.textMuted }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAddModal}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.resultCount}>
        {filtered.length} of {models.length} models
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🏍️</Text>
            <Text style={s.emptyTitle}>
              {models.length === 0 ? 'No models yet.' : 'No models match your search.'}
            </Text>
          </View>
        ) : (
          filtered.map(m => (
            <View key={m.id} style={s.card}>
              <View style={s.cardLeft}>
                <View style={s.photoWrap}>
                  {m.reference_photo_url ? (
                    <Image
                      source={{ uri: m.reference_photo_url }}
                      style={s.photo}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={{ fontSize: 24 }}>🏍️</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modelName}>{m.make} {m.model}</Text>
                  {m.year_range ? (
                    <Text style={s.modelSub}>{m.year_range}</Text>
                  ) : (
                    <Text style={[s.modelSub, { color: theme.textMuted, fontStyle: 'italic' }]}>
                      No year range
                    </Text>
                  )}
                </View>
              </View>
              <View style={s.cardActions}>
                <TouchableOpacity
                  style={s.editBtn}
                  onPress={() => openEditModal(m)}
                >
                  <Text style={s.editBtnText}>✎ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={() => confirmDelete(m)}
                  disabled={deletingId === m.id}
                >
                  <Text style={s.deleteBtnText}>
                    {deletingId === m.id ? '...' : '🗑'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editingId ? 'Edit Model' : 'Add New Model'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {formError ? (
                <View style={s.formError}>
                  <Text style={s.formErrorText}>{formError}</Text>
                </View>
              ) : null}

              {/* Photo preview */}
              {form.reference_photo_url ? (
                <Image
                  source={{ uri: form.reference_photo_url }}
                  style={s.previewImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[s.previewImage, { backgroundColor: theme.bg2, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 40 }}>🏍️</Text>
                </View>
              )}

              <Text style={s.fieldLabel}>Reference Photo URL</Text>
              <TextInput
                style={s.input}
                placeholder="https://..."
                placeholderTextColor={theme.textMuted}
                value={form.reference_photo_url}
                onChangeText={v => setForm(f => ({ ...f, reference_photo_url: v }))}
                autoCapitalize="none"
              />

              <Text style={s.fieldLabel}>Make *</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Yamaha"
                placeholderTextColor={theme.textMuted}
                value={form.make}
                onChangeText={v => setForm(f => ({ ...f, make: v }))}
              />

              <Text style={s.fieldLabel}>Model *</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Aerox 155"
                placeholderTextColor={theme.textMuted}
                value={form.model}
                onChangeText={v => setForm(f => ({ ...f, model: v }))}
              />

              <Text style={s.fieldLabel}>Year Range</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 2021–2024"
                placeholderTextColor={theme.textMuted}
                value={form.year_range}
                onChangeText={v => setForm(f => ({ ...f, year_range: v }))}
              />

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.saveBtn}
                  onPress={handleSubmit}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.saveBtnText}>
                        {editingId ? 'Save Changes' : '+ Add Model'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg2, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: theme.text },
  searchClear: { padding: 4 },
  addBtn: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  resultCount: { fontSize: 12, color: theme.textMuted, paddingHorizontal: 14, marginBottom: 8 },
  emptyCard: { alignItems: 'center', padding: 48 },
  emptyTitle: { fontSize: 16, color: theme.textSub },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.card, marginHorizontal: 12, marginBottom: 10, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  photoWrap: { width: 52, height: 52, borderRadius: 10, backgroundColor: theme.bg2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 0 },
  photo: { width: 52, height: 52 },
  modelName: { fontSize: 14, fontWeight: 'bold', color: theme.text },
  modelSub: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: theme.primary + '18', borderWidth: 1, borderColor: theme.primary + '44' },
  editBtnText: { fontSize: 12, fontWeight: '600', color: theme.primaryLight },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#ef444418', borderWidth: 1, borderColor: '#ef444444' },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.text },
  modalClose: { fontSize: 20, color: theme.textMuted },
  previewImage: { width: '100%', height: 160, borderRadius: 12, marginBottom: 16 },
  formError: { backgroundColor: '#ef444418', borderRadius: 8, padding: 10, marginBottom: 12 },
  formErrorText: { color: '#ef4444', fontSize: 13 },
  fieldLabel: { fontSize: 12, color: theme.textSub, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: theme.text, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
});