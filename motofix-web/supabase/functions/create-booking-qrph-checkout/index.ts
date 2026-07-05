import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toCentavos(amount: number) {
  return Math.round(Number(amount || 0) * 100);
}

function money(value: unknown) {
  return Number(value) || 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paymongoSecretKey = Deno.env.get("PAYMONGO_SECRET_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables." }, 500);
    }

    if (!paymongoSecretKey) {
      return json({ error: "Missing PAYMONGO_SECRET_KEY." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    if (!jwt) {
      return json({ error: "Unauthorized. Please login again." }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(jwt);

    if (userError || !user) {
      return json({ error: "Unauthorized. Please login again." }, 401);
    }

    const { booking_id } = await req.json();

    if (!booking_id) {
      return json({ error: "booking_id is required." }, 400);
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, service_id, status, payment_status, total_amount")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return json({ error: "Booking not found." }, 404);
    }

    if (booking.customer_id !== user.id) {
      return json({ error: "You can only pay your own booking." }, 403);
    }

    if (booking.payment_status === "paid") {
      return json({ error: "This booking is already paid." }, 400);
    }

    if (booking.status === "cancelled") {
      return json({ error: "This booking is already cancelled." }, 400);
    }

    const { data: service } = await supabaseAdmin
      .from("services")
      .select("name, base_price, labor_cost")
      .eq("id", booking.service_id)
      .maybeSingle();

    const basePrice = money(service?.base_price);
    const laborCost = money(service?.labor_cost);
    const computedServiceTotal = basePrice + laborCost;
    const savedBookingTotal = money(booking.total_amount);
    const serviceTotal = savedBookingTotal > 0 ? savedBookingTotal : computedServiceTotal;

    if (serviceTotal <= 0) {
      return json({ error: "Invalid service total." }, 400);
    }

    // Reservation fee is 20% of the full service total: base price + labor cost.
    const reservationFee = Number((serviceTotal * 0.2).toFixed(2));
    const amountCentavos = toCentavos(reservationFee);

    if (amountCentavos < 100) {
      return json({ error: "Reservation fee is too low." }, 400);
    }

    const { data: existingPayment } = await supabaseAdmin
      .from("booking_payments")
      .select("id, checkout_url, provider_checkout_session_id, status, amount")
      .eq("booking_id", booking.id)
      .in("status", ["checkout_created", "pending_payment"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingAmount = money(existingPayment?.amount);
    const existingAmountMatches = Math.abs(existingAmount - reservationFee) < 0.01;

    if (existingPayment?.checkout_url && existingAmountMatches) {
      await supabaseAdmin
        .from("bookings")
        .update({
          total_amount: serviceTotal,
          reservation_fee: reservationFee,
          payment_status: "checkout_created",
          payment_reference: undefined,
          paymongo_checkout_session_id: existingPayment.provider_checkout_session_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      return json({
        checkout_url: existingPayment.checkout_url,
        checkout_session_id: existingPayment.provider_checkout_session_id,
        reference_number: null,
        amount: reservationFee,
        payment_method: "qrph",
        reused: true,
      });
    }

    // If an old checkout exists with the wrong amount, do not reuse it.
    // Mark it expired locally and create a fresh PayMongo checkout with the correct amount.
    if (existingPayment?.id && !existingAmountMatches) {
      await supabaseAdmin
        .from("booking_payments")
        .update({
          status: "expired",
          metadata: {
            expired_reason:
              "Old checkout amount did not match current reservation fee. A new checkout was created.",
            old_amount: existingAmount,
            correct_amount: reservationFee,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPayment.id);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const referenceNumber = `MF-BKG-${String(booking.id)
      .slice(0, 8)
      .toUpperCase()}-${Date.now()}`;

    const customerName = `${profile?.first_name || ""} ${
      profile?.last_name || ""
    }`.trim();

    const successUrl =
      Deno.env.get("PAYMENT_SUCCESS_URL") ||
      "https://motofix.store/payment-success";

    const cancelUrl =
      Deno.env.get("PAYMENT_CANCEL_URL") ||
      "https://motofix.store/payment-cancel";

    const payload = {
      data: {
        attributes: {
          line_items: [
            {
              name: `MotoFix Booking Reservation Fee - ${service?.name || "Service"}`,
              amount: amountCentavos,
              currency: "PHP",
              quantity: 1,
            },
          ],

          // QR Ph only. No card.
          payment_method_types: ["qrph"],

          success_url: `${successUrl}?booking_id=${booking.id}`,
          cancel_url: `${cancelUrl}?booking_id=${booking.id}`,

          reference_number: referenceNumber,
          send_email_receipt: true,

          metadata: {
            payment_for: "booking",
            payment_channel: "qrph",
            booking_id: booking.id,
            customer_id: user.id,
            base_price: basePrice,
            labor_cost: laborCost,
            service_total: serviceTotal,
            reservation_fee: reservationFee,
            reservation_percentage: 20,
          },

          billing: {
            name: customerName || "MotoFix Customer",
            email: profile?.email || user.email || "",
            phone: profile?.phone || "",
          },
        },
      },
    };

    const paymongoResponse = await fetch(
      "https://api.paymongo.com/v2/checkout_sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${paymongoSecretKey}:`)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const paymongoJson = await paymongoResponse.json();

    if (!paymongoResponse.ok) {
      console.error("PAYMONGO ERROR:", paymongoJson);

      return json(
        {
          error:
            paymongoJson?.errors?.[0]?.detail ||
            paymongoJson?.errors?.[0]?.title ||
            "Failed to create PayMongo QR Ph checkout.",
          details: paymongoJson,
        },
        400
      );
    }

    const checkoutSession = paymongoJson?.data;
    const checkoutSessionId = checkoutSession?.id;
    const checkoutUrl = checkoutSession?.attributes?.checkout_url;

    if (!checkoutSessionId || !checkoutUrl) {
      return json({ error: "PayMongo did not return checkout URL." }, 500);
    }

    const { error: paymentInsertError } = await supabaseAdmin
      .from("booking_payments")
      .insert({
        customer_id: user.id,
        booking_id: booking.id,
        provider: "paymongo",
        status: "checkout_created",
        amount: reservationFee,
        currency: "PHP",
        reference_number: referenceNumber,
        checkout_url: checkoutUrl,
        provider_checkout_session_id: checkoutSessionId,
        payment_method: "qrph",
        metadata: {
          checkout_session: checkoutSession,
          base_price: basePrice,
          labor_cost: laborCost,
          service_total: serviceTotal,
          reservation_fee: reservationFee,
        },
      });

    if (paymentInsertError) {
      console.error("BOOKING PAYMENT INSERT ERROR:", paymentInsertError);
      return json({ error: paymentInsertError.message }, 500);
    }

    const { error: bookingUpdateError } = await supabaseAdmin
      .from("bookings")
      .update({
        total_amount: serviceTotal,
        payment_status: "checkout_created",
        reservation_fee: reservationFee,
        payment_reference: referenceNumber,
        paymongo_checkout_session_id: checkoutSessionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    if (bookingUpdateError) {
      console.error("BOOKING UPDATE ERROR:", bookingUpdateError);
      return json({ error: bookingUpdateError.message }, 500);
    }

    return json({
      checkout_url: checkoutUrl,
      checkout_session_id: checkoutSessionId,
      reference_number: referenceNumber,
      amount: reservationFee,
      payment_method: "qrph",
      service_total: serviceTotal,
    });
  } catch (err) {
    console.error(err);

    return json(
      {
        error: err instanceof Error ? err.message : "Unexpected server error.",
      },
      500
    );
  }
});
