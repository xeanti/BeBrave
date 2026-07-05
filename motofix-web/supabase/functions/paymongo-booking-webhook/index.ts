import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, paymongo-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function parsePaymongoSignature(header: string | null) {
  if (!header) return null;

  const parts = header.split(",").map((part) => part.trim());
  const parsed: Record<string, string> = {};

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) parsed[key] = value;
  }

  return parsed;
}

async function hmacSha256Hex(secret: string, value: string) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifyPaymongoWebhook(req: Request, rawBody: string) {
  const webhookSecret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");

  // During first testing, you can leave PAYMONGO_WEBHOOK_SECRET empty.
  // Once you add the webhook in PayMongo Dashboard, set the secret.
  if (!webhookSecret) return true;

  const signatureHeader = req.headers.get("paymongo-signature");
  const parsed = parsePaymongoSignature(signatureHeader);

  if (!parsed?.t) return false;

  const signedPayload = `${parsed.t}.${rawBody}`;
  const expected = await hmacSha256Hex(webhookSecret, signedPayload);

  const testSignature = parsed.te;
  const liveSignature = parsed.li;

  return (
    Boolean(testSignature && safeEqual(expected, testSignature)) ||
    Boolean(liveSignature && safeEqual(expected, liveSignature))
  );
}

function getEventType(event: any) {
  // PayMongo webhook shape is commonly:
  // data.type = "event"
  // data.attributes.type = "checkout_session.payment.paid"
  return event?.data?.attributes?.type || event?.data?.type || null;
}

function getCheckoutSession(event: any) {
  // PayMongo webhook shape is commonly:
  // data.attributes.data = checkout_session object
  return event?.data?.attributes?.data || event?.data?.data || null;
}

function getPaymentMethod(paymentAttributes: any) {
  return (
    paymentAttributes?.source?.type ||
    paymentAttributes?.payment_method?.type ||
    paymentAttributes?.payment_method_allowed ||
    "qrph"
  );
}

