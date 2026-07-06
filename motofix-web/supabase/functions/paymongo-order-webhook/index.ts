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
  const parts: Record<string, string> = {};

  if (!header) return parts;

  header.split(",").forEach((part) => {
    const [key, value] = part.trim().split("=");
    if (key && value) parts[key.trim()] = value.trim();
  });

  return parts;
}

function bytesToHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifyPaymongoSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string | undefined
) {
  // For local/testing convenience, no secret means do not block the webhook.
  // For production, set the correct PayMongo webhook secret in Supabase.
  if (!webhookSecret) return true;

  const parts = parsePaymongoSignature(signatureHeader);
  const timestamp = parts.t;
  const signature = parts.te || parts.li || parts.v1;

  if (!timestamp || !signature) return false;

  const payload = `${timestamp}.${rawBody}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  const expected = bytesToHex(digest);

  return safeEqual(expected, signature);
}

function getEventType(event: any) {
  return event?.data?.attributes?.type || event?.data?.type || null;
}

function getCheckoutSession(event: any) {
  return event?.data?.attributes?.data || event?.data?.data || null;
}

function getSessionAttributes(session: any) {
  return session?.attributes || {};
}

function getPaidPayment(attributes: any) {
  const payments = Array.isArray(attributes?.payments) ? attributes.payments : [];

  return (
    payments.find((payment: any) => payment?.attributes?.status === "paid") ||
    payments[0] ||
    attributes?.payment ||
    attributes?.payment_intent ||
    null
  );
}

function getPaymentId(attributes: any) {
  const payment = getPaidPayment(attributes);
  return payment?.id || payment?.data?.id || null;
}

function getPaidAmount(attributes: any, fallbackAmount: number) {
  const payment = getPaidPayment(attributes);
  const paymentAttributes = payment?.attributes || {};

  const amountCentavos = Number(
    paymentAttributes?.amount ||
      attributes?.amount ||
      attributes?.payment_intent?.attributes?.amount ||
      0
  );

  if (amountCentavos > 0) {
    return Number((amountCentavos / 100).toFixed(2));
  }

  return Number(fallbackAmount || 0);
}

async function findOrderPaymentByCheckoutSession(
  supabaseAdmin: any,
  checkoutSessionId: string
) {
  const { data, error } = await supabaseAdmin
    .from("order_payments")
    .select("id, order_id, customer_id, amount, reference_number, status")
    .eq("provider_checkout_session_id", checkoutSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("ORDER PAYMENT LOOKUP ERROR:", error);
    throw error;
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return json({
      ok: true,
      message: "PayMongo order webhook is running. Waiting for POST events.",
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Added BOOKING secret fallback only because some projects store one common PayMongo
    // webhook secret under that name. This does NOT change the booking webhook.
    const webhookSecret =
      Deno.env.get("PAYMONGO_ORDER_WEBHOOK_SECRET") ||
      Deno.env.get("PAYMONGO_WEBHOOK_SECRET") ||
      Deno.env.get("PAYMONGO_BOOKING_WEBHOOK_SECRET");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment variables." }, 500);
    }

    const rawBody = await req.text();
    const signatureHeader = req.headers.get("paymongo-signature");

    const validSignature = await verifyPaymongoSignature(
      rawBody,
      signatureHeader,
      webhookSecret
    );

    if (!validSignature) {
      console.error("Invalid PayMongo order webhook signature.");
      return json({ error: "Invalid signature." }, 401);
    }

    const event = JSON.parse(rawBody);
    const eventType = getEventType(event);

    console.log("PAYMONGO ORDER WEBHOOK EVENT:", eventType);

    if (eventType !== "checkout_session.payment.paid") {
      return json({
        ok: true,
        ignored: true,
        event_type: eventType,
      });
    }

    const session = getCheckoutSession(event);
    const attributes = getSessionAttributes(session);
    const metadata = attributes?.metadata || {};

    const checkoutSessionId = session?.id;
    const referenceNumber = attributes?.reference_number || null;
    const providerPaymentId = getPaymentId(attributes);
    const paidAt = new Date().toISOString();

    if (!checkoutSessionId) {
      return json({ error: "Missing checkout session id." }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Prefer PayMongo metadata, but fall back to the saved order_payments row.
    let orderId = metadata?.order_id || null;
    let customerId = metadata?.customer_id || null;
    let savedPayment = null;

    if (!orderId) {
      savedPayment = await findOrderPaymentByCheckoutSession(
        supabaseAdmin,
        checkoutSessionId
      );

      orderId = savedPayment?.order_id || null;
      customerId = savedPayment?.customer_id || null;

      console.log("ORDER WEBHOOK METADATA FALLBACK:", {
        checkoutSessionId,
        orderId,
        customerId,
      });
    }

    if (!orderId) {
      console.error("Missing order_id.", {
        checkoutSessionId,
        metadata,
      });

      return json(
        {
          error:
            "Missing order_id in PayMongo metadata and no matching order_payments row found.",
          checkout_session_id: checkoutSessionId,
          metadata,
        },
        400
      );
    }

    const { data: order, error: orderFetchError } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, total_amount, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderFetchError) {
      console.error("ORDER FETCH ERROR:", orderFetchError);
      return json({ error: orderFetchError.message }, 500);
    }

    if (!order) {
      console.error("ORDER NOT FOUND:", orderId);
      return json({ error: "Order not found.", order_id: orderId }, 404);
    }

    const metadataAmount = Number(metadata?.order_total || 0);
    const paidAmount = getPaidAmount(
      attributes,
      metadataAmount > 0 ? metadataAmount : Number(order.total_amount || 0)
    );

    const finalCustomerId = customerId || order.customer_id;

    // Idempotent update. If PayMongo retries, this will keep the row paid.
    const { data: updatedPaymentRows, error: paymentUpdateError } =
      await supabaseAdmin
        .from("order_payments")
        .update({
          status: "paid",
          amount: paidAmount,
          reference_number: referenceNumber || savedPayment?.reference_number || null,
          provider_payment_id: providerPaymentId,
          payment_method: "qrph",
          paid_at: paidAt,
          metadata: {
            event,
            checkout_session: session,
          },
        })
        .eq("provider_checkout_session_id", checkoutSessionId)
        .select("id");

    if (paymentUpdateError) {
      console.error("ORDER PAYMENT UPDATE ERROR:", paymentUpdateError);
      return json({ error: paymentUpdateError.message }, 500);
    }

    if (!updatedPaymentRows?.length) {
      const { error: insertPaymentError } = await supabaseAdmin
        .from("order_payments")
        .insert({
          customer_id: finalCustomerId,
          order_id: order.id,
          provider: "paymongo",
          status: "paid",
          amount: paidAmount,
          currency: "PHP",
          reference_number: referenceNumber,
          provider_checkout_session_id: checkoutSessionId,
          provider_payment_id: providerPaymentId,
          payment_method: "qrph",
          paid_at: paidAt,
          metadata: {
            event,
            checkout_session: session,
          },
        });

      if (insertPaymentError) {
        console.error("ORDER PAYMENT INSERT FALLBACK ERROR:", insertPaymentError);
        return json({ error: insertPaymentError.message }, 500);
      }
    }

    const { error: orderUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "processing",
        payment_provider: "paymongo",
        payment_method: "paymongo_qrph",
        payment_status: "paid",
        payment_reference: referenceNumber || providerPaymentId || checkoutSessionId,
        paymongo_checkout_session_id: checkoutSessionId,
        down_payment_amount: paidAmount,
        remaining_balance: 0,
        paid_at: paidAt,

        // These columns exist in your checkout flow. If your DB does not have them,
        // remove these 3 lines.
        payment_received: true,
        payment_received_at: paidAt,
        payment_received_by: null,
      })
      .eq("id", order.id);

    if (orderUpdateError) {
      console.error("ORDER PAID UPDATE ERROR:", orderUpdateError);
      return json({ error: orderUpdateError.message }, 500);
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: order.customer_id,
      title: "Order Payment Received",
      message:
        "Your PayMongo QR Ph / GCash product order payment has been received. Your order is now being processed.",
      type: "order",
      related_table: "orders",
      related_id: order.id,
      is_read: false,
    });

    console.log("ORDER PAYMENT MARKED PAID:", {
      orderId: order.id,
      checkoutSessionId,
      referenceNumber,
      providerPaymentId,
      paidAmount,
    });

    return json({
      ok: true,
      order_id: order.id,
      checkout_session_id: checkoutSessionId,
      payment_status: "paid",
      paid_amount: paidAmount,
    });
  } catch (err) {
    console.error("PAYMONGO ORDER WEBHOOK ERROR:", err);

    return json(
      {
        error: err instanceof Error ? err.message : "Unexpected server error.",
      },
      500
    );
  }
});
