import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});

function CartIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 3h2.386c.51 0 .955.343 1.087.835l.383 1.437m0 0L7.5 14.25A2.25 2.25 0 0 0 9.711 16.1h6.839a2.25 2.25 0 0 0 2.175-1.681l1.225-4.675A1.5 1.5 0 0 0 18.5 7.875H6.106m0-2.603L5.25 2.25M9 20.25h.008v.008H9v-.008Zm8.25 0h.008v.008h-.008v-.008Z"
      />
    </svg>
  );
}

function CloseIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function EmptyCart({ onShop }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-primary-500/20 blur-2xl" />
        <div className="relative grid h-24 w-24 place-items-center rounded-[2rem] border border-primary-100 bg-primary-50 text-primary-600 shadow-xl shadow-primary-500/10 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-primary-300">
          <CartIcon className="h-10 w-10" />
        </div>
      </div>

      <h3 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">
        Your cart is empty
      </h3>
      <p className="mt-2 max-w-[260px] text-sm leading-6 text-gray-500 dark:text-gray-400">
        Add motorcycle parts from the shop and review them here before checkout.
      </p>

      <button
        onClick={onShop}
        className="mt-7 inline-flex items-center justify-center rounded-2xl bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/25 transition hover:-translate-y-0.5 hover:bg-primary-700 active:translate-y-0"
      >
        Browse Shop
      </button>
    </div>
  );
}

