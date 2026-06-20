import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get date 3 days from now
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 3);
    const dateStr = reminderDate.toISOString().split('T')[0];

    // Fetch bookings that are 3 days away and still active
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        booking_time,
        down_payment,
        notes,
        services(name, base_price),
        profiles!bookings_customer_id_fkey(first_name, last_name, email, phone)
      `)
      .eq('booking_date', dateStr)
      .in('status', ['pending', 'confirmed']);

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No bookings to remind for ' + dateStr, count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log each reminder (replace this with actual email/SMS later)
    const reminders = bookings.map((b) => ({
      customer: `${b.profiles?.first_name} ${b.profiles?.last_name}`,
      email: b.profiles?.email,
      phone: b.profiles?.phone,
      service: b.services?.name,
      date: b.booking_date,
      time: b.booking_time,
      down_payment: b.down_payment,
      message: `Reminder: Your "${b.services?.name}" appointment is on ${b.booking_date} at ${b.booking_time}. Please prepare your down payment of ₱${b.down_payment}.`,
    }));

    console.log('Sending reminders for', dateStr, ':', reminders);

    // TODO: Hook up actual email or SMS here
    // e.g., Resend, Nodemailer, Twilio, etc.

    return new Response(
      JSON.stringify({ reminded: reminders.length, date: dateStr, reminders }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});