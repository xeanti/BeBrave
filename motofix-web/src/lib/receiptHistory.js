import { supabase } from './supabaseClient';

function cleanText(value, fallback = null) {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || fallback;
}

function cleanSourceType(value) {
  const sourceType = cleanText(value, 'order');

  if (
    [
      'booking',
      'order',
      'walkin',
      'service',
      'product_counter_sale',
      'counter_sale',
      'pos_sale',
      'product_sale',
    ].includes(sourceType)
  ) {
    return sourceType;
  }

  return 'order';
}

function toMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.max(0, amount);
}

function toQuantity(value) {
  const quantity = Math.floor(Number(value));

  if (!Number.isFinite(quantity) || quantity < 1) {
    return 1;
  }

  return quantity;
}

function normalizeReceiptItem(item) {
  const quantity = toQuantity(item.quantity);
  const unitPrice = toMoney(item.unit_price ?? item.unitPrice ?? item.price);
  const lineTotal = toMoney(item.line_total ?? item.lineTotal ?? unitPrice * quantity);

  return {
    item_type: cleanText(item.item_type ?? item.itemType, 'other'),
    item_name: cleanText(item.item_name ?? item.itemName ?? item.name ?? item.label, 'MotoFix Item'),
    description: cleanText(item.description, null),
    quantity,
    unit_price: unitPrice,
    line_total: lineTotal,
    related_service_id: item.related_service_id ?? item.relatedServiceId ?? null,
    related_part_id: item.related_part_id ?? item.relatedPartId ?? item.part_id ?? item.product_id ?? null,
  };
}

async function findExistingReceipt({ receiptNumber, paymentTable, paymentId }) {
  if (paymentTable && paymentId) {
    const { data, error } = await supabase
      .from('receipts')
      .select('id, receipt_number')
      .eq('payment_table', paymentTable)
      .eq('payment_id', paymentId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (receiptNumber) {
    const { data, error } = await supabase
      .from('receipts')
      .select('id, receipt_number')
      .eq('receipt_number', receiptNumber)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

async function insertReceipt(payload, allowReceiptNumber = true) {
  const receiptPayload = {
    source_type: cleanSourceType(payload.sourceType),
    source_id: payload.sourceId,
    payment_table: payload.paymentTable || null,
    payment_id: payload.paymentId || null,
    customer_id: payload.customerId || null,
    customer_name: cleanText(payload.customerName, 'Walk-in Customer'),
    customer_phone: cleanText(payload.customerPhone, null),
    customer_email: cleanText(payload.customerEmail, null),
    payment_method: cleanText(payload.paymentMethod, 'Cash'),
    payment_reference: cleanText(payload.paymentReference, null),
    subtotal: toMoney(payload.subtotal ?? payload.totalAmount),
    discount_amount: toMoney(payload.discountAmount),
    tax_amount: toMoney(payload.taxAmount),
    total_amount: toMoney(payload.totalAmount),
    amount_paid: toMoney(payload.amountPaid ?? payload.totalAmount),
    balance_amount: toMoney(payload.balanceAmount),
    status: cleanText(payload.status, 'issued'),
    notes: cleanText(payload.notes, null),
    metadata: payload.metadata || {},
    issued_by: payload.issuedBy || null,
    issued_at: payload.issuedAt || new Date().toISOString(),
  };

  if (allowReceiptNumber && payload.receiptNumber) {
    receiptPayload.receipt_number = cleanText(payload.receiptNumber, null);
  }

  return supabase
    .from('receipts')
    .insert(receiptPayload)
    .select('id, receipt_number')
    .single();
}

export async function createReceiptHistory(payload) {
  const receiptNumber = cleanText(payload.receiptNumber, null);
  const paymentTable = cleanText(payload.paymentTable, null);
  const paymentId = payload.paymentId || null;

  const existing = await findExistingReceipt({
    receiptNumber,
    paymentTable,
    paymentId,
  });

  if (existing) {
    return existing;
  }

  let receiptResult = await insertReceipt(
    {
      ...payload,
      receiptNumber,
      paymentTable,
      paymentId,
    },
    true
  );

  if (receiptResult.error) {
    const message = String(receiptResult.error.message || '').toLowerCase();

    if (
      message.includes('duplicate') ||
      message.includes('receipts_receipt_number') ||
      message.includes('unique')
    ) {
      receiptResult = await insertReceipt(
        {
          ...payload,
          receiptNumber: null,
          paymentTable,
          paymentId,
        },
        false
      );
    }
  }

  if (receiptResult.error) {
    throw receiptResult.error;
  }

  const receipt = receiptResult.data;
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeReceiptItem) : [];

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from('receipt_items').insert(
      items.map((item) => ({
        ...item,
        receipt_id: receipt.id,
      }))
    );

    if (itemsError) {
      throw itemsError;
    }
  }

  return receipt;
}
