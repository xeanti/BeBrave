import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name)')
      .eq('customer_id', user.id)
      .order('booking_date', { ascending: true })
      .limit(6);

    if (!error) setBookings(data || []);
    setLoading(false);
  }

  const upcomingCount = bookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'pending'
  ).length;

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white px-4 sm:px-6 py-8 sm:py-10 transition-colors">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="relative rounded-2xl bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 shadow-sm dark:shadow-none p-5 sm:p-6 mb-8 overflow-hidden transition-colors">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-500 to-accent-400" />

          <div className="flex items-center justify-between flex-wrap gap-6 pl-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center text-lg font-bold text-white shrink-0 shadow-md shadow-primary-500/30">
                {profile?.first_name ? profile.first_name[0].toUpperCase() : '🏍️'}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-accent-600 dark:text-accent-400">
                  {greeting()}
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  {profile?.first_name || 'Rider'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {upcomingCount > 0
                    ? `${upcomingCount} upcoming booking${upcomingCount > 1 ? 's' : ''} on your schedule`
                    : "No bookings yet — let's get your bike serviced."}
                </p>
              </div>
            </div>

            {profile?.moto_make && (
              <div className="flex items-center gap-3 bg-gray-100 dark:bg-black/30 rounded-xl px-4 py-3 border border-gray-200 dark:border-white/10">
                {profile.moto_photo_url ? (
                  <img
                    src={profile.moto_photo_url}
                    alt="My motorcycle"
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-dark-700 flex items-center justify-center text-xl">
                    🏍️
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium leading-tight">
                    {profile.moto_make} {profile.moto_model}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{profile.moto_year || ''}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          <QuickAction
            to="/booking"
            title="Book a Service"
            description="Schedule your next appointment"
            icon="📅"
            color="bg-blue-500/10 text-blue-500 dark:text-blue-400"
          />
          <QuickAction
            to="/customize"
            title="AI Appearance Preview"
            description="See your motorcycle with new parts"
            icon="✨"
            color="bg-primary-500/10 text-primary-500 dark:text-primary-400"
          />
          <QuickAction
            to="/profile"
            title="My Profile"
            description="Update your info & motorcycle"
            icon="👤"
            color="bg-purple-500/10 text-purple-500 dark:text-purple-400"
          />
        </div>

        {/* Bookings */}
        <div className="bg-white dark:bg-dark-800 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none p-5 sm:p-6 transition-colors">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold">Upcoming Bookings</h2>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Your next scheduled services</p>
            </div>
            <Link
              to="/booking"
              className="text-xs font-medium text-primary-600 dark:text-primary-500 hover:text-primary-700 dark:hover:text-primary-400 bg-primary-500/10 hover:bg-primary-500/15 rounded-full px-3 py-1.5 transition"
            >
              + New booking
            </Link>
          </div>

          {loading ? (
            <SkeletonList />
          ) : bookings.length === 0 ? (
            <EmptyState
              icon="📅"
              text="No bookings yet."
              actionLabel="Book your first service"
              actionTo="/booking"
            />
          ) : (
            <ul className="space-y-2.5">
              {bookings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between bg-gray-50 dark:bg-dark-900 hover:bg-gray-100 dark:hover:bg-dark-900/70 rounded-xl p-4 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-800 border border-gray-200 dark:border-transparent flex items-center justify-center text-base">
                      🔧
                    </div>
                    <div>
                      <p className="font-medium text-sm">{b.services?.name || 'Service'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatDate(b.booking_date)} · {b.booking_time}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function QuickAction({ to, title, description, icon, color }) {
  return (
    <Link
      to={to}
      className="bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-800/70 border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 shadow-sm dark:shadow-none rounded-xl p-5 transition-all flex items-start gap-4 group hover:-translate-y-0.5"
    >
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-500 transition-colors">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </Link>
  );
}

function StatusBadge({ status }) {
  const styles = {
    confirmed: 'bg-green-500/15 text-green-600 dark:text-green-400 ring-1 ring-green-500/20',
    pending: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 ring-1 ring-yellow-500/20',
    in_progress: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20',
    completed: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 ring-1 ring-gray-500/20',
    cancelled: 'bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500/20',
  };

  return (
    <span
      className={`text-xs px-3 py-1 rounded-full capitalize whitespace-nowrap font-medium ${styles[status] || styles.pending}`}
    >
      {status?.replace('_', ' ')}
    </span>
  );
}

function EmptyState({ icon, text, actionLabel, actionTo }) {
  return (
    <div className="text-center py-10">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">{text}</p>
      <Link
        to={actionTo}
        className="inline-block text-primary-600 dark:text-primary-500 text-sm font-medium hover:underline"
      >
        {actionLabel} →
      </Link>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-16 bg-gray-100 dark:bg-dark-900 rounded-xl relative overflow-hidden"
        >
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-gray-200/60 dark:via-white/5 to-transparent" />
        </div>
      ))}
    </div>
  );
}