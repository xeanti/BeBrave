import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function CartDrawer() {
  const { cart, removeFromCart, updateQuantity, clearCart, total, itemCount } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  
  const drawerRef = useRef(null);

  // Global listener to detect clicks completely outside of the drawer element
  useEffect(() => {
    function handleOutsideClick(event) {
      if (open && drawerRef.current && !drawerRef.current.contains(event.target)) {
        if (!event.target.closest('.cart-toggle-btn')) {
          setOpen(false);
        }
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  return (
    <>
      {/* Cart button */}
      <button
        onClick={() => setOpen(!open)}
        className="cart-toggle-btn relative p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-dark-800 border border-transparent hover:border-dark-700 transition-all duration-200 flex-shrink-0"
      >
        <span className="text-xl">🛒</span>
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold tracking-tight shadow-md animate-fade-in">
            {itemCount > 9 ? '9+' : itemCount}
          </span>
        )}
      </button>

      {/* BACKDROP Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-md transition-opacity duration-300 cursor-pointer"
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 h-screen max-h-screen z-[9999] flex flex-col shadow-[rgba(0,0,0,0.8)_0px_0px_50px_0px] transition-transform duration-300 ease-out overflow-hidden bg-dark-900 border-l border-dark-800 text-white w-full max-w-[420px] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0 border-b border-dark-800 bg-dark-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛒</span>
            <h2 className="font-bold text-lg tracking-tight text-white">
              Parts Cart
            </h2>
            {itemCount > 0 && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-dark-800 text-gray-400 hover:text-white border border-transparent hover:border-dark-700 hover:bg-dark-700/50"
          >
            ✕
          </button>
        </div>

        {/* Items (Middle Scrollable Content) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4 scrollbar-thin scrollbar-thumb-dark-700">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-20 h-20 rounded-full bg-dark-800 flex items-center justify-center text-4xl mb-4 border border-dark-700/50">
                🛒
              </div>
              <p className="font-semibold text-lg mb-1 text-white">Your cart is empty</p>
              <p className="text-sm mb-6 text-gray-400 max-w-[240px] mx-auto">
                Browse our shop and add premium parts to get started.
              </p>
              <button
                onClick={() => { setOpen(false); navigate('/shop'); }}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all bg-pink-600 text-white hover:bg-pink-500 active:scale-95 shadow-lg shadow-pink-600/20"
              >
                Browse Shop
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-4 rounded-xl p-3.5 bg-dark-950/40 border border-dark-800/80 hover:border-dark-700 transition-all duration-200 group"
              >
                {/* Image Wrap */}
                <div className="flex-shrink-0 relative overflow-hidden rounded-lg bg-dark-800 border border-dark-700/60 p-0.5">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="object-cover w-[56px] h-[56px] rounded-md group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="rounded-md flex items-center justify-center text-2xl w-[56px] h-[56px] bg-dark-800 text-gray-500">
                      ⚙️
                    </div>
                  )}
                </div>

                {/* Info block */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold truncate text-white group-hover:text-pink-400 transition-colors duration-200">
                      {item.name}
                    </p>
                    <p className="text-sm font-bold text-white flex-shrink-0">
                      ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
                    </p>
                  </div>
                  <p className="text-[11px] font-medium tracking-wide mt-0.5 uppercase text-gray-500">
                    {item.category || 'Part'}
                  </p>
                  <p className="text-xs mt-1 text-yellow-500 font-medium">
                    ₱{parseFloat(item.price).toFixed(2)} <span className="text-gray-500 text-[10px]">each</span>
                  </p>

                  {/* Quantity adjustments + remove links */}
                  <div className="flex items-center justify-between gap-2 mt-3.5 pt-2 border-t border-dark-800/40">
                    <div className="flex items-center gap-1 bg-dark-900 rounded-lg p-0.5 border border-dark-800">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold transition hover:bg-dark-800 text-gray-400 hover:text-white"
                      >
                        −
                      </button>
                      <span className="text-xs font-bold w-7 text-center text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold transition hover:bg-dark-800 text-gray-400 hover:text-white"
                      >
                        +
                      </button>
                    </div>
                    
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-xs font-medium text-gray-500 hover:text-red-400 transition-colors duration-150"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="flex-shrink-0 px-6 py-5 space-y-4 bg-dark-900 border-t border-dark-800 shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
            {/* Totals Box */}
            <div className="rounded-xl p-4 space-y-2.5 bg-dark-950/80 border border-dark-800/60">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-gray-400">
                  Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </span>
                <span className="text-white">
                  ₱{total.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs font-medium pt-2 border-t border-dark-800/40">
                <span className="text-gray-400">Down Payment (15%)</span>
                <span className="font-bold text-yellow-500">
                  ₱{(total * 0.15).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Main Action Call */}
            <button
              onClick={() => { setOpen(false); navigate('/checkout'); }}
              className="w-full py-3.5 rounded-xl text-sm font-bold transition-all bg-pink-600 hover:bg-pink-500 active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-lg shadow-pink-600/10 hover:shadow-pink-600/20"
            >
              Proceed to Checkout
              <span className="text-base">→</span>
            </button>

            {/* Auxiliary actions */}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setOpen(false); navigate('/shop'); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all bg-dark-800 text-gray-300 hover:text-white border border-dark-700/50 hover:bg-dark-700"
              >
                Continue Shopping
              </button>
              <button
                onClick={clearCart}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all bg-dark-800 text-gray-400 hover:text-red-400 border border-dark-700/50 hover:bg-dark-700"
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

s