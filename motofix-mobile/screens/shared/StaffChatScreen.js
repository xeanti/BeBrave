import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

export default function StaffChatScreen() {
  const { theme, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    init();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    await fetchConversations(user);

    // Subscribe to new messages globally
    const channel = supabase
      .channel('staff-chat-global')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, () => fetchConversations(user))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_conversations',
      }, () => fetchConversations(user))
      .subscribe();

    channelRef.current = channel;
    setLoading(false);
  }

  async function fetchConversations(currentUser) {
    const u = currentUser || user;
    const { data } = await supabase
      .from('chat_conversations')
      .select('*, profiles!chat_conversations_customer_id_fkey(first_name, last_name, email)')
      .order('updated_at', { ascending: false });

    if (!data) return;

    // Count unread per conversation
    const withUnread = await Promise.all(
      data.map(async (c) => {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact' })
          .eq('conversation_id', c.id)
          .neq('sender_id', u?.id)
          .eq('is_read', false);
        return { ...c, unread: count || 0 };
      })
    );
    setConversations(withUnread);
  }

  async function selectConversation(conv) {
    setSelected(conv);

    // Assign staff_id if not yet assigned
    if (!conv.staff_id && user) {
      await supabase
        .from('chat_conversations')
        .update({ staff_id: user.id })
        .eq('id', conv.id);
    }

    await fetchMessages(conv.id);
    subscribeToConversation(conv.id);
  }

  async function fetchMessages(conversationId) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (data) setMessages(data);

    // Mark as read
    if (user) {
      await supabase.rpc('mark_messages_read', {
        conv_id: conversationId,
        reader_id: user.id,
      });
    }
    fetchConversations(user);
  }

  function subscribeToConversation(conversationId) {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`staff-chat:${conversationId}`)
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
          if (user) {
            await supabase.rpc('mark_messages_read', {
              conv_id: conversationId,
              reader_id: user.id,
            });
          }
          fetchConversations(user);
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

  async function sendMessage() {
    if (!input.trim() || !selected || !user) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    try {
      const { data } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: selected.id,
          sender_id: user.id,
          message: text,
          is_bot: false,
          is_read: false,
        })
        .select('*, profiles!chat_messages_sender_id_fkey(first_name, last_name, role)')
        .single();

      if (data) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  async function closeConversation(id) {
    await supabase
      .from('chat_conversations')
      .update({ status: 'closed' })
      .eq('id', id);
    setSelected((prev) => prev?.id === id ? { ...prev, status: 'closed' } : prev);
    fetchConversations(user);
  }

  async function reopenConversation(id) {
    await supabase
      .from('chat_conversations')
      .update({ status: 'open' })
      .eq('id', id);
    setSelected((prev) => prev?.id === id ? { ...prev, status: 'open' } : prev);
    fetchConversations(user);
  }

  const s = styles(theme);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.primaryLight} />
      </View>
    );
  }

  // Conversation list view
  if (!selected) {
    return (
      <View style={s.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

        <View style={s.listHeader}>
          <Text style={s.listTitle}>Customer Conversations</Text>
          <Text style={s.listSub}>{conversations.length} total</Text>
        </View>

        {conversations.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
            <Text style={s.emptyText}>No conversations yet.</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const name = item.profiles?.first_name
                ? `${item.profiles.first_name} ${item.profiles.last_name}`
                : 'Unknown Customer';
              return (
                <TouchableOpacity
                  style={s.convRow}
                  onPress={() => selectConversation(item)}
                  activeOpacity={0.7}
                >
                  <View style={s.convAvatar}>
                    <Text style={s.convAvatarText}>
                      {(item.profiles?.first_name?.[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.convNameRow}>
                      <Text style={s.convName} numberOfLines={1}>{name}</Text>
                      {item.unread > 0 && (
                        <View style={s.unreadBadge}>
                          <Text style={s.unreadBadgeText}>
                            {item.unread > 9 ? '9+' : item.unread}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.convEmail} numberOfLines={1}>
                      {item.profiles?.email || ''}
                    </Text>
                  </View>
                  <View style={[
                    s.statusPill,
                    { backgroundColor: item.status === 'open' ? theme.success + '22' : theme.textMuted + '22' }
                  ]}>
                    <Text style={[
                      s.statusPillText,
                      { color: item.status === 'open' ? theme.success : theme.textMuted }
                    ]}>
                      {item.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  // Chat view
  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Chat Header */}
      <View style={s.chatHeader}>
        <TouchableOpacity onPress={() => setSelected(null)} style={s.backBtn}>
          <Text style={s.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.chatHeaderName} numberOfLines={1}>
            {selected.profiles?.first_name
              ? `${selected.profiles.first_name} ${selected.profiles.last_name}`
              : 'Customer'}
          </Text>
          <Text style={s.chatHeaderEmail} numberOfLines={1}>
            {selected.profiles?.email || ''}
          </Text>
        </View>
        {selected.status === 'open' ? (
          <TouchableOpacity
            style={s.closeBtn}
            onPress={() => closeConversation(selected.id)}
          >
            <Text style={s.closeBtnText}>Close</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.closeBtn, { borderColor: theme.success + '55' }]}
            onPress={() => reopenConversation(selected.id)}
          >
            <Text style={[s.closeBtnText, { color: theme.success }]}>Reopen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={s.emptyChat}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>💬</Text>
            <Text style={s.emptyText}>No messages yet.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isOwn = item.sender_id === user?.id;
          const isLast = index === messages.length - 1;

          return (
            <View style={[s.bubbleWrap, isOwn ? s.myWrap : s.theirWrap]}>
              {!isOwn && (
                <View style={[s.senderAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={{ fontSize: 11, color: '#fff' }}>
                    {item.profiles?.first_name?.[0] || '?'}
                  </Text>
                </View>
              )}
              <View style={[s.bubble, isOwn ? s.myBubble : s.theirBubble]}>
                {!isOwn && (
                  <Text style={s.senderLabel}>
                    {item.profiles?.first_name || 'Customer'}
                  </Text>
                )}
                <Text style={[s.bubbleText, isOwn && s.myBubbleText]}>
                  {item.message}
                </Text>
                <View style={[s.bubbleMeta, isOwn && { flexDirection: 'row-reverse' }]}>
                  <Text style={[s.bubbleTime, isOwn && { color: 'rgba(255,255,255,0.6)' }]}>
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </Text>
                  {isOwn && isLast && (
                    <Text style={[s.readReceipt, { color: item.is_read ? theme.primaryLight : 'rgba(255,255,255,0.5)' }]}>
                      {item.is_read ? ' ✓✓ Seen' : ' ✓ Sent'}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={s.inputBar}>
        {selected.status === 'closed' ? (
          <View style={s.closedBar}>
            <Text style={s.closedText}>Conversation is closed. </Text>
            <TouchableOpacity onPress={() => reopenConversation(selected.id)}>
              <Text style={[s.closedText, { color: theme.primaryLight }]}>Reopen</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={s.input}
              placeholder="Reply to customer..."
              placeholderTextColor={theme.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.sendBtnText}>↑</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },

  // Conversation list
  listHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.bg2 },
  listTitle: { fontSize: 18, fontWeight: 'bold', color: theme.text },
  listSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  convRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: theme.border,
    backgroundColor: theme.bg, gap: 12,
  },
  convAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: theme.primary,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  convAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  convNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  convName: { fontSize: 14, fontWeight: '600', color: theme.text, flex: 1 },
  convEmail: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  unreadBadge: {
    backgroundColor: theme.primary, borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 4 },
  statusPillText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyText: { color: theme.textSub, fontSize: 14 },

  // Chat header
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, backgroundColor: theme.bg2,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backBtnText: { color: theme.primaryLight, fontWeight: '600', fontSize: 14 },
  chatHeaderName: { fontSize: 14, fontWeight: 'bold', color: theme.text },
  chatHeaderEmail: { fontSize: 11, color: theme.textSub, marginTop: 1 },
  closeBtn: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  closeBtnText: { fontSize: 12, color: theme.textSub, fontWeight: '600' },

  // Messages
  messageList: { padding: 16, gap: 8 },
  emptyChat: { alignItems: 'center', paddingTop: 60 },
  bubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 },
  myWrap: { justifyContent: 'flex-end' },
  theirWrap: { justifyContent: 'flex-start', gap: 8 },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 12 },
  myBubble: { backgroundColor: theme.primary, borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderBottomLeftRadius: 4 },
  senderLabel: { fontSize: 10, color: theme.textMuted, marginBottom: 4, fontWeight: '600' },
  bubbleText: { fontSize: 15, color: theme.text, lineHeight: 20 },
  myBubbleText: { color: '#fff' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  bubbleTime: { fontSize: 10, color: theme.textMuted },
  readReceipt: { fontSize: 10 },

  // Input
  inputBar: {
    flexDirection: 'row', padding: 12,
    backgroundColor: theme.bg2, borderTopWidth: 1, borderTopColor: theme.border,
    gap: 10, alignItems: 'flex-end',
  },
  input: {
    flex: 1, backgroundColor: theme.bg3, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: theme.text, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.bg3 },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  closedBar: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  closedText: { fontSize: 13, color: theme.textMuted },
});