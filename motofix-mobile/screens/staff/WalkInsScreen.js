import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, Alert,
  KeyboardAvoidingView, Platform,
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
  const [tab, setTab] = useState('booking');
  const [staffId, setStaffId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setStaffId(data?.user?.id || null));
  }, []);

  const s = styles(theme);

  return (
    <View style={s.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Tab Bar */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'booking' && s.tabBtnActive]}
          onPress={() => setTab('booking')}
        >
          <Text style={s.tabIcon}>📅</Text>
          <Text style={[s.tabBtnText, tab === 'booking' && s.tabBtnTextActive]}>Walk-in Booking</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'pos' && s.tabBtnActive]}
          onPress={() => setTab('pos')}
        >
          <Text style={s.tabIcon}>🧾</Text>
          <Text style={[s.tabBtnText, tab === 'pos' && s.tabBtnTextActive]}>Parts POS</Text>
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
// Customer Picker
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
        <View style={s.selectedAvatar}>
          <Text style={s.selectedAvatarText}>
            {(selected.first_name?.[0] || '') + (selected.last_name?.[0] || '')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.selectedName}>{selected.first_name} {selected.last_name}</Text>
          <Text style={s.selectedSub}>{selected.email}{selected.phone ? ` · ${selected.phone}` : ''}</Text>
          {selected._tempPassword && (
            <Text style={s.tempPassword}>Temp password: {selected._tempPassword}</Text>
          )}
        </View>
        <TouchableOpacity style={s.changeBtn} onPress={() => onSelect(null)}>
          <Text style={s.changeText}>Change</Text>
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
          <Text style={[s.modeChipText, mode === 'search' && s.modeChipTextActive]}>🔍 Search</Text>
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
              style={s.searchInput}
              placeholder="Search by name, email, or phone..."
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={s.searchBtn} onPress={handleSearch}>
              <Text style={s.searchBtnText}>{searching ? '...' : 'Go'}</Text>
            </TouchableOpacity>
          </View>
          {results.map((c) => (
            <TouchableOpacity key={c.id} style={s.resultRow} onPress={() => onSelect(c)}>
              <View style={s.resultAvatar}>
                <Text style={s.resultAvatarText}>
                  {(c.first_name?.[0] || '') + (c.last_name?.[0] || '')}
                </Text>
              </View>
              <View>
                <Text style={s.selectedName}>{c.first_name} {c.last_name}</Text>
                <Text style={s.selectedSub}>{c.email}{c.phone ? ` · ${c.phone}` : ''}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View>
          <View style={s.createGrid}>
            <TextInput style={[s.input, { flex: 1, marginRight: 8 }]} placeholder="First Name"
              placeholderTextColor={theme.textMuted} value={newCustomer.firstName}
              onChangeText={(v) => setNewCustomer({ ...newCustomer, firstName: v })} />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Last Name"
              placeholderTextColor={theme.textMuted} value={newCustomer.lastName}
              onChangeText={(v) => setNewCustomer({ ...newCustomer, lastName: v })} />
          </View>
          <TextInput style={s.input} placeholder="Email" placeholderTextColor={theme.textMuted}
            keyboardType="email-address" autoCapitalize="none"
            value={newCustomer.email} onChangeText={(v) => setNewCustomer({ ...newCustomer, email: v })} />
          <TextInput style={s.input} placeholder="Phone" placeholderTextColor={theme.textMuted}
            keyboardType="phone-pad" value={newCustomer.phone}
            onChangeText={(v) => setNewCustomer({ ...newCustomer, phone: v })} />
          <TouchableOpacity style={s.createBtn} onPress={handleCreate} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.createBtnText}>+ Create & Select</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Walk-in Booking
// ─────────────────────────────────────────
function WalkInBooking({ staffId, theme }) {
  const s = formStyles(theme);
  const [customer, setCustomer] = useState(null);
  const [services, setServices] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [downPaymentRate, setDownPaymentRate] = useState(0.15);
  const [form, setForm] = useState({
    service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

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

      setSuccess('Walk-in booking created! Confirm payment in the Payments tab.');
      setForm({ service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '' });
      setCustomer(null);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {success ? (
          <View style={s.successBox}>
            <Text style={s.successText}>✅ {success}</Text>
            <TouchableOpacity onPress={() => setSuccess('')}>
              <Text style={s.successDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Step 1 */}
        <View style={s.stepHeader}>
          <View style={s.stepBadge}><Text style={s.stepBadgeText}>1</Text></View>
          <Text style={s.stepTitle}>Customer</Text>
        </View>
        <CustomerPicker selected={customer} onSelect={setCustomer} theme={theme} />

        {/* Step 2 */}
        <View style={s.stepHeader}>
          <View style={s.stepBadge}><Text style={s.stepBadgeText}>2</Text></View>
          <Text style={s.stepTitle}>Select Service</Text>
        </View>
        <View style={s.serviceGrid}>
          {services.map((sv) => (
            <TouchableOpacity
              key={sv.id}
              style={[s.serviceCard, form.service_id === sv.id && s.serviceCardActive]}
              onPress={() => setForm({ ...form, service_id: sv.id })}
            >
              <Text style={[s.serviceName, form.service_id === sv.id && s.serviceNameActive]} numberOfLines={2}>
                {sv.name}
              </Text>
              <Text style={s.servicePrice}>₱{sv.base_price}</Text>
              {form.service_id === sv.id && <Text style={s.serviceCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Step 3 */}
        <View style={s.stepHeader}>
          <View style={s.stepBadge}><Text style={s.stepBadgeText}>3</Text></View>
          <Text style={s.stepTitle}>Mechanic <Text style={s.optional}>(optional)</Text></Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <TouchableOpacity
            style={[s.mechanicChip, !form.mechanic_id && s.mechanicChipActive]}
            onPress={() => setForm({ ...form, mechanic_id: '' })}
          >
            <Text style={[s.mechanicChipText, !form.mechanic_id && s.mechanicChipTextActive]}>
              🔧 Any Available
            </Text>
          </TouchableOpacity>
          {mechanics.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[s.mechanicChip, form.mechanic_id === m.id && s.mechanicChipActive]}
              onPress={() => setForm({ ...form, mechanic_id: m.id })}
            >
              <View style={s.mechanicInitials}>
                <Text style={s.mechanicInitialsText}>
                  {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                </Text>
              </View>
              <Text style={[s.mechanicChipText, form.mechanic_id === m.id && s.mechanicChipTextActive]}>
                {m.first_name} {m.last_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Step 4 */}
        <View style={s.stepHeader}>
          <View style={s.stepBadge}><Text style={s.stepBadgeText}>4</Text></View>
          <Text style={s.stepTitle}>Date & Time</Text>
        </View>
        <TextInput
          style={s.input}
          placeholder="Date (YYYY-MM-DD)"
          placeholderTextColor={theme.textMuted}
          value={form.booking_date}
          onChangeText={(v) => setForm({ ...form, booking_date: v })}
        />
        <View style={s.timeGrid}>
          {TIME_SLOTS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.timeChip, form.booking_time === t && s.timeChipActive]}
              onPress={() => setForm({ ...form, booking_time: t })}
            >
              <Text style={[s.timeChipText, form.booking_time === t && s.timeChipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Step 5 */}
        <View style={s.stepHeader}>
          <View style={s.stepBadge}><Text style={s.stepBadgeText}>5</Text></View>
          <Text style={s.stepTitle}>Notes <Text style={s.optional}>(optional)</Text></Text>
        </View>
        <TextInput
          style={[s.input, { height: 80, textAlignVertical: 'top' }]}
          placeholder="Special instructions..."
          placeholderTextColor={theme.textMuted}
          value={form.notes}
          onChangeText={(v) => setForm({ ...form, notes: v })}
          multiline
        />

        {selectedService && (
          <View style={s.summaryBox}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Service Total</Text>
              <Text style={s.summaryValue}>₱{total.toFixed(2)}</Text>
            </View>
            <View style={[s.summaryRow, { marginTop: 4 }]}>
              <Text style={s.summaryLabel}>Down Payment ({Math.round(downPaymentRate * 100)}%)</Text>
              <Text style={[s.summaryValue, { color: theme.accent, fontSize: 18 }]}>₱{downpayment}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>Create Walk-in Booking</Text>}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────
// Walk-in POS
// ─────────────────────────────────────────
function WalkInPOS({ staffId, theme }) {
  const s = formStyles(theme);
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [parts, setParts] = useState([]);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

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
        action: 'CREATE_WALKIN_ORDER', entity: 'orders', entity_id: order.id,
        performed_by: staffId, details: { customer_id: customer.id, total },
      });

      setSuccess('Order created! Confirm payment in the Payments tab.');
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {success ? (
          <View style={s.successBox}>
            <Text style={s.successText}>✅ {success}</Text>
            <TouchableOpacity onPress={() => setSuccess('')}>
              <Text style={s.successDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={s.stepHeader}>
          <View style={s.stepBadge}><Text style={s.stepBadgeText}>1</Text></View>
          <Text style={s.stepTitle}>Customer</Text>
        </View>
        <CustomerPicker selected={customer} onSelect={setCustomer} theme={theme} />

        <View style={s.stepHeader}>
          <View style={s.stepBadge}><Text style={s.stepBadgeText}>2</Text></View>
          <Text style={s.stepTitle}>Search Parts</Text>
        </View>
        <TextInput
          style={s.input}
          placeholder="Type to search parts..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {parts.map((p) => (
          <TouchableOpacity key={p.id} style={s.partResultRow} onPress={() => addToCart(p)}>
            <View style={{ flex: 1 }}>
              <Text style={s.partResultName}>{p.name}</Text>
              <Text style={s.partResultSub}>{p.stock_quantity} in stock</Text>
            </View>
            <Text style={s.partResultPrice}>₱{p.price}</Text>
            <View style={s.addBtn}>
              <Text style={s.addBtnText}>+</Text>
            </View>
          </TouchableOpacity>
        ))}

        {cart.length > 0 && (
          <>
            <View style={s.stepHeader}>
              <View style={s.stepBadge}><Text style={s.stepBadgeText}>3</Text></View>
              <Text style={s.stepTitle}>Cart ({cart.length} items)</Text>
            </View>
            <View style={s.cartBox}>
              {cart.map((item) => (
                <View key={item.id} style={s.cartRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cartItemName}>{item.name}</Text>
                    <Text style={s.cartItemPrice}>₱{parseFloat(item.price).toFixed(2)} each</Text>
                  </View>
                  <View style={s.qtyRow}>
                    <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.id, item.quantity - 1)}>
                      <Text style={s.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.qtyValue}>{item.quantity}</Text>
                    <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.id, item.quantity + 1)}>
                      <Text style={s.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.cartItemTotal}>₱{(parseFloat(item.price) * item.quantity).toFixed(2)}</Text>
                </View>
              ))}
              <View style={s.cartTotalRow}>
                <Text style={s.cartTotalLabel}>Total</Text>
                <Text style={s.cartTotalValue}>₱{total.toFixed(2)}</Text>
              </View>
            </View>
          </>
        )}

        <TouchableOpacity style={s.submitBtn} onPress={handleCheckout} disabled={submitting}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>Create Order</Text>}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────
const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  tabBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: theme.bg2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: theme.bg3,
  },
  tabBtnActive: { backgroundColor: theme.primary },
  tabIcon: { fontSize: 16 },
  tabBtnText: { color: theme.textSub, fontWeight: '600', fontSize: 13 },
  tabBtnTextActive: { color: '#fff' },
});

const formStyles = (theme) => StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },

  successBox: {
    backgroundColor: theme.success + '18',
    borderWidth: 1,
    borderColor: theme.success + '44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  successText: { color: theme.success, fontSize: 13, fontWeight: '600', flex: 1 },
  successDismiss: { color: theme.success, fontWeight: 'bold', marginLeft: 8 },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 12 },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: theme.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  stepBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  stepTitle: { fontSize: 15, fontWeight: 'bold', color: theme.text },
  optional: { fontSize: 13, fontWeight: 'normal', color: theme.textMuted },

  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    padding: 14, marginBottom: 12, fontSize: 14,
    color: theme.text, backgroundColor: theme.bg2,
  },

  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  serviceCard: {
    width: '47%', backgroundColor: theme.bg2,
    borderRadius: 12, padding: 14,
    borderWidth: 2, borderColor: theme.border,
  },
  serviceCardActive: { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
  serviceName: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6 },
  serviceNameActive: { color: theme.primaryLight },
  servicePrice: { fontSize: 13, fontWeight: 'bold', color: theme.accent },
  serviceCheck: { position: 'absolute', top: 8, right: 10, color: theme.primary, fontWeight: 'bold', fontSize: 16 },

  mechanicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, backgroundColor: theme.bg2,
    borderWidth: 1, borderColor: theme.border, marginRight: 8,
  },
  mechanicChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  mechanicInitials: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: theme.bg3, justifyContent: 'center', alignItems: 'center',
  },
  mechanicInitialsText: { fontSize: 10, fontWeight: 'bold', color: theme.text },
  mechanicChipText: { color: theme.textSub, fontSize: 13 },
  mechanicChipTextActive: { color: '#fff', fontWeight: 'bold' },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  timeChip: {
    width: '22%', paddingVertical: 10,
    borderRadius: 10, backgroundColor: theme.bg2,
    borderWidth: 1, borderColor: theme.border,
    alignItems: 'center',
  },
  timeChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  timeChipText: { color: theme.textSub, fontSize: 12 },
  timeChipTextActive: { color: '#fff', fontWeight: 'bold' },

  summaryBox: {
    backgroundColor: theme.bg2, borderRadius: 14,
    padding: 16, marginBottom: 20,
    borderLeftWidth: 4, borderLeftColor: theme.accent,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: theme.textSub },
  summaryValue: { fontSize: 15, fontWeight: 'bold', color: theme.text },

  submitBtn: {
    backgroundColor: theme.primary, borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  partResultRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.bg2, borderRadius: 12,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: theme.border,
    borderLeftWidth: 3, borderLeftColor: theme.primary,
  },
  partResultName: { fontSize: 14, fontWeight: '600', color: theme.text },
  partResultSub: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  partResultPrice: { fontSize: 14, fontWeight: 'bold', color: theme.accent, marginRight: 10 },
  addBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: theme.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  cartBox: {
    backgroundColor: theme.bg2, borderRadius: 14,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  cartRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  cartItemName: { fontSize: 13, fontWeight: '600', color: theme.text },
  cartItemPrice: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: theme.bg3, justifyContent: 'center', alignItems: 'center',
  },
  qtyBtnText: { color: theme.text, fontWeight: 'bold', fontSize: 16 },
  qtyValue: { color: theme.text, fontWeight: 'bold', marginHorizontal: 10, fontSize: 14 },
  cartItemTotal: { fontSize: 13, fontWeight: 'bold', color: theme.accent, width: 70, textAlign: 'right' },
  cartTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingTop: 12, marginTop: 4,
  },
  cartTotalLabel: { fontSize: 14, fontWeight: 'bold', color: theme.text },
  cartTotalValue: { fontSize: 18, fontWeight: 'bold', color: theme.primaryLight },
});

