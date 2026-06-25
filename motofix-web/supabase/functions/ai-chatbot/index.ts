import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type GeminiPart = {
  text?: string;
};

type TemplateRow = {
  intent: string;
  title?: string | null;
  keywords?: string[] | null;
  response: string;
  priority?: number | null;
  is_active?: boolean | null;
};

type TemplateMatch = {
  intent: string;
  response: string;
  source: 'database_template' | 'fallback_template';
};

const SYSTEM_PROMPT = `
You are MotoFix Assistant, the official AI assistant for the MotoFix web system.

MotoFix is a motorcycle service booking, parts shop, customization preview, order tracking, payment, invoice, and e-receipt system.

Core rules:
- Never use placeholder text such as [Insert Website Link], [Website Link], [Contact Number], [Email Here], or similar placeholders.
- Never invent URLs, phone numbers, emails, shop hours, prices, mechanic names, available schedules, payment verification, or booking confirmation.
- Guide users using MotoFix page names instead of fake links.
- Keep answers short, friendly, and practical.
- Use numbered steps when explaining how to do something.
- Do not say a booking is confirmed unless admin/staff confirmed it.
- Do not say a payment is verified unless admin/staff verified it.
- If the user needs real-time account/order/booking/payment data, tell them where to check inside MotoFix.
- If the user asks for exact repair diagnosis, explain that a mechanic must inspect the motorcycle first.
- If the user asks for admin-only actions, explain that only admin/staff can do those actions.
- If the user wants human help, tell them to choose "Talk to a Real Person" in MotoFix Chat.

MotoFix page guide:
- Service booking: Book Service / Booking page.
- Booking status/history: My Bookings, Appointments, or Booking Details.
- Parts shopping: Shop / Parts page.
- Order status/history: My Orders and Order Details.
- Payment, invoice, or e-receipt: open the related Order Details or Booking Details page.
- AI customization preview: Customize page.
- Notifications: Notifications page.

If unsure, answer safely and suggest using MotoFix support chat.
`;

const FALLBACK_TEMPLATES: TemplateRow[] = [
  {
    intent: 'book_service',
    keywords: ['book', 'booking', 'appointment', 'schedule', 'service', 'reserve', 'how to book', 'book service'],
    response:
      'To book a service in MotoFix:\n\n1. Go to the Book Service page.\n2. Choose the motorcycle service you need.\n3. Select your preferred date and time.\n4. Add notes if needed.\n5. Submit the booking request.\n\nYour booking will stay pending until admin or staff confirms it. You can check updates in My Bookings or Appointments.',
    priority: 10,
    is_active: true,
  },
  {
    intent: 'order_parts',
    keywords: ['parts', 'shop', 'order part', 'buy part', 'cart', 'checkout', 'purchase', 'motorcycle part'],
    response:
      'To order motorcycle parts in MotoFix:\n\n1. Go to the Shop page.\n2. Choose the part you want.\n3. Add it to your cart.\n4. Proceed to checkout.\n5. Wait for admin or staff confirmation.\n\nYou can track the order status in My Orders.',
    priority: 20,
    is_active: true,
  },
  {
    intent: 'invoice_receipt',
    keywords: ['invoice', 'receipt', 'e-receipt', 'ereceipt', 'official receipt', 'or number', 'receipt number', 'print receipt', 'save pdf', 'proof of payment'],
    response:
      'To view your invoice or e-receipt in MotoFix:\n\n1. Go to My Orders or My Bookings.\n2. Open the related details page.\n3. Click View Invoice or View E-Receipt.\n4. Use Print / Save PDF if you need a copy.\n\nReceipts are created after a payment is recorded or verified by admin/staff.',
    priority: 30,
    is_active: true,
  },
  {
    intent: 'human_support',
    keywords: ['human', 'real person', 'staff', 'admin', 'mechanic', 'support', 'agent', 'talk to someone', 'contact'],
    response:
      'To talk to MotoFix support:\n\n1. Open MotoFix Chat.\n2. Choose Talk to a Real Person.\n3. Send your concern.\n\nAdmin, staff, or mechanic support can reply in the shared support chat when available.',
    priority: 80,
    is_active: true,
  },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTemplate(message: string, template: TemplateRow) {
  const normalized = normalizeText(message);
  const keywords = template.keywords || [];
  let score = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);

    if (!normalizedKeyword) continue;

    if (normalized.includes(normalizedKeyword)) {
      score += normalizedKeyword.includes(' ') ? 3 : 1;
    }
  }

  return score;
}

