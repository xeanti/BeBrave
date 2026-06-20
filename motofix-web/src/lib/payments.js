import { supabase } from './supabaseClient';

export async function fetchPaymentsFor({ bookingIds = [], orderIds = [] }) {
  if (bookingIds.length === 0 && orderIds.length === 0) return [];

  let query = supabase
    .from('payments')
    .select('*, profiles!payments_processed_by_fkey(first_name, last_name)')
    .order('created_at', { ascending: true });

  if (bookingIds.length > 0 && orderIds.length > 0) {
    query = query.or(
      `booking_id.in.(${bookingIds.join(',')}),order_id.in.(${orderIds.join(',')})`
    );
  } else if (bookingIds.length > 0) {
    query = query.in('booking_id', bookingIds);
  } else {
    query = query.in('order_id', orderIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchPaymentsFor error:', error);
    return [];
  }
  return data || [];
}

export async function recordPayment({ bookingId, orderId, amount, paymentType, method, processedBy, notes }) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      booking_id: bookingId || null,
      order_id: orderId || null,
      amount: parseFloat(amount),
      payment_type: paymentType,
      method: method || 'cash',
      processed_by: processedBy,
      notes: notes || null,
    })
    .select('*, profiles!payments_processed_by_fkey(first_name, last_name)')
    .single();

  if (error) throw error;
  return data;
}

export function summarizePayments(payments) {
  const totalPaid = payments.reduce((sum, p) => {
    return p.payment_type === 'refund' ? sum - p.amount : sum + p.amount;
  }, 0);
  return { totalPaid, count: payments.length };
}