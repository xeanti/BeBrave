import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { sendMessage } from '../../lib/chat';

function formatTime(timestamp) {
  if (!timestamp) return '';

  return new Date(timestamp).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(timestamp) {
  if (!timestamp) return '';

  return new Date(timestamp).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(timestamp) {
  if (!timestamp) return '';

  return new Date(timestamp).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCustomerName(conversation) {
  const profile = conversation?.profiles || conversation?.customer;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  return name || 'Unknown Customer';
}

function getAgentName(conversation) {
  const profile = conversation?.staff;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  return name || 'Not assigned yet';
}

function getRoleLabel(role) {
  if (!role) return 'Staff';
  return String(role).charAt(0).toUpperCase() + String(role).slice(1);
}

function getRoleBadgeStyle(role) {
  const normalized = String(role || '').toLowerCase();

  const styles = {
    admin:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
    staff:
      'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
    mechanic:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
    customer:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
    bot:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
    support:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  };

  return styles[normalized] || styles.support;
}

function RoleBadge({ role, isBot = false }) {
  const normalized = isBot ? 'bot' : String(role || 'support').toLowerCase();
  const label = isBot ? 'AI Assistant' : getRoleLabel(normalized);

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${getRoleBadgeStyle(normalized)}`}>
      {label}
    </span>
  );
}

function isShopTeamRole(role) {
  return ['admin', 'staff', 'mechanic'].includes(String(role || '').toLowerCase());
}

function getInitials(profile) {
  const first = profile?.first_name?.[0] || '';
  const last = profile?.last_name?.[0] || '';

  return `${first}${last}`.toUpperCase() || '?';
}

function StatusBadge({ status }) {
  const isOpen = status === 'open';

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black capitalize ring-1 ${
        isOpen
          ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
          : 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25'
      }`}
    >
      {status || 'open'}
    </span>
  );
}

function Avatar({ profile, size = 'md' }) {
  const sizeClasses = {
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-base',
  };

  if (profile?.profile_photo_url) {
    return (
      <img
        src={profile.profile_photo_url}
        alt={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'User'}
        className={`${sizeClasses[size]} flex-shrink-0 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} grid flex-shrink-0 place-items-center rounded-2xl bg-primary-600 font-black text-white shadow-sm shadow-primary-600/20`}
    >
      {getInitials(profile)}
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="space-y-1 p-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="flex gap-3 rounded-3xl p-3">
          <div className="h-11 w-11 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
          <div className="flex-1">
            <div className="mb-2 h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
            <div className="h-3 w-44 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message, currentUserId }) {
  const senderRole = message.profiles?.role || 'customer';
  const isShopTeamMessage = isShopTeamRole(senderRole);
  const isCurrentUser = message.sender_id === currentUserId;

  const senderName = isCurrentUser
    ? 'You'
    : message.profiles?.first_name || (isShopTeamMessage ? 'Support' : 'Customer');

  return (
    <div className={`flex flex-col ${isShopTeamMessage ? 'items-end' : 'items-start'}`}>
      <div className={`mb-1 flex items-center gap-2 px-1 ${isShopTeamMessage ? 'flex-row-reverse' : 'flex-row'}`}>
        <span
          className={`text-[11px] font-bold ${
            isShopTeamMessage
              ? 'text-primary-500 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {senderName}
        </span>
        <RoleBadge role={senderRole} />
      </div>

      <div
        className={`max-w-xs rounded-3xl px-4 py-3 text-sm leading-relaxed md:max-w-lg lg:max-w-xl ${
          isShopTeamMessage
            ? 'rounded-br-md bg-primary-600 text-white shadow-lg shadow-primary-600/10'
            : 'rounded-bl-md border border-gray-200 bg-white text-gray-800 shadow-sm dark:border-dark-700 dark:bg-dark-800 dark:text-gray-200'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.message}</p>
      </div>

      <div className={`mt-1 flex items-center gap-1.5 px-1 ${isShopTeamMessage ? 'flex-row-reverse' : 'flex-row'}`}>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {formatTime(message.created_at)}
        </span>

        {isCurrentUser && (
          <span
            className={`text-[11px] font-bold ${
              message.is_read
                ? 'text-primary-500 dark:text-primary-400'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {message.is_read ? '✓✓ Seen' : '✓ Sent'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminChat() {
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const selectedRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const bottomRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!user?.id) return;

    fetchConversations();

    /*
      Realtime refresh for admin chat.
      Enable Realtime in Supabase for chat_conversations and chat_messages.
    */
    const channel = supabase
      .channel('admin-chat-global')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
        },
        () => fetchConversations(false)
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const activeConversation = selectedRef.current;

          if (payload.new.conversation_id === activeConversation?.id) {
            fetchMessages(activeConversation.id, false);
          }

          fetchConversations(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const activeConversation = selectedRef.current;

          if (payload.new.conversation_id === activeConversation?.id) {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === payload.new.id ? { ...message, ...payload.new } : message
              )
            );
          }

          fetchConversations(false);
        }
      )
      .subscribe();

    const handleFocus = () => {
      fetchConversations(false);
      if (selectedRef.current?.id) fetchMessages(selectedRef.current.id, false);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchConversations(false);
        if (selectedRef.current?.id) fetchMessages(selectedRef.current.id, false);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchConversations(showLoader = true) {
    if (!user?.id) return;

    if (showLoader) setLoadingConversations(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('chat_conversations')
      .select(`
        *,
        profiles!chat_conversations_customer_id_fkey(first_name, last_name, email, profile_photo_url),
        staff:profiles!chat_conversations_staff_id_fkey(first_name, last_name, email, role, profile_photo_url)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load conversations.');
      setConversations([]);
      setLoadingConversations(false);
      return;
    }

    const withUnread = await Promise.all(
      (data || []).map(async (conversation) => {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversation.id)
          .neq('sender_id', user.id)
          .eq('is_read', false);

        return {
          ...conversation,
          unread: count || 0,
        };
      })
    );

    setConversations(withUnread);
    setLastUpdated(new Date());
    setLoadingConversations(false);
  }

  async function fetchMessages(conversationId, showLoader = true) {
    if (!conversationId || !user?.id) return;

    if (showLoader) setLoadingMessages(true);

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      setFetchError(error.message || 'Failed to load messages.');
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setMessages(data || []);

    await supabase.rpc('mark_messages_read', {
      conv_id: conversationId,
      reader_id: user.id,
    });

    fetchConversations(false);
    setLoadingMessages(false);
  }

  async function selectConversation(conversation) {
    setSelected(conversation);
    setFetchError('');

    if (!conversation.staff_id) {
      const { error } = await supabase
        .from('chat_conversations')
        .update({
          staff_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);

      if (!error) {
        setSelected({
          ...conversation,
          staff_id: user.id,
          staff: {
            id: user.id,
            first_name: user.user_metadata?.first_name || 'Current',
            last_name: user.user_metadata?.last_name || 'User',
            email: user.email,
            role: user.user_metadata?.role || 'staff',
          },
        });
      }
    }

    await fetchMessages(conversation.id);

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`admin-chat-conversation-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('chat_messages')
            .select('*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role)')
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((previous) => {
              if (previous.find((message) => message.id === data.id)) return previous;
              return [...previous, data];
            });

            await supabase.rpc('mark_messages_read', {
              conv_id: conversation.id,
              reader_id: user.id,
            });

            fetchConversations(false);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
  }

  async function handleSend(event) {
    event.preventDefault();

    if (!input.trim() || !selected || !user?.id) return;

    const messageText = input.trim();

    setSending(true);
    setFetchError('');

    try {
      const message = await sendMessage(selected.id, user.id, messageText);

      setMessages((previous) => {
        if (message?.id && previous.find((item) => item.id === message.id)) {
          return previous;
        }

        return [...previous, message];
      });

      setInput('');
      fetchConversations(false);
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  async function updateConversationStatus(id, status) {
    setUpdatingStatus(true);
    setFetchError('');

    try {
      const { error } = await supabase
        .from('chat_conversations')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      fetchConversations(false);

      if (selected?.id === id) {
        setSelected((previous) => ({
          ...previous,
          status,
        }));
      }
    } catch (err) {
      setFetchError(err.message || 'Failed to update conversation.');
    } finally {
      setUpdatingStatus(false);
    }
  }

  const filteredConversations = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const customerName = getCustomerName(conversation).toLowerCase();
      const email = String(conversation.profiles?.email || '').toLowerCase();
      const status = conversation.status || 'open';

      const matchesSearch =
        !searchTerm ||
        customerName.includes(searchTerm) ||
        email.includes(searchTerm) ||
        String(conversation.id || '').toLowerCase().includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [conversations, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: conversations.length,
      open: conversations.filter((conversation) => conversation.status === 'open').length,
      closed: conversations.filter((conversation) => conversation.status === 'closed').length,
      unread: conversations.filter((conversation) => conversation.unread > 0).length,
    };
  }, [conversations]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + (conversation.unread || 0), 0),
    [conversations]
  );

  const messagesByDate = useMemo(() => {
    const groups = [];

    messages.forEach((message) => {
      const label = formatDate(message.created_at);
      const lastGroup = groups[groups.length - 1];

      if (lastGroup?.label === label) {
        lastGroup.messages.push(message);
      } else {
        groups.push({
          label,
          messages: [message],
        });
      }
    });

    return groups;
  }, [messages]);

  return (
    <div className="h-[calc(100vh-65px)] bg-gray-50 text-gray-900 dark:bg-dark-900 dark:text-white">
      <div className="flex h-full overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800 xl:w-96">
          <div className="border-b border-gray-200 p-5 dark:border-dark-700">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Admin Chat
                </p>
                <h1 className="text-xl font-black text-gray-950 dark:text-white">
                  Conversations
                </h1>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {conversations.length} total · {totalUnread} unread
                </p>
                {lastUpdated && (
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    Updated {formatTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchConversations(false)}
                className="rounded-2xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                Refresh
              </button>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer or email..."
              className="mb-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
            />

            <div className="flex flex-wrap gap-2">
              {[
                ['all', 'All', counts.all],
                ['open', 'Open', counts.open],
                ['closed', 'Closed', counts.closed],
              ].map(([key, label, count]) => {
                const active = statusFilter === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {fetchError && (
            <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {fetchError}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <ConversationSkeleton />
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
                  💬
                </div>
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  No conversations found.
                </p>
              </div>
            ) : (
              <div className="p-3">
                {filteredConversations.map((conversation) => {
                  const active = selected?.id === conversation.id;
                  const customerName = getCustomerName(conversation);

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => selectConversation(conversation)}
                      className={`mb-2 flex w-full items-start gap-3 rounded-3xl border p-3 text-left transition ${
                        active
                          ? 'border-primary-100 bg-primary-50 shadow-sm dark:border-primary-500/25 dark:bg-primary-500/10'
                          : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-dark-700 dark:hover:bg-dark-900/60'
                      }`}
                    >
                      <Avatar profile={conversation.profiles} size="md" />

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                            {customerName}
                          </p>

                          {conversation.unread > 0 && (
                            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-600 px-1.5 text-[10px] font-black text-white">
                              {conversation.unread > 9 ? '9+' : conversation.unread}
                            </span>
                          )}
                        </div>

                        <p className="mb-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          {conversation.profiles?.email || 'No email'}
                        </p>

                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="truncate text-[11px] font-bold text-gray-400 dark:text-gray-500">
                            Handled by: {getAgentName(conversation)}
                          </p>
                          {conversation.staff?.role && <RoleBadge role={conversation.staff.role} />}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge status={conversation.status} />
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            {formatDateTime(conversation.updated_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Chat panel */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-white text-4xl shadow-sm ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                  💬
                </div>
                <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
                  Select a conversation
                </h2>
                <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Choose a customer conversation from the left panel to view messages and reply.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4 dark:border-dark-700 dark:bg-dark-800">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar profile={selected.profiles} size="md" />

                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                        {getCustomerName(selected)}
                      </p>
                      <StatusBadge status={selected.status} />
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {selected.profiles?.email || 'No email'}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="truncate text-[11px] font-bold text-gray-400 dark:text-gray-500">
                        Handled by: {getAgentName(selected)}
                      </p>
                      {selected.staff?.role && <RoleBadge role={selected.staff.role} />}
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchMessages(selected.id)}
                    className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                  >
                    Refresh
                  </button>

                  {selected.status === 'open' ? (
                    <button
                      type="button"
                      onClick={() => updateConversationStatus(selected.id, 'closed')}
                      disabled={updatingStatus}
                      className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-600 transition hover:border-red-300 hover:text-red-700 disabled:opacity-50 dark:border-dark-700 dark:text-gray-300 dark:hover:border-red-500/40 dark:hover:text-red-300"
                    >
                      {updatingStatus ? 'Closing...' : 'Close Chat'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateConversationStatus(selected.id, 'open')}
                      disabled={updatingStatus}
                      className="rounded-2xl border border-green-200 bg-green-50 px-4 py-2 text-xs font-black text-green-700 transition hover:bg-green-100 disabled:opacity-50 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-500/20"
                    >
                      {updatingStatus ? 'Reopening...' : 'Reopen Chat'}
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-5 dark:bg-dark-900 sm:px-6">
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      Loading messages...
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-white text-3xl ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                        ✉️
                      </div>
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                        No messages yet.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messagesByDate.map((group) => (
                      <div key={group.label}>
                        <div className="mb-4 flex items-center gap-3">
                          <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-gray-400 ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                            {group.label}
                          </span>
                          <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
                        </div>

                        <div className="space-y-3">
                          {group.messages.map((message, index) => {
                            return (
                              <MessageBubble
                                key={message.id || `${message.created_at}-${index}`}
                                message={message}
                                currentUserId={user.id}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 dark:border-dark-700 dark:bg-dark-800 sm:px-6">
                {selected.status === 'closed' ? (
                  <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-dark-700 dark:bg-dark-900/70">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      This conversation is closed.{' '}
                      <button
                        type="button"
                        onClick={() => updateConversationStatus(selected.id, 'open')}
                        className="font-black text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-400"
                      >
                        Reopen it
                      </button>{' '}
                      to continue replying.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSend} className="flex items-end gap-3">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          handleSend(event);
                        }
                      }}
                      rows={1}
                      placeholder="Reply to customer..."
                      disabled={sending}
                      className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                    />

                    <button
                      type="submit"
                      disabled={sending || !input.trim()}
                      className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Send"
                    >
                      {sending ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <svg
                          className="h-4 w-4 translate-x-px"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </form>
                )}

                <p className="mt-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
                  Press Enter to send. Use Shift + Enter for a new line.
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