async function insertNotification(
  supabaseAdmin: any,
  userId: string | null,
  bookingId: string,
  referenceNumber: string | null
) {
  if (!userId) return;

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    title: "Payment Received",
    message:
      "Your QR Ph / GCash reservation payment has been received. Please wait for booking confirmation.",
    type: "payment",
    related_table: "bookings",
    related_id: bookingId,
    metadata: {
      payment_method: "PayMongo QR Ph / GCash",
      reference_number: referenceNumber,
    },
  });

  if (error) {
    console.warn("NOTIFICATION INSERT WARNING:", error.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return json({
      ok: true,
      message: "PayMongo booking webhook is running. Waiting for POST events.",
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const isVerified = await verifyPaymongoWebhook(req, rawBody);

    if (!isVerified) {
      return json({ error: "Invalid PayMongo webhook signature." }, 401);
    }

    const event = JSON.parse(rawBody);
    const eventType = getEventType(event);
    const session = getCheckoutSession(event);

    console.log("PAYMONGO WEBHOOK EVENT:", eventType, session?.id || "no_session_id");

    if (eventType !== "checkout_session.payment.paid") {
      return json({
        received: true,
        ignored: true,
        event_type: eventType,
      });
    }

    const attributes = session?.attributes || {};
    const metadata = attributes?.metadata || {};

    const bookingId = metadata.booking_id;
    const metadataCustomerId = metadata.customer_id || null;
    const checkoutSessionId = session?.id;
    const referenceNumber = attributes?.reference_number || attributes?.reference || null;

    if (!bookingId || !checkoutSessionId) {
      return json(
        {
          error: "Missing booking_id or checkout session ID.",
          event_type: eventType,
          checkout_session_id: checkoutSessionId || null,
          metadata,
        },
        400
      );
    }

    const payments = attributes?.payments || [];
    const paidPayment =
      payments.find((payment: any) => payment?.attributes?.status === "paid") ||
      payments[0] ||
      null;

    const paymentAttributes = paidPayment?.attributes || {};
    const providerPaymentId = paidPayment?.id || null;
    const providerPaymentIntentId =
      attributes?.payment_intent?.id ||
      paymentAttributes?.payment_intent?.id ||
      null;

    const amount = Number(paymentAttributes.amount || attributes.amount || 0) / 100;
    const feeAmount = Number(paymentAttributes.fee || 0) / 100;
    const netAmount = Number(paymentAttributes.net_amount || 0) / 100;
    const paymentMethod = getPaymentMethod(paymentAttributes);
    const paidAt = new Date().toISOString();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables." }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: booking, error: bookingFetchError } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, service_id, reservation_fee, payment_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingFetchError) {
      console.error("BOOKING FETCH ERROR:", bookingFetchError);
      return json({ error: bookingFetchError.message }, 500);
    }

    if (!booking) {
      return json({ error: "Booking not found.", booking_id: bookingId }, 404);
    }

    const customerId = metadataCustomerId || booking.customer_id || null;

    const paymentUpdatePayload = {
      status: "paid",
      provider_payment_id: providerPaymentId,
      provider_payment_intent_id: providerPaymentIntentId,
      payment_method: paymentMethod || "qrph",
      amount: amount || Number(booking.reservation_fee) || 0,
      fee_amount: feeAmount || 0,
      net_amount: netAmount || 0,
      reference_number: referenceNumber,
      paid_at: paidAt,
      metadata: {
        checkout_session: session,
        payment: paidPayment,
        webhook_event: event,
      },
      updated_at: paidAt,
    };

    const { data: updatedPayments, error: updatePaymentError } = await supabaseAdmin
      .from("booking_payments")
      .update(paymentUpdatePayload)
      .eq("provider_checkout_session_id", checkoutSessionId)
      .select("id");

    if (updatePaymentError) {
      console.error("BOOKING PAYMENT UPDATE ERROR:", updatePaymentError);
      return json({ error: updatePaymentError.message }, 500);
    }

    // Fallback insert in case webhook arrived before DB insert finished
    if (!updatedPayments || updatedPayments.length === 0) {
      const { error: insertPaymentError } = await supabaseAdmin
        .from("booking_payments")
        .insert({
          customer_id: customerId,
          booking_id: bookingId,
          provider: "paymongo",
          currency: "PHP",
          reference_number: referenceNumber,
          provider_checkout_session_id: checkoutSessionId,
          ...paymentUpdatePayload,
        });

      if (insertPaymentError) {
        console.error("BOOKING PAYMENT INSERT ERROR:", insertPaymentError);
        return json({ error: insertPaymentError.message }, 500);
      }
    }

    const reservationFee =
      amount > 0
        ? amount
        : Number(booking.reservation_fee) > 0
          ? Number(booking.reservation_fee)
          : 0;

    const { error: updateBookingError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "paid",
        reservation_fee: reservationFee,
        payment_reference: referenceNumber || providerPaymentId || checkoutSessionId,
        paymongo_checkout_session_id: checkoutSessionId,
        paid_at: paidAt,
        updated_at: paidAt,
      })
      .eq("id", bookingId);

    if (updateBookingError) {
      console.error("BOOKING PAYMENT STATUS UPDATE ERROR:", updateBookingError);
      return json({ error: updateBookingError.message }, 500);
    }

    await insertNotification(
      supabaseAdmin,
      customerId,
      bookingId,
      referenceNumber || providerPaymentId || checkoutSessionId
    );

    await supabaseAdmin.from("audit_logs").insert({
      action: "PAYMONGO_QRPH_PAYMENT_RECEIVED",
      entity: "bookings",
      entity_id: bookingId,
      performed_by: null,
      details: {
        booking_id: bookingId,
        customer_id: customerId,
        checkout_session_id: checkoutSessionId,
        provider_payment_id: providerPaymentId,
        provider_payment_intent_id: providerPaymentIntentId,
        reference_number: referenceNumber,
        amount: reservationFee,
        payment_method: paymentMethod || "qrph",
      },
    });

    return json({
      received: true,
      payment_received: true,
      event_type: eventType,
      booking_id: bookingId,
      checkout_session_id: checkoutSessionId,
      payment_status: "paid",
      message: "Payment received and booking updated.",
    });
  } catch (err) {
    console.error("PAYMONGO WEBHOOK ERROR:", err);

    return json(
      {
        error: err instanceof Error ? err.message : "Webhook error.",
      },
      500
    );
  }
});
