import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const YELLOW = '#EAB308';

const QUICK_REPLIES = {
  ai: [
    'How do I book a service?',
    'How much is the down payment?',
    'Can you explain the order process?',
    'What can I do in MotoFix?',
  ],
  human: [
    'Hi, I need help with my booking.',
    'Can I ask about my order?',
    'I need help with payment.',
    'Can I talk to staff?',
  ],
};

function getThemeValue(theme, key, fallback) {
  return theme?.[key] || fallback;
}

function formatTime(value) {
  if (!value) return '';

  return new Date(value).toLocaleTimeString('en-PH', {
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

function getSenderLabel(message, isOwn, selectedType) {
  if (isOwn) return 'You';
  if (message?.is_bot || selectedType === 'ai') return 'AI Assistant';

  const role = message?.profiles?.role;
  if (role === 'admin') return 'Admin';
  if (role === 'staff' || role === 'cashier') return 'Staff';
  if (role === 'mechanic') return 'Mechanic';

  return 'MotoFix Support';
}

export default function ChatScreen() {
  const { theme } = useTheme();
  const s = styles(theme);

  const [user, setUser] = useState(null);
  const [selectedType, setSelectedType] = useState(null); // null | ai | human
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [errorText, setErrorText] = useState('');

  const flatListRef = useRef(null);
  const messageChannelRef = useRef(null);
  const conversationChannelRef = useRef(null);

  const isAiChat = selectedType === 'ai';
  const chatTitle = isAiChat ? 'AI Assistant' : 'MotoFix Support';
  const chatSubtitle = isAiChat
    ? 'Automated help for booking, payments, parts, and basic questions'
    : 'Chat with admin, staff, or mechanic';
  const chatIcon = isAiChat ? 'sparkles' : 'headset';
  const activeQuickReplies = selectedType ? QUICK_REPLIES[selectedType] || [] : [];

  const lastOwnMessageId = useMemo(() => {
    const ownMessages = messages.filter(
      (item) => item.sender_id === user?.id && !item.is_bot
    );

    return ownMessages[ownMessages.length - 1]?.id || null;
  }, [messages, user?.id]);

  useEffect(() => {
    loadUser();

    return () => {
      removeSubscriptions();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (selectedType && user?.id) {
        initChat(selectedType, false);
      }
    }, [selectedType, user?.id])
  );

  async function loadUser() {
    setInitializing(true);

    const {
      data: { user: currentUser },
      error,
    } = await supabase.auth.getUser();

    if (error || !currentUser?.id) {
      setErrorText('Please login again to use chat.');
      setInitializing(false);
      return;
    }

    setUser(currentUser);
    setInitializing(false);
  }

  function removeSubscriptions() {
    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }

    if (conversationChannelRef.current) {
      supabase.removeChannel(conversationChannelRef.current);
      conversationChannelRef.current = null;
    }
  }

  async function chooseChatType(type) {
    setSelectedType(type);
    setConversation(null);
    setMessages([]);
    setInput('');
    setErrorText('');
    await initChat(type, true);
  }

  function backToChoices() {
    removeSubscriptions();
    setSelectedType(null);
    setConversation(null);
    setMessages([]);
    setInput('');
    setErrorText('');
    setSending(false);
    setAiThinking(false);
  }

  async function initChat(type = selectedType, showLoader = true) {
    if (!user?.id || !type) return;

    if (showLoader) setLoading(true);
    setErrorText('');

    removeSubscriptions();

    const { data, error } = await supabase
      .from('chat_conversations')
      .select(
        `
        *,
        staff:profiles!chat_conversations_staff_id_fkey(
          first_name,
          last_name,
          role,
          email
        )
      `
      )
      .eq('customer_id', user.id)
      .eq('status', 'open')
      .eq('conversation_type', type)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      setLoading(false);
      setErrorText(error.message || 'Failed to load chat.');
      return;
    }

    const activeConversation = data?.[0] || null;

    setConversation(activeConversation);

    if (activeConversation?.id) {
      await fetchMessages(activeConversation.id, false);
      subscribeToMessages(activeConversation.id);
    } else {
      setMessages([]);
    }

    subscribeToConversation(type);

    setLoading(false);
  }

  function subscribeToConversation(type) {
    if (!user?.id || !type) return;

    const channel = supabase
      .channel(`mobile-customer-conversation-${user.id}-${type}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `customer_id=eq.${user.id}`,
        },
        async (payload) => {
          if (payload.new?.conversation_type !== type) return;

          if (payload.new?.id) {
            setConversation((prev) => ({
              ...(prev || {}),
              ...payload.new,
            }));
          }
        }
      )
      .subscribe();

    conversationChannelRef.current = channel;
  }

  async function fetchMessages(conversationId = conversation?.id, showError = true) {
    if (!conversationId) return;

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

    if (error) {
      if (showError) setErrorText(error.message || 'Failed to load messages.');
      return;
    }

    setMessages(data || []);

    try {
      await supabase.rpc('mark_messages_read', {
        conv_id: conversationId,
        reader_id: user?.id,
      });
    } catch {
      // Safe fallback if the RPC is not available in the mobile project.
    }

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 100);
  }

  function subscribeToMessages(conversationId) {
    if (!conversationId) return;

    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }

    const channel = supabase
      .channel(`mobile-customer-messages-${conversationId}`)
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

          if (nextMessage.is_bot) {
            setAiThinking(false);
          }

          try {
            await supabase.rpc('mark_messages_read', {
              conv_id: conversationId,
              reader_id: user?.id,
            });
          } catch {
            // Ignore if RPC does not exist.
          }

          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
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
            prev.map((item) =>
              item.id === payload.new.id ? { ...item, ...payload.new } : item
            )
          );
        }
      )
      .subscribe();

    messageChannelRef.current = channel;
  }

  async function createConversation(type) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        customer_id: user.id,
        status: 'open',
        conversation_type: type,
      })
      .select(
        `
        *,
        staff:profiles!chat_conversations_staff_id_fkey(
          first_name,
          last_name,
          role,
          email
        )
      `
      )
      .single();

    if (error) throw error;

    setConversation(data);
    subscribeToMessages(data.id);

    return data;
  }

  async function sendMessage(customText) {
    const messageText = String(customText || input).trim();

    if (!messageText || !user?.id || !selectedType || sending) return;

    setSending(true);
    setErrorText('');
    setInput('');

    try {
      let activeConversation = conversation;

      if (!activeConversation?.id) {
        activeConversation = await createConversation(selectedType);
      }

      const { data: sentMessage, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: activeConversation.id,
          sender_id: user.id,
          message: messageText,
          is_bot: false,
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;

      if (sentMessage) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === sentMessage.id)) return prev;

          return [
            ...prev,
            {
              ...sentMessage,
              profiles: {
                role: 'customer',
              },
            },
          ];
        });
      }

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      if (selectedType === 'ai') {
        setAiThinking(true);

        supabase.functions
          .invoke('ai-chatbot', {
            body: {
              conversation_id: activeConversation.id,
              message: messageText,
            },
          })
          .then(({ error: aiError }) => {
            if (aiError) {
              setAiThinking(false);
              setErrorText(
                'AI Assistant could not reply right now. Please try again later.'
              );
              console.log('AI chatbot error:', aiError.message);
            }
          });
      }
    } catch (error) {
      setInput(messageText);
      setErrorText(error.message || 'Failed to send message.');
      Alert.alert('Send Failed', error.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);

    if (conversation?.id) {
      await fetchMessages(conversation.id, false);
    } else if (selectedType) {
      await initChat(selectedType, false);
    }

    setRefreshing(false);
  }

  function renderChoiceScreen() {
    return (
      <View style={s.choiceContainer}>
        <View style={s.choiceHero}>
          <View style={s.choiceHeroIcon}>
            <Ionicons name="chatbubbles" size={32} color="#111827" />
          </View>

          <Text style={s.choiceTitle}>MotoFix Chat</Text>
          <Text style={s.choiceSubtitle}>
            Choose AI Assistant for quick automated help or talk to a real MotoFix support member.
          </Text>
        </View>

        {!!errorText && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#ef4444" />
            <Text style={s.errorText}>{errorText}</Text>
          </View>
        )}

        <TouchableOpacity
          style={s.choiceCard}
          onPress={() => chooseChatType('ai')}
          activeOpacity={0.85}
        >
          <View style={s.choiceCardIcon}>
            <Ionicons name="sparkles" size={26} color={YELLOW} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.choiceCardTitle}>AI Assistant</Text>
            <Text style={s.choiceCardText}>
              Get quick help about booking, payments, parts, orders, and basic MotoFix questions.
            </Text>
            <Text style={s.choiceStart}>Start AI Chat →</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.choiceCard}
          onPress={() => chooseChatType('human')}
          activeOpacity={0.85}
        >
          <View style={s.choiceCardIcon}>
            <Ionicons name="headset" size={26} color={YELLOW} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.choiceCardTitle}>Talk to a Real Person</Text>
            <Text style={s.choiceCardText}>
              Chat with MotoFix admin, staff, or mechanic for booking, order, and service concerns.
            </Text>
            <Text style={s.choiceStart}>Start Support Chat →</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  function renderMessage({ item, index }) {
    const previous = messages[index - 1];
    const showDate = shouldShowDate(item, previous);
    const isOwn = item.sender_id === user?.id && !item.is_bot;
    const senderLabel = getSenderLabel(item, isOwn, selectedType);
    const isLastOwn = item.id === lastOwnMessageId;

    return (
      <View>
        {showDate && (
          <View style={s.dateDivider}>
            <Text style={s.dateDividerText}>{formatDateLabel(item.created_at)}</Text>
          </View>
        )}

        <View style={[s.messageRow, isOwn ? s.myMessageRow : s.theirMessageRow]}>
          {!isOwn && (
            <View style={[s.avatar, item.is_bot && s.botAvatar]}>
              <Ionicons
                name={item.is_bot ? 'sparkles' : 'headset'}
                size={16}
                color={item.is_bot ? YELLOW : '#fff'}
              />
            </View>
          )}

          <View
            style={[
              s.bubble,
              isOwn ? s.myBubble : s.theirBubble,
              item.is_bot && s.botBubble,
            ]}
          >
            {!isOwn && (
              <Text style={[s.senderLabel, item.is_bot && s.botLabel]}>
                {senderLabel}
              </Text>
            )}

            <Text style={[s.messageText, isOwn && s.myMessageText]}>
              {item.message}
            </Text>

            <View style={s.messageFooter}>
              <Text style={[s.timeText, isOwn && s.myTimeText]}>
                {formatTime(item.created_at)}
              </Text>

              {isOwn && isLastOwn && (
                <Text style={s.sentText}>{item.is_read ? 'Seen' : 'Sent'}</Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  function renderChatScreen() {
    if (loading) {
      return (
        <View style={s.centered}>
          <ActivityIndicator color={YELLOW} size="large" />
          <Text style={s.loadingText}>Opening chat...</Text>
        </View>
      );
    }

    return (
      <KeyboardAvoidingView
        style={s.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 85 : 0}
      >
        <View style={s.header}>
          <TouchableOpacity
            style={s.backButton}
            onPress={backToChoices}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={YELLOW} />
          </TouchableOpacity>

          <View style={[s.headerAvatar, isAiChat && s.aiHeaderAvatar]}>
            <Ionicons name={chatIcon} size={23} color={isAiChat ? YELLOW : '#111827'} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{chatTitle}</Text>
            <Text style={s.headerSub} numberOfLines={1}>
              {conversation?.status === 'closed'
                ? 'Conversation closed'
                : chatSubtitle}
            </Text>
          </View>

          <TouchableOpacity
            style={s.refreshButton}
            onPress={() => onRefresh()}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={18} color={YELLOW} />
          </TouchableOpacity>
        </View>

        {!!errorText && (
          <View style={s.inlineError}>
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <Text style={s.inlineErrorText}>{errorText}</Text>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={[
            s.messageList,
            messages.length === 0 && s.emptyList,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={YELLOW}
            />
          }
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <View style={s.emptyIcon}>
                <Ionicons name={chatIcon} size={40} color={YELLOW} />
              </View>

              <Text style={s.emptyTitle}>
                {isAiChat ? 'Ask the AI Assistant' : 'Start a support chat'}
              </Text>

              <Text style={s.emptyText}>
                {isAiChat
                  ? 'Ask about bookings, payments, parts, orders, or basic MotoFix help.'
                  : 'Send a message and MotoFix admin, staff, or mechanic can reply.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            aiThinking ? (
              <View style={s.thinkingRow}>
                <View style={[s.avatar, s.botAvatar]}>
                  <Ionicons name="sparkles" size={16} color={YELLOW} />
                </View>

                <View style={[s.bubble, s.botBubble]}>
                  <Text style={s.botLabel}>AI Assistant</Text>
                  <View style={s.typingDots}>
                    <View style={s.dot} />
                    <View style={s.dot} />
                    <View style={s.dot} />
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {messages.length === 0 && (
          <View style={s.quickReplies}>
            {activeQuickReplies.map((reply) => (
              <TouchableOpacity
                key={reply}
                style={s.quickReply}
                onPress={() => sendMessage(reply)}
                activeOpacity={0.8}
              >
                <Text style={s.quickReplyText}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {conversation?.status === 'closed' ? (
          <View style={s.closedBox}>
            <Text style={s.closedText}>This conversation is closed.</Text>
            <TouchableOpacity
              style={s.newChatButton}
              onPress={() => {
                setConversation(null);
                setMessages([]);
                setErrorText('');
              }}
              activeOpacity={0.8}
            >
              <Text style={s.newChatButtonText}>Start New Chat</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder={isAiChat ? 'Ask the AI Assistant...' : 'Type a message...'}
              placeholderTextColor={getThemeValue(theme, 'textMuted', '#9ca3af')}
              multiline
              maxLength={700}
            />

            <TouchableOpacity
              style={[
                s.sendButton,
                (!input.trim() || sending) && s.sendButtonDisabled,
              ]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || sending}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator color="#111827" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#111827" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  }

  if (initializing) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={YELLOW} size="large" />
        <Text style={s.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  if (!selectedType) {
    return <View style={s.container}>{renderChoiceScreen()}</View>;
  }

  return renderChatScreen();
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

    choiceContainer: {
      flex: 1,
      padding: 18,
      justifyContent: 'center',
    },
    choiceHero: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 24,
      padding: 22,
      alignItems: 'center',
      marginBottom: 16,
    },
    choiceHeroIcon: {
      width: 70,
      height: 70,
      borderRadius: 24,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    choiceTitle: {
      color: text,
      fontSize: 28,
      fontWeight: '900',
      textAlign: 'center',
    },
    choiceSubtitle: {
      color: textSub,
      textAlign: 'center',
      lineHeight: 21,
      marginTop: 8,
      fontWeight: '600',
    },
    choiceCard: {
      flexDirection: 'row',
      gap: 14,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 22,
      padding: 18,
      marginBottom: 13,
    },
    choiceCardIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      backgroundColor: YELLOW + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceCardTitle: {
      color: text,
      fontSize: 18,
      fontWeight: '900',
    },
    choiceCardText: {
      color: textMuted,
      lineHeight: 19,
      fontSize: 13,
      marginTop: 5,
      fontWeight: '600',
    },
    choiceStart: {
      color: YELLOW,
      fontWeight: '900',
      marginTop: 10,
      fontSize: 13,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.35)',
      borderRadius: 15,
      padding: 12,
      marginBottom: 13,
    },
    errorText: {
      color: '#ef4444',
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },

    chatContainer: {
      flex: 1,
      backgroundColor: bg,
    },
    header: {
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
    headerAvatar: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: YELLOW,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiHeaderAvatar: {
      backgroundColor: YELLOW + '22',
      borderWidth: 1,
      borderColor: YELLOW + '55',
    },
    headerTitle: {
      color: text,
      fontSize: 16,
      fontWeight: '900',
    },
    headerSub: {
      color: textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 3,
    },
    refreshButton: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: bg2,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(239, 68, 68, 0.25)',
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    inlineErrorText: {
      color: '#ef4444',
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
    },

    messageList: {
      padding: 16,
      paddingBottom: 20,
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
      marginBottom: 10,
    },
    myMessageRow: {
      justifyContent: 'flex-end',
    },
    theirMessageRow: {
      justifyContent: 'flex-start',
    },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 11,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    botAvatar: {
      backgroundColor: YELLOW + '22',
      borderWidth: 1,
      borderColor: YELLOW + '55',
    },
    bubble: {
      maxWidth: '78%',
      borderRadius: 18,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    myBubble: {
      backgroundColor: primary,
      borderBottomRightRadius: 5,
    },
    theirBubble: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderBottomLeftRadius: 5,
    },
    botBubble: {
      backgroundColor: YELLOW + '16',
      borderWidth: 1,
      borderColor: YELLOW + '55',
      borderBottomLeftRadius: 5,
    },
    senderLabel: {
      color: textMuted,
      fontSize: 10,
      fontWeight: '900',
      marginBottom: 4,
    },
    botLabel: {
      color: YELLOW,
      fontSize: 10,
      fontWeight: '900',
      marginBottom: 4,
    },
    messageText: {
      color: text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
    },
    myMessageText: {
      color: '#111827',
      fontWeight: '700',
    },
    messageFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    timeText: {
      color: textMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    myTimeText: {
      color: 'rgba(17, 24, 39, 0.65)',
    },
    sentText: {
      color: 'rgba(17, 24, 39, 0.75)',
      fontSize: 10,
      fontWeight: '900',
    },

    emptyChat: {
      alignItems: 'center',
      paddingHorizontal: 26,
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
      fontSize: 19,
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

    thinkingRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 10,
    },
    typingDots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 3,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: YELLOW,
      opacity: 0.8,
    },

    quickReplies: {
      paddingHorizontal: 12,
      paddingBottom: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      backgroundColor: bg,
    },
    quickReply: {
      backgroundColor: card,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    quickReplyText: {
      color: textSub,
      fontSize: 12,
      fontWeight: '800',
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

    closedBox: {
      backgroundColor: card,
      borderTopWidth: 1,
      borderTopColor: border,
      padding: 14,
      alignItems: 'center',
    },
    closedText: {
      color: textMuted,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 10,
    },
    newChatButton: {
      backgroundColor: YELLOW,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    newChatButtonText: {
      color: '#111827',
      fontWeight: '900',
    },
  });
};