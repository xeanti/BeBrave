import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { fetchPaymentsFor, recordPayment, summarizePayments } from '../../lib/payments';

export default function AdminOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  
  // Payment States (Mirrors Bookings Workflow)
  const [payments, setPayments] = useState({}); // orderId -> [payments]
  const [paymentForm, setPaymentForm] = useState({}); // orderId -> { amount, payment_type, method }
  const [savingPayment, setSavingPayment] = useState(null);
  const [paymentToast, setPaymentToast] = useState(null); // { orderId, amount, balance, isFullyPaid }
  const [expandedPayment, setExpandedPayment] = useState(null); // orderId tracking active forms
  const [expandedHistory, setExpandedHistory] = useState(null); // orderId tracking active history collections

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles!orders_customer_id_fkey(first_name, last_name, email, phone), order_items(*, parts(name, image_url))')
      .order('created_at', { ascending: false });
    
    if (data) {
      setOrders(data);
      // Fetch financial ledgers for all pulled items matching your database schema
      const allPayments = await fetchPaymentsFor({ orderIds: data.map((o) => o.id) });
      const grouped = {};
      allPayments.forEach((p) => {
        // Fallback checks to catch order or booking relationship definitions smoothly
        const targetId = p.order_id || p.booking_id; 
        if (targetId) {
          if (!grouped[targetId]) grouped[targetId] = [];
          grouped[targetId].push(p);
        }
      });
      setPayments(grouped);
    }
    setLoading(false);
  }

  async function updateStatus(id, status) {
    await supabase.from('orders').update({ status }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_ORDER_STATUS',
      entity: 'orders',
      entity_id: id,
      performed_by: user.id,
      details: { new_status: status },
    });
    fetchOrders();
  }

  async function submitPayment(orderId) {
    const form = paymentForm[orderId];
    if (!form?.amount || parseFloat(form.amount) <= 0) return;
    setSavingPayment(orderId);
    try {
      await recordPayment({
        orderId, // explicitly passing down context identifier
        amount: form.amount,
        paymentType: form.payment_type || 'balance',
        method: form.method || 'cash',
        processedBy: user.id,
      });
      
      await supabase.from('audit_logs').insert({
        action: 'RECORD_ORDER_PAYMENT',
        entity: 'orders',
        entity_id: orderId,
        performed_by: user.id,
        details: { amount: parseFloat(form.amount), payment_type: form.payment_type || 'balance' },
      });

      // Quick dynamic calculations for real-time customer feedback toasts
      const currentOrder = orders.find((o) => o.id === orderId);
      const total = currentOrder?.total_amount || 0;
      const existingPaid = (payments[orderId] || []).reduce(
        (acc, p) => (p.payment_type === 'refund' ? acc - p.amount : acc + p.amount), 0
      );
      const newTotalPaid = existingPaid + parseFloat(form.amount);
      const newBalance = Math.max(total - newTotalPaid, 0);

      setPaymentToast({
        orderId,
        amount: parseFloat(form.amount),
        balance: newBalance,
        isFullyPaid: newBalance <= 0,
      });
      setTimeout(() => setPaymentToast(null), 4000);

      setPaymentForm((prev) => ({ ...prev, [orderId]: { amount: '', payment_type: 'balance', method: 'cash' } }));
      setExpandedPayment(null);
      fetchOrders();
    } finally {
      setSavingPayment(null);
    }
  }

  const filtered = orders.filter(o => {
    const matchesStatus = filter === 'all' || o.status === filter;
    const fullName = `${o.profiles?.first_name || ''} ${o.profiles?.last_name || ''}`.toLowerCase();
    const matchesSearch = search.trim() === '' || fullName.includes(search.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Manage Orders</h1>
          <p className="text-gray-400">View and update parts orders from customers.</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
                filter === f ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}>
              {f} <span className="opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name..."
            className="w-full md:w-80 px-4 py-2 rounded-lg bg-dark-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-600"
          />
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-gray-400">No orders found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => {
              const orderPayments = payments[order.id] || [];
              const { totalPaid } = summarizePayments(orderPayments);
              const balance = Math.max(order.total_amount - totalPaid, 0);
              const isFullyPaid = order.total_amount > 0 && balance <= 0;
              const form = paymentForm[order.id] || { amount: '', payment_type: 'balance', method: 'cash' };
              const isPaymentOpen = expandedPayment === order.id;
              const isHistoryOpen = expandedHistory === order.id;

              return (
                <div key={order.id} className="bg-dark-800 rounded-xl p-5 border border-dark-700">

                  {/* Top Row Wrap */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-lg">
                        {order.profiles?.first_name} {order.profiles?.last_name}
                      </p>
                      <p className="text-sm text-gray-400 mt-0.5">
                        👤 {order.profiles?.email}
                        {order.profiles?.phone ? ` · ${order.profiles.phone}` : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Order #{order.id.slice(0, 8).toUpperCase()} · {new Date(order.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium whitespace-nowrap ${STATUS_COLORS[order.status] || STATUS_COLORS.pending}`}>
                        {order.status}
                      </span>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap ${
                        isFullyPaid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {isFullyPaid ? '✓ Fully Paid' : `₱${balance.toFixed(2)} balance due`}
                      </span>
                    </div>
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="bg-dark-900 rounded-lg px-4 py-3 mb-4 text-sm text-gray-300 italic">
                      "{order.notes}"
                    </div>
                  )}

                  {/* Items breakdown */}
                  <div className="bg-dark-900 rounded-lg p-3 mb-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 mb-2">ORDER ITEMS</p>
                    {order.order_items?.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        {item.parts?.image_url ? (
                          <img src={item.parts.image_url} alt={item.parts.name}
                            className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center text-xs flex-shrink-0">⚙️</div>
                        )}
                        <div className="flex-1 flex justify-between items-center min-w-0">
                          <p className="text-sm text-gray-300 truncate mr-2">{item.parts?.name}</p>
                          <p className="text-sm text-gray-400 whitespace-nowrap">
                            ₱{item.unit_price} × {item.quantity} = <span className="text-white font-medium">₱{item.subtotal}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Financial Breakdown Grid */}
                  <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Total Amount</p>
                      <p className="font-medium text-white">₱{Number(order.total_amount).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Down Payment (15%)</p>
                      <p className="font-medium text-yellow-500">₱{(order.total_amount * 0.15).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Total Collected</p>
                      <p className="font-medium text-green-400">₱{totalPaid.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Remaining Balance</p>
                      <p className={`font-medium ${balance === 0 ? 'text-green-400' : 'text-red-400'}`}>₱{balance.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Operational Status Updates */}
                  <div className="flex gap-2 flex-wrap items-center bg-dark-900/40 p-3 rounded-lg border border-dark-700 mb-4">
                    <p className="text-xs text-gray-500 mr-1">Update status:</p>
                    {['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']
                      .filter(s => s !== order.status)
                      .map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatus(order.id, s)}
                          className={`text-xs px-3 py-1.5 rounded-md transition capitalize font-medium ${ACTION_STYLES[s]}`}
                        >
                          {s === 'ready' ? 'Ready for Pickup' : s.replace('_', ' ')}
                        </button>
                      ))}
                  </div>

                  {/* Financial Quick Utilities Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setExpandedPayment(isPaymentOpen ? null : order.id)}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                        isPaymentOpen ? 'bg-primary-600 text-white' : 'bg-dark-900 border border-gray-700 text-gray-300 hover:text-white'
                      }`}
                    >
                      {isPaymentOpen ? 'Close Form' : '+ Record Payment'}
                    </button>

                    {orderPayments.length > 0 && (
                      <button
                        onClick={() => setExpandedHistory(isHistoryOpen ? null : order.id)}
                        className="text-xs px-3 py-1.5 rounded-md bg-dark-900 border border-gray-700 text-gray-300 hover:text-white transition"
                      >
                        {isHistoryOpen ? 'Hide History' : 'View History'} ({orderPayments.length})
                      </button>
                    )}
                  </div>

                  {/* Payment Records Accordion */}
                  {isHistoryOpen && orderPayments.length > 0 && (
                    <div className="mt-4 bg-dark-900 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-400 mb-2">PAYMENT LEDGER</p>
                      <div className="space-y-1.5">
                        {orderPayments.map((p) => (
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

                  {/* Dynamic Financial Payment Entry Form */}
                  {isPaymentOpen && (
                    <div className="mt-4 bg-dark-900 rounded-lg p-4 flex flex-wrap items-end gap-3 border border-dark-700">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Amount (₱)</label>
                        <input
                          type="number"
                          autoFocus
                          value={form.amount}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, [order.id]: { ...form, amount: e.target.value } }))}
                          className="w-28 px-2 py-1.5 rounded-md bg-dark-800 border border-gray-700 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Type</label>
                        <select
                          value={form.payment_type}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, [order.id]: { ...form, payment_type: e.target.value } }))}
                          className="px-2 py-1.5 rounded-md bg-dark-800 border border-gray-700 text-sm text-white"
                        >
                          <option value="down_payment">Down Payment (15%)</option>
                          <option value="balance">Remaining Balance</option>
                          <option value="full">Full Payment</option>
                          <option value="refund">Refund</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Method</label>
                        <select
                          value={form.method}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, [order.id]: { ...form, method: e.target.value } }))}
                          className="px-2 py-1.5 rounded-md bg-dark-800 border border-gray-700 text-sm text-white"
                        >
                          <option value="cash">Cash</option>
                          <option value="gcash">GCash</option>
                          <option value="card">Card</option>
                          <option value="bank_transfer">Bank Transfer</option>
                        </select>
                      </div>
                      <button
                        onClick={() => submitPayment(order.id)}
                        disabled={savingPayment === order.id}
                        className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-1.5 rounded-md text-sm font-medium transition text-white"
                      >
                        {savingPayment === order.id ? 'Saving...' : 'Save Payment'}
                      </button>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Global Toasts */}
      {paymentToast && (
        <div className="fixed bottom-6 right-6 bg-dark-800 border border-primary-600 rounded-xl px-5 py-4 shadow-xl max-w-xs z-50">
          <p className="text-sm font-semibold text-white mb-1">
            ₱{paymentToast.amount.toFixed(2)} payment recorded
          </p>
          <p className="text-xs text-gray-400">
            {paymentToast.isFullyPaid ? '✓ Order invoice is fully settled' : `₱${paymentToast.balance.toFixed(2)} balance remaining`}
          </p>
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-green-500/20 text-green-400',
  preparing: 'bg-purple-500/20 text-purple-400',
  ready: 'bg-cyan-500/20 text-cyan-400',
  completed: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

const ACTION_STYLES = {
  pending: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
  preparing: 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30',
  ready: 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30',
  completed: 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30',
  cancelled: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
};