import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, StatusBar,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';

export default function ChatScreen() {
  const { theme, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    await getOrCreateConversation(user);
  }

  async function getOrCreateConversation(user) {
    // Check if conversation exists
    let { data: existing } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!existing) {
      const { data: created } = await supabase
        .from('chat_conversations')
        .insert({ customer_id: user.id, status: 'open' })
        .select()
        .single();
      existing = created;
    }

    setConversation(existing);
    await fetchMessages(existing.id);
    subscribeToMessages(existing.id);
    setLoading(false);
  }

  async function fetchMessages(conversationId) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  function subscribeToMessages(conversationId) {
    supabase
      .channel('chat:' + conversationId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();
  }

  async function sendMessage() {
    if (!input.trim() || !conversation) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    await supabase.from('chat_messages').insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      message: text,
      is_bot: false,
      is_read: false,
    });

    setSending(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }

  const s = styles(theme);

  if (loading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={theme.primaryLight} />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerAvatar}>
          <Text style={{ fontSize: 18 }}>🏍️</Text>
        </View>
        <View>
          <Text style={s.headerTitle}>MotoFix Support</Text>
          <Text style={s.headerSub}>
            {conversation?.status === 'open' ? '🟢 Online' : '🔴 Offline'}
          </Text>
        </View>
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
            <Text style={s.emptyChatIcon}>💬</Text>
            <Text style={s.emptyChatText}>No messages yet. Say hello!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.sender_id === user?.id && !item.is_bot;
          const isBot = item.is_bot;

          return (
            <View style={[s.messageBubbleWrap, isMe ? s.myWrap : s.theirWrap]}>
              {!isMe && (
                <View style={[s.senderAvatar, { backgroundColor: isBot ? theme.accent : theme.primary }]}>
                  <Text style={{ fontSize: 12 }}>{isBot ? '🤖' : '👤'}</Text>
                </View>
              )}
              <View style={[
                s.bubble,
                isMe ? s.myBubble : s.theirBubble,
                isBot && s.botBubble,
              ]}>
                {isBot && <Text style={s.botLabel}>AI Assistant</Text>}
                <Text style={[s.bubbleText, isMe && s.myBubbleText]}>{item.message}</Text>
                <Text style={[s.bubbleTime, isMe && { color: 'rgba(255,255,255,0.6)' }]}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          placeholder="Type a message..."
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: theme.bg2, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 12 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: theme.text },
  headerSub: { fontSize: 12, color: theme.textSub, marginTop: 2 },
  messageList: { padding: 16, gap: 8 },
  messageBubbleWrap: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 },
  myWrap: { justifyContent: 'flex-end' },
  theirWrap: { justifyContent: 'flex-start', gap: 8 },
  senderAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 12 },
  myBubble: { backgroundColor: theme.primary, borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, borderBottomLeftRadius: 4 },
  botBubble: { backgroundColor: theme.accent + '22', borderWidth: 1, borderColor: theme.accent + '55' },
  botLabel: { fontSize: 10, fontWeight: 'bold', color: theme.accent, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: theme.text, lineHeight: 20 },
  myBubbleText: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: theme.textMuted, marginTop: 4, textAlign: 'right' },
  emptyChat: { alignItems: 'center', paddingTop: 80 },
  emptyChatIcon: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { fontSize: 14, color: theme.textSub },
  inputBar: { flexDirection: 'row', padding: 12, backgroundColor: theme.bg2, borderTopWidth: 1, borderTopColor: theme.border, gap: 10, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: theme.bg3, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: theme.text, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: theme.bg3 },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});a