function findTemplateResponse(message: string, templates: TemplateRow[], source: TemplateMatch['source']): TemplateMatch | null {
  const activeTemplates = templates
    .filter((template) => template?.response?.trim() && template.is_active !== false)
    .sort((a, b) => {
      const priorityA = Number(a.priority ?? 100);
      const priorityB = Number(b.priority ?? 100);
      return priorityA - priorityB;
    });

  let bestMatch: TemplateMatch | null = null;
  let bestScore = 0;

  for (const template of activeTemplates) {
    const score = scoreTemplate(message, template);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        intent: template.intent,
        response: template.response,
        source,
      };
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

async function fetchDatabaseTemplates(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from('chatbot_templates')
    .select('intent, title, keywords, response, priority, is_active')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('Failed to load chatbot templates:', error);
    return [];
  }

  return (data || []) as TemplateRow[];
}

function sanitizeAiReply(reply: string) {
  let cleaned = String(reply || '').trim();

  const placeholderPatterns = [
    /\[[^\]]*(website|link|url|contact|phone|number|email|insert|shop)[^\]]*\]/gi,
    /insert website link/gi,
    /website link/gi,
    /contact number/gi,
    /email here/gi,
  ];

  for (const pattern of placeholderPatterns) {
    cleaned = cleaned.replace(pattern, 'MotoFix page');
  }

  cleaned = cleaned
    .replace(/https?:\/\/[^\s)]+/gi, 'the related MotoFix page')
    .replace(/\s{3,}/g, ' ')
    .trim();

  if (!cleaned) {
    return 'Sorry, I could not generate a response right now. Please use Talk to a Real Person in MotoFix Chat.';
  }

  return cleaned;
}

async function insertBotMessage(adminClient: ReturnType<typeof createClient>, conversationId: string, message: string) {
  const { data: botMessage, error: insertError } = await adminClient
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: null,
      message,
      is_bot: true,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  await adminClient
    .from('chat_conversations')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  return botMessage;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase environment variables.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { conversation_id, message } = await req.json();

    if (!conversation_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'conversation_id and message are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conversation, error: conversationError } = await adminClient
      .from('chat_conversations')
      .select('id, customer_id, status, conversation_type')
      .eq('id', conversation_id)
      .single();

    if (conversationError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conversation.customer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conversation.status === 'closed') {
      return new Response(JSON.stringify({ error: 'Conversation is closed.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (conversation.conversation_type && conversation.conversation_type !== 'ai') {
      return new Response(JSON.stringify({ error: 'This is not an AI conversation.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const databaseTemplates = await fetchDatabaseTemplates(adminClient);
    const databaseMatch = findTemplateResponse(message, databaseTemplates, 'database_template');
    const fallbackMatch = databaseMatch || findTemplateResponse(message, FALLBACK_TEMPLATES, 'fallback_template');

    if (fallbackMatch) {
      const botMessage = await insertBotMessage(adminClient, conversation_id, fallbackMatch.response);

      return new Response(
        JSON.stringify({
          success: true,
          source: fallbackMatch.source,
          intent: fallbackMatch.intent,
          message: botMessage,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!geminiApiKey) {
      const fallbackReply =
        'I can help with MotoFix bookings, parts orders, payments, invoices, e-receipts, customization previews, and basic service guidance. For account-specific details, please check the related MotoFix page or choose Talk to a Real Person in MotoFix Chat.';

      const botMessage = await insertBotMessage(adminClient, conversation_id, fallbackReply);

      return new Response(
        JSON.stringify({
          success: true,
          source: 'fallback',
          message: botMessage,
        }),
        {
          status: 200,
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
            temperature: 0.2,
            maxOutputTokens: 320,
          },
        }),
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error('Gemini error:', geminiData);

      const fallbackReply =
        'Sorry, the AI Assistant could not generate a reply right now. Please try again or choose Talk to a Real Person in MotoFix Chat.';

      const botMessage = await insertBotMessage(adminClient, conversation_id, fallbackReply);

      return new Response(
        JSON.stringify({
          success: true,
          source: 'fallback',
          message: botMessage,
          ai_error: geminiData,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const rawReply =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part: GeminiPart) => part.text || '')
        .join('\n')
        .trim() ||
      'Sorry, I could not generate a response right now. Please use Talk to a Real Person in MotoFix Chat.';

    const aiReply = sanitizeAiReply(rawReply);

    const botMessage = await insertBotMessage(adminClient, conversation_id, aiReply);

    return new Response(
      JSON.stringify({
        success: true,
        source: 'gemini',
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
        error: error instanceof Error ? error.message : 'AI chatbot error.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
