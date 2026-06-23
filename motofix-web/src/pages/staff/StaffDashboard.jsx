import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import CustomerPicker from '../../components/CustomerPicker';
import ReceiptModal from '../../components/ReceiptModal';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { getDownPaymentPercent } from '../../lib/settings';

const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 8; h < 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
})();

// ─── Step badge header (mirrors mobile stepHeader) ────────────────────────────
function StepHeader({ number, title, sub }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">{number}</span>
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{title}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────
function Section({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-dark-800 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

// ─── Alert banner ─────────────────────────────────────────────────────────────
function Banner({ message }) {
  if (!message) return null;
  const isError = message.startsWith('Error') || message.startsWith('❌');
  return (
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 mb-5 border text-sm font-medium
      ${isError
        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-400'
        : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400'
      }`}
    >
      <span className="text-base leading-none mt-0.5">{isError ? '⚠️' : '✅'}</span>
      <span>{isError ? message.replace('Error: ', '') : message}</span>
    </div>
  );
}

// ─── Main entry ───────────────────────────────────────────────────────────────
export default function StaffDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('booking');
  const [receipt, setReceipt] = useState(null);

  const tabs = [
    { id: 'booking', label: 'Walk-in Booking', icon: '📅' },
    { id: 'pos',     label: 'Parts POS',        icon: '🧾' },
    { id: 'pending', label: 'Pending Payments',  icon: '💰' },
  ];

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">Staff Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Walk-in bookings, parts checkout, and payment confirmation.</p>
        </div>

        {/* Tab bar — styled like mobile tabBar */}
        <div className="flex gap-2 mb-6 p-1.5 bg-gray-200/70 dark:bg-dark-800 rounded-2xl w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-white dark:bg-dark-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'booking' && <WalkInBooking staffId={user?.id} onReceipt={setReceipt} />}
        {tab === 'pos'     && <WalkInPOS     staffId={user?.id} onReceipt={setReceipt} />}
        {tab === 'pending' && <PendingPayments staffId={user?.id} onReceipt={setReceipt} />}
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Walk-in Booking
// ══════════════════════════════════════════════════════════════════════════════
function WalkInBooking({ staffId, onReceipt }) {
  const [customer,  setCustomer]  = useState(null);
  const [services,  setServices]  = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [form, setForm] = useState({
    service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '',
  });
  const [submitting,       setSubmitting]       = useState(false);
  const [message,          setMessage]          = useState('');
  const [downPaymentRate,  setDownPaymentRate]  = useState(0.15);

  useEffect(() => {
    supabase.from('services').select('*').eq('is_active', true).then(({ data }) => data && setServices(data));
    supabase.from('profiles').select('id, first_name, last_name').eq('role', 'mechanic').then(({ data }) => data && setMechanics(data));
    getDownPaymentPercent().then(setDownPaymentRate);
  }, []);

  const selectedService = services.find((s) => s.id === form.service_id);
  const total = selectedService ? (selectedService.base_price || 0) + (selectedService.labor_cost || 0) : 0;
  const downpayment = selectedService ? (total * downPaymentRate).toFixed(2) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!customer) { setMessage('Error: Select or create a customer first.'); return; }
    setSubmitting(true);
    setMessage('');

    const { data, error } = await supabase.from('bookings').insert({
      customer_id: customer.id,
      service_id: form.service_id || null,
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

    if (error) {
      setMessage('Error: ' + error.message);
    } else {
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
        action: 'CREATE_WALKIN_BOOKING', entity: 'bookings', entity_id: data.id,
        performed_by: staffId, details: { customer_id: customer.id, service_id: form.service_id },
      });
      setMessage('✅ Walk-in booking created! Confirm payment in the Pending Payments tab.');
      setForm({ service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '' });
      setCustomer(null);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Banner message={message} />

      {/* Two-column layout on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT COLUMN */}
        <div className="space-y-5">

          {/* Step 1 — Customer */}
          <Section>
            <StepHeader number="1" title="Customer" />
            <CustomerPicker selected={customer} onSelect={setCustomer} />
          </Section>

          {/* Step 2 — Service (card grid like mobile) */}
          <Section>
            <StepHeader number="2" title="Select Service" />
            {services.length === 0 ? (
              <p className="text-sm text-gray-400">Loading services...</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {services.map((sv) => {
                  const active = form.service_id === sv.id;
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      onClick={() => setForm({ ...form, service_id: sv.id })}
                      className={`relative text-left rounded-xl p-3.5 border-2 transition-all ${
                        active
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-900 hover:border-primary-300'
                      }`}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 text-primary-600 dark:text-primary-400 font-bold text-sm">✓</span>
                      )}
                      <p className={`text-sm font-semibold leading-tight mb-1.5 pr-4 ${active ? 'text-primary-700 dark:text-primary-300' : 'text-gray-800 dark:text-white'}`}>
                        {sv.name}
                      </p>
                      <p className="text-xs font-bold text-amber-600 dark:text-amber-400">₱{(sv.base_price || 0).toLocaleString()}</p>
                      {sv.labor_cost > 0 && (
                        <p className="text-[11px] text-gray-400 mt-0.5">+₱{sv.labor_cost.toLocaleString()} labor</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Step 3 — Mechanic (avatar chips like mobile) */}
          <Section>
            <StepHeader number="3" title="Assign Mechanic" sub="Optional" />
            <div className="flex flex-wrap gap-2">
              {/* Any available */}
              <button
                type="button"
                onClick={() => setForm({ ...form, mechanic_id: '' })}
                className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-all ${
                  !form.mechanic_id
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-dark-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                }`}
              >
                🔧 Any Available
              </button>
              {mechanics.map((m) => {
                const active = form.mechanic_id === m.id;
                const initials = (m.first_name?.[0] || '') + (m.last_name?.[0] || '');
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm({ ...form, mechanic_id: m.id })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-all ${
                      active
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-dark-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? 'bg-white/30' : 'bg-gray-300 dark:bg-dark-700'}`}>
                      {initials}
                    </span>
                    {m.first_name} {m.last_name}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">

          {/* Step 4 — Date & Time */}
          <Section>
            <StepHeader number="4" title="Date & Time" />
            <input
              type="date"
              required
              value={form.booking_date}
              onChange={(e) => setForm({ ...form, booking_date: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
              className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
            {/* Time chip grid — same as mobile */}
            <div className="grid grid-cols-4 gap-2">
              {TIME_SLOTS.map((t) => {
                const active = form.booking_time === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, booking_time: t })}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      active
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-gray-50 dark:bg-dark-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Step 5 — Notes */}
          <Section>
            <StepHeader number="5" title="Notes" sub="Optional" />
            <textarea
              placeholder="Special instructions, part requests, customer concerns..."
              value={form.notes}
              rows={3}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 resize-none placeholder-gray-400 dark:placeholder-gray-500"
            />
          </Section>

          {/* Summary box (like mobile summaryBox with left accent border) */}
          {selectedService && (
            <div className="rounded-xl border-l-4 border-l-amber-500 border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10 px-5 py-4">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">Booking Summary</p>
              <div className="flex justify-between items-center text-sm text-gray-700 dark:text-gray-300 mb-1">
                <span>Service Total</span>
                <span className="font-bold">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-amber-200 dark:border-amber-700/40 pt-2 mt-2">
                <span className="text-gray-600 dark:text-gray-400">Down Payment ({Math.round(downPaymentRate * 100)}%)</span>
                <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400">₱{downpayment}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-base transition shadow-md"
          >
            {submitting ? 'Creating...' : '📅 Create Walk-in Booking'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Walk-in POS
// ══════════════════════════════════════════════════════════════════════════════
function WalkInPOS({ staffId, onReceipt }) {
  const [customer,   setCustomer]   = useState(null);
  const [search,     setSearch]     = useState('');
  const [parts,      setParts]      = useState([]);
  const [cart,       setCart]       = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message,    setMessage]    = useState('');

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
    setSearch(''); setParts([]);
  }

  function updateQty(id, qty) {
    if (qty < 1) { setCart((prev) => prev.filter((p) => p.id !== id)); return; }
    setCart((prev) => prev.map((p) => p.id === id ? { ...p, quantity: qty } : p));
  }

  const total = cart.reduce((sum, p) => sum + parseFloat(p.price || 0) * p.quantity, 0);

  async function handleCheckout() {
    if (!customer) { setMessage('Error: Select or create a customer first.'); return; }
    if (cart.length === 0) { setMessage('Error: Cart is empty.'); return; }
    setSubmitting(true); setMessage('');
    try {
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        customer_id: customer.id, total_amount: total, status: 'pending',
        is_walkin: true, created_by: staffId,
      }).select().single();
      if (orderError) throw orderError;

      const items = cart.map((p) => ({
        order_id: order.id, part_id: p.id, quantity: p.quantity,
        unit_price: parseFloat(p.price || 0), subtotal: parseFloat(p.price || 0) * p.quantity,
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
      setMessage('✅ Order created! Confirm payment in the Pending Payments tab.');
      setCart([]); setCustomer(null); setSearch(''); setParts([]);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Banner message={message} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT — Customer + Part Search */}
        <div className="space-y-5">
          <Section>
            <StepHeader number="1" title="Customer" />
            <CustomerPicker selected={customer} onSelect={setCustomer} />
          </Section>

          <Section>
            <StepHeader number="2" title="Search Parts" />
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type part name..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Part search results — styled like mobile partResultRow */}
            {parts.length > 0 && (
              <div className="mt-2 space-y-2">
                {parts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className="w-full flex items-center justify-between text-left bg-gray-50 dark:bg-dark-900 hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-l-[3px] border-l-primary-500 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 transition-all group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.stock_quantity} in stock</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400">₱{Number(p.price).toLocaleString()}</span>
                      <span className="w-7 h-7 rounded-full bg-primary-600 text-white text-lg font-bold flex items-center justify-center leading-none">+</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {search.trim() && parts.length === 0 && (
              <p className="text-sm text-gray-400 mt-3 text-center">No parts found matching "{search}"</p>
            )}
          </Section>
        </div>

        {/* RIGHT — Cart */}
        <div className="space-y-5">
          <Section>
            <StepHeader number="3" title={`Cart${cart.length > 0 ? ` (${cart.length} item${cart.length > 1 ? 's' : ''})` : ''}`} />

            {cart.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-gray-400">
                <span className="text-4xl mb-3">🛒</span>
                <p className="text-sm">Add parts from the search to get started.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-gray-50 dark:bg-dark-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">₱{Number(item.price).toLocaleString()} each</p>
                    </div>
                    {/* Stepper — mirrors mobile qtyRow */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-dark-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white font-bold text-sm flex items-center justify-center hover:bg-gray-300 dark:hover:bg-dark-600 transition"
                      >−</button>
                      <span className="w-8 text-center text-sm font-bold text-gray-900 dark:text-white">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-dark-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white font-bold text-sm flex items-center justify-center hover:bg-gray-300 dark:hover:bg-dark-600 transition"
                      >+</button>
                    </div>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400 w-20 text-right">
                      ₱{(parseFloat(item.price) * item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}

                {/* Cart total */}
                <div className="flex justify-between items-center border-t border-gray-200 dark:border-gray-700 pt-3 mt-2 px-1">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Total</span>
                  <span className="text-xl font-extrabold text-primary-600 dark:text-primary-400">
                    ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </Section>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={submitting || cart.length === 0}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white py-4 rounded-xl font-bold text-base transition shadow-md"
          >
            {submitting ? 'Processing...' : '🧾 Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Pending Payments
// ══════════════════════════════════════════════════════════════════════════════
function PendingPayments({ staffId, onReceipt }) {
  const [bookings,        setBookings]        = useState([]);
  const [orders,          setOrders]          = useState([]);
  const [bookingPayments, setBookingPayments] = useState({});
  const [orderPayments,   setOrderPayments]   = useState({});
  const [loading,         setLoading]         = useState(true);
  const [confirming,      setConfirming]      = useState(null);
  const [amount,          setAmount]          = useState('');
  const [method,          setMethod]          = useState('cash');

  useEffect(() => { fetchPending(); }, []);

  async function fetchPending() {
    setLoading(true);
    setBookingPayments({}); setOrderPayments({});
    const [b, o] = await Promise.all([
      supabase.from('bookings')
        .select('*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name, profile_photo_url)')
        .neq('status', 'completed').neq('status', 'cancelled').order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('*, profiles!orders_customer_id_fkey(first_name, last_name, profile_photo_url)')
        .neq('status', 'completed').neq('status', 'cancelled').order('created_at', { ascending: false }),
    ]);
    const bookingsData = b.data || [];
    const ordersData   = o.data || [];

    let groupedBookingPayments = {};
    if (bookingsData.length) {
      const allBP = await fetchPaymentsFor({ bookingIds: bookingsData.map(bk => bk.id) });
      allBP.forEach(p => {
        if (!groupedBookingPayments[p.booking_id]) groupedBookingPayments[p.booking_id] = [];
        groupedBookingPayments[p.booking_id].push(p);
      });
    }
    let groupedOrderPayments = {};
    if (ordersData.length) {
      const allOP = await fetchPaymentsFor({ orderIds: ordersData.map(o => o.id) });
      allOP.forEach(p => {
        if (!groupedOrderPayments[p.order_id]) groupedOrderPayments[p.order_id] = [];
        groupedOrderPayments[p.order_id].push(p);
      });
    }

    setBookings(bookingsData.filter(bk => {
      const tot = (bk.services?.base_price || 0) + (bk.services?.labor_cost || 0) || bk.total_amount || 0;
      return tot - (summarizePayments(groupedBookingPayments[bk.id] || []).totalPaid) > 0;
    }));
    setOrders(ordersData.filter(o => {
      return (o.total_amount || 0) - (summarizePayments(groupedOrderPayments[o.id] || []).totalPaid) > 0;
    }));
    setBookingPayments(groupedBookingPayments);
    setOrderPayments(groupedOrderPayments);
    setLoading(false);
  }

  function openConfirm(type, record, due) {
    setConfirming({ type, record, due });
    setAmount(due.toFixed(2));
    setMethod('cash');
  }

  async function confirmPayment() {
    if (!confirming) return;
    const { type, record, due } = confirming;
    const paidAmount = parseFloat(amount);
    if (!paidAmount || paidAmount <= 0) return;
    if (paidAmount > due) { alert(`Amount cannot exceed ₱${due.toFixed(2)}.`); return; }

    const isFullPayment = paidAmount >= due;

    if (type === 'booking') {
      await supabase.from('payments').insert({ booking_id: record.id, amount: paidAmount, payment_type: isFullPayment ? 'full' : 'balance', method, processed_by: staffId });
      if (isFullPayment) await supabase.from('bookings').update({ status: 'completed' }).eq('id', record.id);
    } else {
      await supabase.from('payments').insert({ order_id: record.id, amount: paidAmount, payment_type: isFullPayment ? 'full' : 'balance', method, processed_by: staffId });
      if (isFullPayment) await supabase.from('orders').update({ payment_received: true, payment_method: method, payment_received_at: new Date().toISOString(), payment_received_by: staffId, status: 'completed' }).eq('id', record.id);
    }
    await supabase.from('audit_logs').insert({ action: 'CONFIRM_PAYMENT', entity: type === 'booking' ? 'bookings' : 'orders', entity_id: record.id, performed_by: staffId, details: { method, amount: paidAmount } });

    onReceipt({
      customerName: record.profiles ? `${record.profiles.first_name} ${record.profiles.last_name}` : 'Walk-in Customer',
      type,
      items: type === 'booking'
        ? [{ label: record.services?.name || 'Service', amount: (record.services?.base_price || 0) + (record.services?.labor_cost || 0) }]
        : [{ label: 'Parts order', amount: record.total_amount }],
      total: type === 'booking' ? (record.services?.base_price || 0) + (record.services?.labor_cost || 0) : record.total_amount,
      amountPaid: paidAmount, paymentMethod: method,
      referenceId: record.id.slice(0, 8).toUpperCase(),
    });
    setConfirming(null);
    fetchPending();
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">Loading payments...</p>
      </div>
    </div>
  );

  // Payment row component
  function PaymentRow({ type, record, payments }) {
    const tot = type === 'booking'
      ? (record.services?.base_price || 0) + (record.services?.labor_cost || 0) || record.total_amount || 0
      : record.total_amount || 0;
    const { totalPaid } = summarizePayments(payments);
    const due = Math.max(tot - totalPaid, 0);
    const pct = tot > 0 ? Math.round((totalPaid / tot) * 100) : 0;

    return (
      <div className="flex items-center gap-4 bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3.5">
        {/* Avatar */}
{record.profiles?.profile_photo_url ? (
  <img
    src={record.profiles.profile_photo_url}
    alt=""
    className="w-10 h-10 rounded-full object-cover border-2 border-primary-200 dark:border-primary-500/30 flex-shrink-0"
  />
) : (
  <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-sm">
    {(record.profiles?.first_name?.[0] || '?') + (record.profiles?.last_name?.[0] || '')}
  </div>
)}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {record.profiles?.first_name} {record.profiles?.last_name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {type === 'booking' ? (record.services?.name || 'Service') : 'Parts order'}
          </p>
          {/* Mini progress bar */}
          {totalPaid > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold whitespace-nowrap">{pct}% paid</span>
            </div>
          )}
        </div>

        {/* Amount due + button */}
        <div className="text-right flex-shrink-0">
          <p className="text-base font-extrabold text-amber-600 dark:text-amber-400">₱{due.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400 mb-2">due</p>
          <button
            onClick={() => openConfirm(type, record, due)}
            className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg font-semibold transition shadow-sm"
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  const totalPending = bookings.length + orders.length;

  return (
    <div>
      {totalPending === 0 ? (
        <Section>
          <div className="text-center py-12">
            <span className="text-5xl">🎉</span>
            <p className="mt-4 text-lg font-bold text-gray-900 dark:text-white">All caught up!</p>
            <p className="text-sm text-gray-400 mt-1">No pending payments right now.</p>
          </div>
        </Section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Bookings */}
          <Section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Bookings</h2>
              {bookings.length > 0 && (
                <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  {bookings.length} pending
                </span>
              )}
            </div>
            {bookings.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">None pending ✓</p>
            ) : (
              <div className="space-y-2.5">
                {bookings.map(b => (
                  <PaymentRow key={b.id} type="booking" record={b} payments={bookingPayments[b.id] || []} />
                ))}
              </div>
            )}
          </Section>

          {/* Orders */}
          <Section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Orders</h2>
              {orders.length > 0 && (
                <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  {orders.length} pending
                </span>
              )}
            </div>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">None pending ✓</p>
            ) : (
              <div className="space-y-2.5">
                {orders.map(o => (
                  <PaymentRow key={o.id} type="order" record={o} payments={orderPayments[o.id] || []} />
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* Confirm payment modal */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirming(null)}
        >
          <div
            className="bg-white dark:bg-dark-800 rounded-2xl p-6 max-w-sm w-full border border-gray-200 dark:border-gray-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">💳</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Payment</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {confirming.record.profiles?.first_name} {confirming.record.profiles?.last_name} — <span className="font-semibold text-amber-600 dark:text-amber-400">₱{Number(confirming.due).toFixed(2)} due</span>
              </p>
            </div>

            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Amount Received (₱)</label>
            <input
              type="number" step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mb-4 px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-lg font-bold focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />

            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Payment Method</p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { id: 'cash',  label: 'Cash',  icon: '💵' },
                { id: 'gcash', label: 'GCash', icon: '📱' },
                { id: 'card',  label: 'Card',  icon: '💳' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    method === m.id
                      ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                      : 'bg-gray-50 dark:bg-dark-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                  }`}
                >
                  <span className="text-lg mb-0.5">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={confirmPayment}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold transition shadow-md"
              >
                Confirm & Generate Receipt
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="w-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-white py-3 rounded-xl font-semibold transition hover:bg-gray-50 dark:hover:bg-dark-900/50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}