import { useLocation, useNavigate, Link } from 'react-router-dom';

export default function OrderConfirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state?.order) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No order found.</p>
          <button onClick={() => navigate('/shop')}
            className="bg-primary-600 px-6 py-2 rounded-lg text-sm">
            Go to Shop
          </button>
        </div>
      </div>
    );
  }

  const { order, items, total, downPayment } = state;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-xl mx-auto">

        {/* Success header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4 text-3xl">
            ✅
          </div>
          <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
          <p className="text-gray-400">
            Your order has been submitted successfully.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Receipt card */}
        <div className="bg-dark-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Order Receipt</h2>
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full">
              Pending
            </span>
          </div>

          {/* Items */}
          <div className="space-y-3 mb-4">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-dark-900 rounded-lg p-3">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name}
                    className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center text-sm">⚙️</div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-gray-400">₱{parseFloat(item.price).toFixed(2)} × {item.quantity}</p>
                </div>
                <p className="text-sm font-bold text-accent-400">
                  ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-gray-700 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal</span>
              <span>₱{total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-white text-base">
              <span>Total</span>
              <span>₱{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Down payment notice */}
          <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg p-4 mt-4">
            <p className="text-sm font-semibold text-accent-400 mb-1">
              ⚠️ Down Payment Required
            </p>
            <p className="text-2xl font-bold text-accent-400">
              ₱{downPayment.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Please prepare 15% of your total (₱{downPayment.toFixed(2)}) upon pickup of your parts.
            </p>
          </div>

          {/* Order date */}
          <p className="text-xs text-gray-500 text-center mt-4">
            Ordered on {new Date(order.created_at).toLocaleDateString('en-PH', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </p>
        </div>

        {/* What's next */}
        <div className="bg-dark-800 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-3">What happens next?</h3>
          <div className="space-y-3">
            {[
              { icon: '📋', text: 'Our team will review your order and confirm it shortly.' },
              { icon: '🔧', text: 'Parts will be prepared and ready for pickup.' },
              { icon: '💰', text: `Pay the down payment of ₱${downPayment.toFixed(2)} upon pickup.` },
              { icon: '📦', text: 'Pick up your parts at the shop.' },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-xl">{step.icon}</span>
                <p className="text-sm text-gray-400">{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link to="/my-orders"
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition text-center text-sm">
            View My Orders
          </Link>
          <Link to="/shop"
            className="flex-1 border border-gray-700 hover:border-gray-500 py-3 rounded-lg transition text-center text-sm text-gray-300">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}