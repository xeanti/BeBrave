import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function NotificationBell({ mobile = false }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    fetchUnreadNotifications();

    const uniqueChannelName = `notification-bell-${user.id}-${
      mobile ? 'mobile' : 'desktop'
    }-${Date.now()}-${Math.random()}`;

    const channel = supabase.channel(uniqueChannelName);

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      },
      () => {
        fetchUnreadNotifications();
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, mobile]);

  async function fetchUnreadNotifications() {
    if (!user?.id) return;

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('Failed to fetch notifications:', error);
      return;
    }

    setUnreadCount(count || 0);
  }

  return (
    <Link
      to="/notifications"
      title="Notifications"
      className={`relative flex flex-shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white/80 text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 dark:border-gray-700 dark:bg-dark-800/90 dark:text-gray-200 dark:hover:border-primary-500 dark:hover:bg-dark-700 ${
        mobile ? 'h-11 w-11' : 'h-10 w-10'
      }`}
    >
      <span className="text-lg">🔔</span>

      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white dark:ring-dark-900">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}