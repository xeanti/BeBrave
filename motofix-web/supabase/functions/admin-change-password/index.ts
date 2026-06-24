import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify the caller is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: callerUser }, error: authError } = await userSupabase.auth.getUser()
    if (authError || !callerUser) throw new Error('Unauthorized')

    const { data: callerProfile, error: profileError } = await userSupabase
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()
    if (profileError || callerProfile?.role !== 'admin') throw new Error('Forbidden: admin only')

    // Parse body
    const { userId, newPassword } = await req.json()
    if (!userId || !newPassword) throw new Error('userId and newPassword are required')
    if (newPassword.length < 6) throw new Error('Password must be at least 6 characters')

    // Use service role to update the password
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    })
    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})