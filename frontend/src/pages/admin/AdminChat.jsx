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
      // For each conversation, count unread messages
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

    // Mark as read
    await supabase.rpc('mark_messages_read', {
      conv_id: conversationId,
      reader_id: user.id,
    });

    // Refresh to clear badge
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

    // Subscribe to this conversation's messages
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
          // Auto mark as read since admin is viewing
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

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white flex">

      {/* Sidebar */}
      <div className="w-72 border-r border-gray-800 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-800">
          <h2 className="font-semibold">Conversations</h2>
          <p className="text-xs text-gray-500 mt-0.5">{conversations.length} total</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => selectConversation(c)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-dark-800 transition ${
                  selected?.id === c.id ? 'bg-dark-800 border-l-2 border-l-primary-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium truncate">
                    {c.profiles?.first_name
                      ? `${c.profiles.first_name} ${c.profiles.last_name}`
                      : 'Unknown Customer'}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {/* Only show badge if unread > 0 */}
                    {c.unread > 0 && (
                      <span className="bg-primary-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                        {c.unread > 9 ? '9+' : c.unread}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === 'open'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 truncate">{c.profiles?.email}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-gray-400">Select a conversation to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  {selected.profiles?.first_name} {selected.profiles?.last_name}
                </p>
                <p className="text-xs text-gray-400">{selected.profiles?.email}</p>
              </div>
              <div className="flex gap-2">
                {selected.status === 'open' ? (
                  <button
                    onClick={() => closeConversation(selected.id)}
                    className="text-xs border border-gray-600 text-gray-400 hover:text-white px-3 py-1.5 rounded-md transition"
                  >
                    Close Chat
                  </button>
                ) : (
                  <button
                    onClick={() => reopenConversation(selected.id)}
                    className="text-xs border border-green-500/30 text-green-400 px-3 py-1.5 rounded-md transition"
                  >
                    Reopen Chat
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-8">No messages yet.</p>
              )}
              {messages.map((msg, index) => {
                const isOwn = msg.sender_id === user.id;
                const isLast = index === messages.length - 1;
                const showReadReceipt = isOwn && isLast;

                return (
                  <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-xs md:max-w-md flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && (
                        <p className="text-xs text-gray-500 px-1">
                          {msg.profiles?.first_name || 'Customer'}
                        </p>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                        isOwn
                          ? 'bg-primary-600 text-white rounded-br-sm'
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
                        {showReadReceipt && (
                          <span className={`text-xs ${msg.is_read ? 'text-primary-400' : 'text-gray-600'}`}>
                            {msg.is_read ? '✓✓ Seen' : '✓ Sent'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-800 px-6 py-4">
              {selected.status === 'closed' ? (
                <p className="text-center text-sm text-gray-500">
                  This conversation is closed.{' '}
                  <button
                    onClick={() => reopenConversation(selected.id)}
                    className="text-primary-400 hover:underline"
                  >
                    Reopen it
                  </button>
                </p>
              ) : (
                <form onSubmit={handleSend} className="flex gap-3">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Reply to customer..."
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
          </>
        )}
      </div>
    </div>
  );
}