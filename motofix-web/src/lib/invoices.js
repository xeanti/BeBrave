import { supabase } from './supabaseClient';

export const INVOICE_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
};

function toNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

export function calculatePaymentTotal(payments = []) {
  return roundMoney(
    payments.reduce((sum, payment) => {
      const amount = toNumber(payment.amount);

      return payment.payment_type === 'refund' ? sum - amount : sum + amount;
    }, 0)
  );
}

export function getInvoiceStatus({
  totalAmount = 0,
  amountPaid = 0,
  hasRefund = false,
}) {
  const total = roundMoney(totalAmount);
  const paid = roundMoney(amountPaid);

  if (hasRefund && paid <= 0) return INVOICE_STATUS.REFUNDED;
  if (total <= 0) return INVOICE_STATUS.PAID;
  if (paid <= 0) return INVOICE_STATUS.UNPAID;
  if (paid < total) return INVOICE_STATUS.PARTIAL;

  return INVOICE_STATUS.PAID;
}

export function calculateInvoiceTotals({ totalAmount = 0, payments = [] }) {
  const total = roundMoney(totalAmount);
  const amountPaid = calculatePaymentTotal(payments);
  const balanceDue = roundMoney(Math.max(total - amountPaid, 0));
  const hasRefund = payments.some((payment) => payment.payment_type === 'refund');

  return {
    totalAmount: total,
    amountPaid,
    balanceDue,
    status: getInvoiceStatus({
      totalAmount: total,
      amountPaid,
      hasRefund,
    }),
  };
}

export async function fetchPaymentsForInvoice({
  orderId = null,
  bookingId = null,
}) {
  if (!orderId && !bookingId) {
    throw new Error('Order ID or booking ID is required to fetch invoice payments.');
  }

  let query = supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: true });

  if (orderId) query = query.eq('order_id', orderId);
  if (bookingId) query = query.eq('booking_id', bookingId);

  const { data, error } = await query;

  if (error) throw error;

  return data || [];
}

export async function getInvoiceById(invoiceId) {
  if (!invoiceId) throw new Error('Invoice ID is required.');

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function getInvoiceForOrder(orderId) {
  if (!orderId) throw new Error('Order ID is required.');

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function getInvoiceForBooking(bookingId) {
  if (!bookingId) throw new Error('Booking ID is required.');

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function getInvoiceForRecord({
  orderId = null,
  bookingId = null,
}) {
  if (orderId) return getInvoiceForOrder(orderId);
  if (bookingId) return getInvoiceForBooking(bookingId);

  throw new Error('Order ID or booking ID is required.');
}

export async function generateOrSyncOrderInvoice({
  orderId,
  dueDate = null,
  notes = null,
} = {}) {
  if (!orderId) throw new Error('Order ID is required.');

  const { data, error } = await supabase.rpc('generate_or_sync_invoice', {
    p_order_id: orderId,
    p_booking_id: null,
    p_due_date: dueDate,
    p_notes: notes,
  });

  if (error) throw error;

  return data;
}

export async function generateOrSyncBookingInvoice({
  bookingId,
  dueDate = null,
  notes = null,
} = {}) {
  if (!bookingId) throw new Error('Booking ID is required.');

  const { data, error } = await supabase.rpc('generate_or_sync_invoice', {
    p_order_id: null,
    p_booking_id: bookingId,
    p_due_date: dueDate,
    p_notes: notes,
  });

  if (error) throw error;

  return data;
}

export async function syncInvoiceForRecord({
  orderId = null,
  bookingId = null,
  dueDate = null,
  notes = null,
} = {}) {
  if (orderId) {
    return generateOrSyncOrderInvoice({
      orderId,
      dueDate,
      notes,
    });
  }

  if (bookingId) {
    return generateOrSyncBookingInvoice({
      bookingId,
      dueDate,
      notes,
    });
  }

  throw new Error('Order ID or booking ID is required.');
}

export async function cancelInvoice(invoiceId, notes = null) {
  if (!invoiceId) throw new Error('Invoice ID is required.');

  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: INVOICE_STATUS.CANCELLED,
      notes,
    })
    .eq('id', invoiceId)
    .select('*')
    .single();

  if (error) throw error;

  return data;
}

export async function getCustomerInvoices(customerId) {
  if (!customerId) throw new Error('Customer ID is required.');

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customerId)
    .order('issued_at', { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function getInvoiceDetails({
  invoiceId = null,
  orderId = null,
  bookingId = null,
} = {}) {
  let invoice = null;

  if (invoiceId) invoice = await getInvoiceById(invoiceId);
  if (!invoice && orderId) invoice = await getInvoiceForOrder(orderId);
  if (!invoice && bookingId) invoice = await getInvoiceForBooking(bookingId);

  if (!invoice) return null;

  const payments = await fetchPaymentsForInvoice({
    orderId: invoice.order_id,
    bookingId: invoice.booking_id,
  });

  return {
    invoice,
    payments,
    totals: calculateInvoiceTotals({
      totalAmount: invoice.total_amount,
      payments,
    }),
  };
}