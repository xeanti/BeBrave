import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function CartDrawer() {
  const { cart, removeFromCart, updateQuantity, clearCart, total, itemCount } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Cart button */}
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-md text-gray-400 hover:text-white hover:bg-dark-800 transition flex-shrink-0"
      >
        🛒
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none">
            {itemCount > 9 ? '9+' : itemCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer — slides in from right */}
      <div
        className={`fixed top-0 right-0 h-full z-[101] flex flex-col shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          width: 'min(400px, 100vw)',
          backgroundColor: '#1a1a1a',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #2a2a2a' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🛒</span>
            <h2 className="font-bold text-base" style={{ color: 'white' }}>
              Parts Cart
            </h2>
            {itemCount > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: '#db2777', color: 'white' }}
              >
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center transition hover:opacity-70"
            style={{ backgroundColor: '#2a2a2a', color: '#9ca3af' }}
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-5xl mb-4">🛒</div>
              <p className="font-medium mb-1" style={{ color: 'white' }}>Your cart is empty</p>
              <p className="text-sm mb-5" style={{ color: '#9ca3af' }}>
                Browse our shop and add parts to get started.
              </p>
              <button
                onClick={() => { setOpen(false); navigate('/shop'); }}
                className="px-5 py-2 rounded-lg text-sm font-medium transition"
                style={{ backgroundColor: '#db2777', color: 'white' }}
              >
                Browse Shop
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{ backgroundColor: '#0f0f0f' }}
              >
                {/* Image */}
                <div className="flex-shrink-0">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="rounded-lg object-cover"
                      style={{ width: 52, height: 52 }}
                    />
                  ) : (
                    <div
                      className="rounded-lg flex items-center justify-center text-xl"
                      style={{ width: 52, height: 52, backgroundColor: '#2a2a2a' }}
                    >
                      ⚙️
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: 'white' }}
                  >
                    {item.name}
                  </p>
                  <p className="text-xs mt-0.5 capitalize" style={{ color: '#9ca3af' }}>
                    {item.category || 'Part'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#eab308' }}>
                    ₱{parseFloat(item.price).toFixed(2)} each
                  </p>

                  {/* Qty + remove */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold transition hover:opacity-80"
                      style={{ backgroundColor: '#2a2a2a', color: 'white' }}
                    >
                      −
                    </button>
                    <span
                      className="text-sm font-semibold w-6 text-center"
                      style={{ color: 'white' }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold transition hover:opacity-80"
                      style={{ backgroundColor: '#db2777', color: 'white' }}
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="ml-auto text-xs transition hover:opacity-80"
                      style={{ color: '#f87171' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Subtotal */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold" style={{ color: 'white' }}>
                    ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div
            className="flex-shrink-0 px-4 py-4 space-y-3"
            style={{ borderTop: '1px solid #2a2a2a' }}
          >
            {/* Breakdown */}
            <div className="space-y-1.5">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between text-xs">
                  <span style={{ color: '#9ca3af' }} className="truncate mr-2">
                    {item.name} × {item.quantity}
                  </span>
                  <span style={{ color: '#d1d5db' }} className="flex-shrink-0">
                    ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div
              className="rounded-xl p-3 space-y-2"
              style={{ backgroundColor: '#0f0f0f' }}
            >
              <div className="flex justify-between text-sm">
                <span style={{ color: '#9ca3af' }}>
                  Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </span>
                <span className="font-semibold" style={{ color: 'white' }}>
                  ₱{total.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#9ca3af' }}>Down Payment (15%)</span>
                <span className="font-bold" style={{ color: '#eab308' }}>
                  ₱{(total * 0.15).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Checkout button */}
            <button
              onClick={() => { setOpen(false); navigate('/checkout'); }}
              className="w-full py-3 rounded-xl text-sm font-bold transition hover:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#db2777', color: 'white' }}
            >
              Proceed to Checkout
              <span>→</span>
            </button>

            {/* Secondary actions */}
            <div className="flex gap-2">
              <button
                onClick={() => { setOpen(false); navigate('/shop'); }}
                className="flex-1 py-2 rounded-xl text-xs font-medium transition hover:opacity-80"
                style={{ backgroundColor: '#2a2a2a', color: '#9ca3af' }}
              >
                Continue Shopping
              </button>
              <button
                onClick={clearCart}
                className="flex-1 py-2 rounded-xl text-xs font-medium transition hover:opacity-80"
                style={{ backgroundColor: '#2a2a2a', color: '#f87171' }}
              >
                Clear Cart
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}