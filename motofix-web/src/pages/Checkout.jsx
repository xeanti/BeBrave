import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDownPaymentPercent } from '../lib/settings';
import { notifyRole, notifyUser } from '../lib/notifications';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';
import {
  CONSENT_SOURCE_PAGES,
  CONSENT_TYPES,
  acceptMultipleCustomerConsents,
  getConsentDefinitionSafe,
} from '../lib/consents';

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

function cleanText(value, max = 500) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function isValidPhilippineMobile(value) {
  return /^09\d{9}$/.test(value);
}

function cleanGcashReference(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 20);
}

function getCashPaymentMethod(fulfillmentMethod) {
  return fulfillmentMethod === 'delivery' ? 'cash_on_delivery' : 'cash_on_pickup';
}

function getCashPaymentTitle(fulfillmentMethod) {
  return fulfillmentMethod === 'delivery' ? 'Cash on Delivery (COD)' : 'Pay at Counter';
}

function getCashPaymentSubtitle(fulfillmentMethod) {
  return fulfillmentMethod === 'delivery'
    ? 'Customer pays in cash when the order is delivered.'
    : 'Customer pays at the shop counter when the order is picked up or released.';
}

function OptionCard({ active, title, subtitle, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
        active
          ? 'border-primary-500 bg-primary-50 ring-4 ring-primary-500/10 dark:border-primary-500 dark:bg-primary-900/20'
          : 'border-gray-200 bg-gray-50 hover:border-primary-300 dark:border-dark-700 dark:bg-dark-900/70 dark:hover:border-primary-500/40'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-black text-gray-950 dark:text-white">
          {title}
        </span>
      </div>
      <p className="text-xs leading-5 text-gray-600 dark:text-gray-400">
        {subtitle}
      </p>
    </button>
  );
}

