import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getServiceRoleKey() {
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (legacyKey) return legacyKey;

  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');

  if (!secretKeysRaw) return null;

  try {
    const secretKeys = JSON.parse(secretKeysRaw);
    return secretKeys.default || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed.' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const pushSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
    const requestSecret = req.headers.get('x-push-secret');

    if (pushSecret && requestSecret !== pushSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = getServiceRoleKey();

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase environment variables.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    /*
      This supports:
      1. Database webhook payload: { record: {...} }
      2. Manual test payload: { notification_id: "..." }
    */
    let notification = body.record || body.notification || null;

    if (!notification && body.notification_id) {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', body.notification_id)
        .single();

      if (error) throw error;

      notification = data;
    }

    if (!notification?.user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing notification user_id.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('id, expo_push_token')
      .eq('user_id', notification.user_id)
      .eq('is_active', true);

    if (tokenError) throw tokenError;

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          message: 'No active push tokens for this user.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const messages = tokens.map((token) => ({
      to: token.expo_push_token,
      sound: 'default',
      title: notification.title || 'MotoFix Notification',
      body: notification.message || 'You have a new update from MotoFix.',
      priority: 'high',
      channelId: 'default',
      data: {
        notificationId: notification.id,
        type: notification.type,
        relatedTable: notification.related_table,
        relatedId: notification.related_id,
      },
    }));

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const expoResult = await expoResponse.json();

    if (!expoResponse.ok) {
      return new Response(
        JSON.stringify({
          error: 'Expo push request failed.',
          details: expoResult,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tickets = Array.isArray(expoResult.data)
      ? expoResult.data
      : [expoResult.data];

    const invalidTokenIds = [];

    tickets.forEach((ticket, index) => {
      if (
        ticket?.status === 'error' &&
        ticket?.details?.error === 'DeviceNotRegistered' &&
        tokens[index]?.id
      ) {
        invalidTokenIds.push(tokens[index].id);
      }
    });

    if (invalidTokenIds.length > 0) {
      await supabase
        .from('push_tokens')
        .update({
          is_active: false,
          last_seen_at: new Date().toISOString(),
        })
        .in('id', invalidTokenIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: messages.length,
        invalidTokensDisabled: invalidTokenIds.length,
        expo: expoResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Push notification error.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});