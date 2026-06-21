import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 8; h < 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
})();

async function getDownPaymentPercent() {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'down_payment_percent')
    .single();
  return data ? parseFloat(data.value) / 100 : 0.15;
}

export default function WalkInsScreen() {
  const { theme, isDark } = useTheme();
  const [tab, setTab] = useState('booking'); // 'booking' | 'pos'
  const [staffId, setStaffId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setStaffId(data?.user?.id || null));
  }, []);

  const s = styles(theme);

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'booking' && s.tabBtnActive]}
          onPress={() => setTab('booking')}
        >
          <Text style={[s.tabBtnText, tab === 'booking' && s.tabBtnTextActive]}>📅 Booking</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'pos' && s.tabBtnActive]}
          onPress={() => setTab('pos')}
        >
          <Text style={[s.tabBtnText, tab === 'pos' && s.tabBtnTextActive]}>🧾 Parts POS</Text>
        </TouchableOpacity>
      </View>

      {tab === 'booking' ? (
        <WalkInBooking staffId={staffId} theme={theme} />
      ) : (
        <WalkInPOS staffId={staffId} theme={theme} />
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Shared: Customer picker (search or create)
// ─────────────────────────────────────────
function CustomerPicker({ selected, onSelect, theme }) {
  const s = pickerStyles(theme);
  const [mode, setMode] = useState('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [newCustomer, setNewCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [creating, setCreating] = useState(false);

  async function handleSearch() {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone')
      .eq('role', 'customer')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(8);
    setResults(data || []);
    setSearching(false);
  }

  async function handleCreate() {
    if (!newCustomer.firstName || !newCustomer.lastName || !newCustomer.email) {
      Alert.alert('Error', 'First name, last name, and email are required.');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-account', {
        body: { ...newCustomer, role: 'customer' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      onSelect({
        id: data.account.id,
        first_name: data.account.first_name,
        last_name: data.account.last_name,
        email: data.account.email,
        phone: newCustomer.phone,
        _tempPassword: data.account.tempPassword,
      });
      setNewCustomer({ firstName: '', lastName: '', email: '', phone: '' });
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <View style={s.selectedCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.selectedName}>{selected.first_name} {selected.last_name}</Text>
          <Text style={s.selectedSub}>{selected.email}{selected.phone ? ` · ${selected.phone}` : ''}</Text>
          {selected._tempPassword && (
            <Text style={s.tempPassword}>Temp password: {selected._tempPassword}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => onSelect(null)}>
          <Text style={s.changeLink}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={s.modeRow}>
        <TouchableOpacity
          style={[s.modeChip, mode === 'search' && s.modeChipActive]}
          onPress={() => setMode('search')}
        >
          <Text style={[s.modeChipText, mode === 'search' && s.modeChipTextActive]}>Search Existing</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeChip, mode === 'create' && s.modeChipActive]}
          onPress={() => setMode('create')}
        >
          <Text style={[s.modeChipText, mode === 'create' && s.modeChipTextActive]}>+ New Customer</Text>
        </TouchableOpacity>
      </View>

      {mode === 'search' ? (
        <View>
          <View style={s.searchRow}>
            <TextInput
              style={s.input}
              placeholder="Search by name, email, or phone..."
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity style={s.searchBtn} onPress={handleSearch}>
              <Text style={s.searchBtnText}>{searching ? '...' : 'Go'}</Text>
            </TouchableOpacity>
          </View>
          {results.map((c) => (
            <TouchableOpacity key={c.id} style={s.resultRow} onPress={() => onSelect(c)}>
              <Text style={s.selectedName}>{c.first_name} {c.last_name}</Text>
              <Text style={s.selectedSub}>{c.email}{c.phone ? ` · ${c.phone}` : ''}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View>
          <TextInput style={s.input} placeholder="First Name" placeholderTextColor={theme.textMuted}
            value={newCustomer.firstName} onChangeText={(v) => setNewCustomer({ ...newCustomer, firstName: v })} />
          <TextInput style={s.input} placeholder="Last Name" placeholderTextColor={theme.textMuted}
            value={newCustomer.lastName} onChangeText={(v) => setNewCustomer({ ...newCustomer, lastName: v })} />
          <TextInput style={s.input} placeholder="Email" placeholderTextColor={theme.textMuted}
            keyboardType="email-address" autoCapitalize="none"
            value={newCustomer.email} onChangeText={(v) => setNewCustomer({ ...newCustomer, email: v })} />
          <TextInput style={s.input} placeholder="Phone" placeholderTextColor={theme.textMuted}
            keyboardType="phone-pad"
            value={newCustomer.phone} onChangeText={(v) => setNewCustomer({ ...newCustomer, phone: v })} />
          <TouchableOpacity style={s.createBtn} onPress={handleCreate} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.createBtnText}>+ Create & Select</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Tab 1: Walk-in Booking
// ─────────────────────────────────────────
function WalkInBooking({ staffId, theme }) {
  const s = formStyles(theme);
  const [customer, setCustomer] = useState(null);
  const [services, setServices] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [downPaymentRate, setDownPaymentRate] = useState(0.15);
  const [form, setForm] = useState({ service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('services').select('*').eq('is_active', true).then(({ data }) => data && setServices(data));
    supabase.from('profiles').select('id, first_name, last_name').eq('role', 'mechanic').then(({ data }) => data && setMechanics(data));
    getDownPaymentPercent().then(setDownPaymentRate);
  }, []);

  const selectedService = services.find((sv) => sv.id === form.service_id);
  const total = selectedService ? (selectedService.base_price || 0) + (selectedService.labor_cost || 0) : 0;
  const downpayment = selectedService ? (total * downPaymentRate).toFixed(2) : null;

  async function handleSubmit() {
    if (!customer) { Alert.alert('Error', 'Select or create a customer first.'); return; }
    if (!form.service_id) { Alert.alert('Error', 'Please select a service.'); return; }
    if (!form.booking_date || !form.booking_time) { Alert.alert('Error', 'Please select a date and time.'); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.from('bookings').insert({
        customer_id: customer.id,
        service_id: form.service_id,
        mechanic_id: form.mechanic_id || null,
        booking_date: form.booking_date,
        booking_time: form.booking_time,
        notes: form.notes,
        status: 'confirmed',
        down_payment: downpayment ? parseFloat(downpayment) : 0,
        total_amount: total,
        is_walkin: true,
        created_by: staffId,
      }).select().single();

      if (error) throw error;

      if (downpayment && parseFloat(downpayment) > 0) {
        await supabase.from('payments').insert({
          booking_id: data.id,
          amount: parseFloat(downpayment),
          payment_type: 'down_payment',
          method: 'cash',
          processed_by: staffId,
        });
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_WALKIN_BOOKING',
        entity: 'bookings',
        entity_id: data.id,
        performed_by: staffId,
        details: { customer_id: customer.id, service_id: form.service_id },
      });

      Alert.alert('Success', 'Walk-in booking created! Confirm payment in the Payments tab.');
      setForm({ service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '' });
      setCustomer(null);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionLabel}>1. Customer</Text>
      <CustomerPicker selected={customer} onSelect={setCustomer} theme={theme} />

      <Text style={s.sectionLabel}>2. Service Details</Text>

      <Text style={s.fieldLabel}>Service</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {services.map((sv) => (
          <TouchableOpacity
            key={sv.id}
            style={[s.chip, form.service_id === sv.id && s.chipActive]}
            onPress={() => setForm({ ...form, service_id: sv.id })}
          >
            <Text style={[s.chipText, form.service_id === sv.id && s.chipTextActive]}>
              {sv.name} — ₱{sv.base_price}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={s.fieldLabel}>Mechanic (optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <TouchableOpacity
          style={[s.chip, !form.mechanic_id && s.chipActive]}
          onPress={() => setForm({ ...form, mechanic_id: '' })}
        >
          <Text style={[s.chipText, !form.mechanic_id && s.chipTextActive]}>Any available</Text>
        </TouchableOpacity>
        {mechanics.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[s.chip, form.mechanic_id === m.id && s.chipActive]}
            onPress={() => setForm({ ...form, mechanic_id: m.id })}
          >
            <Text style={[s.chipText, form.mechanic_id === m.id && s.chipTextActive]}>
              {m.first_name} {m.last_name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={s.fieldLabel}>Date (YYYY-MM-DD)</Text>
      <TextInput
        style={s.input}
        placeholder="2026-06-25"
        placeholderTextColor={theme.textMuted}
        value={form.booking_date}
        onChangeText={(v) => setForm({ ...form, booking_date: v })}
      />

      <Text style={s.fieldLabel}>Time</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {TIME_SLOTS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.chip, form.booking_time === t && s.chipActive]}
            onPress={() => setForm({ ...form, booking_time: t })}
          >
            <Text style={[s.chipText, form.booking_time === t && s.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={s.fieldLabel}>Notes (optional)</Text>
      <TextInput
        style={[s.input, { height: 70, textAlignVertical: 'top' }]}
        placeholder="Special instructions..."
        placeholderTextColor={theme.textMuted}
        value={form.notes}
        onChangeText={(v) => setForm({ ...form, notes: v })}
        multiline
      />

      {selectedService && (
        <View style={s.summaryBox}>
          <Text style={s.summaryRow}>Total: ₱{total.toFixed(2)}</Text>
          <Text style={[s.summaryRow, { color: theme.accent, fontWeight: 'bold' }]}>
            Down Payment Due ({Math.round(downPaymentRate * 100)}%): ₱{downpayment}
          </Text>
        </View>
      )}

      <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Create Walk-in Booking</Text>}
      </TouchableOpacity>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────
// Tab 2: Walk-in Parts POS
// ─────────────────────────────────────────
function WalkInPOS({ staffId, theme }) {
  const s = formStyles(theme);
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [parts, setParts] = useState([]);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!search.trim()) { setParts([]); return; }
    const t = setTimeout(() => {
      supabase.from('parts').select('*').ilike('name', `%${search}%`).gt('stock_quantity', 0).limit(8)
        .then(({ data }) => setParts(data || []));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  function addToCart(part) {
    setCart((prev) => {
      const existing = prev.find((p) => p.id === part.id);
      if (existing) return prev.map((p) => p.id === part.id ? { ...p, quantity: p.quantity + 1 } : p);
      return [...prev, { ...part, quantity: 1 }];
    });
    setSearch('');
    setParts([]);
  }

  function updateQty(id, qty) {
    if (qty < 1) { setCart((prev) => prev.filter((p) => p.id !== id)); return; }
    setCart((prev) => prev.map((p) => p.id === id ? { ...p, quantity: qty } : p));
  }

  const total = cart.reduce((sum, p) => sum + parseFloat(p.price || 0) * p.quantity, 0);

  async function handleCheckout() {
    if (!customer) { Alert.alert('Error', 'Select or create a customer first.'); return; }
    if (cart.length === 0) { Alert.alert('Error', 'Cart is empty.'); return; }
    setSubmitting(true);

    try {
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        customer_id: customer.id,
        total_amount: total,
        status: 'pending',
        is_walkin: true,
        created_by: staffId,
      }).select().single();
      if (orderError) throw orderError;

      const items = cart.map((p) => ({
        order_id: order.id,
        part_id: p.id,
        quantity: p.quantity,
        unit_price: parseFloat(p.price || 0),
        subtotal: parseFloat(p.price || 0) * p.quantity,
      }));
      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        await supabase.rpc('decrement_stock', { part_id: item.id, qty: item.quantity });
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_WALKIN_ORDER',
        entity: 'orders',
        entity_id: order.id,
        performed_by: staffId,
        details: { customer_id: customer.id, total },
      });

      Alert.alert('Success', 'Order created! Confirm payment in the Payments tab.');
      setCart([]);
      setCustomer(null);
      setSearch('');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionLabel}>1. Customer</Text>
      <CustomerPicker selected={customer} onSelect={setCustomer} theme={theme} />

      <Text style={s.sectionLabel}>2. Add Parts</Text>
      <TextInput
        style={s.input}
        placeholder="Search parts by name..."
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      {parts.map((p) => (
        <TouchableOpacity key={p.id} style={s.partResultRow} onPress={() => addToCart(p)}>
          <Text style={s.fieldLabel}>{p.name}</Text>
          <Text style={{ color: theme.accent, fontSize: 12 }}>₱{p.price} · {p.stock_quantity} available</Text>
        </TouchableOpacity>
      ))}

      {cart.length > 0 && (
        <View style={s.summaryBox}>
          <Text style={s.sectionLabel}>Cart</Text>
          {cart.map((item) => (
            <View key={item.id} style={s.cartRow}>
              <Text style={{ color: theme.text, flex: 1 }}>{item.name}</Text>
              <TouchableOpacity onPress={() => updateQty(item.id, item.quantity - 1)} style={s.qtyBtn}>
                <Text style={s.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={{ color: theme.text, marginHorizontal: 8 }}>{item.quantity}</Text>
              <TouchableOpacity onPress={() => updateQty(item.id, item.quantity + 1)} style={s.qtyBtn}>
                <Text style={s.qtyBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={{ color: theme.accent, width: 70, textAlign: 'right' }}>
                ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
          <Text style={[s.summaryRow, { fontWeight: 'bold', marginTop: 8 }]}>Total: ₱{total.toFixed(2)}</Text>
        </View>
      )}

      <TouchableOpacity style={s.submitBtn} onPress={handleCheckout} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Create Order</Text>}
      </TouchableOpacity>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  tabRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: theme.bg2, borderBottomWidth: 1, borderBottomColor: theme.border },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.bg3, alignItems: 'center' },
  tabBtnActive: { backgroundColor: theme.primary },
  tabBtnText: { color: theme.textSub, fontWeight: '600', fontSize: 13 },
  tabBtnTextActive: { color: '#fff' },
});

const formStyles = (theme) => StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  sectionLabel: { fontSize: 12, fontWeight: 'bold', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  fieldLabel: { fontSize: 13, color: theme.textSub, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, marginRight: 8 },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { color: theme.textSub, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  summaryBox: { backgroundColor: theme.bg2, borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  summaryRow: { color: theme.textSub, fontSize: 13, marginBottom: 4 },
  submitBtn: { backgroundColor: theme.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  partResultRow: { padding: 12, borderRadius: 8, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, marginBottom: 6 },
  cartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  qtyBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: theme.bg3, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { color: theme.text, fontWeight: 'bold' },
});

const pickerStyles = (theme) => StyleSheet.create({
  selectedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg2, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.border },
  selectedName: { color: theme.text, fontWeight: '600', fontSize: 14 },
  selectedSub: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  tempPassword: { color: theme.warning, fontSize: 11, marginTop: 4 },
  changeLink: { color: theme.primaryLight, fontSize: 13, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  modeChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  modeChipText: { color: theme.textSub, fontSize: 12 },
  modeChipTextActive: { color: '#fff', fontWeight: 'bold' },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, backgroundColor: theme.bg2, marginBottom: 10 },
  searchBtn: { paddingHorizontal: 16, justifyContent: 'center', backgroundColor: theme.bg3, borderRadius: 10, borderWidth: 1, borderColor: theme.border, height: 46 },
  searchBtnText: { color: theme.text, fontSize: 13 },
  resultRow: { padding: 12, borderRadius: 8, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, marginBottom: 6 },
  createBtn: { backgroundColor: theme.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});