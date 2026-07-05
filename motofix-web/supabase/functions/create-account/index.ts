import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_ROLES = ['customer', 'mechanic', 'staff', 'admin', 'super_admin'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + 'Aa1!';
}

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanPhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhilippineMobile(phone: string) {
  if (!phone) return true;
  return /^09\d{9}$/.test(phone);
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

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('id', caller.id)
      .single();

    if (profileError || !callerProfile) {
      return json({ error: 'Caller profile not found.' }, 403);
    }

    if (callerProfile.role !== 'super_admin') {
      return json(
        {
          error:
            'Only super admins can create customer, mechanic, staff, admin, or super admin accounts.',
        },
        403
      );
    }

    const body = await req.json();

    const firstName = cleanText(body.firstName);
    const lastName = cleanText(body.lastName);
    const email = cleanEmail(body.email);
    const phone = cleanPhone(body.phone);
    const password = cleanText(body.password);
    const role = cleanText(body.role || 'customer');

    if (!firstName || !lastName || !email || !role) {
      return json(
        {
          error: 'firstName, lastName, email, and role are required.',
        },
        400
      );
    }

    if (!isValidEmail(email)) {
      return json({ error: 'Please enter a valid email address.' }, 400);
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return json(
        {
          error:
            'Invalid role. Allowed roles are customer, mechanic, staff, admin, and super_admin.',
        },
        400
      );
    }

    if (phone && !isValidPhilippineMobile(phone)) {
      return json(
        {
          error:
            'Invalid phone number. Phone number must be 11 digits and start with 09.',
        },
        400
      );
    }

    if (password && password.length < 6) {
      return json({ error: 'Password must be at least 6 characters.' }, 400);
    }

    const finalPassword = password || generateTempPassword();

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return json({ error: 'An account with this email already exists.' }, 409);
    }

    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          role,
          created_by: caller.id,
        },
      });

    if (authError) {
      return json({ error: authError.message }, 400);
    }

    if (!authUser?.user?.id) {
      return json({ error: 'Account was not created.' }, 500);
    }

    const { error: profileUpsertError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authUser.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        role,
        updated_at: new Date().toISOString(),
      });

    if (profileUpsertError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return json({ error: profileUpsertError.message }, 400);
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CREATE_USER_ACCOUNT',
      entity: 'profiles',
      entity_id: authUser.user.id,
      performed_by: caller.id,
      details: {
        email,
        role,
        created_by_role: callerProfile.role,
      },
    });

    return json({
      success: true,
      account: {
        id: authUser.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        role,
        tempPassword: password ? undefined : finalPassword,
      },
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
