import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';

export default function Checkout() {
  const { user, profile } = useAuth();
  const { cart, total, itemCount, clearCart } = useCart();
  const navigate = useNavigate();

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const downPayment = total * 0.15;

  async function handleSubmit(e) {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitting(true);
    setError('');

    try {
      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: user.id,
          total_amount: total,
          status: 'pending',
          notes,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const items = cart.map((item) => ({
        order_id: order.id,
        part_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.price * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(items);

      if (itemsError) throw itemsError;

      // Reduce stock
      for (const item of cart) {
        await supabase.rpc('decrement_stock', {
          part_id: item.id,
          qty: item.quantity,
        });
      }

      clearCart();
      navigate('/order-confirmation', { state: { order, items: cart, total, downPayment } });
    } catch (err) {
      setError(err.message || 'Failed to submit order.');
    } finally {
      setSubmitting(false);
    }
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-gray-400 mb-4">Your cart is empty.</p>
          <button onClick={() => navigate('/shop')}
            className="bg-primary-600 hover:bg-primary-700 px-6 py-2 rounded-lg text-sm font-medium transition">
            Browse Shop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Checkout</h1>
        <p className="text-gray-400 mb-8">Review your order before submitting.</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">

          {/* Left: order details */}
          <div className="md:col-span-2 space-y-4">

            {/* Customer info */}
            <div className="bg-dark-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                Customer Info
              </h2>
              <div className="space-y-1 text-sm">
                <p style={{color:'white'}}>{profile?.first_name} {profile?.last_name}</p>
                <p style={{color:'#9ca3af'}}>{profile?.email}</p>
                <p style={{color:'#9ca3af'}}>{profile?.phone || 'No phone on file'}</p>
              </div>
            </div>

            {/* Order items */}
            <div className="bg-dark-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                Order Items ({itemCount})
              </h2>
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-dark-900 rounded-lg p-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center text-lg">⚙️</div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{color:'white'}}>{item.name}</p>
                      <p className="text-xs" style={{color:'#9ca3af'}}>
                        {item.category} · ₱{parseFloat(item.price).toFixed(2)} × {item.quantity}
                      </p>
                      {item.compatible_models?.length > 0 && (
                        <p className="text-xs" style={{color:'#ec4899'}}>
                          For: {item.compatible_models.slice(0,2).join(', ')}
                          {item.compatible_models.length > 2 ? ` +${item.compatible_models.length - 2} more` : ''}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-bold" style={{color:'#eab308'}}>
                      ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-dark-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                Notes (optional)
              </h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any special instructions for your order..."
                className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>
          </div>

          {/* Right: order summary */}
          <div className="space-y-4">
            <div className="bg-dark-800 rounded-xl p-5 sticky top-20">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
                Order Summary
              </h2>

              <div className="space-y-2 mb-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex justify-between text-xs">
                    <span style={{color:'#9ca3af'}} className="truncate mr-2">
                      {item.name} × {item.quantity}
                    </span>
                    <span style={{color:'white'}} className="flex-shrink-0">
                      ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-700 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{color:'#9ca3af'}}>Subtotal</span>
                  <span style={{color:'white'}}>₱{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span style={{color:'white'}}>Total</span>
                  <span style={{color:'white'}}>₱{total.toFixed(2)}</span>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-2">
                  <p className="text-xs" style={{color:'#eab308'}}>
                    ⚠️ Down Payment Required
                  </p>
                  <p className="text-lg font-bold mt-1" style={{color:'#eab308'}}>
                    ₱{downPayment.toFixed(2)}
                  </p>
                  <p className="text-xs mt-0.5" style={{color:'#9ca3af'}}>
                    15% of total — pay upon pickup
                  </p>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition mt-4"
              >
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>

              <button
                onClick={() => navigate('/shop')}
                className="w-full text-sm text-center mt-2 hover:text-white transition"
                style={{color:'#6b7280'}}
              >
                ← Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}