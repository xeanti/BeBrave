import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const EMPTY_FORM = {
  name: '',
  category: '',
  price: '',
  stock_quantity: '',
  reorder_threshold: '5',
  compatible_models: '',
  image_url: '',
};

export default function InventoryScreen() {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // all | low | out
  const [sortBy, setSortBy] = useState('name'); // name | price_asc | price_desc | stock_asc | stock_desc

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [stockEdits, setStockEdits] = useState({}); // id -> pending qty string

  useEffect(() => {
    fetchParts();
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  async function fetchParts() {
    const { data } = await supabase.from('parts').select('*').order('name');
    if (data) setParts(data);
    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchParts();
  }

  function handleChange(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAddModal() {
    return;
  }

  function openEditModal(part) {
    setEditingId(part.id);
    setForm({
      name: part.name || '',
      category: part.category || '',
      price: String(part.price ?? ''),
      stock_quantity: String(part.stock_quantity ?? ''),
      reorder_threshold: String(part.reorder_threshold ?? '5'),
      compatible_models: (part.compatible_models || []).join(', '),
      image_url: part.image_url || '',
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
    if (!form.name.trim()) {
      setFormError('Part name is required.');
      return;
    }
    if (!form.price || isNaN(parseFloat(form.price))) {
      setFormError('Enter a valid price.');
      return;
    }
    if (form.stock_quantity === '' || isNaN(parseInt(form.stock_quantity, 10))) {
      setFormError('Enter a valid stock quantity.');
      return;
    }

    setSaving(true);
    setFormError('');

    const compatibleArray = form.compatible_models
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      price: parseFloat(form.price),
      stock_quantity: parseInt(form.stock_quantity, 10),
      reorder_threshold: parseInt(form.reorder_threshold || '5', 10),
      compatible_models: compatibleArray,
      image_url: form.image_url.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from('parts').update(payload).eq('id', editingId);
      if (error) {
        setFormError(error.message);
        setSaving(false);
        return;
      }
      await supabase.from('audit_logs').insert({
        action: 'UPDATE_PART',
        entity: 'parts',
        entity_id: editingId,
        performed_by: userId,
        details: payload,
      });
    } else {
      setFormError('Adding parts has been disabled.');
      setSaving(false);
      return;
    }

    setSaving(false);
    closeModal();
    fetchParts();
  }

  function confirmDelete(part) {
    Alert.alert(
      'Delete Part',
      `Delete "${part.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deletePart(part) },
      ]
    );
  }

  async function deletePart(part) {
    await supabase.from('parts').delete().eq('id', part.id);
    await supabase.from('audit_logs').insert({
      action: 'DELETE_PART',
      entity: 'parts',
      entity_id: part.id,
      performed_by: userId,
      details: { name: part.name },
    });
    fetchParts();
  }

  async function updateStock(id, qty) {
    if (Number.isNaN(qty) || qty < 0) return;
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, stock_quantity: qty } : p)));
    await supabase.from('parts').update({ stock_quantity: qty }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_PART_STOCK',
      entity: 'parts',
      entity_id: id,
      performed_by: userId,
      details: { new_stock_quantity: qty },
    });
  }

  function adjustStock(part, delta) {
    const next = Math.max(0, (part.stock_quantity || 0) + delta);
    updateStock(part.id, next);
  }

  function commitStockInput(part) {
    const raw = stockEdits[part.id];
    if (raw === undefined) return;
    const qty = parseInt(raw, 10);
    if (!Number.isNaN(qty) && qty >= 0 && qty !== part.stock_quantity) {
      updateStock(part.id, qty);
    }
    setStockEdits((prev) => {
      const next = { ...prev };
      delete next[part.id];
      return next;
    });
  }

  const categories = useMemo(
    () => ['all', ...new Set(parts.map((p) => p.category).filter(Boolean))],
    [parts]
  );

  const stats = useMemo(() => {
    const totalValue = parts.reduce((sum, p) => sum + (p.price || 0) * (p.stock_quantity || 0), 0);
    const lowStock = parts.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.reorder_threshold).length;
    const outOfStock = parts.filter((p) => p.stock_quantity <= 0).length;
    return { totalValue, lowStock, outOfStock, total: parts.length };
  }, [parts]);

  const filteredParts = useMemo(() => {
    let result = parts.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const matchStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && p.stock_quantity > 0 && p.stock_quantity <= p.reorder_threshold) ||
        (stockFilter === 'out' && p.stock_quantity <= 0);
      return matchSearch && matchCategory && matchStock;
    });

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'price_asc': return a.price - b.price;
        case 'price_desc': return b.price - a.price;
        case 'stock_asc': return a.stock_quantity - b.stock_quantity;
        case 'stock_desc': return b.stock_quantity - a.stock_quantity;
        default: return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [parts, search, categoryFilter, stockFilter, sortBy]);

  const SORT_OPTIONS = [
    { key: 'name', label: 'Name (A-Z)' },
    { key: 'price_asc', label: 'Price ↑' },
    { key: 'price_desc', label: 'Price ↓' },
    { key: 'stock_asc', label: 'Stock ↑' },
    { key: 'stock_desc', label: 'Stock ↓' },
  ];

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryLight} />}
      >
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Inventory</Text>
            <Text style={s.subtitle}>Manage parts and stock levels.</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsGrid}>
          <StatCard theme={theme} label="Total Parts" value={stats.total} color={theme.text} />
          <StatCard theme={theme} label="Low Stock" value={stats.lowStock} color={theme.warning} />
          <StatCard theme={theme} label="Out of Stock" value={stats.outOfStock} color={theme.danger} />
          <StatCard
            theme={theme}
            label="Inventory Value"
            value={`₱${stats.totalValue.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
            color={theme.accent}
          />
        </View>

        {/* Search */}
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search parts by name..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              style={[s.chip, categoryFilter === c && s.chipActive]}
              onPress={() => setCategoryFilter(c)}
            >
              <Text style={[s.chipText, categoryFilter === c && s.chipTextActive]}>
                {c === 'all' ? 'All Categories' : c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Stock filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
          {[
            { key: 'all', label: 'All Stock' },
            { key: 'low', label: 'Low Stock' },
            { key: 'out', label: 'Out of Stock' },
          ].map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[s.chip, stockFilter === f.key && s.chipActive]}
              onPress={() => setStockFilter(f.key)}
            >
              <Text style={[s.chipText, stockFilter === f.key && s.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[s.chip, sortBy === opt.key && s.chipActive]}
              onPress={() => setSortBy(opt.key)}
            >
              <Text style={[s.chipText, sortBy === opt.key && s.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.resultsCount}>
          {filteredParts.length} of {parts.length} {parts.length === 1 ? 'part' : 'parts'} shown
        </Text>

        {/* Parts list */}
        {filteredParts.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🔍</Text>
            <Text style={s.emptyText}>
              {parts.length === 0 ? 'No parts in inventory yet.' : 'No parts match your filters.'}
            </Text>
          </View>
        ) : (
          filteredParts.map((p) => {
            const isOut = p.stock_quantity <= 0;
            const isLow = !isOut && p.stock_quantity <= p.reorder_threshold;
            const badgeColor = isOut ? theme.danger : isLow ? theme.warning : theme.success;
            const badgeText = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';

            return (
              <View key={p.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.cardImage}>
                    {p.image_url ? (
                      <Image source={{ uri: p.image_url }} style={s.cardImageInner} />
                    ) : (
                      <Text style={{ fontSize: 20 }}>⚙️</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.cardCategory}>{p.category || 'Uncategorized'}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: badgeColor + '22' }]}>
                    <Text style={[s.badgeText, { color: badgeColor }]}>{badgeText}</Text>
                  </View>
                </View>

                {p.compatible_models?.length > 0 && (
                  <View style={s.tagsRow}>
                    {p.compatible_models.slice(0, 3).map((m, i) => (
                      <View key={i} style={s.tag}>
                        <Text style={s.tagText}>{m}</Text>
                      </View>
                    ))}
                    {p.compatible_models.length > 3 && (
                      <Text style={s.tagMore}>+{p.compatible_models.length - 3} more</Text>
                    )}
                  </View>
                )}

                <View style={s.infoRow}>
                  <View>
                    <Text style={s.infoLabel}>Price</Text>
                    <Text style={[s.infoValue, { color: theme.accent }]}>
                      ₱{Number(p.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View>
                    <Text style={s.infoLabel}>Reorder At</Text>
                    <Text style={s.infoValue}>{p.reorder_threshold}</Text>
                  </View>
                </View>

                {/* Stock stepper */}
                <View style={s.stockRow}>
                  <TouchableOpacity
                    style={s.stockBtn}
                    onPress={() => adjustStock(p, -1)}
                    disabled={p.stock_quantity <= 0}
                  >
                    <Text style={[s.stockBtnText, p.stock_quantity <= 0 && { opacity: 0.3 }]}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.stockInput}
                    keyboardType="number-pad"
                    value={stockEdits[p.id] ?? String(p.stock_quantity)}
                    onChangeText={(val) => setStockEdits((prev) => ({ ...prev, [p.id]: val }))}
                    onBlur={() => commitStockInput(p)}
                  />
                  <TouchableOpacity style={s.stockBtn} onPress={() => adjustStock(p, 1)}>
                    <Text style={s.stockBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={s.stockOnHand}>on hand</Text>
                </View>

                {/* Actions */}
                <View style={s.actionsRow}>
                  <TouchableOpacity style={[s.actionBtn, s.editBtn]} onPress={() => openEditModal(p)}>
                    <Text style={[s.actionBtnText, { color: theme.primaryLight }]}>✎ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, s.deleteBtn]} onPress={() => confirmDelete(p)}>
                    <Text style={[s.actionBtnText, { color: theme.danger }]}>🗑 Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalOverlay}
        >
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Part</Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: '100%' }} keyboardShouldPersistTaps="handled">
              {formError ? (
                <View style={s.formError}>
                  <Text style={s.formErrorText}>{formError}</Text>
                </View>
              ) : null}

              <Text style={s.fieldLabel}>Image URL</Text>
              <TextInput
                style={s.input}
                placeholder="https://..."
                placeholderTextColor={theme.textMuted}
                value={form.image_url}
                onChangeText={(v) => handleChange('image_url', v)}
                autoCapitalize="none"
              />

              <Text style={s.fieldLabel}>Part Name *</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Performance Exhaust"
                placeholderTextColor={theme.textMuted}
                value={form.name}
                onChangeText={(v) => handleChange('name', v)}
              />

              <Text style={s.fieldLabel}>Category</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. exhaust, headlight"
                placeholderTextColor={theme.textMuted}
                value={form.category}
                onChangeText={(v) => handleChange('category', v)}
              />

              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Price (₱) *</Text>
                  <TextInput
                    style={s.input}
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    value={form.price}
                    onChangeText={(v) => handleChange('price', v)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Stock Qty *</Text>
                  <TextInput
                    style={s.input}
                    placeholder="0"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    value={form.stock_quantity}
                    onChangeText={(v) => handleChange('stock_quantity', v)}
                  />
                </View>
              </View>

              <Text style={s.fieldLabel}>Reorder Threshold</Text>
              <TextInput
                style={s.input}
                placeholder="5"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                value={form.reorder_threshold}
                onChangeText={(v) => handleChange('reorder_threshold', v)}
              />
              <Text style={s.fieldHint}>Parts at or below this stock level are flagged as low stock.</Text>

              <Text style={s.fieldLabel}>Compatible Models (comma-separated)</Text>
              <TextInput
                style={s.input}
                placeholder="Yamaha Aerox 155, Honda Click 125i"
                placeholderTextColor={theme.textMuted}
                value={form.compatible_models}
                onChangeText={(v) => handleChange('compatible_models', v)}
              />

              <View style={s.modalActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleSubmit} disabled={saving}>
                  <Text style={s.saveBtnText}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Text>
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

function StatCard({ theme, label, value, color }) {
  return (
    <View style={{ width: '48%', backgroundColor: theme.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

const styles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    content: { padding: 16, paddingBottom: 24 },

    headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.text },
    subtitle: { fontSize: 13, color: theme.textSub, marginTop: 2 },
    addBtn: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

    searchBar: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg2,
      borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12,
      marginBottom: 10, height: 44,
    },
    searchIcon: { fontSize: 14, marginRight: 8, opacity: 0.6 },
    searchInput: { flex: 1, color: theme.text, fontSize: 14, height: '100%' },
    searchClear: { color: theme.textSub, fontSize: 14, fontWeight: 'bold', paddingHorizontal: 6 },

    chipRow: { marginBottom: 10 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, marginRight: 8 },
    chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { fontSize: 12, color: theme.textSub, fontWeight: '500' },
    chipTextActive: { color: '#fff', fontWeight: 'bold' },

    resultsCount: { fontSize: 12, color: theme.textMuted, marginBottom: 12 },

    emptyState: { alignItems: 'center', padding: 40 },
    emptyText: { color: theme.textSub, fontSize: 14, textAlign: 'center', marginBottom: 8 },
    emptyLink: { color: theme.primaryLight, fontSize: 13, fontWeight: '600' },

    card: { backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    cardImage: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.bg2, justifyContent: 'center', alignItems: 'center', marginRight: 10, overflow: 'hidden' },
    cardImageInner: { width: '100%', height: '100%' },
    cardName: { fontSize: 14, fontWeight: 'bold', color: theme.text },
    cardCategory: { fontSize: 11, color: theme.textMuted, marginTop: 1, textTransform: 'capitalize' },
    badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    badgeText: { fontSize: 10, fontWeight: 'bold' },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' },
    tag: { backgroundColor: theme.primary + '15', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    tagText: { fontSize: 10, color: theme.primaryLight },
    tagMore: { fontSize: 10, color: theme.textMuted },

    infoRow: { flexDirection: 'row', gap: 24, backgroundColor: theme.bg2, borderRadius: 10, padding: 10, marginBottom: 10 },
    infoLabel: { fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    infoValue: { fontSize: 13, fontWeight: 'bold', color: theme.text },

    stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    stockBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', alignItems: 'center' },
    stockBtnText: { fontSize: 16, fontWeight: 'bold', color: theme.text },
    stockInput: { width: 56, height: 32, borderRadius: 8, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '600' },
    stockOnHand: { fontSize: 11, color: theme.textMuted, marginLeft: 4 },

    actionsRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
    actionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    editBtn: { backgroundColor: theme.primary + '18' },
    deleteBtn: { backgroundColor: '#ef444418' },
    actionBtnText: { fontSize: 12, fontWeight: '600' },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet: { backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.text },
    modalClose: { fontSize: 20, color: theme.textMuted },

    formError: { backgroundColor: '#ef444418', borderRadius: 8, padding: 10, marginBottom: 12 },
    formErrorText: { color: theme.danger, fontSize: 13 },

    fieldLabel: { fontSize: 12, color: theme.textSub, marginBottom: 6, marginTop: 12 },
    fieldHint: { fontSize: 11, color: theme.textMuted, marginTop: 4 },
    input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2 },
    row2: { flexDirection: 'row', gap: 12 },

    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, alignItems: 'center' },
    cancelBtnText: { color: theme.text, fontWeight: '600' },
    saveBtn: { flex: 1, backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: 'bold' },
  });