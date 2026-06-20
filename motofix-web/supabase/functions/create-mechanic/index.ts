import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { firstName, lastName, email, phone, password } = await req.json();

    if (!firstName || !lastName || !email || !password) {
      return new Response(
        JSON.stringify({ error: 'firstName, lastName, email, and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm so they can log in immediately
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        phone,
      },
    });

    if (authError) throw authError;

    // Create/update the profile with mechanic role
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authUser.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        role: 'mechanic',
      });

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({
        success: true,
        mechanic: {
          id: authUser.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
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