import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { sendMessage } from '../lib/chat';

export default function Chat() {
  const { user, profile } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    if (user) initChat();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function initChat() {
    try {
      const { data: existing } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('customer_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(1);

      if (existing && existing.length > 0) {
        setConversation(existing[0]);
        await fetchMessages(existing[0].id);
        subscribeToMessages(existing[0].id);
      }
    } catch (err) {
      console.error('Chat init error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMessages(conversationId) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);

    // Mark messages as read when opened
    await supabase.rpc('mark_messages_read', {
      conv_id: conversationId,
      reader_id: user.id,
    });
  }

  function subscribeToMessages(conversationId) {
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        // Fetch full message with profile
        const { data } = await supabase
          .from('chat_messages')
          .select('*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role)')
          .eq('id', payload.new.id)
          .single();

        if (data) {
          setMessages((prev) => {
            if (prev.find((m) => m.id === data.id)) return prev;
            return [...prev, data];
          });
          // Auto-mark as read since chat is open
          await supabase.rpc('mark_messages_read', {
            conv_id: conversationId,
            reader_id: user.id,
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        // Update read status in real time
        setMessages((prev) =>
          prev.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m)
        );
      })
      .subscribe();

    channelRef.current = channel;
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setSending(true);

    try {
      let conv = conversation;

      if (!conv) {
        const { data, error } = await supabase
          .from('chat_conversations')
          .insert({ customer_id: user.id, status: 'open' })
          .select()
          .single();

        if (error) throw error;
        conv = data;
        setConversation(conv);
        subscribeToMessages(conv.id);
      }

      const msg = await sendMessage(conv.id, user.id, input.trim());
      setMessages((prev) => [...prev, msg]);
      setInput('');
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-dark-900 flex items-center justify-center">
        <p className="text-gray-400">Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold">
          MF
        </div>
        <div>
          <p className="font-semibold text-sm">MotoFix Support</p>
          <p className="text-xs text-green-400">● Online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">💬</p>
            <p className="text-gray-400 text-sm font-medium mb-1">
              Hi {profile?.first_name || 'there'}! 👋
            </p>
            <p className="text-gray-500 text-sm">
              Send a message to start chatting with our support team.
            </p>
          </div>
        )}

        {messages.map((msg, index) => {
          const isOwn = msg.sender_id === user.id;
          const isBot = msg.is_bot;
          const isLast = index === messages.length - 1;

          // Show read receipt only on last sent message
          const showReadReceipt = isOwn && isLast;
          const isRead = msg.is_read;

          return (
            <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
              <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} w-full`}>
                <div className={`max-w-xs md:max-w-md flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && (
                    <p className="text-xs text-gray-500 px-1">
                      {isBot ? '🤖 AI Assistant' : `${msg.profiles?.first_name || 'Support'}`}
                    </p>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                    isOwn
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : isBot
                      ? 'bg-dark-700 text-gray-200 rounded-bl-sm border border-gray-700'
                      : 'bg-dark-800 text-gray-200 rounded-bl-sm'
                  }`}>
                    {msg.message}
                  </div>
                  <div className={`flex items-center gap-1 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    <p className="text-xs text-gray-600">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {/* Read receipt — only on last own message */}
                    {showReadReceipt && (
                      <span className={`text-xs ${isRead ? 'text-primary-400' : 'text-gray-600'}`}>
                        {isRead ? '✓✓ Seen' : '✓ Sent'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 px-6 py-4 max-w-3xl w-full mx-auto">
        {conversation?.status === 'closed' ? (
          <p className="text-center text-sm text-gray-500 py-2">
            This conversation has been closed by the shop.
          </p>
        ) : (
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={sending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-medium transition"
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}