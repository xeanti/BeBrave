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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Missing Supabase environment variables.' }, 500);
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
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseAuth.auth.getUser(jwt);

    if (callerError || !caller?.id) {
      return json({ error: 'Unauthorized. Please login again.' }, 401);
    }

    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return json({ error: 'target_user_id is required.' }, 400);
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', caller.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return json({ error: 'Caller profile not found.' }, 403);
    }

    if (callerProfile.role !== 'super_admin') {
      return json({ error: 'Only super admins can reactivate users.' }, 403);
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, first_name, last_name, is_active')
      .eq('id', target_user_id)
      .single();

    if (targetError || !targetProfile) {
      return json({ error: 'Target user not found.' }, 404);
    }

    if (targetProfile.is_active !== false) {
      return json({ error: 'This user account is already active.' }, 400);
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
      .eq('id', target_user_id);

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'REACTIVATE_USER_ACCOUNT',
      entity: 'profiles',
      entity_id: target_user_id,
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
