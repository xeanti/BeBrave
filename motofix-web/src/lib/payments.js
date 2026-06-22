import { supabase } from './supabaseClient';

export async function fetchPaymentsFor({ bookingIds = [], orderIds = [] }) {
  if (bookingIds.length === 0 && orderIds.length === 0) return [];

  // Fetch separately and merge — avoids the .or() UUID string parsing bug
  const results = [];

  if (bookingIds.length > 0) {
    const { data, error } = await supabase
      .from('payments')
      .select('*, profiles!payments_processed_by_fkey(first_name, last_name)')
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('fetchPaymentsFor (bookings) error:', error);
    } else if (data) {
      results.push(...data);
    }
  }

  if (orderIds.length > 0) {
    const { data, error } = await supabase
      .from('payments')
      .select('*, profiles!payments_processed_by_fkey(first_name, last_name)')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('fetchPaymentsFor (orders) error:', error);
    } else if (data) {
      results.push(...data);
    }
  }

  return results;
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