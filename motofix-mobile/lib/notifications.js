import { supabase } from './supabase';

export async function notifyUser({
  userId,
  title,
  message,
  type = 'general',
  relatedTable = null,
  relatedId = null,
}) {
  if (!userId) return null;

  const { data, error } = await supabase.rpc('create_notification', {
    p_user_id: userId,
    p_title: title,
    p_message: message,
    p_type: type,
    p_related_table: relatedTable,
    p_related_id: relatedId,
  });

  if (error) {
    console.log('notifyUser error:', error.message);
    return null;
  }

  return data;
}

export async function notifyRole({
  role,
  title,
  message,
  type = 'general',
  relatedTable = null,
  relatedId = null,
}) {
  if (!role) return null;

  const { data, error } = await supabase.rpc('notify_role', {
    p_role: role,
    p_title: title,
    p_message: message,
    p_type: type,
    p_related_table: relatedTable,
    p_related_id: relatedId,
  });

  if (error) {
    console.log('notifyRole error:', error.message);
    return null;
  }

  return data;
}