import { supabase } from './supabaseClient';

const NOTIFICATION_CONSENT_TYPE = 'notifications';

async function getUserRole(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('getUserRole warning:', error.message);
    return null;
  }

  return data?.role || null;
}

async function hasNotificationConsent(userId) {
  if (!userId) return false;

  const { data, error } = await supabase.rpc('has_customer_consent', {
    p_customer_id: userId,
    p_consent_type: NOTIFICATION_CONSENT_TYPE,
  });

  if (error) {
    console.warn('hasNotificationConsent warning:', error.message);

    // Do not break the notification system if the consent RPC has a temporary issue.
    return true;
  }

  return Boolean(data);
}

async function canNotifyUser(userId) {
  if (!userId) return false;

  const role = await getUserRole(userId);

  // Admin, staff, and mechanic notifications are internal system notifications.
  // The customer notification consent is only applied to customer accounts.
  if (role && role !== 'customer') {
    return true;
  }

  // If the role cannot be checked, allow the notification to avoid breaking old accounts.
  // Customer consent is still enforced when the role is known as "customer".
  if (!role) {
    return true;
  }

  return hasNotificationConsent(userId);
}

export async function notifyUser({
  userId,
  title,
  message,
  type = 'general',
  relatedTable = null,
  relatedId = null,
  respectConsent = true,
  force = false,
}) {
  if (!userId) return { skipped: true, reason: 'missing_user_id' };

  if (respectConsent && !force) {
    const allowed = await canNotifyUser(userId);

    if (!allowed) {
      console.info('Notification skipped because user has no notification consent:', {
        userId,
        title,
        type,
        relatedTable,
        relatedId,
      });

      return {
        skipped: true,
        reason: 'notification_consent_not_accepted',
      };
    }
  }

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

    return {
      skipped: false,
      error,
    };
  }

  return {
    skipped: false,
    error: null,
  };
}

export async function notifyRole({
  role,
  title,
  message,
  type = 'general',
  relatedTable = null,
  relatedId = null,
}) {
  if (!role) return { skipped: true, reason: 'missing_role' };

  // For admin/staff/mechanic notifications, keep the fast RPC.
  // These are internal system alerts and should not depend on customer consent.
  if (role !== 'customer') {
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

      return {
        skipped: false,
        error,
      };
    }

    return {
      skipped: false,
      error: null,
    };
  }

  // Safer customer-role handling:
  // If ever used for customers, notify users one by one so notification consent is respected.
  const { data: customers, error: customerError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'customer');

  if (customerError) {
    console.error('notifyRole customer lookup error:', customerError.message);

    return {
      skipped: false,
      error: customerError,
    };
  }

  const results = [];

  for (const customer of customers || []) {
    const result = await notifyUser({
      userId: customer.id,
      title,
      message,
      type,
      relatedTable,
      relatedId,
      respectConsent: true,
    });

    results.push({
      userId: customer.id,
      ...result,
    });
  }

  return {
    skipped: false,
    error: null,
    results,
  };
}

export async function markNotificationAsRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('markNotificationAsRead error:', error.message);
  }

  return { error };
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

  return { error };
}