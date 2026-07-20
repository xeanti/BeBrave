import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import CustomerPicker from '../../../components/CustomerPicker';
import { adjustPartStock } from '../../../lib/inventory';
import { createReceiptHistory } from '../../../lib/receiptHistory';
import { confirmAction } from '../../../components/ConfirmModal';

import {
  Banner,
  Section,
  StatCard,
  PaymentMethodPicker,
  formatPeso,
  getCustomerName,
} from './StaffDashboardShared';

function ProductImage({ product }) {
  if (product?.image_url) {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        className="h-16 w-16 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700"
      />
    );
  }

  return (
    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gray-100 text-2xl ring-1 ring-gray-200 dark:bg-dark-900 dark:ring-dark-700">
      📦
    </div>
  );
}

function cleanText(value, maxLength = 120) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeText(value) {
  return cleanText(value, 120).toLowerCase();
}

function sanitizeSearch(value) {
  return cleanText(value, 120);
}

function sanitizeName(value) {
  return String(value || '')
    .replace(/[^a-zA-ZñÑ .'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function sanitizeReference(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .trim()
    .slice(0, 40);
}

function sanitizeNote(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function normalizePaymentMethod(value) {
  return value === 'gcash' ? 'gcash' : 'cash';
}

function normalizeCartQuantity(value) {
  const quantity = Math.floor(Number(value) || 0);
  return Math.max(quantity, 0);
}

function sanitizeCartItem(item) {
  if (!item?.id) return null;

  const stock = Math.max(0, Number(item.stock_quantity) || 0);
  const quantity = Math.min(Math.max(1, normalizeCartQuantity(item.quantity)), stock || 1);

  return {
    ...item,
    name: cleanText(item.name || 'Product', 120),
    category: cleanText(item.category || 'General', 80),
    price: Math.max(0, Number(item.price) || 0),
    stock_quantity: stock,
    quantity,
  };
}

function normalizeCart(value) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeCartItem).filter(Boolean);
}

function isValidOptionalPhone(value) {
  if (!value) return true;
  return /^09\d{9}$/.test(value);
}

function createReceiptNumberFallback(orderId) {
  return `POS-${String(orderId || '').slice(0, 8).toUpperCase()}-${Date.now()}`;
}

function getSaleCustomerName({ customerMode, customer, guestName }) {
  if (customerMode === 'guest') return sanitizeName(guestName) || 'Guest Customer';
  return getCustomerName(customer);
}

function buildSaleSummary({ customerName, cartItems, paymentMethod, paymentReference, cartTotal }) {
  const lines = cartItems
    .map((item) => `• ${item.quantity} × ${item.name} — ${formatPeso((Number(item.price) || 0) * item.quantity)}`)
    .join('\n');

  return [
    `Complete product sale for ${customerName}?`,
    '',
    lines,
    '',
    `Total: ${formatPeso(cartTotal)}`,
    `Payment: ${paymentMethod === 'gcash' ? 'GCash Manual' : 'Cash'}`,
    paymentReference ? `Reference: ${paymentReference}` : null,
    '',
    'This will create the order, record payment, and deduct stock.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

const PRODUCT_POS_DRAFT_KEY = 'motofix_staff_product_pos_draft';

function readProductPosDraft() {
  try {
    const raw = localStorage.getItem(PRODUCT_POS_DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProductPosDraft(draft) {
  try {
    localStorage.setItem(PRODUCT_POS_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore browser storage errors.
  }
}

function clearProductPosDraft() {
  try {
    localStorage.removeItem(PRODUCT_POS_DRAFT_KEY);
  } catch {
    // Ignore browser storage errors.
  }
}

export default function WalkInPOS({ staffId, onReceipt }) {
  const draft = readProductPosDraft();

  const [customerMode, setCustomerMode] = useState(() => draft.customerMode === 'registered' ? 'registered' : 'guest');
  const [customer, setCustomer] = useState(() => draft.customer || null);
  const [guestName, setGuestName] = useState(() => sanitizeName(draft.guestName || ''));
  const [guestPhone, setGuestPhone] = useState(() => sanitizePhone(draft.guestPhone || ''));

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [search, setSearch] = useState(() => sanitizeSearch(draft.search || ''));
  const [categoryFilter, setCategoryFilter] = useState(() => cleanText(draft.categoryFilter || 'all', 80) || 'all');
  const [cart, setCart] = useState(() => normalizeCart(draft.cart || []));

  const [paymentMethod, setPaymentMethod] = useState(() => normalizePaymentMethod(draft.paymentMethod || 'cash'));
  const [paymentReference, setPaymentReference] = useState(() => sanitizeReference(draft.paymentReference || ''));
  const [saleNote, setSaleNote] = useState(() => sanitizeNote(draft.saleNote || ''));

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchProducts();

    const channel = supabase
      .channel('staff-easy-pos-products')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parts',
        },
        () => fetchProducts(false)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const hasDraft =
      customer ||
      customerMode !== 'guest' ||
      guestName.trim() ||
      guestPhone.trim() ||
      search.trim() ||
      categoryFilter !== 'all' ||
      safeCart.length > 0 ||
      paymentMethod !== 'cash' ||
      paymentReference.trim() ||
      saleNote.trim();

    if (!hasDraft) {
      clearProductPosDraft();
      return;
    }

    saveProductPosDraft({
      customerMode,
      customer,
      guestName: sanitizeName(guestName),
      guestPhone: sanitizePhone(guestPhone),
      search: sanitizeSearch(search),
      categoryFilter: cleanText(categoryFilter, 80) || 'all',
      cart: normalizeCart(cart),
      paymentMethod: normalizePaymentMethod(paymentMethod),
      paymentReference: sanitizeReference(paymentReference),
      saleNote: sanitizeNote(saleNote),
      updatedAt: new Date().toISOString(),
    });
  }, [
    customerMode,
    customer,
    guestName,
    guestPhone,
    search,
    categoryFilter,
    cart,
    paymentMethod,
    paymentReference,
    saleNote,
  ]);

  async function fetchProducts(showLoader = true) {
    if (showLoader) setLoadingProducts(true);

    const { data, error } = await supabase
      .from('parts')
      .select('*')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('name', { ascending: true });

    if (error) {
      setMessage(`Error: ${error.message || 'Failed to load products.'}`);
      setProducts([]);
    } else {
      setProducts(data || []);
    }

    setLoadingProducts(false);
  }

  const categories = useMemo(() => {
    const list = [...new Set(products.map((product) => product.category || 'General'))].sort();
    return ['all', ...list];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = safeText(search);

    return products.filter((product) => {
      const category = product.category || 'General';
      const compatibleModels = Array.isArray(product.compatible_models)
        ? product.compatible_models.join(' ')
        : '';

      const haystack = [
        product.name,
        category,
        product.description,
        compatibleModels,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const matchesCategory = categoryFilter === 'all' || category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const safeCart = useMemo(() => normalizeCart(cart), [cart]);

  const cartQuantity = safeCart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = safeCart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
    0
  );

  function getCartQuantity(productId) {
    return safeCart.find((item) => item.id === productId)?.quantity || 0;
  }

  function canAddProduct(product) {
    const stock = Number(product.stock_quantity) || 0;
    return getCartQuantity(product.id) < stock;
  }

  function addToCart(product) {
    setMessage('');

    const stock = Number(product.stock_quantity) || 0;

    if (stock <= 0) {
      setMessage(`Error: ${product.name} is out of stock.`);
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        if (existing.quantity >= stock) {
          setMessage(`Error: Only ${stock} ${product.name} in stock.`);
          return current;
        }

        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...current, sanitizeCartItem({ ...product, quantity: 1 })].filter(Boolean);
    });
  }

  function updateQty(id, qty) {
    setMessage('');

    const nextQty = normalizeCartQuantity(qty);

    if (nextQty < 1) {
      setCart((current) => current.filter((item) => item.id !== id));
      return;
    }

    setCart((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        const maxStock = Math.max(0, Number(item.stock_quantity) || 0);

        if (maxStock <= 0) return { ...item, quantity: 0 };

        const safeQty = Math.min(nextQty, maxStock);

        if (nextQty > maxStock) {
          setMessage(`Error: Only ${maxStock} ${item.name} in stock.`);
        }

        return { ...item, quantity: safeQty };
      }).filter((item) => item.quantity > 0)
    );
  }

  async function clearCart() {
    if (safeCart.length === 0) return;

    const confirmed = await confirmAction('Clear all products from the cart?');
    if (!confirmed) return;

    setCart([]);
    setMessage('Cart cleared.');
  }

  function resetSaleState() {
    setCustomerMode('guest');
    setCustomer(null);
    setGuestName('');
    setGuestPhone('');
    setSearch('');
    setCategoryFilter('all');
    setCart([]);
    setPaymentMethod('cash');
    setPaymentReference('');
    setSaleNote('');
    setMessage('');
    clearProductPosDraft();
  }

  async function clearSale(options = {}) {
    const skipConfirm = options?.skipConfirm === true;

    if (!skipConfirm && hasSavedDraft) {
      const confirmed = await confirmAction('Reset this POS sale and clear the saved draft?');
      if (!confirmed) return;
    }

    resetSaleState();
  }

  async function insertOrder(orderPayload) {
    const { data, error } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('id')
      .single();

    if (!error) return data;

    const message = String(error.message || '').toLowerCase();
    const shouldFallback =
      message.includes('schema cache') ||
      message.includes('column') ||
      message.includes('payment_status') ||
      message.includes('down_payment_amount') ||
      message.includes('remaining_balance') ||
      message.includes('payment_received') ||
      message.includes('walkin_customer_name') ||
      message.includes('walkin_customer_phone');

    if (!shouldFallback) throw error;

    const fallbackPayload = {
      customer_id: orderPayload.customer_id,
      total_amount: orderPayload.total_amount,
      status: 'completed',
      is_walkin: true,
      created_by: orderPayload.created_by,
      notes: orderPayload.notes,
    };

    const retry = await supabase
      .from('orders')
      .insert(fallbackPayload)
      .select('id')
      .single();

    if (retry.error) throw retry.error;

    return retry.data;
  }

  async function markOrderPaid(
    orderId,
    receiptNumber = null,
    cleanPaymentMethod = paymentMethod,
    cleanPaymentReference = paymentReference
  ) {
    const now = new Date().toISOString();
    const safePaymentMethod = normalizePaymentMethod(cleanPaymentMethod);
    const safePaymentReference = sanitizeReference(cleanPaymentReference);

    const payload = {
      status: 'completed',
      payment_status: 'paid',
      payment_method: safePaymentMethod,
      payment_reference: safePaymentReference || receiptNumber || null,
      down_payment_amount: cartTotal,
      remaining_balance: 0,
      payment_received: true,
      payment_received_at: now,
      payment_received_by: staffId || null,
      paid_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from('orders').update(payload).eq('id', orderId);

    if (!error) return;

    const message = String(error.message || '').toLowerCase();

    if (
      message.includes('schema cache') ||
      message.includes('column') ||
      message.includes('payment_status') ||
      message.includes('down_payment_amount') ||
      message.includes('remaining_balance') ||
      message.includes('payment_received')
    ) {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
      return;
    }

    throw error;
  }

  async function handleCheckout() {
    const cleanCustomerMode = customerMode === 'registered' ? 'registered' : 'guest';
    const cleanGuestName = sanitizeName(guestName);
    const cleanGuestPhone = sanitizePhone(guestPhone);
    const cleanPaymentMethod = normalizePaymentMethod(paymentMethod);
    const cleanPaymentReference = sanitizeReference(paymentReference);
    const cleanSaleNote = sanitizeNote(saleNote);
    const checkoutCart = normalizeCart(safeCart).map((item) => {
      const latestProduct = products.find((product) => product.id === item.id) || item;
      const latestStock = Math.max(0, Number(latestProduct.stock_quantity) || 0);

      return {
        ...item,
        price: Math.max(0, Number(latestProduct.price ?? item.price) || 0),
        stock_quantity: latestStock,
        quantity: Math.min(item.quantity, latestStock),
      };
    }).filter((item) => item.quantity > 0);

    const checkoutTotal = checkoutCart.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
      0
    );

    if (cleanCustomerMode === 'registered' && !customer) {
      setMessage('Error: Select an existing registered customer, or switch to Guest Customer.');
      return;
    }

    if (cleanCustomerMode === 'guest' && !cleanGuestName) {
      setMessage('Error: Enter the guest customer name.');
      return;
    }

    if (cleanCustomerMode === 'guest' && !isValidOptionalPhone(cleanGuestPhone)) {
      setMessage('Error: Guest phone must be 11 digits and start with 09.');
      return;
    }

    if (checkoutCart.length === 0) {
      setMessage('Error: Cart is empty or selected products are out of stock.');
      return;
    }

    if (checkoutTotal <= 0) {
      setMessage('Error: Sale total must be greater than ₱0.00.');
      return;
    }

    if (cleanPaymentMethod === 'gcash' && !cleanPaymentReference) {
      setMessage('Error: Enter the GCash reference number before completing the sale.');
      return;
    }

    const saleCustomerName = getSaleCustomerName({
      customerMode: cleanCustomerMode,
      customer,
      guestName: cleanGuestName,
    });

    const confirmed = await confirmAction(
      buildSaleSummary({
        customerName: saleCustomerName,
        cartItems: checkoutCart,
        paymentMethod: cleanPaymentMethod,
        paymentReference: cleanPaymentReference,
        cartTotal: checkoutTotal,
      })
    );

    if (!confirmed) return;

    setSubmitting(true);
    setMessage('');

    try {
      const now = new Date().toISOString();

      const orderNotes = [
        'PRODUCT COUNTER SALE',
        'Payment collected immediately at staff POS',
        `Customer Type: ${cleanCustomerMode === 'guest' ? 'Guest Counter Sale' : 'Registered Customer'}`,
        cleanCustomerMode === 'guest' ? `Guest Name: ${cleanGuestName}` : null,
        cleanCustomerMode === 'guest' && cleanGuestPhone ? `Guest Phone: ${cleanGuestPhone}` : null,
        `Payment Method: ${cleanPaymentMethod === 'gcash' ? 'GCash Manual' : 'Cash'}`,
        cleanPaymentReference ? `Reference: ${cleanPaymentReference}` : null,
        cleanSaleNote ? `Staff Note: ${cleanSaleNote}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const order = await insertOrder({
        customer_id: cleanCustomerMode === 'registered' ? customer.id : null,
        walkin_customer_name: cleanCustomerMode === 'guest' ? cleanGuestName : null,
        walkin_customer_phone: cleanCustomerMode === 'guest' ? cleanGuestPhone || null : null,
        total_amount: checkoutTotal,
        status: 'completed',
        is_walkin: true,
        created_by: staffId,
        payment_status: 'paid',
        payment_method: cleanPaymentMethod,
        payment_reference: cleanPaymentReference || null,
        down_payment_amount: checkoutTotal,
        remaining_balance: 0,
        payment_received: true,
        payment_received_at: now,
        payment_received_by: staffId || null,
        paid_at: now,
        notes: orderNotes,
      });

      const orderItems = checkoutCart.map((item) => ({
        order_id: order.id,
        part_id: item.id,
        quantity: item.quantity,
        unit_price: Number(item.price) || 0,
        subtotal: (Number(item.price) || 0) * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

      if (itemsError) throw itemsError;

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: order.id,
          amount: checkoutTotal,
          payment_type: 'full',
          method: cleanPaymentMethod,
          processed_by: staffId || null,
          notes:
            cleanPaymentMethod === 'gcash'
              ? `GCash reference: ${cleanPaymentReference}`
              : 'Cash payment collected at product counter POS',
        })
        .select('id, receipt_number, receipt_issued_at, created_at')
        .single();

      if (paymentError) throw paymentError;

      for (const item of checkoutCart) {
        await adjustPartStock({
          partId: item.id,
          movementType: 'sold_order',
          quantity: item.quantity,
          reason: 'Product sold through staff counter POS',
          relatedOrderId: order.id,
        });
      }

      await markOrderPaid(order.id, payment?.receipt_number || null, cleanPaymentMethod, cleanPaymentReference);

      await supabase.from('audit_logs').insert({
        action: 'COMPLETE_PRODUCT_COUNTER_SALE',
        entity: 'orders',
        entity_id: order.id,
        performed_by: staffId,
        details: {
          customer_id: cleanCustomerMode === 'registered' ? customer.id : null,
          customer_name: saleCustomerName,
          customer_type: cleanCustomerMode,
          total: checkoutTotal,
          payment_method: cleanPaymentMethod,
          payment_reference: cleanPaymentReference || null,
          receipt_number: payment?.receipt_number || null,
          items: checkoutCart.map((item) => ({
            product_id: item.id,
            name: item.name,
            quantity: item.quantity,
            unit_price: Number(item.price) || 0,
            subtotal: (Number(item.price) || 0) * item.quantity,
          })),
        },
      });

      const receiptNumber = payment?.receipt_number || createReceiptNumberFallback(order.id);

      await createReceiptHistory({
        receiptNumber,
        sourceType: 'product_counter_sale',
        sourceId: order.id,
        paymentTable: 'payments',
        paymentId: payment?.id || null,

        customerId: cleanCustomerMode === 'registered' ? customer.id : null,
        customerName: saleCustomerName,
        customerPhone:
          cleanCustomerMode === 'guest'
            ? cleanGuestPhone || null
            : customer?.phone || customer?.contact_number || customer?.mobile_number || null,
        customerEmail: cleanCustomerMode === 'registered' ? customer?.email || null : null,

        paymentMethod: cleanPaymentMethod === 'gcash' ? 'GCash Manual' : 'Cash',
        paymentReference: cleanPaymentReference || payment?.receipt_number || receiptNumber,

        subtotal: checkoutTotal,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: checkoutTotal,
        amountPaid: checkoutTotal,
        balanceAmount: 0,

        status: 'issued',
        notes: cleanSaleNote || 'Product counter sale',
        issuedBy: staffId || null,
        issuedAt: payment?.receipt_issued_at || payment?.created_at || now,

        items: checkoutCart.map((item) => ({
          item_type: 'product',
          item_name: item.name,
          description: 'Product counter sale',
          quantity: item.quantity,
          unit_price: Number(item.price) || 0,
          line_total: (Number(item.price) || 0) * item.quantity,
          related_part_id: item.id,
        })),

        metadata: {
          transaction_type: 'product_counter_sale',
          order_id: order.id,
          payment_id: payment?.id || null,
          customer_type: cleanCustomerMode,
          payment_method: cleanPaymentMethod,
          payment_reference: cleanPaymentReference || null,
          cart: checkoutCart.map((item) => ({
            product_id: item.id,
            name: item.name,
            quantity: item.quantity,
            unit_price: Number(item.price) || 0,
            subtotal: (Number(item.price) || 0) * item.quantity,
          })),
        },
      });

      onReceipt?.({
        customerName: saleCustomerName,
        customerPhone:
          cleanCustomerMode === 'guest'
            ? cleanGuestPhone || '—'
            : customer?.phone ||
              customer?.contact_number ||
              customer?.mobile_number ||
              '—',
        customerEmail:
          cleanCustomerMode === 'registered'
            ? customer?.email || '—'
            : '—',
        type: 'product_counter_sale',
        sourceLabel: 'Product Counter Sale',
        transactionLabel: 'Product Counter Sale',
        paymentType: 'full',
        paymentReference:
          cleanPaymentReference ||
          payment?.receipt_number ||
          receiptNumber,
        items: checkoutCart.map((item) => {
          const quantity = Math.max(1, Number(item.quantity) || 1);
          const unitPrice = Number(item.price) || 0;
          const lineTotal = unitPrice * quantity;

          return {
            label: item.name || 'Product',
            description: item.category || 'Product',
            quantity,
            unitPrice,
            lineTotal,
            amount: lineTotal,
          };
        }),
        subtotal: checkoutTotal,
        discountAmount: 0,
        taxAmount: 0,
        total: checkoutTotal,
        amountPaid: checkoutTotal,
        balance: 0,
        status: 'paid',
        paymentMethod:
          cleanPaymentMethod === 'gcash'
            ? 'GCash Manual'
            : 'Cash',
        receiptNumber,
        issuedAt:
          payment?.receipt_issued_at ||
          payment?.created_at ||
          now,
        referenceId: order.id.slice(0, 8).toUpperCase(),
        orderId: order.id,
        notes: cleanSaleNote || 'Product counter sale.',
      });

      setMessage(`Sale completed. Receipt ${receiptNumber} generated.`);
      clearSale({ skipConfirm: true });
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to complete sale.'}`);
    } finally {
      setSubmitting(false);
    }
  }

  const hasSavedDraft =
    customer ||
    customerMode !== 'guest' ||
    guestName.trim() ||
    guestPhone.trim() ||
    search.trim() ||
    categoryFilter !== 'all' ||
    safeCart.length > 0 ||
    paymentMethod !== 'cash' ||
    paymentReference.trim() ||
    saleNote.trim();

  return (
    <div>
      <Banner message={message} />

      {hasSavedDraft && (
        <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-primary-200 bg-primary-50 p-4 text-primary-800 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">Product sale draft auto-saved</p>
            <p className="mt-1 text-xs font-semibold">
              This POS sale will stay even if you change tabs or refresh the page.
            </p>
          </div>

          <button
            type="button"
            onClick={clearSale}
            className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-200 transition hover:bg-primary-100 dark:bg-dark-800 dark:text-primary-300 dark:ring-primary-500/25"
          >
            Clear Draft
          </button>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Cart Lines" value={safeCart.length} icon="🛒" tone="primary" />
        <StatCard label="Quantity" value={cartQuantity} icon="📦" tone="green" />
        <StatCard label="Payment" value={paymentMethod === 'gcash' ? 'GCash' : 'Cash'} icon="💵" tone="yellow" />
        <StatCard label="Total" value={formatPeso(cartTotal)} icon="💰" tone="accent" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <Section>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                  Easy Product POS
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Tap products, choose customer type, collect payment, then complete sale.
                </p>
              </div>

              <button
                type="button"
                onClick={() => fetchProducts(false)}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
              >
                Refresh Products
              </button>
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
                🔍
              </span>
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(sanitizeSearch(event.target.value))}
                placeholder="Search product, category, or motorcycle model..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {categories.map((category) => {
                const active = categoryFilter === category;

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCategoryFilter(category)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                      active
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                    }`}
                  >
                    {category === 'all' ? 'All Products' : category}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                  Product List
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {filteredProducts.length} available product(s)
                </p>
              </div>
            </div>

            {loadingProducts ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-28 animate-pulse rounded-3xl bg-gray-100 dark:bg-dark-900"
                  />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-dark-700 dark:bg-dark-900/70">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
                  🔍
                </div>
                <p className="text-sm font-black text-gray-950 dark:text-white">
                  No products found
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Try another search or category.
                </p>
              </div>
            ) : (
              <div className="grid max-h-[660px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {filteredProducts.map((product) => {
                  const stock = Number(product.stock_quantity) || 0;
                  const inCart = getCartQuantity(product.id);
                  const remaining = Math.max(stock - inCart, 0);
                  const canAdd = canAddProduct(product);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={!canAdd}
                      className={`group flex items-center gap-3 rounded-3xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        inCart > 0
                          ? 'border-primary-300 bg-primary-50 dark:border-primary-500/30 dark:bg-primary-500/10'
                          : 'border-gray-200 bg-gray-50 hover:border-primary-400 hover:bg-primary-50 dark:border-dark-700 dark:bg-dark-900 dark:hover:border-primary-500 dark:hover:bg-primary-500/10'
                      }`}
                    >
                      <ProductImage product={product} />

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-black text-gray-950 group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-400">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {product.category || 'General'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-accent-600 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700">
                            {formatPeso(product.price)}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${
                              remaining <= 0
                                ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25'
                                : remaining <= 5
                                  ? 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25'
                                  : 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
                            }`}
                          >
                            {remaining} left
                          </span>
                          {inCart > 0 && (
                            <span className="rounded-full bg-primary-600 px-2.5 py-1 text-[11px] font-black text-white">
                              {inCart} in cart
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary-600 text-lg font-black text-white shadow-lg shadow-primary-600/20">
                        +
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section>
            <div className="mb-4">
              <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                Customer Type
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use Guest Customer for fast counter sales. Use Registered only for existing customer accounts.
              </p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-3xl bg-gray-100 p-2 dark:bg-dark-900">
              {[
                { id: 'guest', label: 'Guest Customer' },
                { id: 'registered', label: 'Registered Customer' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setCustomerMode(mode.id);
                    setMessage('');
                  }}
                  className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                    customerMode === mode.id
                      ? 'bg-white text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-400'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {customerMode === 'guest' ? (
              <div className="grid gap-3">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(sanitizeName(event.target.value))}
                  placeholder="Guest customer name"
                  maxLength={80}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                />

                <input
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(sanitizePhone(event.target.value))}
                  placeholder="Phone optional, 09XXXXXXXXX"
                  inputMode="numeric"
                  maxLength={11}
                  pattern="09[0-9]{9}"
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                />

                <p className="rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-semibold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-200 dark:ring-yellow-500/25">
                  Guest sales are for fast counter transactions. Registered Customer is only for existing accounts created by Admin or Super Admin.
                </p>
              </div>
            ) : (
              <CustomerPicker selected={customer} onSelect={setCustomer} />
            )}
          </Section>

          <Section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                  Cart
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {cartQuantity} product(s) selected
                </p>
              </div>

              {safeCart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {safeCart.length === 0 ? (
              <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 py-10 text-gray-500 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                <span className="mb-3 text-5xl">🛒</span>
                <p className="text-sm font-semibold">
                  Tap products from the list to add them here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {safeCart.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900"
                  >
                    <div className="flex items-start gap-3">
                      <ProductImage product={item} />

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-black text-gray-950 dark:text-white">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatPeso(item.price)} each · {item.stock_quantity} stock
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateQty(item.id, 0)}
                        className="rounded-xl bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.quantity - 1)}
                          className="grid h-10 w-10 place-items-center rounded-2xl border border-gray-200 bg-white text-lg font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
                        >
                          −
                        </button>

                        <input
                          type="number"
                          min="1"
                          max={Number(item.stock_quantity) || 1}
                          value={item.quantity}
                          onChange={(event) => updateQty(item.id, Number(event.target.value))}
                          className="h-10 w-16 rounded-2xl border border-gray-200 bg-white text-center text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                        />

                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.quantity + 1)}
                          disabled={item.quantity >= Number(item.stock_quantity)}
                          className="grid h-10 w-10 place-items-center rounded-2xl border border-gray-200 bg-white text-lg font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
                        >
                          +
                        </button>
                      </div>

                      <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                        {formatPeso((Number(item.price) || 0) * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}

                <div className="rounded-3xl border border-primary-100 bg-primary-50 p-4 dark:border-primary-500/25 dark:bg-primary-500/10">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-primary-800 dark:text-primary-200">
                      Total
                    </span>
                    <span className="text-3xl font-black text-primary-700 dark:text-primary-300">
                      {formatPeso(cartTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section>
            <p className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Payment
            </p>

            <PaymentMethodPicker value={paymentMethod} onChange={(value) => setPaymentMethod(normalizePaymentMethod(value))} />

            {paymentMethod === 'gcash' && (
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(sanitizeReference(event.target.value))}
                placeholder="GCash reference number"
                className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />
            )}

            <textarea
              value={saleNote}
              onChange={(event) => setSaleNote(sanitizeNote(event.target.value))}
              rows={3}
              placeholder="Optional staff note..."
              className="mt-3 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />
          </Section>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={submitting || safeCart.length === 0}
            className="w-full rounded-3xl bg-primary-600 py-5 text-base font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting
              ? 'Completing Sale...'
              : `✅ Complete Sale · ${formatPeso(cartTotal)}`}
          </button>

          <button
            type="button"
            onClick={clearSale}
            disabled={submitting}
            className="w-full rounded-3xl border border-gray-200 bg-white py-4 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
          >
            Reset POS
          </button>
        </div>
      </div>
    </div>
  );
}