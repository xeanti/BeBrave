import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../lib/payments';

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState({}); // orderId -> [payments]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, [user]);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, parts(name, image_url, category))')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
      setOrders(data);

      if (data.length > 0) {
        const allPayments = await fetchPaymentsFor({ orderIds: data.map((o) => o.id) });
        const grouped = {};
        allPayments.forEach((p) => {
          if (!grouped[p.order_id]) grouped[p.order_id] = [];
          grouped[p.order_id].push(p);
        });
        setPayments(grouped);
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">My Orders</h1>
        <p className="text-gray-400 mb-8">Parts orders you've submitted.</p>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : orders.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-3xl mb-3">📦</p>
            <p className="text-gray-400">No orders yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const total = order.total_amount || 0;
              const orderPayments = payments[order.id] || [];
              const { totalPaid } = summarizePayments(orderPayments);
              const balance = Math.max(total - totalPaid, 0);
              const isFullyPaid = total > 0 && balance <= 0;

              return (
                <div key={order.id} className="bg-dark-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-500">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full capitalize ${
                      order.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                      order.status === 'ready' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-3">
                    {order.order_items?.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 bg-dark-900 rounded-lg p-3">
                        {item.parts?.image_url ? (
                          <img src={item.parts.image_url} alt={item.parts.name} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center text-xs text-gray-500">No img</div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.parts?.name}</p>
                          <p className="text-xs text-gray-400">
                            ₱{item.unit_price} × {item.quantity}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-white">₱{item.subtotal}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-gray-700 pt-3 flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Total</span>
                    <span className="font-bold text-white">₱{total.toFixed(2)}</span>
                  </div>

                  {/* Payment summary */}
                  <div className="flex items-center gap-3 flex-wrap text-sm mb-2">
                    <span className="text-green-400">Paid: ₱{totalPaid.toFixed(2)}</span>
                    {!isFullyPaid ? (
                      <span className="text-yellow-400 font-medium">Balance: ₱{balance.toFixed(2)}</span>
                    ) : (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                        ✓ Fully Paid
                      </span>
                    )}
                  </div>

                  {/* Payment history */}
                  {orderPayments.length > 0 && (
                    <div className="bg-dark-900 rounded-lg p-3 mt-2 space-y-1">
                      {orderPayments.map((p) => (
                        <p key={p.id} className="text-xs text-gray-500">
                          {new Date(p.created_at).toLocaleDateString()} — ₱{Number(p.amount).toFixed(2)}{' '}
                          <span className="capitalize">({p.payment_type.replace('_', ' ')})</span>
                          {p.profiles && (
                            <span className="text-gray-600">
                              {' '}· processed by {p.profiles.first_name} {p.profiles.last_name}
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}