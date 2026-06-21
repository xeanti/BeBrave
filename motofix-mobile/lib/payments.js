import { supabase } from './supabase';

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

export function summarizePayments(payments) {
  const totalPaid = payments.reduce((sum, p) => {
    return p.payment_type === 'refund' ? sum - p.amount : sum + p.amount;
  }, 0);
  return { totalPaid, count: payments.length };
}

// Returns { totalPaid, balance, isFullyPaid, lastProcessedBy } for one booking/order
export function getPaymentInfo(records, recordId, total) {
  const list = records[recordId] || [];
  const { totalPaid } = summarizePayments(list);
  const balance = Math.max(total - totalPaid, 0);
  const isFullyPaid = total > 0 && balance <= 0;
  const last = list.length ? list[list.length - 1] : null;
  const lastProcessedBy = last?.profiles
    ? `${last.profiles.first_name} ${last.profiles.last_name}`
    : last
    ? 'System'
    : '—';
  return { totalPaid, balance, isFullyPaid, lastProcessedBy };
}