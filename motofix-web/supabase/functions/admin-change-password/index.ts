// supabase/functions/admin-change-password/index.ts
// ============================================================
// MotoFix Admin Change Password Edge Function
//
// Deploy:
//   supabase functions deploy admin-change-password
//
// Required secret:
//   supabase secrets set MOTOFIX_SERVICE_ROLE_KEY="your_service_role_key"
//
// This function verifies the caller is an active super_admin using public.profiles,
// then updates the target user's Supabase Auth password using service_role.
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function isUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanPassword(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 72);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("MOTOFIX_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json(
        { error: "Missing Supabase Edge Function environment variables." },
        500,
      );
    }

    const authorization = req.headers.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Missing authorization token." }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user: actor },
      error: actorError,
    } = await userClient.auth.getUser();

    if (actorError || !actor?.id) {
      return json({ error: "Not authenticated." }, 401);
    }

    const { data: actorProfile, error: actorProfileError } = await adminClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", actor.id)
      .single();

    if (actorProfileError || !actorProfile) {
      return json({ error: "Actor profile not found." }, 403);
    }

    if (actorProfile.role !== "super_admin" || actorProfile.is_active === false) {
      return json({ error: "Only active super admins can change user passwords." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const userId = body.userId || body.target_user_id;
    const newPassword = cleanPassword(body.newPassword || body.new_password);

    if (!isUuid(userId)) {
      return json({ error: "Valid userId is required." }, 400);
    }

    if (userId === actor.id) {
      return json({ error: "Use your own Profile page to change your password." }, 400);
    }

    if (!newPassword || newPassword.length < 6) {
      return json({ error: "Password must be at least 6 characters." }, 400);
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from("profiles")
      .select("id, email, role, is_active")
      .eq("id", userId)
      .single();

    if (targetProfileError || !targetProfile) {
      return json({ error: "Target user profile not found." }, 404);
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        password: newPassword,
      },
    );

    if (updateError) {
      return json({ error: updateError.message || "Failed to update password." }, 400);
    }

    await adminClient.from("audit_logs").insert({
      action: "ADMIN_CHANGE_PASSWORD",
      entity: "profiles",
      entity_id: userId,
      performed_by: actor.id,
      details: {
        target_email: targetProfile.email,
        target_role: targetProfile.role,
      },
    });

    return json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("admin-change-password error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      500,
    );
  }
});