export default function Checkout() {
  const { user, profile } = useAuth();
  const { cart, total, itemCount, clearCart, refreshCart } = useCart();
  const navigate = useNavigate();

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validatingStock, setValidatingStock] = useState(false);
  const [error, setError] = useState('');

  const [downPaymentRate, setDownPaymentRate] = useState(0.15);
  const [agreedToOrderConsent, setAgreedToOrderConsent] = useState(false);
  const [orderConsent, setOrderConsent] = useState(null);
  const [invoiceConsent, setInvoiceConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(true);

  const [fulfillmentMethod, setFulfillmentMethod] = useState('pickup');
  const [paymentMethod, setPaymentMethod] = useState('cash_on_pickup');
  const [paymentReference, setPaymentReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [contactPhone, setContactPhone] = useState(profile?.phone || '');

  useEffect(() => {
    setContactPhone(profile?.phone || '');
  }, [profile?.phone]);

  useEffect(() => {
    if (paymentMethod === 'cash_on_pickup' || paymentMethod === 'cash_on_delivery') {
      setPaymentMethod(getCashPaymentMethod(fulfillmentMethod));
    }
  }, [fulfillmentMethod]);

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

  useEffect(() => {
    let mounted = true;

    async function loadCheckoutConsents() {
      try {
        const [orderDefinition, invoiceDefinition] = await Promise.all([
          getConsentDefinitionSafe(CONSENT_TYPES.ORDER_PAYMENT_PROCESSING),
          getConsentDefinitionSafe(CONSENT_TYPES.INVOICE_RECEIPT),
        ]);

        if (!mounted) return;

        setOrderConsent(orderDefinition);
        setInvoiceConsent(invoiceDefinition);
      } catch (err) {
        console.warn('Failed to load checkout consent definitions:', err);
      } finally {
        if (mounted) setConsentLoading(false);
      }
    }

    loadCheckoutConsents();

    return () => {
      mounted = false;
    };
  }, []);

  const downPaymentPercent = Math.round(downPaymentRate * 100);
  const onlinePaymentAmount =
    paymentMethod === 'paymongo_qrph'
      ? Number(total.toFixed(2))
      : paymentMethod === 'gcash_manual'
        ? Number((total * downPaymentRate).toFixed(2))
        : 0;
  const requiredDownPayment = onlinePaymentAmount;
  const remainingBalance = Number((total - onlinePaymentAmount).toFixed(2));

  const customerName = useMemo(() => {
    const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
    return fullName || 'Customer';
  }, [profile]);

  async function validateCartStock() {
    setValidatingStock(true);

    try {
      if (!cart.length) return { ok: false, message: 'Your cart is empty.' };

      const ids = [...new Set(cart.map((item) => item.id).filter(Boolean))];

      const { data, error: stockError } = await supabase
        .from('parts')
        .select('id, name, stock_quantity, is_active')
        .in('id', ids);

      if (stockError) throw stockError;

      const partsById = new Map((data || []).map((part) => [part.id, part]));

      for (const item of cart) {
        const latest = partsById.get(item.id);

        if (!latest || latest.is_active === false) {
          return {
            ok: false,
            message: `${item.name} is no longer available. Please remove it from your cart.`,
          };
        }

        const latestStock = Number(latest.stock_quantity) || 0;

        if (latestStock <= 0) {
          return {
            ok: false,
            message: `${item.name} is already out of stock.`,
          };
        }

        if (Number(item.quantity) > latestStock) {
          return {
            ok: false,
            message: `Only ${latestStock} item(s) are available for ${item.name}. Please update the quantity.`,
          };
        }
      }

      return { ok: true };
    } finally {
      setValidatingStock(false);
    }
  }

  async function createOrderQrphCheckout(orderId) {
    const { data, error: invokeError } = await supabase.functions.invoke(
      'create-order-qrph-checkout',
      {
        body: {
          order_id: orderId,
        },
      }
    );

    if (invokeError) {
      throw new Error(invokeError.message || 'Failed to create PayMongo checkout.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.checkout_url) {
      throw new Error('PayMongo checkout URL was not returned.');
    }

    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    if (cart.length === 0 || submitting) return;

    if (!agreedToOrderConsent) {
      setError('Please agree to the order/payment privacy consent before placing your order.');
      return;
    }

    const safeContactPhone = cleanPhone(contactPhone);
    const safeDeliveryAddress = cleanText(deliveryAddress, 300);
    const safePickupNotes = cleanText(pickupNotes, 200);
    const safeNotes = cleanText(notes, 500);
    const safePaymentReference = cleanGcashReference(paymentReference);

    if (!safeContactPhone) {
      setError('Please enter a contact number for this order.');
      return;
    }

    if (!isValidPhilippineMobile(safeContactPhone)) {
      setError('Contact number must start with 09 and contain exactly 11 digits.');
      return;
    }

    if (fulfillmentMethod === 'delivery' && !safeDeliveryAddress) {
      setError('Please enter your delivery address.');
      return;
    }

    if (paymentMethod === 'gcash_manual' && safePaymentReference.length < 4) {
      setError('Please enter a valid GCash reference number before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const stockCheck = await validateCartStock();

      if (!stockCheck.ok) {
        setError(stockCheck.message);
        await refreshCart?.();
        return;
      }

      await acceptMultipleCustomerConsents({
        consentTypes: [
          CONSENT_TYPES.ORDER_PAYMENT_PROCESSING,
          CONSENT_TYPES.INVOICE_RECEIPT,
        ],
        sourcePage: CONSENT_SOURCE_PAGES.CHECKOUT,
        metadata: {
          cart_item_count: itemCount,
          cart_total: total,
          down_payment: requiredDownPayment,
          remaining_balance: remainingBalance,
          fulfillment_method: fulfillmentMethod,
          payment_method: paymentMethod,
          payment_reference_provided: Boolean(safePaymentReference),
          notes_provided: Boolean(safeNotes),
        },
      });

      const paymentStatus =
        paymentMethod === 'gcash_manual'
          ? 'pending_verification'
          : 'pending_payment';

      let checkoutData = null;
      let finalPaymentStatus = paymentStatus;

      const fulfillmentStatus =
        fulfillmentMethod === 'delivery' ? 'pending_delivery' : 'pending_pickup';

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: user.id,
          total_amount: total,
          status: 'pending',

          payment_status: paymentStatus,
          payment_method: paymentMethod,
          payment_reference:
            paymentMethod === 'gcash_manual' ? safePaymentReference || null : null,
          // Do not count the amount as paid yet.
          // PayMongo becomes paid only after webhook; GCash manual becomes paid only after staff/admin verification.
          down_payment_amount: 0,
          remaining_balance: total,

          fulfillment_method: fulfillmentMethod,
          fulfillment_status: fulfillmentStatus,
          delivery_address:
            fulfillmentMethod === 'delivery' ? safeDeliveryAddress : null,
          pickup_notes:
            fulfillmentMethod === 'pickup' ? safePickupNotes || null : null,
          customer_contact_phone: safeContactPhone,

          notes: safeNotes || null,
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

      const { error: itemsError } = await supabase.from('order_items').insert(items);

      if (itemsError) throw itemsError;

      const { error: reserveStockError } = await supabase.rpc('reserve_order_stock', {
  p_order_id: order.id,
});

if (reserveStockError) throw reserveStockError;

      if (paymentMethod === 'paymongo_qrph') {
        checkoutData = await createOrderQrphCheckout(order.id);
        finalPaymentStatus = 'checkout_created';
      }

      await Promise.allSettled([
        notifyUser({
          userId: user.id,
          title: 'Order Submitted',
          message:
            paymentMethod === 'paymongo_qrph'
              ? 'Your order was submitted. Please complete your PayMongo QR Ph / GCash payment.'
              : paymentMethod === 'gcash_manual'
                ? 'Your order was submitted and is waiting for GCash payment verification.'
                : paymentMethod === 'cash_on_delivery'
                  ? 'Your order was submitted. Please pay cash upon delivery.'
                  : 'Your order was submitted. Please pay at the shop counter during pickup or release.',
          type: 'order',
          relatedTable: 'orders',
          relatedId: order.id,
        }),

        notifyRole({
          role: 'admin',
          title: 'New Product Order',
          message:
            paymentMethod === 'paymongo_qrph'
              ? 'A customer submitted a product order and PayMongo checkout was created.'
              : paymentMethod === 'gcash_manual'
                ? 'A customer submitted a product order with GCash payment reference for verification.'
                : paymentMethod === 'cash_on_delivery'
                  ? 'A customer submitted a product order for Cash on Delivery.'
                  : 'A customer submitted a product order for counter payment.',
          type: 'order',
          relatedTable: 'orders',
          relatedId: order.id,
        }),

        notifyRole({
          role: 'staff',
          title: 'New Product Order',
          message: 'A new product order is waiting for staff processing.',
          type: 'order',
          relatedTable: 'orders',
          relatedId: order.id,
        }),
      ]);

      const submittedItems = cart.map((item) => ({ ...item }));

      await clearCart();

      navigate('/order-confirmation', {
        state: {
          order,
          items: submittedItems,
          total,
          downPayment: 0,
          remainingBalance: total,
          downPaymentRate,
          fulfillmentMethod,
          paymentMethod,
          paymentStatus: finalPaymentStatus,
          checkoutUrl: checkoutData?.checkout_url || null,
        },
      });

      if (checkoutData?.checkout_url) {
        window.open(checkoutData.checkout_url, '_blank', 'noopener,noreferrer');
      }
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
              Browse products before checking out.
            </p>
            <button
              type="button"
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
        <div className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800/70">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
            MotoFix Checkout
          </p>
          <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
            Review and place order
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
            Confirm your products, choose pickup or delivery, then select your payment option.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-4">
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                  Customer Details
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  These details are used for order processing and staff contact.
                </p>
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

                <label className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Contact Number
                  </p>
                  <input
                    value={contactPhone}
                    onChange={(event) => setContactPhone(cleanPhone(event.target.value))}
                    placeholder="09XXXXXXXXX"
                    maxLength={11}
                    className="w-full bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                  />
                </label>
              </div>
            </section>

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
                              {item.category || 'Product'} · {formatPeso(price)} × {item.quantity}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-black text-accent-600 dark:text-accent-400">
                            {formatPeso(itemTotal)}
                          </p>
                        </div>

                        <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          Stock available: {item.stock_quantity}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                Fulfillment Method
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <OptionCard
                  active={fulfillmentMethod === 'pickup'}
                  icon="🏪"
                  title="Pickup at Shop"
                  subtitle="Customer will pick up the products at the MotoFix shop."
                  onClick={() => {
                    setFulfillmentMethod('pickup');
                    if (paymentMethod === 'cash_on_delivery') {
                      setPaymentMethod('cash_on_pickup');
                    }
                  }}
                />

                <OptionCard
                  active={fulfillmentMethod === 'delivery'}
                  icon="🛵"
                  title="Delivery"
                  subtitle="Staff will process the order for delivery or release."
                  onClick={() => {
                    setFulfillmentMethod('delivery');
                    if (paymentMethod === 'cash_on_pickup') {
                      setPaymentMethod('cash_on_delivery');
                    }
                  }}
                />
              </div>

              {fulfillmentMethod === 'delivery' ? (
                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Delivery Address
                  </span>
                  <textarea
                    value={deliveryAddress}
                    onChange={(event) => setDeliveryAddress(cleanText(event.target.value, 300))}
                    rows={3}
                    maxLength={300}
                    placeholder="Enter complete delivery address..."
                    className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
                  />
                </label>
              ) : (
                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Pickup Notes
                  </span>
                  <input
                    value={pickupNotes}
                    onChange={(event) => setPickupNotes(cleanText(event.target.value, 200))}
                    placeholder="Example: I will pick this up tomorrow afternoon"
                    maxLength={200}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
                  />
                </label>
              )}
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                Payment Method
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <OptionCard
                  active={paymentMethod === getCashPaymentMethod(fulfillmentMethod)}
                  icon="💵"
                  title={getCashPaymentTitle(fulfillmentMethod)}
                  subtitle={getCashPaymentSubtitle(fulfillmentMethod)}
                  onClick={() => setPaymentMethod(getCashPaymentMethod(fulfillmentMethod))}
                />

                <OptionCard
                  active={paymentMethod === 'paymongo_qrph'}
                  icon="⚡"
                  title="PayMongo QR Ph / GCash"
                  subtitle="Pay the full order online. The system marks it paid automatically after webhook confirmation."
                  onClick={() => setPaymentMethod('paymongo_qrph')}
                />

                <OptionCard
                  active={paymentMethod === 'gcash_manual'}
                  icon="📲"
                  title="GCash Manual Verification"
                  subtitle="Enter your GCash reference number. Staff will verify before processing."
                  onClick={() => setPaymentMethod('gcash_manual')}
                />
              </div>

              {paymentMethod === 'gcash_manual' && (
                <div className="mt-4 rounded-2xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-500/25 dark:bg-primary-900/10">
                  <label>
                    <span className="mb-2 block text-xs font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
                      GCash Reference Number
                    </span>
                    <input
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(cleanGcashReference(event.target.value))}
                      placeholder="Example: 1234567890123"
                      maxLength={20}
                      className="w-full rounded-2xl border border-primary-200 bg-white px-4 py-3 text-sm font-bold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-primary-500/30 dark:bg-dark-900 dark:text-white"
                    />
                  </label>

                  <p className="mt-3 text-xs leading-5 text-primary-700/80 dark:text-primary-300/80">
                    Required down payment: <b>{formatPeso(requiredDownPayment)}</b>. Staff/Admin will verify this reference before marking the order as paid.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                Notes
              </h2>
              <textarea
                value={notes}
                onChange={(event) => setNotes(cleanText(event.target.value, 500))}
                rows={4}
                maxLength={500}
                placeholder="Special instructions..."
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
              />
            </section>
          </div>

          <aside className="space-y-6">
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
                  <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                  <span className="font-bold text-gray-950 dark:text-white">
                    {formatPeso(total)}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Payment Due Now
                    {paymentMethod === 'gcash_manual' ? ` (${downPaymentPercent}% manual)` : ''}
                    {paymentMethod === 'paymongo_qrph' ? ' (full online payment)' : ''}
                    {paymentMethod === 'cash_on_delivery' ? ' (COD)' : ''}
                    {paymentMethod === 'cash_on_pickup' ? ' (counter)' : ''}
                  </span>
                  <span className="font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(requiredDownPayment)}
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
                  <span className="font-black text-gray-950 dark:text-white">Total</span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {formatPeso(total)}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agreedToOrderConsent}
                    onChange={(event) => setAgreedToOrderConsent(event.target.checked)}
                    className="mt-1 accent-primary-600"
                  />
                  <span className="text-xs leading-5 text-gray-600 dark:text-gray-400">
                    <span className="block font-black text-gray-900 dark:text-white">
                      Order, Payment, Invoice & E-Receipt Privacy Consent
                    </span>

                    {consentLoading ? (
                      'Loading privacy consent...'
                    ) : (
                      <>
                        <span className="block">
                          {orderConsent?.consent_text ||
                            'I agree that MotoFix may use my order, cart, payment, contact, and transaction information to process product orders, payment records, invoices, and e-receipts.'}
                        </span>
                        <span className="mt-2 block">
                          {invoiceConsent?.consent_text ||
                            'I agree that MotoFix may generate and store invoices, e-receipts, and payment history for my orders.'}
                        </span>
                      </>
                    )}
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || validatingStock}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting || validatingStock ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {validatingStock ? 'Checking Stock...' : 'Placing Order...'}
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
