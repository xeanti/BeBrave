import { supabase } from './supabaseClient';

export async function getOrCreateConversation(customerId) {
  // Check if open conversation exists
  const { data: existing } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(1);

  if (existing && existing.length > 0) return existing[0];

  // Create new conversation
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ customer_id: customerId, status: 'open' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function sendMessage(conversationId, senderId, message, isBot = false) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message,
      is_bot: isBot,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}