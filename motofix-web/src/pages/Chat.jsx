import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { sendMessage } from '../lib/chat';

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

function getRoleLabel(role) {
  if (!role) return 'Support';
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
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${getRoleBadgeStyle(
        normalized
      )}`}
    >
      {label}
    </span>
  );
}

function getAgentName(conversation) {
  const staff = conversation?.staff;
  const name = `${staff?.first_name || ''} ${staff?.last_name || ''}`.trim();

  return name || 'Waiting for support';
}

function getProfileName(profile, fallback = 'User') {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  return name || fallback;
}

function getInitials(profile, fallback = 'U') {
  const first = profile?.first_name?.[0] || '';
  const last = profile?.last_name?.[0] || '';

  return `${first}${last}`.toUpperCase() || fallback;
}

function Avatar({
  profile,
  fallback = 'U',
  className = 'h-10 w-10 rounded-2xl',
}) {
  if (profile?.profile_photo_url) {
    return (
      <img
        src={profile.profile_photo_url}
        alt={getProfileName(profile)}
        className={`${className} flex-shrink-0 object-cover ring-1 ring-gray-200 dark:ring-dark-700`}
      />
    );
  }

  return (
    <div
      className={`${className} grid flex-shrink-0 place-items-center bg-primary-600 text-sm font-black text-white shadow-sm shadow-primary-600/20`}
    >
      {getInitials(profile, fallback)}
    </div>
  );
}

function MessageBubble({ message, isOwn, isLastOwn }) {
  const isBot = message.is_bot;
  const role = message.profiles?.role;
  const senderName = isOwn
    ? 'You'
    : isBot
    ? 'AI Assistant'
    : getProfileName(message.profiles, 'Support');

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
      <div
        className={`mb-1 flex items-center gap-2 px-1 ${
          isOwn ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <span
          className={`text-[11px] font-bold ${
            isOwn
              ? 'text-primary-500 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {senderName}
        </span>
        <RoleBadge role={isOwn ? 'customer' : role} isBot={isBot} />
      </div>

      <div
        className={`max-w-xs rounded-3xl px-4 py-3 text-sm leading-relaxed md:max-w-lg lg:max-w-xl ${
          isOwn
            ? 'rounded-br-md bg-primary-600 text-white shadow-lg shadow-primary-600/10'
            : 'rounded-bl-md border border-gray-200 bg-white text-gray-800 shadow-sm dark:border-dark-700 dark:bg-dark-800 dark:text-gray-200'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.message}</p>
      </div>

      <div
        className={`mt-1 flex items-center gap-1.5 px-1 ${
          isOwn ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {formatTime(message.created_at)}
        </span>

        {isLastOwn && (
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

function ConversationSkeleton() {
  return (
    <div className="flex h-[calc(100vh-65px)] items-center justify-center bg-gray-50 dark:bg-dark-900">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          Loading chat...
        </p>
      </div>
    </div>
  );
}

export default function Chat() {
  const { user, profile } = useAuth();

  const [selectedType, setSelectedType] = useState(null);

  const [conversation, setConversation] = useState(null);
  const conversationRef = useRef(null);
  const selectedTypeRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [lastUpdated, setLastUpdated] = useState(null);

  const bottomRef = useRef(null);
  const messageChannelRef = useRef(null);
  const conversationChannelRef = useRef(null);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    selectedTypeRef.current = selectedType;
  }, [selectedType]);

  useEffect(() => {
    if (!user?.id || !selectedType) return;

    initChat(selectedType);

    const convChannel = supabase
      .channel(`customer-chat-conversations-${user.id}-${selectedType}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `customer_id=eq.${user.id}`,
        },
        async (payload) => {
          const activeConversation = conversationRef.current;
          const activeType = selectedTypeRef.current;

          if (payload.new?.conversation_type !== activeType) return;

          if (payload.new?.id && activeConversation?.id === payload.new.id) {
            await fetchConversation(payload.new.id);
          } else if (!activeConversation) {
            await initChat(activeType, false);
          }
        }
      )
      .subscribe();

    conversationChannelRef.current = convChannel;

    const handleFocus = () => {
      const activeConversation = conversationRef.current;
      const activeType = selectedTypeRef.current;

      if (!activeType) return;

      if (activeConversation?.id) {
        fetchConversation(activeConversation.id);
        fetchMessages(activeConversation.id, false);
      } else {
        initChat(activeType, false);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) handleFocus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (messageChannelRef.current) {
        supabase.removeChannel(messageChannelRef.current);
        messageChannelRef.current = null;
      }

      if (conversationChannelRef.current) {
        supabase.removeChannel(conversationChannelRef.current);
        conversationChannelRef.current = null;
      }

      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id, selectedType]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function initChat(type = selectedTypeRef.current || 'human', showLoader = true) {
    if (!user?.id || !type) return;

    if (showLoader) setLoading(true);

    setFetchError('');

    try {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select(`
          *,
          staff:profiles!chat_conversations_staff_id_fkey(first_name, last_name, email, role, profile_photo_url)
        `)
        .eq('customer_id', user.id)
        .eq('status', 'open')
        .eq('conversation_type', type)
        .order('created_at', { ascending: true })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const activeConversation = data[0];

        setConversation(activeConversation);
        await fetchMessages(activeConversation.id, false);
        subscribeToMessages(activeConversation.id);
      } else {
        setConversation(null);
        setMessages([]);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Chat init error:', err);
      setFetchError(err.message || 'Failed to load chat.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchConversation(conversationId) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select(`
        *,
        staff:profiles!chat_conversations_staff_id_fkey(first_name, last_name, email, role, profile_photo_url)
      `)
      .eq('id', conversationId)
      .single();

    if (!error && data) {
      setConversation(data);
      setLastUpdated(new Date());
    }
  }

  async function fetchMessages(conversationId, showError = true) {
    if (!conversationId || !user?.id) return;

    const { data, error } = await supabase
      .from('chat_messages')
      .select(
        '*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role, profile_photo_url)'
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      if (showError) setFetchError(error.message || 'Failed to load messages.');
      return;
    }

    setMessages(data || []);
    setLastUpdated(new Date());

    await supabase.rpc('mark_messages_read', {
      conv_id: conversationId,
      reader_id: user.id,
    });
  }

  function subscribeToMessages(conversationId) {
    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
    }

    const channel = supabase
      .channel(`customer-chat-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('chat_messages')
            .select(
              '*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role, profile_photo_url)'
            )
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((previous) => {
              if (previous.find((message) => message.id === data.id)) {
                return previous;
              }

              return [...previous, data];
            });

            await supabase.rpc('mark_messages_read', {
              conv_id: conversationId,
              reader_id: user.id,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === payload.new.id ? { ...message, ...payload.new } : message
            )
          );
        }
      )
      .subscribe();

    messageChannelRef.current = channel;
  }

  function handleChooseChat(type) {
    setSelectedType(type);
    setConversation(null);
    setMessages([]);
    setInput('');
    setFetchError('');
  }

  function handleBackToChoices() {
    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }

    if (conversationChannelRef.current) {
      supabase.removeChannel(conversationChannelRef.current);
      conversationChannelRef.current = null;
    }

    setSelectedType(null);
    setConversation(null);
    setMessages([]);
    setInput('');
    setFetchError('');
    setLastUpdated(null);
  }

  async function handleSend(event) {
    event.preventDefault();

    if (!input.trim() || !user?.id || !selectedType) return;

    const messageText = input.trim();

    setSending(true);
    setFetchError('');

    try {
      let activeConversation = conversation;

      if (!activeConversation) {
        const { data, error } = await supabase
          .from('chat_conversations')
          .insert({
            customer_id: user.id,
            status: 'open',
            conversation_type: selectedType,
          })
          .select(`
            *,
            staff:profiles!chat_conversations_staff_id_fkey(first_name, last_name, email, role, profile_photo_url)
          `)
          .single();

        if (error) throw error;

        activeConversation = data;
        setConversation(activeConversation);
        subscribeToMessages(activeConversation.id);
      }

      const message = await sendMessage(activeConversation.id, user.id, messageText);

      setMessages((previous) => {
        if (message?.id && previous.find((item) => item.id === message.id)) {
          return previous;
        }

        return [
          ...previous,
          {
            ...message,
            profiles: {
              first_name: profile?.first_name,
              last_name: profile?.last_name,
              role: profile?.role || 'customer',
              profile_photo_url: profile?.profile_photo_url,
            },
          },
        ];
      });

      setInput('');
      setLastUpdated(new Date());

      if ((activeConversation.conversation_type || selectedType) === 'ai') {
        supabase.functions
          .invoke('ai-chatbot', {
            body: {
              conversation_id: activeConversation.id,
              message: messageText,
            },
          })
          .then(({ error }) => {
            if (error) {
              console.error('AI chatbot error:', error);
              setFetchError(
                'AI Assistant could not reply right now. Please try again later.'
              );
            }
          });
      }
    } catch (err) {
      console.error('Send error:', err);
      setFetchError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  const messagesByDate = messages.reduce((groups, message) => {
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

    return groups;
  }, []);

  const lastMessage = messages[messages.length - 1];

  const activeType = conversation?.conversation_type || selectedType;
  const isAiChat = activeType === 'ai';

  const chatTitle = isAiChat ? 'AI Assistant' : 'MotoFix Support';
  const chatIcon = isAiChat ? 'AI' : 'MF';
  const handledBy = isAiChat ? 'AI Assistant' : getAgentName(conversation);

  if (!selectedType) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-10 text-gray-900 dark:bg-dark-900 dark:text-white">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              MotoFix Chat
            </p>
            <h1 className="text-3xl font-black text-gray-950 dark:text-white md:text-4xl">
              How can we help you?
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              Choose AI Assistant for quick automated help or talk to the MotoFix
              support team for real-person assistance.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <button
              type="button"
              onClick={() => handleChooseChat('ai')}
              className="rounded-3xl border border-gray-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary-400 hover:shadow-md dark:border-dark-700 dark:bg-dark-800"
            >
              <div className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-yellow-50 text-4xl ring-1 ring-yellow-100 dark:bg-yellow-500/10 dark:ring-yellow-500/25">
                🤖
              </div>
              <h2 className="text-xl font-black text-gray-950 dark:text-white">
                AI Assistant
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                Get quick automated help about booking, payments, parts, shop
                information, and basic motorcycle service questions.
              </p>
              <div className="mt-5 inline-flex rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white">
                Start AI Chat
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleChooseChat('human')}
              className="rounded-3xl border border-gray-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary-400 hover:shadow-md dark:border-dark-700 dark:bg-dark-800"
            >
              <div className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/25">
                💬
              </div>
              <h2 className="text-xl font-black text-gray-950 dark:text-white">
                Talk to a Real Person
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                Chat with MotoFix admin, staff, or mechanic using the existing
                shared real-time support chat.
              </p>
              <div className="mt-5 inline-flex rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white">
                Start Support Chat
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <ConversationSkeleton />;

  return (
    <div className="h-[calc(100vh-65px)] bg-gray-50 text-gray-900 transition-colors dark:bg-dark-900 dark:text-white">
      <div className="flex h-full overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden w-80 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800 md:flex">
          <div className="border-b border-gray-200 p-5 dark:border-dark-700">
            <p className="mb-1 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              MotoFix Chat
            </p>
            <h2 className="text-xl font-black text-gray-950 dark:text-white">
              Messages
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isAiChat ? 'Your AI assistant conversation' : 'Your support conversation'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {conversation ? (
              <button
                type="button"
                className="w-full rounded-3xl border border-primary-100 bg-primary-50 p-4 text-left shadow-sm dark:border-primary-500/25 dark:bg-primary-500/10"
              >
                <div className="mb-3 flex items-start gap-3">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-sm font-black text-white">
                    {chatIcon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                        {chatTitle}
                      </p>
                      {lastMessage && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {formatTime(lastMessage.created_at)}
                        </span>
                      )}
                    </div>

                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {lastMessage ? lastMessage.message : 'No messages yet'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-primary-100 dark:bg-dark-800 dark:ring-primary-500/25">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Handled by
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="truncate text-xs font-black text-primary-700 dark:text-primary-400">
                      {handledBy}
                    </p>

                    {isAiChat ? (
                      <RoleBadge role="bot" isBot />
                    ) : (
                      conversation?.staff?.role && (
                        <RoleBadge role={conversation.staff.role} />
                      )
                    )}
                  </div>
                </div>
              </button>
            ) : (
              <div className="rounded-3xl border border-dashed border-gray-300 p-8 text-center dark:border-dark-700">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
                  {isAiChat ? '🤖' : '💬'}
                </div>
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  No conversation yet.
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Send a message to get started.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 p-4 dark:border-dark-700">
            <div className="flex items-center gap-3">
              <Avatar
                profile={profile}
                fallback={profile?.first_name?.[0]?.toUpperCase() || 'U'}
                className="h-10 w-10 rounded-2xl"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                  {getProfileName(profile, 'User')}
                </p>
                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Chat panel */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-4 dark:border-dark-700 dark:bg-dark-800 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-sm font-black text-white shadow-sm shadow-primary-600/20">
                  {chatIcon}
                </div>

                <div className="min-w-0">
                  <p className="font-black leading-tight text-gray-950 dark:text-white">
                    {chatTitle}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                    Online
                    {lastUpdated ? ` · Updated ${formatTime(lastUpdated)}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackToChoices}
                  className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Change
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (conversation?.id) {
                      fetchConversation(conversation.id);
                      fetchMessages(conversation.id);
                    } else {
                      initChat(activeType, false);
                    }
                  }}
                  className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-gray-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Handled by
              </p>
              <div className="mt-2 flex items-center gap-3">
                {isAiChat ? (
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl bg-yellow-100 text-xs font-black text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300">
                    AI
                  </div>
                ) : conversation?.staff ? (
                  <Avatar
                    profile={conversation.staff}
                    fallback="S"
                    className="h-9 w-9 rounded-2xl"
                  />
                ) : (
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl bg-gray-200 text-xs font-black text-gray-500 dark:bg-dark-700 dark:text-gray-300">
                    …
                  </div>
                )}

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                    {handledBy}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {isAiChat ? (
                      <RoleBadge role="bot" isBot />
                    ) : conversation?.staff?.role ? (
                      <RoleBadge role={conversation.staff.role} />
                    ) : (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        A support member will be assigned when someone opens your chat.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {fetchError && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {fetchError}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-gray-50 px-5 py-5 dark:bg-dark-900 sm:px-8">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
                <div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-white text-4xl shadow-sm ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                  {isAiChat ? '🤖' : '💬'}
                </div>
                <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
                  Hi {profile?.first_name || 'there'}! 👋
                </h2>
                <p className="max-w-sm text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {isAiChat
                    ? 'Ask the AI Assistant about bookings, payments, parts, or basic MotoFix help.'
                    : 'Send a message to start chatting with the MotoFix support team.'}
                </p>
              </div>
            ) : (
              messagesByDate.map((group) => (
                <div key={group.label}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-gray-400 ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                      {group.label}
                    </span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
                  </div>

                  <div className="space-y-3">
                    {group.messages.map((message) => {
                      const isOwn = message.sender_id === user.id;
                      const isLastOwn =
                        isOwn && messages[messages.length - 1]?.id === message.id;

                      return (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          isOwn={isOwn}
                          isLastOwn={isLastOwn}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 dark:border-dark-700 dark:bg-dark-800 sm:px-8">
            {conversation?.status === 'closed' ? (
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-dark-700 dark:bg-dark-900/70">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This conversation has been closed by the shop. Send a new message
                  to start another conversation.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConversation(null);
                    setMessages([]);
                  }}
                  className="mt-3 rounded-2xl bg-primary-600 px-5 py-2 text-sm font-black text-white transition hover:bg-primary-700"
                >
                  Start New Chat
                </button>
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
                  placeholder={
                    isAiChat
                      ? 'Ask the AI Assistant...'
                      : 'Type a message...'
                  }
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
        </main>
      </div>
    </div>
  );
}