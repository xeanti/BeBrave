import { useEffect, useRef, useState } from 'react';
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

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
          <p className="text-gray-500 text-sm">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white flex overflow-hidden transition-colors">

      {/* ── Sidebar (desktop only) ── */}
      <aside className="hidden md:flex flex-col w-72 xl:w-80 border-r border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 shrink-0">

        {/* Sidebar header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Messages</h2>
          <p className="text-xs text-gray-500 mt-0.5">Your support conversations</p>
        </div>

        {/* Conversation entry */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversation ? (
            <button className="w-full flex items-start gap-3 px-4 py-3.5 bg-primary-50 dark:bg-dark-700/40 border-l-2 border-primary-500 hover:bg-primary-50/80 dark:hover:bg-dark-700/60 transition-colors text-left">
              <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5">
                MF
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    MotoFix Support
                  </p>
                  {messages.length > 0 && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                      {formatTime(messages[messages.length - 1].created_at)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 truncate mt-0.5">
                  {messages.length > 0
                    ? messages[messages.length - 1].message
                    : 'No messages yet'}
                </p>
              </div>
            </button>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-600">No conversations yet.</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Send a message to get started.</p>
            </div>
          )}
        </div>

        {/* Sidebar footer — user info */}
        <div className="px-4 py-3.5 border-t border-gray-200 dark:border-dark-700 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 shrink-0">
            {profile?.first_name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
      </aside>

      {/* ── Chat panel ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Chat header */}
        <div className="border-b border-gray-200 dark:border-dark-700 px-5 py-3.5 flex items-center gap-3 bg-white dark:bg-dark-800 shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
            MF
          </div>
          <div>
            <p className="font-medium text-sm text-gray-900 dark:text-white leading-tight">
              MotoFix Support
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 inline-block" />
              Online
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 flex flex-col gap-2 bg-gray-50 dark:bg-dark-900">

          {messages.length > 0 && (
            <div className="flex items-center gap-3 mb-1">
              <div className="flex-1 h-px bg-gray-200 dark:bg-dark-700" />
              <span className="text-[11px] text-gray-400 dark:text-gray-600">Today</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-dark-700" />
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 py-20">
              <div className="w-14 h-14 rounded-full bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 flex items-center justify-center text-2xl">
                💬
              </div>
              <div className="text-center">
                <p className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1">
                  Hi {profile?.first_name || 'there'}! 👋
                </p>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
                  Send a message to start chatting with our support team.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, index) => {
            const isOwn = msg.sender_id === user.id;
            const isBot = msg.is_bot;
            const isLast = index === messages.length - 1;
            const showReadReceipt = isOwn && isLast;

            return (
              <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                {!isOwn && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1 px-1">
                    {isBot
                      ? '🤖 AI Assistant'
                      : `${msg.profiles?.first_name || 'Support'} (Staff)`}
                  </p>
                )}

                <div className={`max-w-xs md:max-w-lg lg:max-w-xl px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isOwn
                    ? 'bg-primary-600 text-white rounded-br-sm'
                    : isBot
                    ? 'bg-white dark:bg-dark-700 text-gray-800 dark:text-gray-200 rounded-bl-sm border border-gray-200 dark:border-dark-700'
                    : 'bg-white dark:bg-dark-700 text-gray-800 dark:text-gray-200 rounded-bl-sm border border-gray-200 dark:border-dark-700/60'
                }`}>
                  {msg.message}
                </div>

                <div className={`flex items-center gap-1.5 mt-1 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-[11px] text-gray-400 dark:text-gray-600">
                    {formatTime(msg.created_at)}
                  </span>
                  {showReadReceipt && (
                    <span className={`text-[11px] ${msg.is_read ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-600'}`}>
                      {msg.is_read ? '✓✓ Seen' : '✓ Sent'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 px-5 md:px-8 py-3.5 shrink-0">
          {conversation?.status === 'closed' ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
              This conversation has been closed by the shop.
            </p>
          ) : (
            <form onSubmit={handleSend} className="flex items-center gap-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-700 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500/60 transition-colors"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="w-9 h-9 rounded-full bg-primary-600 hover:bg-primary-500 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
                aria-label="Send"
              >
                {sending ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <svg className="w-4 h-4 text-white translate-x-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}