const pickerStyles = (theme) => StyleSheet.create({
  selectedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.bg2, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: theme.primary + '44',
    borderLeftWidth: 3, borderLeftColor: theme.primary,
  },
  selectedAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: theme.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  selectedAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  selectedName: { color: theme.text, fontWeight: '600', fontSize: 14 },
  selectedSub: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  tempPassword: { color: theme.warning, fontSize: 11, marginTop: 4 },
  changeBtn: {
    backgroundColor: theme.bg3, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  changeText: { color: theme.primaryLight, fontWeight: '600', fontSize: 12 },

  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: theme.bg2, borderWidth: 1,
    borderColor: theme.border, alignItems: 'center',
  },
  modeChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  modeChipText: { color: theme.textSub, fontSize: 13, fontWeight: '600' },
  modeChipTextActive: { color: '#fff' },

  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, padding: 14, fontSize: 14,
    color: theme.text, backgroundColor: theme.bg2,
  },
  searchBtn: {
    paddingHorizontal: 18, justifyContent: 'center',
    backgroundColor: theme.primary, borderRadius: 12,
  },
  searchBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12,
    backgroundColor: theme.bg2, borderWidth: 1,
    borderColor: theme.border, marginBottom: 8,
  },
  resultAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: theme.bg3,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  resultAvatarText: { fontSize: 12, fontWeight: 'bold', color: theme.primaryLight },

  createGrid: { flexDirection: 'row', marginBottom: 0 },
  input: {
    borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, padding: 14, marginBottom: 10,
    fontSize: 14, color: theme.text, backgroundColor: theme.bg2,
  },
  createBtn: {
    backgroundColor: theme.primary, borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});