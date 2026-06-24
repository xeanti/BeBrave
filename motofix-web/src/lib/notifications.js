import { supabase } from './supabaseClient';

export async function notifyUser({
  userId,
  title,
  message,
  type = 'general',
  relatedTable = null,
  relatedId = null,
}) {
  if (!userId) return;

  const { error } = await supabase.rpc('create_notification', {
    p_user_id: userId,
    p_title: title,
    p_message: message,
    p_type: type,
    p_related_table: relatedTable,
    p_related_id: relatedId,
  });

  if (error) {
    console.error('notifyUser error:', error.message);
  }
}

export async function notifyRole({
  role,
  title,
  message,
  type = 'general',
  relatedTable = null,
  relatedId = null,
}) {
  if (!role) return;

  const { error } = await supabase.rpc('notify_role', {
    p_role: role,
    p_title: title,
    p_message: message,
    p_type: type,
    p_related_table: relatedTable,
    p_related_id: relatedId,
  });

  if (error) {
    console.error('notifyRole error:', error.message);
  }
}

export async function markNotificationAsRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('markNotificationAsRead error:', error.message);
  }
}

export async function markAllNotificationsAsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('markAllNotificationsAsRead error:', error.message);
  }
}