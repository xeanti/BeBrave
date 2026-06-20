import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + 'Aa1!';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { firstName, lastName, email, phone, password, role } = await req.json();

    if (!firstName || !lastName || !email || !role) {
      return new Response(
        JSON.stringify({ error: 'firstName, lastName, email, and role are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['customer', 'staff', 'mechanic'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const finalPassword = password || generateTempPassword();

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, phone },
    });

    if (authError) throw authError;

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authUser.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        role,
      });

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({
        success: true,
        account: {
          id: authUser.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          role,
          tempPassword: password ? undefined : finalPassword,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});