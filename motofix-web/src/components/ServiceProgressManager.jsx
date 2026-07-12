// Place this file at:
// motofix-web/src/components/ServiceProgressManager.jsx
//
// Simple service progress manager.
// Includes:
// - progress bar only, no slider
// - service progress status buttons
// - add products used during scheduled service
// - deducts stock automatically when products are added as used
// - restores deducted products when the appointment is cancelled

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { adjustPartStock } from '../lib/inventory';
import {
  generateOrSyncBookingInvoice,
  getInvoiceForBooking,
} from '../lib/invoices';

const STATUS_STEPS = [
  {
    id: 'confirmed',
    label: 'Confirmed',
    percent: 25,
    icon: '✅',
    description: 'The service booking has been confirmed.',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    percent: 40,
    icon: '🔧',
    description: 'The motorcycle service has started.',
  },
  {
    id: 'inspection',
    label: 'Inspection',
    percent: 50,
    icon: '🔍',
    description: 'The motorcycle is being inspected.',
  },
  {
    id: 'repairing',
    label: 'Repairing',
    percent: 70,
    icon: '🛠️',
    description: 'The motorcycle is currently being repaired.',
  },
  {
    id: 'quality_check',
    label: 'Quality Check',
    percent: 85,
    icon: '☑️',
    description: 'The service is being checked before release.',
  },
  {
    id: 'ready_for_pickup',
    label: 'Ready for Pickup',
    percent: 95,
    icon: '🏁',
    description: 'The motorcycle is ready for pickup.',
  },
  {
    id: 'completed',
    label: 'Completed',
    percent: 100,
    icon: '🎉',
    description: 'The service booking has been completed.',
  },
];

const DEFAULT_PROGRESS_BY_STATUS = {
  pending: 10,
  confirmed: 25,
  in_progress: 40,
  inspection: 50,
  repairing: 70,
  quality_check: 85,
  ready_for_pickup: 95,
  completed: 100,
  cancelled: 0,
  rejected: 0,
  no_show: 0,
};

