import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';
const SHOP_ROLES = ['admin', 'staff', 'cashier', 'mechanic'];

function getThemeValue(theme, key, fallback) {
  return theme?.[key] || fallback;
}

function getCustomerName(conversation) {
  const first = conversation?.profiles?.first_name || '';
  const last = conversation?.profiles?.last_name || '';
  const full = `${first} ${last}`.trim();

  return full || conversation?.profiles?.email || 'Unknown Customer';
}

function getInitial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function formatTime(value) {
  if (!value) return '';

  return new Date(value).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateLabel(value) {
  if (!value) return '';

  const date = new Date(value);
  const today = new Date();

  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (sameDay) return 'Today';

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function shouldShowDate(current, previous) {
  if (!current?.created_at) return false;
  if (!previous?.created_at) return true;

  return (
    new Date(current.created_at).toDateString() !==
    new Date(previous.created_at).toDateString()
  );
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();

  if (value === 'cashier') return 'staff';
  return value;
}

function humanRole(role) {
  const value = normalizeRole(role);

  if (value === 'admin') return 'Admin';
  if (value === 'staff') return 'Staff';
  if (value === 'mechanic') return 'Mechanic';
  if (value === 'customer') return 'Customer';

  return 'Support';
}

function getSenderName(message) {
  const profile = message?.profiles || {};
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

  return name || humanRole(profile.role);
}

function getSenderRole(message, conversation) {
  const role = normalizeRole(message?.profiles?.role);

  if (role) return role;

  if (message?.sender_id && conversation?.customer_id) {
    return message.sender_id === conversation.customer_id ? 'customer' : 'staff';
  }

  return 'staff';
}

function isShopRole(role) {
  return SHOP_ROLES.includes(normalizeRole(role));
}

function isShopMessage(message, conversation) {
  const role = getSenderRole(message, conversation);

  if (role === 'customer') return false;
  if (isShopRole(role)) return true;

  if (message?.sender_id && conversation?.customer_id) {
    return message.sender_id !== conversation.customer_id;
  }

  return false;
}

function getRoleColors(role, theme) {
  const normalized = normalizeRole(role);

  if (normalized === 'admin') {
    return {
      bg: '#dc262622',
      border: '#dc262666',
      text: '#f87171',
    };
  }

  if (normalized === 'mechanic') {
    return {
      bg: '#2563eb22',
      border: '#2563eb66',
      text: '#60a5fa',
    };
  }

  if (normalized === 'staff') {
    return {
      bg: `${YELLOW}22`,
      border: `${YELLOW}66`,
      text: YELLOW,
    };
  }

  return {
    bg: getThemeValue(theme, 'bg2', '#111827'),
    border: getThemeValue(theme, 'border', '#374151'),
    text: getThemeValue(theme, 'textMuted', '#9ca3af'),
  };
}

function RoleBadge({ role, theme, compact = false }) {
  const colors = getRoleColors(role, theme);
  const label = humanRole(role);
  const s = styles(theme);

  return (
    <View
      style={[
        s.roleBadge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          paddingHorizontal: compact ? 7 : 9,
          paddingVertical: compact ? 2 : 4,
        },
      ]}
    >
      <Text style={[s.roleBadgeText, { color: colors.text }]}>
        {label}
      </Text>
    </View>
  );
}

export default function StaffChatScreen() {
  const { theme, isDark } = useTheme();
  const s = styles(theme);

  const [user, setUser] = useState(null);
  const [viewerProfile, setViewerProfile] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const flatListRef = useRef(null);
  const globalChannelRef = useRef(null);
  const messageChannelRef = useRef(null);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return conversations;

    return conversations.filter((conversation) => {
      const name = getCustomerName(conversation).toLowerCase();
      const email = String(conversation.profiles?.email || '').toLowerCase();
      const status = String(conversation.status || '').toLowerCase();

      return name.includes(query) || email.includes(query) || status.includes(query);
    });
  }, [conversations, search]);

  const openCount = useMemo(
    () => conversations.filter((item) => item.status === 'open').length,
    [conversations]
  );

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, item) => sum + (Number(item.unread) || 0), 0),
    [conversations]
  );

  useEffect(() => {
    init();

    return () => {
      removeChannels();
    };
  }, []);

  async function init() {
    setLoading(true);

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    setUser(currentUser || null);

    if (currentUser?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('id', currentUser.id)
        .maybeSingle();

      setViewerProfile(profile || null);
    }

    await fetchConversations(currentUser);

    const channel = supabase
      .channel('role-clean-support-chat-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        () => fetchConversations(currentUser)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
        },
        () => fetchConversations(currentUser)
      )
      .subscribe();

    globalChannelRef.current = channel;
    setLoading(false);
  }

  function removeChannels() {
    if (globalChannelRef.current) {
      supabase.removeChannel(globalChannelRef.current);
      globalChannelRef.current = null;
    }

    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }
  }

  async function fetchConversations(currentUser = user) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select(
        `
        *,
        profiles!chat_conversations_customer_id_fkey(
          first_name,
          last_name,
          email
        )
      `
      )
      .or('conversation_type.is.null,conversation_type.eq.human')
      .order('updated_at', { ascending: false });

    if (error || !data) {
      console.log('Fetch conversations error:', error?.message);
      setConversations([]);
      return;
    }

    const withUnread = await Promise.all(
      data.map(async (conversation) => {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversation.id)
          .neq('sender_id', currentUser?.id || '')
          .eq('is_read', false);

        return {
          ...conversation,
          unread: count || 0,
        };
      })
    );

    setConversations(withUnread);

    if (selected?.id) {
      const updatedSelected = withUnread.find((item) => item.id === selected.id);
      if (updatedSelected) setSelected(updatedSelected);
    }
  }

  async function selectConversation(conversation) {
    setSelected(conversation);
    setMessagesLoading(true);

    if (!conversation.staff_id && user?.id) {
      await supabase
        .from('chat_conversations')
        .update({
          staff_id: user.id,
          conversation_type: conversation.conversation_type || 'human',
        })
        .eq('id', conversation.id);
    }

    await fetchMessages(conversation.id);
    subscribeToConversation(conversation.id);
    setMessagesLoading(false);
  }

  async function fetchMessages(conversationId) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(
        `
        *,
        profiles!chat_messages_sender_id_fkey(
          first_name,
          last_name,
          role
        )
      `
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    } else if (error) {
      console.log('Fetch messages error:', error.message);
    }

    if (user?.id) {
      try {
        await supabase.rpc('mark_messages_read', {
          conv_id: conversationId,
          reader_id: user.id,
        });
      } catch {
        await supabase
          .from('chat_messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_id', user.id);
      }
    }

    fetchConversations(user);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 120);
  }

  function subscribeToConversation(conversationId) {
    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }

    const channel = supabase
      .channel(`role-clean-support-chat-${conversationId}`)
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
              `
              *,
              profiles!chat_messages_sender_id_fkey(
                first_name,
                last_name,
                role
              )
            `
            )
            .eq('id', payload.new.id)
            .maybeSingle();

          const nextMessage = data || payload.new;

          setMessages((prev) => {
            if (prev.some((item) => item.id === nextMessage.id)) return prev;
            return [...prev, nextMessage];
          });

          if (user?.id) {
            try {
              await supabase.rpc('mark_messages_read', {
                conv_id: conversationId,
                reader_id: user.id,
              });
            } catch {
              await supabase
                .from('chat_messages')
                .update({ is_read: true })
                .eq('conversation_id', conversationId)
                .neq('sender_id', user.id);
            }
          }

          fetchConversations(user);

          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 120);
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
          setMessages((prev) =>
            prev.map((message) =>
              message.id === payload.new.id ? { ...message, ...payload.new } : message
            )
          );
        }
      )
      .subscribe();

    messageChannelRef.current = channel;
  }

  async function sendMessage() {
    if (!input.trim() || !selected?.id || !user?.id || sending) return;

    const text = input.trim();
    setInput('');
    setSending(true);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: selected.id,
          sender_id: user.id,
          message: text,
          is_bot: false,
          is_read: false,
        })
        .select(
          `
          *,
          profiles!chat_messages_sender_id_fkey(
            first_name,
            last_name,
            role
          )
        `
        )
        .single();

      if (error) throw error;

      if (data) {
        setMessages((prev) => {
          if (prev.some((message) => message.id === data.id)) return prev;
          return [...prev, data];
        });
      }

      await supabase
        .from('chat_conversations')
        .update({
          staff_id: selected.staff_id || user.id,
          updated_at: new Date().toISOString(),
          conversation_type: selected.conversation_type || 'human',
        })
        .eq('id', selected.id);

      fetchConversations(user);
    } catch (error) {
      console.log('Send chat error:', error.message);
      setInput(text);
    } finally {
      setSending(false);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
    }
  }

  async function closeConversation(id) {
    await supabase
      .from('chat_conversations')
      .update({ status: 'closed' })
      .eq('id', id);

    setSelected((prev) => (prev?.id === id ? { ...prev, status: 'closed' } : prev));
    fetchConversations(user);
  }

  async function reopenConversation(id) {
    await supabase
      .from('chat_conversations')
      .update({
        status: 'open',
        conversation_type: selected?.conversation_type || 'human',
      })
      .eq('id', id);

    setSelected((prev) => (prev?.id === id ? { ...prev, status: 'open' } : prev));
    fetchConversations(user);
  }

  async function onRefresh() {
    setRefreshing(true);

    if (selected?.id) {
      await fetchMessages(selected.id);
    } else {
      await fetchConversations(user);
    }

    setRefreshing(false);
  }

  function backToList() {
    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }

    setSelected(null);
    setMessages([]);
    fetchConversations(user);
  }

  function renderConversation({ item }) {
    const name = getCustomerName(item);
    const initial = getInitial(name);
    const isOpen = item.status === 'open';
    const hasUnread = Number(item.unread) > 0;

    return (
      <TouchableOpacity
        style={[s.conversationCard, hasUnread && s.unreadConversationCard]}
        onPress={() => selectConversation(item)}
        activeOpacity={0.78}
      >
        <View style={s.customerAvatar}>
          <Text style={s.customerAvatarText}>{initial}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            <Text style={s.customerName} numberOfLines={1}>
              {name}
            </Text>

            {hasUnread && (
              <View style={s.unreadBadge}>
                <Text style={s.unreadBadgeText}>
                  {item.unread > 99 ? '99+' : item.unread}
                </Text>
              </View>
            )}
          </View>

          <Text style={s.customerEmail} numberOfLines={1}>
            {item.profiles?.email || 'No email'}
          </Text>

          <View style={s.convMetaRow}>
            <View style={[s.statusBadge, isOpen ? s.openBadge : s.closedBadge]}>
              <View style={[s.statusDot, isOpen ? s.openDot : s.closedDot]} />
              <Text
                style={[
                  s.statusText,
                  { color: isOpen ? '#22c55e' : theme.textMuted },
                ]}
              >
                {isOpen ? 'Open' : 'Closed'}
              </Text>
            </View>

            <Text style={s.updatedText}>
              {formatDateTime(item.updated_at || item.created_at)}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={19} color={theme.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderMessage({ item, index }) {
    const previous = messages[index - 1];
    const showDate = shouldShowDate(item, previous);
    const role = getSenderRole(item, selected);
    const shopMessage = isShopMessage(item, selected);
    const isOwnSender = item.sender_id === user?.id;
    const senderName = getSenderName(item);
    const isLastOwnSender = isOwnSender && index === messages.length - 1;

    return (
      <>
        {showDate && (
          <View style={s.dateDivider}>
            <Text style={s.dateDividerText}>{formatDateLabel(item.created_at)}</Text>
          </View>
        )}

        <View style={[s.messageRow, shopMessage ? s.shopMessageRow : s.customerMessageRow]}>
          {!shopMessage && (
            <View style={s.senderAvatar}>
              <Text style={s.senderAvatarText}>{getInitial(senderName)}</Text>
            </View>
          )}

          <View style={[s.messageGroup, shopMessage && s.shopMessageGroup]}>
            <View style={[s.senderLine, shopMessage && s.senderLineRight]}>
              {shopMessage ? (
                <>
                  <Text style={s.senderLabel}>
                    {isOwnSender ? 'You' : senderName}
                  </Text>
                  <RoleBadge role={role} theme={theme} compact />
                </>
              ) : (
                <>
                  <RoleBadge role="customer" theme={theme} compact />
                  <Text style={s.senderLabel}>{senderName}</Text>
                </>
              )}
            </View>

            <View style={[s.bubble, shopMessage ? s.shopBubble : s.customerBubble]}>
              <Text style={[s.bubbleText, shopMessage && s.shopBubbleText]}>
                {item.message}
              </Text>

              <View style={s.bubbleMeta}>
                <Text style={[s.bubbleTime, shopMessage && s.shopBubbleTime]}>
                  {formatTime(item.created_at)}
                </Text>

                {isLastOwnSender && (
                  <Text style={s.readReceipt}>{item.is_read ? 'Seen' : 'Sent'}</Text>
                )}
              </View>
            </View>
          </View>

          {shopMessage && (
            <View style={[s.shopAvatar, { backgroundColor: getRoleColors(role, theme).bg }]}>
              <Text style={[s.shopAvatarText, { color: getRoleColors(role, theme).text }]}>
                {getInitial(humanRole(role))}
              </Text>
            </View>
          )}
        </View>
      </>
    );
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={YELLOW} />
        <Text style={s.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  if (!selected) {
    return (
      <View style={s.container}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.bg}
        />

        <View style={s.listHeader}>
          <View style={s.headerIcon}>
            <Ionicons name="chatbubbles" size={24} color="#111827" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.listTitle}>Support Chats</Text>
            <Text style={s.listSub}>
              {openCount} open · {unreadTotal} unread · Role-clean shop replies
            </Text>
          </View>

          <TouchableOpacity
            style={s.headerButton}
            onPress={() => fetchConversations(user)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={20} color={YELLOW} />
          </TouchableOpacity>
        </View>

        <View style={s.roleLegend}>
          <Text style={s.legendText}>Customer messages appear left.</Text>
          <Text style={s.legendText}>Admin / Staff / Mechanic replies appear right.</Text>
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search customer, email, or status..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />

          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={19} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderConversation}
          contentContainerStyle={[
            s.conversationList,
            filteredConversations.length === 0 && s.emptyList,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={YELLOW}
            />
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <View style={s.emptyIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={34} color={theme.textMuted} />
              </View>

              <Text style={s.emptyTitle}>No support chats yet</Text>
              <Text style={s.emptyText}>
                Real-person customer conversations will appear here. AI chatbot conversations are hidden.
              </Text>
            </View>
          }
        />
      </View>
    );
  }

  const selectedName = getCustomerName(selected);
  const selectedOpen = selected.status === 'open';

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 82 : 0}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.bg}
      />

      <View style={s.chatHeader}>
        <TouchableOpacity style={s.backButton} onPress={backToList}>
          <Ionicons name="chevron-back" size={23} color={YELLOW} />
        </TouchableOpacity>

        <View style={s.smallAvatar}>
          <Text style={s.smallAvatarText}>{getInitial(selectedName)}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.chatHeaderName} numberOfLines={1}>
            {selectedName}
          </Text>

          <Text style={s.chatHeaderEmail} numberOfLines={1}>
            {selected.profiles?.email || 'No email'} · {selectedOpen ? 'Open' : 'Closed'}
          </Text>
        </View>

        {selectedOpen ? (
          <TouchableOpacity
            style={s.closeButton}
            onPress={() => closeConversation(selected.id)}
            activeOpacity={0.8}
          >
            <Text style={s.closeButtonText}>Close</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.reopenButton}
            onPress={() => reopenConversation(selected.id)}
            activeOpacity={0.8}
          >
            <Text style={s.reopenButtonText}>Reopen</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.chatNotice}>
        <Ionicons name="information-circle-outline" size={15} color={theme.textMuted} />
        <Text style={s.chatNoticeText}>
          Role-clean view: customer left, all shop roles right.
        </Text>
      </View>

      {messagesLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={YELLOW} />
          <Text style={s.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={[s.messageList, messages.length === 0 && s.emptyList]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={YELLOW}
            />
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <View style={s.emptyIcon}>
                <Ionicons name="chatbubble-outline" size={34} color={theme.textMuted} />
              </View>

              <Text style={s.emptyTitle}>No messages yet</Text>
              <Text style={s.emptyText}>Reply to start assisting this customer.</Text>
            </View>
          }
        />
      )}

      {!selectedOpen ? (
        <View style={s.inputBar}>
          <View style={s.closedBar}>
            <Text style={s.closedText}>Conversation is closed.</Text>
            <TouchableOpacity onPress={() => reopenConversation(selected.id)}>
              <Text style={s.reopenInlineText}>Reopen</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={s.inputBar}>
          <View style={s.composerRole}>
            <RoleBadge role={viewerProfile?.role || 'staff'} theme={theme} compact />
          </View>

          <TextInput
            style={s.input}
            placeholder="Type a reply..."
            placeholderTextColor={theme.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />

          <TouchableOpacity
            style={[s.sendButton, (!input.trim() || sending) && s.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#111827" />
            ) : (
              <Ionicons name="send" size={20} color="#111827" />
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = (theme) => {
  const bg = getThemeValue(theme, 'bg', '#0f172a');
  const bg2 = getThemeValue(theme, 'bg2', '#111827');
  const bg3 = getThemeValue(theme, 'bg3', '#1f2937');
  const card = getThemeValue(theme, 'card', '#1f2937');
  const border = getThemeValue(theme, 'border', '#374151');
  const text = getThemeValue(theme, 'text', '#f9fafb');
  const textSub = getThemeValue(theme, 'textSub', '#d1d5db');
  const textMuted = getThemeValue(theme, 'textMuted', '#9ca3af');
  const primary = getThemeValue(theme, 'primary', YELLOW);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: bg,
    },
    centered: {
      flex: 1,
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: textMuted,
      marginTop: 10,
      fontWeight: '700',
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: card,
      borderBottomWidth: 1,
      borderBottomColor: border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    headerIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listTitle: {
      color: text,
      fontSize: 21,
      fontWeight: '900',
    },
    listSub: {
      color: textMuted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 3,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roleLegend: {
      backgroundColor: bg2,
      borderBottomWidth: 1,
      borderBottomColor: border,
      paddingHorizontal: 16,
      paddingVertical: 9,
      gap: 2,
    },
    legendText: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: bg2,
      borderBottomWidth: 1,
      borderBottomColor: border,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      color: text,
      fontSize: 14,
      fontWeight: '700',
      paddingVertical: 8,
    },
    conversationList: {
      padding: 14,
      paddingBottom: 28,
    },
    conversationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      padding: 14,
      marginBottom: 11,
    },
    unreadConversationCard: {
      borderColor: YELLOW,
    },
    customerAvatar: {
      width: 48,
      height: 48,
      borderRadius: 17,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    customerAvatarText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 17,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    customerName: {
      color: text,
      fontSize: 15,
      fontWeight: '900',
      flex: 1,
    },
    customerEmail: {
      color: textMuted,
      fontSize: 12,
      marginTop: 3,
      fontWeight: '600',
    },
    convMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    openBadge: {
      backgroundColor: 'rgba(34, 197, 94, 0.12)',
    },
    closedBadge: {
      backgroundColor: textMuted + '22',
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
    },
    openDot: {
      backgroundColor: '#22c55e',
    },
    closedDot: {
      backgroundColor: textMuted,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    updatedText: {
      color: textMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    unreadBadge: {
      backgroundColor: YELLOW,
      minWidth: 22,
      height: 22,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    unreadBadgeText: {
      color: '#111827',
      fontSize: 10,
      fontWeight: '900',
    },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: card,
      borderBottomWidth: 1,
      borderBottomColor: border,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallAvatar: {
      width: 42,
      height: 42,
      borderRadius: 15,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallAvatarText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 15,
    },
    chatHeaderName: {
      color: text,
      fontSize: 15,
      fontWeight: '900',
    },
    chatHeaderEmail: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 3,
    },
    closeButton: {
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.35)',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 12,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    closeButtonText: {
      color: '#ef4444',
      fontSize: 12,
      fontWeight: '900',
    },
    reopenButton: {
      borderWidth: 1,
      borderColor: 'rgba(34, 197, 94, 0.35)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      borderRadius: 12,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    reopenButtonText: {
      color: '#22c55e',
      fontSize: 12,
      fontWeight: '900',
    },
    chatNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: bg2,
      borderBottomWidth: 1,
      borderBottomColor: border,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chatNoticeText: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '700',
      flex: 1,
    },
    messageList: {
      padding: 16,
      paddingBottom: 24,
    },
    emptyList: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    dateDivider: {
      alignItems: 'center',
      marginVertical: 12,
    },
    dateDividerText: {
      color: textMuted,
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: '900',
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 12,
    },
    shopMessageRow: {
      justifyContent: 'flex-end',
    },
    customerMessageRow: {
      justifyContent: 'flex-start',
    },
    messageGroup: {
      maxWidth: '78%',
    },
    shopMessageGroup: {
      alignItems: 'flex-end',
    },
    senderLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    senderLineRight: {
      justifyContent: 'flex-end',
    },
    senderLabel: {
      color: textMuted,
      fontSize: 10,
      fontWeight: '900',
    },
    roleBadge: {
      borderRadius: 999,
      borderWidth: 1,
    },
    roleBadgeText: {
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    senderAvatar: {
      width: 30,
      height: 30,
      borderRadius: 11,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    senderAvatarText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '900',
    },
    shopAvatar: {
      width: 30,
      height: 30,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: border,
    },
    shopAvatarText: {
      fontSize: 11,
      fontWeight: '900',
    },
    bubble: {
      borderRadius: 18,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    shopBubble: {
      backgroundColor: primary,
      borderBottomRightRadius: 5,
    },
    customerBubble: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderBottomLeftRadius: 5,
    },
    bubbleText: {
      color: text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
    },
    shopBubbleText: {
      color: '#111827',
      fontWeight: '700',
    },
    bubbleMeta: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    bubbleTime: {
      color: textMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    shopBubbleTime: {
      color: 'rgba(17, 24, 39, 0.65)',
    },
    readReceipt: {
      color: 'rgba(17, 24, 39, 0.75)',
      fontSize: 10,
      fontWeight: '900',
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      backgroundColor: card,
      borderTopWidth: 1,
      borderTopColor: border,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    composerRole: {
      minHeight: 44,
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      maxHeight: 110,
      minHeight: 44,
      backgroundColor: bg3,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: text,
      fontSize: 15,
      fontWeight: '600',
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.45,
    },
    closedBar: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 7,
      paddingVertical: 10,
    },
    closedText: {
      color: textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    reopenInlineText: {
      color: YELLOW,
      fontSize: 13,
      fontWeight: '900',
    },
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    emptyIcon: {
      width: 82,
      height: 82,
      borderRadius: 26,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      color: text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 7,
      textAlign: 'center',
    },
    emptyText: {
      color: textMuted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      fontWeight: '600',
    },
  });
};
