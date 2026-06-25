import { supabase } from './supabaseClient';

export async function adjustPartStock({
  partId,
  movementType,
  quantity,
  reason,
  relatedOrderId = null,
  relatedBookingId = null,
}) {
  const { data, error } = await supabase.rpc('adjust_part_stock', {
    p_part_id: partId,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_reason: reason,
    p_related_order_id: relatedOrderId,
    p_related_booking_id: relatedBookingId,
  });

  if (error) throw error;
  return data;
}