function getStatusLabel(status) {
  return String(status || 'pending')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStepPercent(status) {
  return DEFAULT_PROGRESS_BY_STATUS[String(status || '').toLowerCase()] ?? 10;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function safeText(value) {
  return String(value || '').toLowerCase().trim();
}

function getLatestProgress(events, bookingStatus) {
  const latestEvent = events?.length ? events[events.length - 1] : null;

  return clampPercent(
    latestEvent?.progress_percent ||
      getStepPercent(bookingStatus)
  );
}

function normalizePartsUsed(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getInitialPartsUsed(booking) {
  const partsUsed = normalizePartsUsed(booking?.parts_used);
  if (partsUsed.length > 0) return partsUsed;

  return normalizePartsUsed(booking?.products);
}

function getServiceLineTotal(service) {
  const quantity = Math.max(1, Number(service?.quantity) || 1);
  const basePrice =
    Number(service?.base_price ?? service?.services?.base_price) || 0;
  const laborCost =
    Number(service?.labor_cost ?? service?.services?.labor_cost) || 0;

  return (basePrice + laborCost) * quantity;
}

function getServiceTotal(booking) {
  const savedServiceTotal = Number(booking?.service_total);

  if (Number.isFinite(savedServiceTotal) && savedServiceTotal > 0) {
    return savedServiceTotal;
  }

  const existingPartsTotal =
    Number(booking?.parts_total ?? booking?.product_total) || 0;
  const savedTotal = Number(booking?.total_amount);

  if (
    Number.isFinite(savedTotal) &&
    savedTotal > 0 &&
    savedTotal >= existingPartsTotal
  ) {
    return savedTotal - existingPartsTotal;
  }

  const selectedServices = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (selectedServices.length > 0) {
    return selectedServices.reduce(
      (sum, service) => sum + getServiceLineTotal(service),
      0
    );
  }

  return getServiceLineTotal(booking?.services);
}

function getPartLineTotal(item) {
  return (Number(item?.unit_price ?? item?.price) || 0) * (Number(item?.quantity) || 1);
}

function getProductsTotal(products = []) {
  return products.reduce((sum, item) => sum + getPartLineTotal(item), 0);
}

function makePartPayload(part, quantity = 1, stockDeducted = true) {
  const qty = Math.max(1, Number(quantity) || 1);
  const price = Number(part.price ?? part.unit_price) || 0;

  return {
    line_id: `${part.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    id: part.id,
    part_id: part.part_id || part.id,
    name: part.name || 'Product',
    category: part.category || 'General',
    quantity: qty,
    unit_price: price,
    price,
    subtotal: price * qty,
    stock_deducted: stockDeducted,
  };
}

function normalizePartLine(item) {
  const qty = Math.max(1, Number(item?.quantity) || 1);
  const price = Number(item?.unit_price ?? item?.price) || 0;

  return {
    ...item,
    line_id: item.line_id || `${item.id || item.part_id}-${Math.random().toString(36).slice(2, 9)}`,
    id: item.id || item.part_id,
    part_id: item.part_id || item.id,
    name: item.name || 'Product',
    category: item.category || 'General',
    quantity: qty,
    unit_price: price,
    price,
    subtotal: price * qty,
    stock_deducted: item.stock_deducted === true,
  };
}

function ProductImage({ product }) {
  if (product?.image_url) {
    return (
      <img
        src={product.image_url}
        alt={product.name || 'Product'}
        className="h-12 w-12 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700"
      />
    );
  }

  return (
    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-xl ring-1 ring-gray-200 dark:bg-dark-900 dark:ring-dark-700">
      📦
    </div>
  );
}

export default function ServiceProgressManager({ booking, onUpdated, compact = false }) {
  const [events, setEvents] = useState([]);
  const [products, setProducts] = useState([]);
  const [partsUsed, setPartsUsed] = useState(() =>
    getInitialPartsUsed(booking).map(normalizePartLine)
  );

  const [partSearch, setPartSearch] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState('');
  const [savingPart, setSavingPart] = useState('');
  const [message, setMessage] = useState('');

  const bookingId = booking?.id;
  const serviceTotal = getServiceTotal(booking);
  const productsTotal = getProductsTotal(partsUsed);
  const totalBill = serviceTotal + productsTotal;
  const hasDeductedParts = partsUsed.some((item) => item.stock_deducted === true);

  useEffect(() => {
    setPartsUsed(getInitialPartsUsed(booking).map(normalizePartLine));
  }, [booking?.id, booking?.parts_used, booking?.products]);

  useEffect(() => {
    if (!bookingId) return;

    fetchEvents();
    fetchProducts();

    const channel = supabase
      .channel(`simple-service-progress-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_progress_events',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => fetchEvents(false)
      )
      .subscribe();

    const productsChannel = supabase
      .channel('service-progress-products')
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

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(productsChannel);
    };
  }, [bookingId]);

  async function fetchEvents(showLoader = true) {
    if (!bookingId) return;

    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('service_progress_events')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (error) {
      setMessage(`Error: ${error.message || 'Failed to load progress events.'}`);
      setEvents([]);
    } else {
      setMessage('');
      setEvents(data || []);
    }

    setLoading(false);
  }

  async function fetchProducts(showLoader = true) {
    if (showLoader) setProductsLoading(true);

    const { data, error } = await supabase
      .from('parts')
      .select('id, name, category, image_url, price, stock_quantity, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(500);

    if (error) {
      console.warn('Failed to load products:', error.message);
      setProducts([]);
    } else {
      setProducts(data || []);
    }

    setProductsLoading(false);
  }

  const currentProgress = useMemo(
    () => getLatestProgress(events, booking?.status),
    [events, booking?.status]
  );

  const currentStatus = String(booking?.status || 'pending').toLowerCase();


  useEffect(() => {
    if (!bookingId || !booking?.customer_id) return;
    if (savingPart) return;
    if (['cancelled', 'rejected', 'no_show'].includes(currentStatus)) return;

    const hasLegacyUndeductedProduct = partsUsed.some(
      (item) => item.stock_deducted !== true && (item.id || item.part_id)
    );

    if (!hasLegacyUndeductedProduct) return;

    autoSyncUndeductedProducts();
  }, [bookingId, booking?.customer_id, currentStatus, partsUsed.length]);

  const filteredProducts = useMemo(() => {
    const query = safeText(partSearch);

    if (!query) return products.slice(0, 8);

    return products
      .filter((part) => {
        const haystack = [
          part.name,
          part.category,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice(0, 12);
  }, [products, partSearch]);

  function requireCustomerId() {
    if (booking?.customer_id) return booking.customer_id;

    throw new Error(
      'This booking has no customer_id. Service progress is only for registered scheduled bookings. Walk-ins should be processed in the Walk-in Queue.'
    );
  }

  async function getCurrentUserId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  }

  async function updateBookingProducts(nextProducts, extraPayload = {}) {
    const normalized = nextProducts.map(normalizePartLine);
    const nextProductsTotal = getProductsTotal(normalized);
    const nextTotal = serviceTotal + nextProductsTotal;
    const now = new Date().toISOString();

    const payload = {
      parts_used: normalized,
      products: normalized,
      service_total: serviceTotal,
      parts_total: nextProductsTotal,
      product_total: nextProductsTotal,
      total_amount: nextTotal,
      updated_at: now,
      ...extraPayload,
    };

    let updateResult = await supabase
      .from('bookings')
      .update(payload)
      .eq('id', bookingId);

    // Older databases may not have service_total yet. Keep the financial
    // synchronization working by retrying without that optional column.
    if (
      updateResult.error &&
      String(updateResult.error.message || '')
        .toLowerCase()
        .includes('service_total')
    ) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.service_total;

      updateResult = await supabase
        .from('bookings')
        .update(fallbackPayload)
        .eq('id', bookingId);
    }

    if (updateResult.error) {
      const errorMessage = String(
        updateResult.error.message || ''
      ).toLowerCase();

      if (
        errorMessage.includes('schema cache') ||
        errorMessage.includes('column') ||
        errorMessage.includes('parts_used') ||
        errorMessage.includes('products') ||
        errorMessage.includes('parts_total') ||
        errorMessage.includes('product_total') ||
        errorMessage.includes('parts_stock_deducted_at')
      ) {
        throw new Error(
          'Missing booking inventory columns. Run the inventory_restore_tracking_cancel_flags.sql file first.'
        );
      }

      throw updateResult.error;
    }

    setPartsUsed(normalized);

    let invoice = null;
    let invoiceSyncWarning = '';

    try {
      await generateOrSyncBookingInvoice({ bookingId });
      invoice = await getInvoiceForBooking(bookingId);
    } catch (invoiceError) {
      console.warn(
        'Booking totals changed, but invoice synchronization failed:',
        invoiceError
      );
      invoiceSyncWarning =
        ' Booking total changed, but the invoice could not be synchronized.';
    }

    const amountPaid = Number(invoice?.amount_paid);
    const balanceDue = Number(invoice?.balance_due);

    await supabase.from('audit_logs').insert({
      action: 'SYNC_BOOKING_PARTS_FINANCIALS',
      entity: 'bookings',
      entity_id: bookingId,
      performed_by: await getCurrentUserId(),
      details: {
        service_total: serviceTotal,
        parts_total: nextProductsTotal,
        total_amount: nextTotal,
        amount_paid: Number.isFinite(amountPaid) ? amountPaid : null,
        remaining_balance: Number.isFinite(balanceDue) ? balanceDue : null,
        invoice_status: invoice?.status || null,
        synchronized_at: now,
      },
    });

    if (typeof onUpdated === 'function') {
      await onUpdated();
    }

    return {
      serviceTotal,
      partsTotal: nextProductsTotal,
      totalAmount: nextTotal,
      amountPaid: Number.isFinite(amountPaid) ? amountPaid : null,
      balanceDue: Number.isFinite(balanceDue) ? balanceDue : null,
      invoiceStatus: invoice?.status || null,
      invoiceSyncWarning,
    };
  }

  async function insertProgressEvent(step) {
    const cleanNote = note.trim();
    const customerId = requireCustomerId();

    const basePayload = {
      booking_id: bookingId,
      customer_id: customerId,
      mechanic_id: booking?.mechanic_id || null,
      service_id: booking?.service_id || null,
      status: step.id,
      title: step.label,
      description: cleanNote || step.description,
      progress_percent: step.percent,
    };

    const { error } = await supabase.from('service_progress_events').insert({
      ...basePayload,
      event_type: 'status_update',
    });

    if (!error) return;

    const message = String(error.message || '').toLowerCase();

    if (
      message.includes('event_type') ||
      message.includes('mechanic_id') ||
      message.includes('service_id') ||
      message.includes('schema cache') ||
      message.includes('column')
    ) {
      const fallback = {
        booking_id: bookingId,
        customer_id: customerId,
        status: step.id,
        title: step.label,
        description: cleanNote || step.description,
        progress_percent: step.percent,
      };

      const retry = await supabase.from('service_progress_events').insert(fallback);
      if (retry.error) throw retry.error;
      return;
    }

    throw error;
  }

  async function updateProgress(step) {
    if (!bookingId || !step?.id) return;

    const confirmed = window.confirm(
      `Update service progress to "${step.label}"?\n\nProgress will be set to ${step.percent}%.`
    );

    if (!confirmed) return;

    setSavingStatus(step.id);
    setMessage('');

    try {
      requireCustomerId();

      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: step.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (bookingError) throw bookingError;

      await insertProgressEvent(step);

      setNote('');
      setMessage(`Progress updated to ${step.label}.`);
      await fetchEvents(false);
      onUpdated?.();
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to update progress.'}`);
    } finally {
      setSavingStatus('');
    }
  }

  async function addPartUsed(part) {
    if (!bookingId || !part?.id) return;

    const confirmed = window.confirm(
      `Add "${part.name}" as product used?\n\nInventory stock will be deducted automatically.`
    );

    if (!confirmed) return;

    setSavingPart(part.id);
    setMessage('');

    try {
      const existingActualIndex = partsUsed.findIndex(
        (item) => item.id === part.id && item.stock_deducted === true
      );

      let nextProducts = [];

      if (existingActualIndex >= 0) {
        nextProducts = partsUsed.map((item, index) => {
          if (index !== existingActualIndex) return item;

          const nextQty = (Number(item.quantity) || 1) + 1;
          const unitPrice = Number(item.unit_price ?? item.price) || 0;

          return {
            ...item,
            quantity: nextQty,
            subtotal: unitPrice * nextQty,
            stock_deducted: true,
          };
        });
      } else {
        nextProducts = [...partsUsed, makePartPayload(part, 1, true)];
      }

      await adjustPartStock({
        partId: part.id,
        movementType: 'stock_out',
        quantity: 1,
        reason: `Product used in scheduled booking ${String(bookingId).slice(0, 8).toUpperCase()}`,
        relatedOrderId: null,
      });

      const financials = await updateBookingProducts(nextProducts, {
        parts_stock_deducted_at:
          booking?.parts_stock_deducted_at || new Date().toISOString(),
      });

      await supabase.from('audit_logs').insert({
        action: 'ADD_BOOKING_PART_USED',
        entity: 'bookings',
        entity_id: bookingId,
        performed_by: await getCurrentUserId(),
        details: {
          part_id: part.id,
          part_name: part.name,
          quantity: 1,
          movement_type: 'stock_out',
        },
      });

      setPartSearch('');
      setMessage(
        `${part.name} added. Total is now ${formatPeso(
          financials.totalAmount
        )}${
          financials.balanceDue !== null
            ? ` · Remaining balance ${formatPeso(financials.balanceDue)}`
            : ''
        }.${financials.invoiceSyncWarning}`
      );
      await fetchProducts(false);
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to add part used.'}`);
    } finally {
      setSavingPart('');
    }
  }


  async function autoSyncUndeductedProducts() {
    if (!bookingId || !booking?.customer_id) return;

    const undeductedLines = partsUsed.filter((item) => item.stock_deducted !== true);
    if (undeductedLines.length === 0) return;

    setSavingPart('auto-sync');
    setMessage('');

    try {
      const nextProducts = [];

      for (const item of partsUsed) {
        if (item.stock_deducted === true) {
          nextProducts.push(item);
          continue;
        }

        const partId = item.id || item.part_id;
        const quantity = Number(item.quantity) || 1;

        if (!partId || quantity <= 0) {
          nextProducts.push({
            ...item,
            stock_deducted: true,
            subtotal: getPartLineTotal(item),
          });
          continue;
        }

        await adjustPartStock({
          partId,
          movementType: 'stock_out',
          quantity,
          reason: `Auto synced product used in scheduled booking ${String(bookingId).slice(0, 8).toUpperCase()}`,
          relatedOrderId: null,
        });

        nextProducts.push({
          ...item,
          stock_deducted: true,
          subtotal: getPartLineTotal(item),
        });
      }

      await updateBookingProducts(nextProducts, {
        parts_stock_deducted_at: booking?.parts_stock_deducted_at || new Date().toISOString(),
      });

      await supabase.from('audit_logs').insert({
        action: 'AUTO_SYNC_BOOKING_PARTS_USED',
        entity: 'bookings',
        entity_id: bookingId,
        performed_by: await getCurrentUserId(),
        details: {
          synced_products: undeductedLines.map((item) => ({
            part_id: item.id || item.part_id,
            name: item.name,
            quantity: Number(item.quantity) || 1,
          })),
          movement_type: 'stock_out',
        },
      });

      await fetchProducts(false);
      setMessage('Products were automatically synced with inventory.');
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to auto-sync products.'}`);
    } finally {
      setSavingPart('');
    }
  }

  async function removePartLine(index) {
    const line = partsUsed[index];
    if (!line) return;

    const quantity = Number(line.quantity) || 1;
    const deducted = line.stock_deducted === true;

    const confirmed = window.confirm(
      deducted
        ? `Remove ${line.name} and return ${quantity} to inventory?`
        : `Remove ${line.name} from the products used list?`
    );

    if (!confirmed) return;

    setSavingPart(line.line_id || line.id);
    setMessage('');

    try {
      if (deducted) {
        await adjustPartStock({
          partId: line.id || line.part_id,
          movementType: 'stock_in',
          quantity,
          reason: `Returned part after removing from booking ${String(bookingId).slice(0, 8).toUpperCase()}`,
          relatedOrderId: null,
        });
      }

      const nextProducts = partsUsed.filter((_, itemIndex) => itemIndex !== index);

      const financials = await updateBookingProducts(nextProducts);

      await fetchProducts(false);
      setMessage(
        `${
          deducted
            ? `${line.name} removed and returned to inventory`
            : `${line.name} removed from products used`
        }. Total is now ${formatPeso(financials.totalAmount)}${
          financials.balanceDue !== null
            ? ` · Remaining balance ${formatPeso(financials.balanceDue)}`
            : ''
        }.${financials.invoiceSyncWarning}`
      );
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to remove part.'}`);
    } finally {
      setSavingPart('');
    }
  }

  async function cancelBookingRestoreInventory() {
    if (!bookingId) return;

    const restorableProducts = partsUsed.filter(
      (item) =>
        item.stock_deducted === true ||
        (booking?.parts_stock_deducted_at && item.stock_deducted !== false)
    );

    const confirmText =
      restorableProducts.length > 0 && !booking?.inventory_restored_at
      ? `Cancel this appointment and return ${restorableProducts.length} deducted product line(s) back to inventory?`
      : 'Cancel this appointment?';

    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    setSavingStatus('cancelled');
    setMessage('');

    try {
      const currentUserId = await getCurrentUserId();

      if (restorableProducts.length > 0 && !booking?.inventory_restored_at) {
        for (const item of restorableProducts) {
          const partId = item.id || item.part_id;
          const quantity = Number(item.quantity) || 0;

          if (!partId || quantity <= 0) continue;

          await adjustPartStock({
            partId,
            movementType: 'stock_in',
            quantity,
            reason: `Returned to inventory after cancelling booking ${String(bookingId).slice(0, 8).toUpperCase()}`,
            relatedOrderId: null,
          });
        }
      }

      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          inventory_restored_at:
            restorableProducts.length > 0 && !booking?.inventory_restored_at
              ? new Date().toISOString()
              : booking?.inventory_restored_at || null,
          inventory_restored_by:
            restorableProducts.length > 0 && !booking?.inventory_restored_at
              ? currentUserId
              : booking?.inventory_restored_by || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (bookingError) throw bookingError;

      try {
        await supabase.from('service_progress_events').insert({
          booking_id: bookingId,
          customer_id: requireCustomerId(),
          status: 'cancelled',
          title: 'Booking Cancelled',
          description:
            restorableProducts.length > 0
              ? 'Booking was cancelled and deducted products were returned to inventory.'
              : 'Booking was cancelled.',
          progress_percent: 0,
          event_type: 'status_update',
        });
      } catch {
        await supabase.from('service_progress_events').insert({
          booking_id: bookingId,
          customer_id: requireCustomerId(),
          status: 'cancelled',
          title: 'Booking Cancelled',
          description:
            restorableProducts.length > 0
              ? 'Booking was cancelled and deducted products were returned to inventory.'
              : 'Booking was cancelled.',
          progress_percent: 0,
        });
      }

      await supabase.from('audit_logs').insert({
        action: 'CANCEL_BOOKING_RESTORE_INVENTORY',
        entity: 'bookings',
        entity_id: bookingId,
        performed_by: currentUserId,
        details: {
          restored_inventory: restorableProducts.length > 0 && !booking?.inventory_restored_at,
          products_returned: restorableProducts,
        },
      });

      setMessage(
        restorableProducts.length > 0 && !booking?.inventory_restored_at
          ? 'Booking cancelled. Deducted products were returned to inventory.'
          : 'Booking cancelled.'
      );

      await fetchEvents(false);
      await fetchProducts(false);
      onUpdated?.();
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to cancel booking.'}`);
    } finally {
      setSavingStatus('');
    }
  }

  if (!bookingId) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        Missing booking record.
      </div>
    );
  }

  return (
    <section
      className={
        compact
          ? ''
          : 'rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800'
      }
    >
      {message && (
        <div
          className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.startsWith('Error')
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
              : 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
          }`}
        >
          {message.replace('Error: ', '')}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
            Service Progress
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Use simple status buttons. Products used can be added during service. Stock is deducted automatically.
          </p>
        </div>

        <div className="rounded-2xl bg-primary-50 px-4 py-2 text-center ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/25">
          <p className="text-[11px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
            Progress
          </p>
          <p className="text-lg font-black text-primary-700 dark:text-primary-300">
            {currentProgress}%
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Current Status
          </p>
          <p className="text-xs font-black text-primary-600 dark:text-primary-400">
            {getStatusLabel(currentStatus)}
          </p>
        </div>

        <div className="h-4 overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200 dark:bg-dark-900 dark:ring-dark-700">
          <div
            className="h-full rounded-full bg-primary-600 transition-all duration-500"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {!booking?.customer_id && (
        <div className="mb-5 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs font-semibold leading-5 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-200">
          This record has no registered customer. Do not use Service Progress for old walk-in booking records.
          Walk-ins should be handled in the Walk-in Queue.
        </div>
      )}

      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_STEPS.map((step) => {
          const active = currentStatus === step.id;
          const done = currentProgress >= step.percent;
          const saving = savingStatus === step.id;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => updateProgress(step)}
              disabled={Boolean(savingStatus) || active || !booking?.customer_id}
              className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/15 dark:border-primary-500/40 dark:bg-primary-500/10'
                  : done
                    ? 'border-green-200 bg-green-50 hover:border-primary-400 dark:border-green-500/25 dark:bg-green-500/10'
                    : 'border-gray-200 bg-gray-50 hover:border-primary-400 hover:bg-white dark:border-dark-700 dark:bg-dark-900 dark:hover:border-primary-500 dark:hover:bg-dark-800'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xl">{step.icon}</span>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-gray-500 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-400 dark:ring-dark-700">
                  {step.percent}%
                </span>
              </div>

              <p className="mt-2 text-sm font-black text-gray-950 dark:text-white">
                {saving ? 'Saving...' : step.label}
              </p>

              <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                {active ? 'Current status' : done ? 'Progress reached' : 'Click to update'}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mb-5 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Products Used
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Add actual products used during the service. Stock is deducted automatically once.
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total Bill
            </p>
            <p className="text-xl font-black text-primary-600 dark:text-primary-400">
              {formatPeso(totalBill)}
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700">
            <p className="text-[11px] font-black uppercase text-gray-500">Service</p>
            <p className="text-sm font-black text-gray-950 dark:text-white">
              {formatPeso(serviceTotal)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-3 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700">
            <p className="text-[11px] font-black uppercase text-gray-500">Products</p>
            <p className="text-sm font-black text-gray-950 dark:text-white">
              {formatPeso(productsTotal)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-3 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700">
            <p className="text-[11px] font-black uppercase text-gray-500">Inventory</p>
            <p className={`text-sm font-black ${hasDeductedParts ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {partsUsed.length > 0 ? 'Auto synced' : 'No products'}
            </p>
          </div>
        </div>

        <input
          value={partSearch}
          onChange={(event) => setPartSearch(event.target.value)}
          placeholder="Search product to add as used..."
          className="mb-3 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
        />

        {productsLoading ? (
          <div className="rounded-2xl bg-white p-4 text-sm font-semibold text-gray-500 dark:bg-dark-800 dark:text-gray-400">
            Loading products...
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="mb-4 grid max-h-72 gap-2 overflow-y-auto">
            {filteredProducts.map((part) => (
              <button
                key={part.id}
                type="button"
                onClick={() => addPartUsed(part)}
                disabled={Boolean(savingPart) || !booking?.customer_id}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-left transition hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:bg-dark-800"
              >
                <ProductImage product={part} />

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-black text-gray-950 dark:text-white">
                    {part.name}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {part.category || 'General'} · {part.stock_quantity} stock
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(part.price)}
                  </p>
                  <p className="text-[11px] font-black text-primary-600 dark:text-primary-400">
                    {savingPart === part.id ? 'Adding...' : '+ Add'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm font-semibold text-gray-500 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
            No products found. Check if the product is active and if the products/parts SELECT policy SQL was already run.
          </div>
        )}

        {partsUsed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm font-semibold text-gray-500 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
            No products used yet.
          </div>
        ) : (
          <div className="space-y-2">
            {partsUsed.map((item, index) => {
              const deducted = item.stock_deducted === true;
              const saving = savingPart === (item.line_id || item.id);

              return (
                <div
                  key={item.line_id || `${item.id}-${index}`}
                  className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-dark-700 dark:bg-dark-800"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-950 dark:text-white">
                        {item.quantity} x {item.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatPeso(item.unit_price ?? item.price)} each · {formatPeso(getPartLineTotal(item))}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ring-1 ${
                          deducted
                            ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
                            : 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25'
                        }`}
                      >
                        {deducted ? 'Stock deducted automatically' : 'Auto syncing inventory'}
                      </span>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removePartLine(index)}
                        className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, 250))}
        rows={3}
        disabled={!booking?.customer_id}
        placeholder="Optional note for the progress update..."
        className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
      />

      <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 dark:border-red-500/25 dark:bg-red-500/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-red-800 dark:text-red-200">
            Cancel Appointment
          </p>
          <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
            If deducted products exist, they will be returned to inventory automatically.
          </p>
        </div>

        <button
          type="button"
          onClick={cancelBookingRestoreInventory}
          disabled={savingStatus === 'cancelled' || currentStatus === 'cancelled'}
          className="rounded-2xl bg-red-600 px-4 py-3 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingStatus === 'cancelled' ? 'Cancelling...' : 'Cancel Booking'}
        </button>
      </div>

      <div className="mt-5">
        <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Recent Updates
        </p>

        {loading ? (
          <div className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-500 dark:bg-dark-900 dark:text-gray-400">
            Loading progress...
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm font-semibold text-gray-500 dark:border-dark-700 dark:bg-dark-900/70 dark:text-gray-400">
            No progress updates yet.
          </div>
        ) : (
          <div className="space-y-2">
            {[...events].reverse().slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-gray-950 dark:text-white">
                    {event.title || getStatusLabel(event.status)}
                  </p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-primary-600 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-primary-300 dark:ring-dark-700">
                    {Number(event.progress_percent) || getStepPercent(event.status)}%
                  </span>
                </div>

                {event.description && (
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {event.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
