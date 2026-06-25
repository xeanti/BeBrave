import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

function formatDateTime(value) {
  if (!value) return '';

  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getIcon(type) {
  if (type === 'booking') return '📅';
  if (type === 'order') return '📦';
  if (type === 'payment') return '💰';
  if (type === 'service_status') return '🔧';
  if (type === 'inventory') return '⚙️';
  if (type === 'message') return '💬';
  return '🔔';
}

function getNotificationPath(notification, profile) {
  const role = profile?.role;
  const relatedTable = notification.related_table;
  const relatedId = notification.related_id;
  const type = notification.type;

  if (type === 'message') {
    return role === 'customer' ? '/chat' : '/admin/chat';
  }

  if (relatedTable === 'bookings') {
    if (!relatedId) {
      if (role === 'admin') return '/admin/bookings';
      if (role === 'mechanic') return '/mechanic-dashboard';
      if (role === 'staff') return '/staff';
      return '/appointments';
    }

    if (role === 'admin') return `/admin/bookings/${relatedId}`;
    if (role === 'customer') return `/appointments/${relatedId}`;
    if (role === 'mechanic') return `/mechanic-dashboard?focus=${relatedId}`;
    if (role === 'staff') return `/staff/bookings/${relatedId}`;

    return `/appointments/${relatedId}`;
  }

  if (relatedTable === 'orders') {
    if (!relatedId) {
      if (role === 'admin' || role === 'staff') return '/admin/orders';
      return '/my-orders';
    }

    if (role === 'admin') return `/admin/orders/${relatedId}`;
    if (role === 'customer') return `/my-orders/${relatedId}`;
    if (role === 'staff') return `/staff/orders/${relatedId}`;

    return `/my-orders/${relatedId}`;
  }

  if (relatedTable === 'pre_assessments' || relatedTable === 'assessments') {
    if (role === 'admin') return '/admin/assessments';
    return '/my-assessments';
  }

  if (relatedTable === 'parts') {
    if (role === 'admin' || role === 'staff') return '/admin/parts';
    return '/shop';
  }

  return '/notifications';
}

export default function Notifications() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications();

    const channel = supabase
      .channel(`notifications-page-${user.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function fetchNotifications(showLoader = true) {
    if (!user?.id) return;

    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error) {
      setNotifications(data || []);
    }

    setLoading(false);
  }

  async function markAsRead(notificationId) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  }

  async function markAllAsRead() {
    if (!user?.id) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        is_read: true,
      }))
    );
  }

  async function handleNotificationClick(notification) {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    const path = getNotificationPath(notification, profile);
    navigate(path);
  }

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Alerts
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Notifications
                </h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {unreadCount > 0
                    ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`
                    : 'You have no unread notifications.'}
                </p>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
              />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              🔔
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No notifications yet
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Booking, order, payment, and service updates will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const unread = !notification.is_read;

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md dark:hover:border-primary-500/40 ${
                    unread
                      ? 'border-primary-200 bg-primary-50 dark:border-primary-500/30 dark:bg-primary-900/15'
                      : 'border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800'
                  }`}
                >
                  <div className="flex gap-4">
                    <div
                      className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-2xl ${
                        unread
                          ? 'bg-white ring-1 ring-primary-100 dark:bg-dark-800 dark:ring-primary-500/30'
                          : 'bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700'
                      }`}
                    >
                      {getIcon(notification.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2
                          className={`text-sm font-black ${
                            unread
                              ? 'text-gray-950 dark:text-white'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {notification.title}
                        </h2>

                        {unread && (
                          <span className="rounded-full bg-primary-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                            New
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        {notification.message}
                      </p>

                      {notification.related_id && (
                        <p className="mt-2 text-xs font-bold text-gray-400 dark:text-gray-500">
                          {notification.related_table === 'bookings'
                            ? 'Appointment ID'
                            : notification.related_table === 'orders'
                            ? 'Order ID'
                            : 'Reference ID'}
                          : {notification.related_id.slice(0, 8).toUpperCase()}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{formatDateTime(notification.created_at)}</span>
                        <span>•</span>
                        <span className="capitalize">
                          {String(notification.type || 'general').replace('_', ' ')}
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-primary-600 dark:text-primary-400">
                          Open details →
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}