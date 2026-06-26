import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const expectedSecret = Deno.env.get("PUSH_SECRET") || "";
    const requestSecret = req.headers.get("x-push-secret") || "";

    if (expectedSecret && requestSecret !== expectedSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json();

    const notification = payload.record || payload;

    const userId = notification.user_id;
    const title = notification.title || "MotoFix";
    const message = notification.message || "";
    const type = notification.type || "general";
    const relatedTable = notification.related_table || null;
    const relatedId = notification.related_id || null;
    const notificationId = notification.id || null;

    if (!userId) {
      return jsonResponse({ error: "Missing user_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "Missing Supabase environment variables" },
        500
      );
    }

    const tokenRes = await fetch(
      `${supabaseUrl}/rest/v1/push_tokens?user_id=eq.${userId}&is_active=eq.true&select=id,expo_push_token`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return jsonResponse(
        { error: "Failed to fetch push tokens", details: text },
        500
      );
    }

    const tokens = await tokenRes.json();

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return jsonResponse({
        ok: true,
        sent: 0,
        message: "No active push tokens for this user.",
      });
    }

    const messages = tokens
      .filter((row) => row.expo_push_token)
      .map((row) => ({
        to: row.expo_push_token,
        sound: "default",
        title,
        body: message,
        data: {
          notificationId,
          type,
          relatedTable,
          relatedId,
        },
      }));

    if (messages.length === 0) {
      return jsonResponse({
        ok: true,
        sent: 0,
        message: "No valid Expo push tokens.",
      });
    }

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoData = await expoRes.json();

    return jsonResponse({
      ok: expoRes.ok,
      sent: messages.length,
      expo: expoData,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error.message || "Unexpected push notification error",
      },
      500
    );
  }
});