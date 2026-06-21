import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import CustomerPicker from '../../components/CustomerPicker';
import ReceiptModal from '../../components/ReceiptModal';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';

const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 8; h < 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
})();

export default function StaffDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('booking'); // 'booking' | 'pos' | 'pending'
  const [receipt, setReceipt] = useState(null);

  return (
    // Changed: Adaptive background and core text colors
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">Staff Dashboard</h1>
        {/* Changed: Adaptive descriptive subtext */}
        <p className="text-gray-600 dark:text-gray-400 mb-8">Walk-in bookings, parts checkout, and payment confirmation.</p>

        <div className="flex gap-2 mb-6">
          {[
            { id: 'booking', label: '📅 Walk-in Booking' },
            { id: 'pos', label: '🧾 Parts POS' },
            { id: 'pending', label: '💰 Pending Payments' },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                // Changed: Adaptive non-active tab styles
                tab === t.id ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-dark-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'booking' && <WalkInBooking staffId={user.id} onReceipt={setReceipt} />}
        {tab === 'pos' && <WalkInPOS staffId={user.id} onReceipt={setReceipt} />}
        {tab === 'pending' && <PendingPayments staffId={user.id} onReceipt={setReceipt} />}
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

// ───────────────────────────────────────────
// TAB 1: Walk-in Booking
// ───────────────────────────────────────────
function WalkInBooking({ staffId, onReceipt }) {
  const [customer, setCustomer] = useState(null);
  const [services, setServices] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [form, setForm] = useState({ service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.from('services').select('*').eq('is_active', true).then(({ data }) => data && setServices(data));
    supabase.from('profiles').select('id, first_name, last_name').eq('role', 'mechanic').then(({ data }) => data && setMechanics(data));
  }, []);

  const selectedService = services.find((s) => s.id === form.service_id);
  const downpayment = selectedService
    ? (((selectedService.base_price || 0) + (selectedService.labor_cost || 0)) * 0.15).toFixed(2)
    : null;

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
      total_amount: selectedService ? (selectedService.base_price || 0) + (selectedService.labor_cost || 0) : 0,
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
        action: 'CREATE_WALKIN_BOOKING',
        entity: 'bookings',
        entity_id: data.id,
        performed_by: staffId,
        details: { customer_id: customer.id, service_id: form.service_id },
      });
      setMessage('✅ Walk-in booking created! Confirm payment in the Pending Payments tab.');
      setForm({ service_id: '', mechanic_id: '', booking_date: '', booking_time: '', notes: '' });
      setCustomer(null);
    }
    setSubmitting(false);
  }

  return (
    // Changed: Adaptive block wrapper colors
    <div className="bg-white dark:bg-dark-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-transparent">
      {message && (
        <div className={`text-sm rounded-lg p-3 mb-4 ${message.startsWith('Error') ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-green-500/10 text-green-600 dark:text-green-400'}`}>
          {message}
        </div>
      )}
      {/* Changed: Adaptive section labeling texts */}
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-3">1. Customer</h2>
      <div className="mb-5"><CustomerPicker selected={customer} onSelect={setCustomer} /></div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide">2. Service Details</h2>
        {/* Changed: Form controls inputs adapt to brightness themes */}
        <select value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })} required
          className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500">
          <option value="">Choose a service...</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name} — ₱{s.base_price}</option>)}
        </select>

        <select value={form.mechanic_id} onChange={(e) => setForm({ ...form, mechanic_id: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500">
          <option value="">Any available mechanic</option>
          {mechanics.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <input type="date" required value={form.booking_date}
            onChange={(e) => setForm({ ...form, booking_date: e.target.value })}
            min={new Date().toISOString().split('T')[0]}
            className="px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500" />
          <select required value={form.booking_time} onChange={(e) => setForm({ ...form, booking_time: e.target.value })}
            className="px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500">
            <option value="">Time...</option>
            {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <textarea placeholder="Notes (optional)" value={form.notes} rows={2}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 resize-none placeholder-gray-400 dark:placeholder-gray-500" />

        {selectedService && (
          <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-4 text-sm flex justify-between border border-gray-200 dark:border-transparent">
            <span className="text-gray-600 dark:text-gray-400">Down Payment Due (15%)</span>
            <span className="text-accent-500 dark:text-accent-400 font-semibold">₱{downpayment}</span>
          </div>
        )}

        <button type="submit" disabled={submitting}
          className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition shadow-sm">
          {submitting ? 'Creating...' : 'Create Walk-in Booking'}
        </button>
      </form>
    </div>
  );
}

// ───────────────────────────────────────────
// TAB 2: Walk-in Parts POS
// ───────────────────────────────────────────
function WalkInPOS({ staffId, onReceipt }) {
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [parts, setParts] = useState([]);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

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

  const total = cart.reduce((sum, p) => sum + parseFloat(p.price) * p.quantity, 0);

  async function handleCheckout() {
    if (!customer) { setMessage('Error: Select or create a customer first.'); return; }
    if (cart.length === 0) { setMessage('Error: Cart is empty.'); return; }
    setSubmitting(true);
    setMessage('');

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
        order_id: order.id, part_id: p.id, quantity: p.quantity, unit_price: p.price, subtotal: p.price * p.quantity,
      }));
      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        await supabase.rpc('decrement_stock', { part_id: item.id, qty: item.quantity });
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_WALKIN_ORDER', entity: 'orders', entity_id: order.id, performed_by: staffId,
        details: { customer_id: customer.id, total },
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
    <div className="bg-white dark:bg-dark-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-transparent">
      {message && (
        <div className={`text-sm rounded-lg p-3 mb-4 ${message.startsWith('Error') ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-green-500/10 text-green-600 dark:text-green-400'}`}>
          {message}
        </div>
      )}
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-3">1. Customer</h2>
      <div className="mb-5"><CustomerPicker selected={customer} onSelect={setCustomer} /></div>

      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide mb-3">2. Add Parts</h2>
      
      {/* Container holding the absolute wrapper overlay stack */}
      <div className="relative mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parts by name..."
          className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500 placeholder-gray-400 dark:placeholder-gray-500"
        />
        
        {/* Changed: Transformed results into an absolute floating popup panel */}
        {parts.length > 0 && (
          <div className="absolute left-0 right-0 mt-1 z-10 max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-900 shadow-xl divide-y divide-gray-100 dark:divide-gray-800">
            {parts.map((p) => (
              <button key={p.id} onClick={() => addToCart(p)}
                className="w-full flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-800/70 p-3 transition text-left">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
                <span className="text-xs text-accent-600 dark:text-accent-400 font-medium">₱{p.price} · {p.stock_quantity} available</span>
              </button>
            ))}
          </div>
        )}

        {search.trim() && parts.length === 0 && (
          <div className="absolute left-0 right-0 mt-1 z-10 border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-900 rounded-lg p-3 shadow-lg text-sm text-gray-500">
            No parts found matching "{search}".
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-transparent rounded-lg p-4 mb-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 tracking-wider">CART ITEMS</p>
          {cart.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-900 dark:text-white font-medium">{item.name}</span>
              <div className="flex items-center gap-2">
                <input type="number" min="1" value={item.quantity}
                  onChange={(e) => updateQty(item.id, parseInt(e.target.value) || 1)}
                  className="w-14 px-2 py-1 rounded bg-white dark:bg-dark-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-center text-xs focus:outline-none focus:border-primary-500" />
                <span className="text-accent-600 dark:text-accent-400 w-16 text-right font-medium">₱{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-semibold text-sm text-gray-900 dark:text-white">
            <span>Total</span><span className="text-accent-600 dark:text-accent-400">₱{total.toFixed(2)}</span>
          </div>
        </div>
      )}

      <button onClick={handleCheckout} disabled={submitting}
        className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white py-3 rounded-lg font-semibold transition shadow-sm">
        {submitting ? 'Processing...' : 'Create Order'}
      </button>
    </div>
  );
}

// ───────────────────────────────────────────
// TAB 3: Pending Payments (bookings + orders)
// ───────────────────────────────────────────
function PendingPayments({ staffId, onReceipt }) {
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [paymentsByBooking, setPaymentsByBooking] = useState({});
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null); 
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');

  useEffect(() => { fetchPending(); }, []);

  async function fetchPending() {
    setLoading(true);
    const [b, o] = await Promise.all([
      supabase.from('bookings').select('*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name)')
        .neq('status', 'completed').neq('status', 'cancelled').order('created_at', { ascending: false }),
      supabase.from('orders').select('*, profiles!orders_customer_id_fkey(first_name, last_name)')
        .eq('payment_received', false).order('created_at', { ascending: false }),
    ]);
    const bookingsData = b.data || [];

    let grouped = {};
    if (bookingsData.length) {
      const allPayments = await fetchPaymentsFor({ bookingIds: bookingsData.map((bk) => bk.id) });
      allPayments.forEach((p) => {
        if (!grouped[p.booking_id]) grouped[p.booking_id] = [];
        grouped[p.booking_id].push(p);
      });
    }
    setPaymentsByBooking(grouped);

    const withBalance = bookingsData.filter((bk) => {
      const total = (bk.services?.base_price || 0) + (bk.services?.labor_cost || 0) || bk.total_amount || 0;
      const { totalPaid } = summarizePayments(grouped[bk.id] || []);
      return total - totalPaid > 0;
    });

    setBookings(withBalance);
    setOrders(o.data || []);
    setLoading(false);
  }

  function openConfirm(type, record, due) {
    setConfirming({ type, record, due });
    setAmount(due.toFixed(2));
    setMethod('cash');
  }

  async function confirmPayment() {
    if (!confirming) return;
    const { type, record } = confirming;
    const paidAmount = parseFloat(amount);
    if (!paidAmount || paidAmount <= 0) return;

    if (type === 'booking') {
      await supabase.from('payments').insert({
        booking_id: record.id,
        amount: paidAmount,
        payment_type: paidAmount >= confirming.due ? 'full' : 'balance',
        method,
        processed_by: staffId,
      });
    } else {
      await supabase.from('orders').update({
        payment_received: true,
        payment_method: method,
        payment_received_at: new Date().toISOString(),
        payment_received_by: staffId,
        status: 'completed',
      }).eq('id', record.id);
    }

    await supabase.from('audit_logs').insert({
      action: 'CONFIRM_PAYMENT',
      entity: type === 'booking' ? 'bookings' : 'orders',
      entity_id: record.id,
      performed_by: staffId,
      details: { method, amount: paidAmount },
    });

    onReceipt({
      customerName: `${record.profiles?.first_name} ${record.profiles?.last_name}`,
      type,
      items: type === 'booking'
        ? [{ label: record.services?.name || 'Service', amount: (record.services?.base_price || 0) + (record.services?.labor_cost || 0) }]
        : [{ label: 'Parts order', amount: record.total_amount }],
      total: type === 'booking' ? (record.services?.base_price || 0) + (record.services?.labor_cost || 0) : record.total_amount,
      amountPaid: paidAmount,
      paymentMethod: method,
      referenceId: record.id.slice(0, 8).toUpperCase(),
    });

    setConfirming(null);
    fetchPending();
  }

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      {/* Bookings block */}
      <div className="bg-white dark:bg-dark-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-transparent">
        <h2 className="font-semibold mb-4 text-gray-900 dark:text-white">Bookings Awaiting Payment ({bookings.length})</h2>
        {bookings.length === 0 ? <p className="text-gray-500 dark:text-gray-400 text-sm">None pending.</p> : (
          <div className="space-y-2">
            {bookings.map((b) => {
              const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0) || b.total_amount || 0;
              const { totalPaid } = summarizePayments(paymentsByBooking[b.id] || []);
              const due = Math.max(total - totalPaid, 0);
              return (
                <div key={b.id} className="flex items-center justify-between bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-transparent rounded-lg p-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{b.profiles?.first_name} {b.profiles?.last_name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{b.services?.name} · ₱{due.toFixed(2)} due</p>
                  </div>
                  <button onClick={() => openConfirm('booking', b, due)}
                    className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-md transition shadow-sm">
                    Confirm Payment
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Orders block */}
      <div className="bg-white dark:bg-dark-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-transparent">
        <h2 className="font-semibold mb-4 text-gray-900 dark:text-white">Orders Awaiting Payment ({orders.length})</h2>
        {orders.length === 0 ? <p className="text-gray-500 dark:text-gray-400 text-sm">None pending.</p> : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-transparent rounded-lg p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{o.profiles?.first_name} {o.profiles?.last_name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">₱{Number(o.total_amount).toFixed(2)} due</p>
                </div>
                <button onClick={() => openConfirm('order', o, o.total_amount)}
                  className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-md transition shadow-sm">
                  Confirm Payment
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal View Confirmation overlay */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirming(null)}>
          <div className="bg-white dark:bg-dark-800 rounded-xl p-6 max-w-sm w-full border border-gray-200 dark:border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1 text-gray-900 dark:text-white text-lg">Confirm Payment</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">₱{confirming.due.toFixed(2)} is currently due.</p>

            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Amount Received (₱)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
            />

            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Payment method</p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {['cash', 'gcash', 'card'].map((m) => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`py-2 rounded-lg text-sm font-medium capitalize transition ${
                    method === m ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-dark-900 text-gray-600 dark:text-gray-400'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={confirmPayment} className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg text-sm font-medium transition shadow-sm">
                Confirm & Generate Receipt
              </button>
              <button onClick={() => setConfirming(null)} className="w-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-white py-2.5 rounded-lg text-sm font-medium transition hover:bg-gray-50 dark:hover:bg-dark-900/50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}