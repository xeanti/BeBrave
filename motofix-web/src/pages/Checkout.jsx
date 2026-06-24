import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDownPaymentPercent } from '../lib/settings';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';

const GCASH_QR_IMAGE = 'https://wcqqduuimpjipwvwzyzx.supabase.co/storage/v1/object/public/motorcycle-photos/MISCS/GCASH%20(1).jpg';

function formatPeso(value) {
  const amount = Number(value) || 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 0.15;
  return rate > 1 ? rate / 100 : rate;
}

export default function Checkout() {
  const { user, profile } = useAuth();
  const { cart, total, itemCount, clearCart } = useCart();
  const navigate = useNavigate();

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [downPaymentRate, setDownPaymentRate] = useState(0.15);

  useEffect(() => {
    let mounted = true;

    getDownPaymentPercent()
      .then((value) => {
        if (mounted) setDownPaymentRate(normalizeRate(value));
      })
      .catch(() => {
        if (mounted) setDownPaymentRate(0.15);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const downPayment = total * downPaymentRate;
  const remainingBalance = total - downPayment;
  const downPaymentPercent = Math.round(downPaymentRate * 100);

  const customerName = useMemo(() => {
    const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
    return fullName || 'Customer';
  }, [profile]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    if (cart.length === 0 || submitting) return;

    setSubmitting(true);
    setError('');

    try {
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

      const items = cart.map((item) => {
        const price = Number(item.price) || 0;

        return {
          order_id: order.id,
          part_id: item.id,
          quantity: item.quantity,
          unit_price: price,
          subtotal: price * item.quantity,
        };
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(items);

      if (itemsError) throw itemsError;

      for (const item of cart) {
        const { error: stockError } = await supabase.rpc('decrement_stock', {
          part_id: item.id,
          qty: item.quantity,
        });

        if (stockError) throw stockError;
      }

      clearCart();

      navigate('/order-confirmation', {
        state: {
          order,
          items: cart,
          total,
          downPayment,
          remainingBalance,
          downPaymentRate,
        },
      });
    } catch (err) {
      setError(err.message || 'Failed to submit order.');
    } finally {
      setSubmitting(false);
    }
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-6 py-10 text-gray-900 dark:bg-dark-900 dark:text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-900/20 dark:ring-primary-500/20">
              🛒
            </div>
            <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
              Your cart is empty
            </h1>
            <p className="mb-6 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Browse our shop and add motorcycle parts before checking out.
            </p>
            <button
              onClick={() => navigate('/shop')}
              className="rounded-2xl bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.98]"
            >
              Browse Shop
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10"
    >
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800/70">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              MotoFix Checkout
            </p>
            <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
              Review your order
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              Check your items, confirm your details, and scan the GCash QR for your required down payment.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Customer info */}
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                    Customer Info
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Used for your order record.
                  </p>
                </div>
                <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                  Account
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Name
                  </p>
                  <p className="truncate text-sm font-bold text-gray-950 dark:text-white">
                    {customerName}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Email
                  </p>
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {profile?.email || user?.email || 'No email on file'}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Phone
                  </p>
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {profile?.phone || 'No phone on file'}
                  </p>
                </div>
              </div>
            </section>

            {/* Order items */}
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                    Order Items
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/shop')}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
                >
                  Add more
                </button>
              </div>

              <div className="space-y-3">
                {cart.map((item) => {
                  const price = Number(item.price) || 0;
                  const itemTotal = price * item.quantity;

                  return (
                    <div
                      key={item.id}
                      className="group flex gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 transition hover:border-primary-200 hover:bg-white dark:border-dark-700 dark:bg-dark-900/60 dark:hover:border-primary-500/30 dark:hover:bg-dark-900"
                    >
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-2xl text-gray-400">
                            ⚙️
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-gray-950 dark:text-white">
                              {item.name}
                            </p>
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                              {item.category || 'Part'} · {formatPeso(price)} × {item.quantity}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-black text-accent-600 dark:text-accent-400">
                            {formatPeso(itemTotal)}
                          </p>
                        </div>

                        {item.compatible_models?.length > 0 && (
                          <p className="mt-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/25 dark:text-primary-300">
                            For: {item.compatible_models.slice(0, 2).join(', ')}
                            {item.compatible_models.length > 2
                              ? ` +${item.compatible_models.length - 2} more`
                              : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Notes */}
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                Notes
              </h2>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Add special instructions, preferred pickup time, or extra details.
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Example: I will pick this up tomorrow afternoon..."
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
              />
            </section>
          </div>

          {/* Right column */}
          <aside className="space-y-6">
            {/* GCash QR */}
            <section className="rounded-3xl border border-primary-200 bg-primary-50 p-5 shadow-sm dark:border-primary-500/25 dark:bg-primary-900/10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-primary-800 dark:text-primary-200">
                    GCash Payment
                  </h2>
                  <p className="mt-1 text-xs text-primary-700/80 dark:text-primary-300/80">
                    Scan to pay the down payment.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-300">
                  QR
                </span>
              </div>

              <div className="rounded-3xl bg-white p-3 shadow-inner ring-1 ring-primary-100 dark:bg-dark-800 dark:ring-primary-500/20">
                <img
                  src={GCASH_QR_IMAGE}
                  alt="GCash QR code"
                  className="aspect-square w-full rounded-2xl object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden aspect-square w-full flex-col items-center justify-center rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-6 text-center dark:border-primary-500/30 dark:bg-primary-900/20">
                  <p className="text-3xl">📷</p>
                  <p className="mt-3 text-sm font-bold text-primary-800 dark:text-primary-200">
                    Add your GCash QR screenshot
                  </p>
                  <p className="mt-1 text-xs leading-5 text-primary-700/80 dark:text-primary-300/80">
                    Save it as public/gcash-qr.png, or replace GCASH_QR_IMAGE with your image link.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm ring-1 ring-primary-100 dark:bg-dark-800/80 dark:ring-primary-500/20">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    Required down payment
                  </span>
                  <span className="text-lg font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(downPayment)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                  {downPaymentPercent}% of total. Keep your GCash receipt for confirmation.
                </p>
              </div>
            </section>

            {/* Summary */}
            <section className="sticky top-24 rounded-3xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
              <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                Order Summary
              </h2>

              <div className="mb-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                {cart.map((item) => {
                  const price = Number(item.price) || 0;

                  return (
                    <div key={item.id} className="flex justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-gray-600 dark:text-gray-400">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="shrink-0 font-bold text-gray-900 dark:text-white">
                        {formatPeso(price * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-dark-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Subtotal
                  </span>
                  <span className="font-bold text-gray-950 dark:text-white">
                    {formatPeso(total)}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Down payment ({downPaymentPercent}%)
                  </span>
                  <span className="font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(downPayment)}
                  </span>
                </div>

                <div className="flex justify-between rounded-2xl bg-gray-50 p-4 text-sm ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <span className="font-bold text-gray-700 dark:text-gray-300">
                    Remaining balance
                  </span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {formatPeso(remainingBalance)}
                  </span>
                </div>

                <div className="flex justify-between border-t border-gray-200 pt-4 text-base dark:border-dark-700">
                  <span className="font-black text-gray-950 dark:text-white">
                    Total
                  </span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {formatPeso(total)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Placing Order...
                  </>
                ) : (
                  <>
                    Place Order
                    <span>→</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/shop')}
                className="mt-3 w-full rounded-2xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
              >
                ← Continue Shopping
              </button>
            </section>
          </aside>
        </div>
      </div>
    </form>
  );
}
