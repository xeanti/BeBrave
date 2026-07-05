import { supabase } from './supabase';

export async function createBookingQrphCheckout(bookingId) {
  if (!bookingId) {
    throw new Error('Missing booking ID.');
  }

  const { data, error } = await supabase.functions.invoke(
    'create-booking-qrph-checkout',
    {
      body: {
        booking_id: bookingId,
      },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to create QR Ph checkout.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.checkout_url) {
    throw new Error('PayMongo checkout URL was not returned.');
  }

  return data;
}
