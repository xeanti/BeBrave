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

function parsePaymongoSignature(header: string) {
  const parts: Record<string, string> = {};

  header.split(",").forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) parts[key.trim()] = value.trim();
  });

  return parts;
}

function bytesToHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPaymongoSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string | undefined
) {
  if (!webhookSecret) return true;

  if (!signatureHeader) return false;

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

  return expected === signature;
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

function getPaymentId(attributes: any) {
  const payment =
    attributes?.payments?.[0] ||
    attributes?.payment ||
    attributes?.payment_intent ||
    null;

  return payment?.id || payment?.data?.id || null;
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
    const webhookSecret = Deno.env.get("PAYMONGO_ORDER_WEBHOOK_SECRET") ||
      Deno.env.get("PAYMONGO_WEBHOOK_SECRET");

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

    const orderId = metadata?.order_id;
    const customerId = metadata?.customer_id;
    const checkoutSessionId = session?.id;
    const referenceNumber = attributes?.reference_number || null;
    const providerPaymentId = getPaymentId(attributes);
    const amount = Number(metadata?.order_total || 0);
    const paidAt = new Date().toISOString();

    if (!orderId || !checkoutSessionId) {
      console.error("Missing order_id or checkout session id.", {
        orderId,
        checkoutSessionId,
      });

      return json({ error: "Missing order_id or checkout session id." }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: order, error: orderFetchError } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, total_amount, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderFetchError || !order) {
      console.error("ORDER FETCH ERROR:", orderFetchError);
      return json({ error: "Order not found." }, 404);
    }

    const paidAmount = amount > 0 ? amount : Number(order.total_amount || 0);

    const { data: updatedPaymentRows, error: paymentUpdateError } =
      await supabaseAdmin
        .from("order_payments")
        .update({
          status: "paid",
          amount: paidAmount,
          reference_number: referenceNumber,
          provider_payment_id: providerPaymentId,
          payment_method: "qrph",
          paid_at: paidAt,
          updated_at: paidAt,
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
          customer_id: customerId || order.customer_id,
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
        payment_reference: referenceNumber || checkoutSessionId,
        paymongo_checkout_session_id: checkoutSessionId,
        down_payment_amount: paidAmount,
        remaining_balance: 0,
        paid_at: paidAt,
        updated_at: paidAt,
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
      paidAmount,
    });

    return json({
      ok: true,
      order_id: order.id,
      payment_status: "paid",
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