function CartItem({ item, onIncrease, onDecrease, onRemove }) {
  const price = Number.parseFloat(item.price || 0);
  const quantity = Number(item.quantity || 1);
  const lineTotal = price * quantity;

  return (
    <div className="group rounded-3xl border border-gray-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-600/10 dark:border-gray-800 dark:bg-dark-800/70 dark:hover:border-primary-500/30">
      <div className="flex gap-3">
        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 dark:border-gray-700 dark:bg-dark-900">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-3xl text-gray-400 dark:text-gray-500">
              ⚙️
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-gray-950 transition group-hover:text-primary-600 dark:text-white dark:group-hover:text-primary-300">
                {item.name}
              </p>
              <p className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                {item.category || 'Part'}
              </p>
            </div>

            <button
              onClick={onRemove}
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-300"
              aria-label={`Remove ${item.name} from cart`}
              title="Remove item"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {peso.format(price)} each
              </p>
              <p className="mt-0.5 text-sm font-black text-gray-950 dark:text-white">
                {peso.format(lineTotal)}
              </p>
            </div>

            <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-dark-900">
              <button
                onClick={onDecrease}
                disabled={quantity <= 1}
                className="grid h-8 w-8 place-items-center rounded-xl text-base font-black text-gray-600 transition hover:bg-white hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
                aria-label={`Decrease ${item.name} quantity`}
              >
                −
              </button>

              <span className="w-9 text-center text-sm font-black text-gray-950 dark:text-white">
                {quantity}
              </span>

              <button
                onClick={onIncrease}
                className="grid h-8 w-8 place-items-center rounded-xl text-base font-black text-gray-600 transition hover:bg-white hover:text-gray-950 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
                aria-label={`Increase ${item.name} quantity`}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CartDrawer() {
  const { cart, removeFromCart, updateQuantity, clearCart, total, itemCount } = useCart();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);

  const downPayment = useMemo(() => total * 0.15, [total]);
  const remainingBalance = useMemo(() => total - downPayment, [total, downPayment]);

  function closeDrawer() {
    setOpen(false);
    setConfirmClear(false);
  }

  function goTo(path) {
    closeDrawer();
    navigate(path);
  }

  function handleClearCart() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }

    clearCart();
    setConfirmClear(false);
  }

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 120);

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeDrawer();
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleOutsideClick(event) {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target) &&
        !event.target.closest('.cart-toggle-btn')
      ) {
        closeDrawer();
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <>
      {/* Cart button */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="cart-toggle-btn group relative grid h-11 w-11 place-items-center rounded-2xl border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:text-primary-600 hover:shadow-lg hover:shadow-primary-600/10 active:translate-y-0 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-200 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
        aria-label={`Open cart${itemCount ? `, ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}`}
        aria-expanded={open}
        aria-controls="cart-drawer"
      >
        <CartIcon className="h-5 w-5 transition group-hover:scale-110" />

        {itemCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full border-2 border-white bg-primary-600 px-1 text-[10px] font-black leading-none text-white shadow-lg dark:border-dark-900">
            {itemCount > 9 ? '9+' : itemCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        className={`fixed inset-0 z-[9998] bg-gray-950/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        id="cart-drawer"
        ref={drawerRef}
        className={`fixed right-0 top-0 z-[9999] flex h-screen w-full max-w-[430px] flex-col overflow-hidden border-l border-gray-200 bg-gray-50 text-gray-950 shadow-2xl shadow-gray-950/30 transition-transform duration-300 ease-out dark:border-gray-800 dark:bg-dark-900 dark:text-white ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-gray-200 bg-white px-5 py-5 dark:border-gray-800 dark:bg-dark-900">
          <div className="absolute -right-16 -top-20 h-40 w-40 rounded-full bg-primary-500/20 blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-600/25">
                <CartIcon className="h-6 w-6" />
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-black tracking-tight">
                  Parts Cart
                </h2>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {itemCount > 0
                    ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'} ready for checkout`
                    : 'No items added yet'}
                </p>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300"
              aria-label="Close cart"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {cart.length === 0 ? (
            <EmptyCart onShop={() => goTo('/shop')} />
          ) : (
            <div className="space-y-3">
              {cart.map((item) => {
                const quantity = Number(item.quantity || 1);

                return (
                  <CartItem
                    key={item.id}
                    item={item}
                    onIncrease={() => updateQuantity(item.id, quantity + 1)}
                    onDecrease={() => {
                      if (quantity > 1) updateQuantity(item.id, quantity - 1);
                    }}
                    onRemove={() => removeFromCart(item.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 bg-white p-5 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] dark:border-gray-800 dark:bg-dark-900 dark:shadow-[0_-18px_45px_rgba(0,0,0,0.35)]">
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-dark-800/70">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">
                    Subtotal
                  </span>
                  <span className="font-bold text-gray-950 dark:text-white">
                    {peso.format(total)}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">
                    Down Payment 15%
                  </span>
                  <span className="font-black text-accent-500">
                    {peso.format(downPayment)}
                  </span>
                </div>

                <div className="border-t border-dashed border-gray-300 pt-3 dark:border-gray-700">
                  <div className="flex justify-between gap-4">
                    <span className="font-semibold text-gray-600 dark:text-gray-300">
                      Remaining balance
                    </span>
                    <span className="font-black text-gray-950 dark:text-white">
                      {peso.format(remainingBalance)}
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-3 rounded-2xl bg-primary-50 px-3 py-2 text-[11px] font-medium leading-5 text-primary-700 dark:bg-primary-500/10 dark:text-primary-200">
                Checkout will reserve your selected parts. Final installation fees may vary after assessment.
              </p>
            </div>

            <button
              type="button"
              onClick={() => goTo('/checkout')}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-primary-600/35 active:translate-y-0"
            >
              Proceed to Checkout
              <span aria-hidden="true">→</span>
            </button>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => goTo('/shop')}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-bold text-gray-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-primary-500/30 dark:hover:bg-primary-500/10 dark:hover:text-primary-200"
              >
                Continue Shopping
              </button>

              <button
                type="button"
                onClick={handleClearCart}
                onMouseLeave={() => setConfirmClear(false)}
                className={`rounded-2xl border px-4 py-3 text-xs font-bold transition ${
                  confirmClear
                    ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-gray-700 dark:bg-dark-800 dark:text-gray-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300'
                }`}
              >
                {confirmClear ? 'Click to Confirm' : 'Clear Cart'}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
