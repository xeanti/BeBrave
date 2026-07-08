import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function isUuid(value: unknown) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey =
      Deno.env.get('MOTOFIX_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(
        {
          error:
            'Missing Supabase environment variables. Set MOTOFIX_SERVICE_ROLE_KEY in Edge Function secrets.',
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '').trim();

    if (!jwt) {
      return json({ error: 'Unauthorized. Please login again.' }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseAuth.auth.getUser(jwt);

    if (callerError || !caller?.id) {
      return json({ error: 'Unauthorized. Please login again.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.target_user_id || body?.userId;

    if (!isUuid(targetUserId)) {
      return json({ error: 'Valid target_user_id is required.' }, 400);
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', caller.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return json({ error: 'Caller profile not found.' }, 403);
    }

    if (callerProfile.role !== 'super_admin' || callerProfile.is_active === false) {
      return json({ error: 'Only active super admins can reactivate users.' }, 403);
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, first_name, last_name, is_active')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return json({ error: 'Target user not found.' }, 404);
    }

    if (targetProfile.is_active !== false) {
      return json({ success: true, message: 'This user account is already active.' });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
        updated_at: now,
      })
      .eq('id', targetUserId);

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'REACTIVATE_USER_ACCOUNT',
      entity: 'profiles',
      entity_id: targetUserId,
      performed_by: caller.id,
      details: {
        email: targetProfile.email,
        role: targetProfile.role,
        name: `${targetProfile.first_name || ''} ${targetProfile.last_name || ''}`.trim(),
      },
    });

    return json({
      success: true,
      message: 'User account reactivated.',
    });
  } catch (err) {
    console.error(err);

    return json(
      {
        error: err instanceof Error ? err.message : 'Unexpected server error.',
      },
      500
    );
  }
});
