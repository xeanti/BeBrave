import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { fetchPaymentsFor, recordPayment, summarizePayments } from '../../lib/payments';

export default function AdminBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState({}); // bookingId -> [payments]
  const [paymentForm, setPaymentForm] = useState({}); // bookingId -> { amount, payment_type }
  const [savingPayment, setSavingPayment] = useState(null);
  const [paymentToast, setPaymentToast] = useState(null); // { bookingId, amount, balance, isFullyPaid }

  useEffect(() => {
    fetchBookings();
    fetchMechanics();
  }, []);

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        services(name, base_price, labor_cost),
        profiles!bookings_customer_id_fkey(first_name, last_name, email, phone),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `)
      .order('booking_date', { ascending: false });
    if (data) {
      setBookings(data);
      const allPayments = await fetchPaymentsFor({ bookingIds: data.map((b) => b.id) });
      const grouped = {};
      allPayments.forEach((p) => {
        if (!grouped[p.booking_id]) grouped[p.booking_id] = [];
        grouped[p.booking_id].push(p);
      });
      setPayments(grouped);
    }
    setLoading(false);
  }

  async function fetchMechanics() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'mechanic');
    if (data) setMechanics(data);
  }

  async function updateStatus(id, status) {
    await supabase.from('bookings').update({ status }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_BOOKING_STATUS',
      entity: 'bookings',
      entity_id: id,
      performed_by: user.id,
      details: { new_status: status },
    });
    fetchBookings();
  }

  async function assignMechanic(id, mechanicId) {
    await supabase.from('bookings')
      .update({ mechanic_id: mechanicId || null })
      .eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'ASSIGN_MECHANIC',
      entity: 'bookings',
      entity_id: id,
      performed_by: user.id,
      details: { mechanic_id: mechanicId || null },
    });
    fetchBookings();
  }

async function submitPayment(bookingId) {
  const form = paymentForm[bookingId];
  if (!form?.amount || parseFloat(form.amount) <= 0) return;
  setSavingPayment(bookingId);
  try {
    await recordPayment({
      bookingId,
      amount: form.amount,
      paymentType: form.payment_type || 'balance',
      method: form.method || 'cash',
      processedBy: user.id,
    });
    await supabase.from('audit_logs').insert({
      action: 'RECORD_PAYMENT',
      entity: 'bookings',
      entity_id: bookingId,
      performed_by: user.id,
      details: { amount: parseFloat(form.amount), payment_type: form.payment_type || 'balance' },
    });

    // Recompute balance right away for the toast
    const booking = bookings.find((b) => b.id === bookingId);
    const total = (booking?.services?.base_price || 0) + (booking?.services?.labor_cost || 0);
    const existingPaid = (payments[bookingId] || []).reduce(
      (s, p) => (p.payment_type === 'refund' ? s - p.amount : s + p.amount), 0
    );
    const newTotalPaid = existingPaid + parseFloat(form.amount);
    const newBalance = Math.max(total - newTotalPaid, 0);

    setPaymentToast({
      bookingId,
      amount: parseFloat(form.amount),
      balance: newBalance,
      isFullyPaid: newBalance <= 0,
    });
    setTimeout(() => setPaymentToast(null), 4000);

    setPaymentForm((f) => ({ ...f, [bookingId]: { amount: '', payment_type: 'balance', method: 'cash' } }));
    fetchBookings();
  } finally {
    setSavingPayment(null);
  }
}

  const filtered = bookings.filter(b => filter === 'all' || b.status === filter);

  const counts = {
    all: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Manage Bookings</h1>
          <p className="text-gray-400">View, assign mechanics, track payments, and update booking statuses.</p>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
                filter === f ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.replace('_', ' ')} <span className="opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-gray-400">No bookings found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((b) => {
              const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
              const bookingPayments = payments[b.id] || [];
              const { totalPaid } = summarizePayments(bookingPayments);
              const balance = Math.max(total - totalPaid, 0);
              const isFullyPaid = total > 0 && balance <= 0;
              const form = paymentForm[b.id] || { amount: '', payment_type: 'balance', method: 'cash' };

              return (
                <div key={b.id} className="bg-dark-800 rounded-xl p-5">

                  <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                    <div>
                      <p className="font-semibold text-lg">
                        {b.profiles?.first_name} {b.profiles?.last_name}
                      </p>
                      <p className="text-sm text-gray-400 mt-0.5">
                        👤 {b.profiles?.email}
                        {b.profiles?.phone ? ` · ${b.profiles.phone}` : ''}
                      </p>
                      <p className="text-sm text-primary-400 mt-0.5">
                        🔧 {b.services?.name || 'No service selected'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {b.booking_date} at {b.booking_time}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${STATUS_COLORS[b.status] || STATUS_COLORS.pending}`}>
                        {b.status?.replace('_', ' ')}
                      </span>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        isFullyPaid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {isFullyPaid ? '✓ Fully Paid' : `₱${balance.toFixed(2)} balance due`}
                      </span>
                    </div>
                  </div>

                  {b.notes && (
                    <div className="bg-dark-900 rounded-lg px-4 py-3 mb-4 text-sm text-gray-300 italic">
                      "{b.notes}"
                    </div>
                  )}

                  <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Service Total</p>
                      <p className="font-medium">₱{total.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Total Paid</p>
                      <p className="font-medium text-green-400">₱{totalPaid.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Mechanic</p>
                      <p className="font-medium">
                        {b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Booking ID</p>
                      <p className="font-medium text-gray-400">{b.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                  </div>

                  {/* Payment history */}
                  {bookingPayments.length > 0 && (
                    <div className="bg-dark-900 rounded-lg p-3 mb-4">
                      <p className="text-xs font-semibold text-gray-400 mb-2">PAYMENT HISTORY</p>
                      <div className="space-y-1.5">
                        {bookingPayments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 capitalize">
                              {p.payment_type.replace('_', ' ')} · {p.method}
                              <span className="text-gray-600 ml-1">
                                — processed by {p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name}` : 'System'}
                              </span>
                            </span>
                            <span className="text-white font-medium">
                              {p.payment_type === 'refund' ? '-' : ''}₱{Number(p.amount).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Record payment form */}
                  <div className="bg-dark-900 rounded-lg p-3 mb-4 flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount (₱)</label>
                      <input
                        type="number"
                        value={form.amount}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, [b.id]: { ...form, amount: e.target.value } }))}
                        className="w-28 px-2 py-1.5 rounded-md bg-dark-800 border border-gray-700 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <select
                        value={form.payment_type}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, [b.id]: { ...form, payment_type: e.target.value } }))}
                        className="px-2 py-1.5 rounded-md bg-dark-800 border border-gray-700 text-sm"
                      >
                        <option value="down_payment">Down Payment</option>
                        <option value="balance">Balance</option>
                        <option value="full">Full Payment</option>
                        <option value="refund">Refund</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Method</label>
                      <select
                        value={form.method}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, [b.id]: { ...form, method: e.target.value } }))}
                        className="px-2 py-1.5 rounded-md bg-dark-800 border border-gray-700 text-sm"
                      >
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>
                    <button
                      onClick={() => submitPayment(b.id)}
                      disabled={savingPayment === b.id}
                      className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-1.5 rounded-md text-sm font-medium transition"
                    >
                      {savingPayment === b.id ? 'Saving...' : '+ Record Payment'}
                    </button>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-1.5">Assign Mechanic</p>
                    <select
                      value={b.mechanic_id || ''}
                      onChange={(e) => assignMechanic(b.id, e.target.value)}
                      className="bg-dark-900 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-white w-full md:w-auto"
                    >
                      <option value="">Unassigned</option>
                      {mechanics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.first_name} {m.last_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2 flex-wrap items-center">
                    <p className="text-xs text-gray-500 mr-1">Update status:</p>
                    {['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']
                      .filter(s => s !== b.status)
                      .map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatus(b.id, s)}
                          className={`text-xs px-3 py-1.5 rounded-md transition capitalize ${ACTION_STYLES[s]}`}
                        >
                          {s.replace('_', ' ')}
                        </button>
                      ))}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-green-500/20 text-green-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

const ACTION_STYLES = {
  pending: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  completed: 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30',
  cancelled: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
};