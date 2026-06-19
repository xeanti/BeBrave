import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

export default function AdminOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles!orders_customer_id_fkey(first_name, last_name, email, phone), order_items(*, parts(name, image_url))')
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
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

  const filtered = orders.filter(o => filter === 'all' || o.status === filter);

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

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-gray-400">No orders found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => (
              <div key={order.id} className="bg-dark-800 rounded-xl p-5">

                {/* Top row */}
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                  <div>
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
                  <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${STATUS_COLORS[order.status] || STATUS_COLORS.pending}`}>
                    {order.status}
                  </span>
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
                      <div className="flex-1 flex justify-between items-center">
                        <p className="text-sm text-gray-300">{item.parts?.name}</p>
                        <p className="text-sm text-gray-400">
                          ₱{item.unit_price} × {item.quantity} = <span className="text-white font-medium">₱{item.subtotal}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Cost summary grid */}
                <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Items</p>
                    <p className="font-medium">{order.order_items?.length || 0} item{order.order_items?.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Total Amount</p>
                    <p className="font-medium text-white">₱{order.total_amount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Down Payment (15%)</p>
                    <p className="font-medium text-accent-400">₱{(order.total_amount * 0.15).toFixed(2)}</p>
                  </div>
                </div>

                {/* Status actions */}
                <div className="flex gap-2 flex-wrap items-center">
                  <p className="text-xs text-gray-500 mr-1">Update status:</p>
                  {['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']
                    .filter(s => s !== order.status)
                    .map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(order.id, s)}
                        className={`text-xs px-3 py-1.5 rounded-md transition capitalize ${ACTION_STYLES[s]}`}
                      >
                        {s === 'ready' ? 'Ready for Pickup' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
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