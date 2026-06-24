import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `
You are MotoFix AI Assistant.

You help customers with:
- motorcycle service booking
- parts order questions
- shop hours
- payment reminders
- basic troubleshooting
- appointment guidance
- how to use the MotoFix website

Important rules:
- Be friendly, short, and clear.
- Do not claim a booking is confirmed unless admin confirmed it.
- Do not claim a payment is verified unless admin verified it.
- If the customer asks for exact repair diagnosis, say the mechanic/admin should confirm it.
- If unsure, tell the user to wait for MotoFix staff support.
- Keep answers under 4 short paragraphs.
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite';

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing environment variables.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authHeader = req.headers.get('Authorization') || '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { conversation_id, message } = await req.json();

    if (!conversation_id || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and message are required.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: conversation, error: conversationError } = await adminClient
      .from('chat_conversations')
      .select('id, customer_id, status')
      .eq('id', conversation_id)
      .single();

    if (conversationError || !conversation) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found.' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (conversation.customer_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden.' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (conversation.status === 'closed') {
      return new Response(
        JSON.stringify({ error: 'Conversation is closed.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: recentMessages } = await adminClient
      .from('chat_messages')
      .select('message, is_bot, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(10);

    const history = (recentMessages || [])
      .reverse()
      .map((item) => ({
        role: item.is_bot ? 'model' : 'user',
        parts: [
          {
            text: item.message,
          },
        ],
      }));

    if (history.length === 0) {
      history.push({
        role: 'user',
        parts: [
          {
            text: message,
          },
        ],
      });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: SYSTEM_PROMPT,
              },
            ],
          },
          contents: history,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 350,
          },
        }),
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error('Gemini error:', geminiData);

      return new Response(
        JSON.stringify({
          error: 'AI assistant failed to generate a reply.',
          details: geminiData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const aiReply =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('\n')
        .trim() ||
      'Sorry, I could not generate a response right now. Please wait for MotoFix support.';

    const { data: botMessage, error: insertError } = await adminClient
      .from('chat_messages')
      .insert({
        conversation_id,
        sender_id: null,
        message: aiReply,
        is_bot: true,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    await adminClient
      .from('chat_conversations')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: botMessage,
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
        error: error.message || 'AI chatbot error.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});