import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { sendMessage } from '../../lib/chat';

export default function AdminChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel('admin-chat-convs')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_conversations',
      }, () => fetchConversations())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (payload) => {
        if (payload.new.conversation_id === selected?.id) {
          fetchMessages(selected.id);
        }
        fetchConversations();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
      }, (payload) => {
        if (payload.new.conversation_id === selected?.id) {
          setMessages((prev) =>
            prev.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m)
          );
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchConversations() {
    const { data } = await supabase
      .from('chat_conversations')
      .select('*, profiles!chat_conversations_customer_id_fkey(first_name, last_name, email)')
      .order('updated_at', { ascending: false });

    if (data) {
      const withUnread = await Promise.all(
        data.map(async (c) => {
          const { count } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact' })
            .eq('conversation_id', c.id)
            .neq('sender_id', user.id)
            .eq('is_read', false);
          return { ...c, unread: count || 0 };
        })
      );
      setConversations(withUnread);
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

    fetchConversations();
  }

  async function selectConversation(conv) {
    setSelected(conv);

    if (!conv.staff_id) {
      await supabase
        .from('chat_conversations')
        .update({ staff_id: user.id })
        .eq('id', conv.id);
    }

    await fetchMessages(conv.id);

    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const channel = supabase
      .channel(`admin-chat:${conv.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conv.id}`,
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
            conv_id: conv.id,
            reader_id: user.id,
          });
          fetchConversations();
        }
      })
      .subscribe();
    channelRef.current = channel;
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !selected) return;
    setSending(true);
    try {
      const msg = await sendMessage(selected.id, user.id, input.trim());
      setMessages((prev) => [...prev, msg]);
      setInput('');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function closeConversation(id) {
    await supabase.from('chat_conversations').update({ status: 'closed' }).eq('id', id);
    fetchConversations();
    if (selected?.id === id) setSelected((prev) => ({ ...prev, status: 'closed' }));
  }

  async function reopenConversation(id) {
    await supabase.from('chat_conversations').update({ status: 'open' }).eq('id', id);
    fetchConversations();
    if (selected?.id === id) setSelected((prev) => ({ ...prev, status: 'open' }));
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getInitials(profile) {
    if (!profile?.first_name) return '?';
    return `${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase();
  }

  return (
    <div className="h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white flex overflow-hidden transition-colors">

      {/* ── Sidebar ── */}
      <aside className="w-72 xl:w-80 border-r border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 flex flex-col shrink-0">

        {/* Sidebar header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Conversations</h2>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
            {conversations.length} total
          </p>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-10">
              No conversations yet.
            </p>
          ) : (
            conversations.map((c) => {
              const isActive = selected?.id === c.id;
              const customerName = c.profiles?.first_name
                ? `${c.profiles.first_name} ${c.profiles.last_name}`
                : 'Unknown Customer';

              return (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c)}
                  className={`w-full text-left px-4 py-3.5 border-b border-gray-100 dark:border-dark-700 transition-colors flex items-start gap-3 ${
                    isActive
                      ? 'bg-primary-50 dark:bg-dark-700 border-l-2 border-l-primary-500'
                      : 'hover:bg-gray-50 dark:hover:bg-dark-700/50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-600/20 flex items-center justify-center text-xs font-semibold text-primary-600 dark:text-primary-400 shrink-0 mt-0.5">
                    {getInitials(c.profiles)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className={`text-sm font-medium truncate ${
                        isActive
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-800 dark:text-gray-200'
                      }`}>
                        {customerName}
                      </p>
                      {c.unread > 0 && (
                        <span className="bg-primary-500 text-white text-[10px] w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full flex items-center justify-center font-bold shrink-0">
                          {c.unread > 9 ? '9+' : c.unread}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
                        {c.profiles?.email}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
                        c.status === 'open'
                          ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-500/20 text-gray-500 dark:text-gray-400'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Chat panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-dark-800 border border-gray-200 dark:border-dark-700 flex items-center justify-center text-2xl mx-auto mb-4">
                💬
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                Select a conversation to start chatting
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="border-b border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 px-6 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-600/20 flex items-center justify-center text-xs font-semibold text-primary-600 dark:text-primary-400 shrink-0">
                  {getInitials(selected.profiles)}
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">
                    {selected.profiles?.first_name} {selected.profiles?.last_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {selected.profiles?.email}
                  </p>
                </div>
              </div>

              <div>
                {selected.status === 'open' ? (
                  <button
                    onClick={() => closeConversation(selected.id)}
                    className="text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 dark:hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Close Chat
                  </button>
                ) : (
                  <button
                    onClick={() => reopenConversation(selected.id)}
                    className="text-xs border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Reopen Chat
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-2 bg-gray-50 dark:bg-dark-900">

              {/* Date divider */}
              {messages.length > 0 && (
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-dark-700" />
                  <span className="text-[11px] text-gray-400 dark:text-gray-600">Today</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-dark-700" />
                </div>
              )}

              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-gray-400 dark:text-gray-500 text-sm">No messages yet.</p>
                </div>
              )}

              {messages.map((msg, index) => {
                const isOwn = msg.sender_id === user.id;
                const isLast = index === messages.length - 1;
                const showReadReceipt = isOwn && isLast;

                return (
                  <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                    {!isOwn && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1 px-1">
                        {msg.profiles?.first_name || 'Customer'}
                      </p>
                    )}

                    <div className={`max-w-xs md:max-w-lg lg:max-w-xl px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isOwn
                        ? 'bg-primary-600 text-white rounded-br-sm'
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
            <div className="border-t border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800 px-6 py-3.5 shrink-0">
              {selected.status === 'closed' ? (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-1">
                  This conversation is closed.{' '}
                  <button
                    onClick={() => reopenConversation(selected.id)}
                    className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                  >
                    Reopen it
                  </button>
                </p>
              ) : (
                <form onSubmit={handleSend} className="flex items-center gap-3">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Reply to customer..."
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
          </>
        )}
      </div>
    </div>
  );
}