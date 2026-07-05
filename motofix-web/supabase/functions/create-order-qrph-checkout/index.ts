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
  return Number(value || 0);
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

    const { order_id } = await req.json();

    if (!order_id) {
      return json({ error: "order_id is required." }, 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, total_amount, status, payment_status, payment_reference, paymongo_checkout_session_id"
      )
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return json({ error: "Order not found." }, 404);
    }

    if (order.customer_id !== user.id) {
      return json({ error: "You can only pay your own order." }, 403);
    }

    if (order.payment_status === "paid") {
      return json({ error: "This order is already paid." }, 400);
    }

    if (order.status === "cancelled") {
      return json({ error: "This order is already cancelled." }, 400);
    }

    const { data: existingPayment } = await supabaseAdmin
      .from("order_payments")
      .select("id, checkout_url, provider_checkout_session_id, status, amount, reference_number")
      .eq("order_id", order.id)
      .in("status", ["checkout_created", "pending_payment"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPayment?.checkout_url) {
      // Checkout was created, but this is NOT paid yet.
      // Keep the order unpaid until the PayMongo webhook receives checkout_session.payment.paid.
      await supabaseAdmin
        .from("orders")
        .update({
          payment_provider: "paymongo",
          payment_method: "paymongo_qrph",
          payment_status: "checkout_created",
          payment_reference: existingPayment.reference_number || order.payment_reference || null,
          paymongo_checkout_session_id: existingPayment.provider_checkout_session_id,
          checkout_url: existingPayment.checkout_url,
          down_payment_amount: 0,
          remaining_balance: money(order.total_amount),
          paid_at: null,
          payment_received: false,
          payment_received_at: null,
          payment_received_by: null,
        })
        .eq("id", order.id);

      return json({
        checkout_url: existingPayment.checkout_url,
        checkout_session_id: existingPayment.provider_checkout_session_id,
        amount: money(existingPayment.amount),
        reused: true,
      });
    }

    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("part_id, quantity, unit_price, subtotal")
      .eq("order_id", order.id);

    if (itemsError) {
      return json({ error: itemsError.message }, 500);
    }

    if (!orderItems?.length) {
      return json({ error: "Order has no items." }, 400);
    }

    const partIds = [...new Set(orderItems.map((item) => item.part_id).filter(Boolean))];

    const { data: parts, error: partsError } = await supabaseAdmin
      .from("parts")
      .select("id, name")
      .in("id", partIds);

    if (partsError) {
      return json({ error: partsError.message }, 500);
    }

    const partsById = new Map((parts || []).map((part) => [part.id, part]));

    const computedTotal = orderItems.reduce((sum, item) => {
      return sum + money(item.subtotal || money(item.unit_price) * money(item.quantity));
    }, 0);

    const paymentAmount = Number((money(order.total_amount) > 0 ? money(order.total_amount) : computedTotal).toFixed(2));
    const amountCentavos = toCentavos(paymentAmount);

    if (amountCentavos < 100) {
      return json({ error: "Order payment amount is too low." }, 400);
    }

    const referenceNumber = `MF-ORD-${String(order.id)
      .slice(0, 8)
      .toUpperCase()}-${Date.now()}`;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const customerName = `${profile?.first_name || ""} ${
      profile?.last_name || ""
    }`.trim();

    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://motofix.store";

    const successUrl =
      Deno.env.get("ORDER_PAYMENT_SUCCESS_URL") ||
      `${siteUrl}/my-orders?payment=success&order_id=${order.id}`;

    const cancelUrl =
      Deno.env.get("ORDER_PAYMENT_CANCEL_URL") ||
      `${siteUrl}/my-orders?payment=cancelled&order_id=${order.id}`;

    const lineItems = orderItems.slice(0, 20).map((item) => {
      const part = partsById.get(item.part_id);
      const unitAmount = toCentavos(money(item.unit_price));
      const quantity = Math.max(1, Number(item.quantity) || 1);

      return {
        name: `MotoFix Product - ${part?.name || "Product"}`,
        amount: Math.max(unitAmount, 100),
        currency: "PHP",
        quantity,
      };
    });

    const lineItemsTotal = lineItems.reduce(
      (sum, item) => sum + item.amount * item.quantity,
      0
    );

    // PayMongo Checkout requires line items. If item rounding differs from the order total,
    // use a single order-level line item to keep the paid amount exact.
    const finalLineItems =
      lineItemsTotal === amountCentavos
        ? lineItems
        : [
            {
              name: `MotoFix Product Order ${String(order.id).slice(0, 8).toUpperCase()}`,
              amount: amountCentavos,
              currency: "PHP",
              quantity: 1,
            },
          ];

    const payload = {
      data: {
        attributes: {
          line_items: finalLineItems,

          // QR Ph only. Customers may pay through supported QR Ph wallet flows.
          payment_method_types: ["qrph"],

          success_url: successUrl,
          cancel_url: cancelUrl,

          reference_number: referenceNumber,
          send_email_receipt: true,

          metadata: {
            payment_for: "order",
            payment_channel: "qrph",
            order_id: order.id,
            customer_id: user.id,
            order_total: paymentAmount,
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
      console.error("PAYMONGO ORDER CHECKOUT ERROR:", paymongoJson);

      return json(
        {
          error:
            paymongoJson?.errors?.[0]?.detail ||
            paymongoJson?.errors?.[0]?.title ||
            "Failed to create PayMongo order checkout.",
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
      .from("order_payments")
      .insert({
        customer_id: user.id,
        order_id: order.id,
        provider: "paymongo",
        status: "checkout_created",
        amount: paymentAmount,
        currency: "PHP",
        reference_number: referenceNumber,
        checkout_url: checkoutUrl,
        provider_checkout_session_id: checkoutSessionId,
        payment_method: "qrph",
        metadata: {
          checkout_session: checkoutSession,
        },
      });

    if (paymentInsertError) {
      console.error("ORDER PAYMENT INSERT ERROR:", paymentInsertError);
      return json({ error: paymentInsertError.message }, 500);
    }

    const { error: orderUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_provider: "paymongo",
        payment_method: "paymongo_qrph",
        payment_status: "checkout_created",
        payment_reference: referenceNumber,
        paymongo_checkout_session_id: checkoutSessionId,
        checkout_url: checkoutUrl,
        // Important: creating a PayMongo checkout is not payment confirmation.
        // Paid amount remains 0 and balance remains full until webhook confirms success.
        down_payment_amount: 0,
        remaining_balance: paymentAmount,
        paid_at: null,
        payment_received: false,
        payment_received_at: null,
        payment_received_by: null,
      })
      .eq("id", order.id);

    if (orderUpdateError) {
      console.error("ORDER UPDATE ERROR:", orderUpdateError);
      return json({ error: orderUpdateError.message }, 500);
    }

    return json({
      checkout_url: checkoutUrl,
      checkout_session_id: checkoutSessionId,
      reference_number: referenceNumber,
      amount: paymentAmount,
      payment_method: "qrph",
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
