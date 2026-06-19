import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [customizations, setCustomizations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    const [bookingsRes, customizationsRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, services(name)')
        .eq('customer_id', user.id)
        .order('booking_date', { ascending: true })
        .limit(5),
      supabase
        .from('customizations')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    if (!bookingsRes.error) setBookings(bookingsRes.data || []);
    if (!customizationsRes.error) setCustomizations(customizationsRes.data || []);
    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">
              Welcome back, {profile?.first_name || 'Rider'} 👋
            </h1>
            <p className="text-gray-400">Here's what's happening with your account.</p>
          </div>
          {profile?.moto_make && (
            <div className="flex items-center gap-3 bg-dark-800 rounded-xl px-4 py-3">
              {profile.moto_photo_url ? (
                <img
                  src={profile.moto_photo_url}
                  alt="My motorcycle"
                  className="w-12 h-12 rounded-lg object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-dark-900 flex items-center justify-center text-xl">
                  🏍️
                </div>
              )}
              <div>
                <p className="text-sm font-medium">
                  {profile.moto_make} {profile.moto_model}
                </p>
                <p className="text-xs text-gray-400">{profile.moto_year || ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          <QuickAction
            to="/booking"
            title="Book a Service"
            description="Schedule your next appointment"
            icon="📅"
            color="bg-blue-500/10 text-blue-400"
          />
          <QuickAction
            to="/customize"
            title="AI Appearance Preview"
            description="See your motorcycle with new parts"
            icon="✨"
            color="bg-primary-500/10 text-primary-400"
          />
          <QuickAction
            to="/profile"
            title="My Profile"
            description="Update your info & motorcycle"
            icon="👤"
            color="bg-purple-500/10 text-purple-400"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Upcoming bookings */}
          <div className="bg-dark-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Upcoming Bookings</h2>
              <Link to="/booking" className="text-xs text-primary-500 hover:underline">
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
              <ul className="space-y-3">
                {bookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between bg-dark-900 rounded-lg p-4"
                  >
                    <div>
                      <p className="font-medium text-sm">{b.services?.name || 'Service'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {b.booking_date} at {b.booking_time}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent AI Previews */}
          <div className="bg-dark-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent AI Previews</h2>
              <Link to="/customize" className="text-xs text-primary-500 hover:underline">
                + New preview
              </Link>
            </div>

            {loading ? (
              <SkeletonList />
            ) : customizations.length === 0 ? (
              <EmptyState
                icon="✨"
                text="No AI previews yet."
                actionLabel="Try the appearance preview"
                actionTo="/customize"
              />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {customizations.map((c) => (
                  <div key={c.id} className="aspect-square bg-dark-900 rounded-lg overflow-hidden">
                    {c.preview_image_url ? (
                      <img
                        src={c.preview_image_url}
                        alt="AI Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                        Pending
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ to, title, description, icon, color }) {
  return (
    <Link
      to={to}
      className="bg-dark-800 hover:bg-dark-800/70 rounded-xl p-5 transition flex items-start gap-4 group"
    >
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl ${color}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold mb-0.5 group-hover:text-primary-500 transition">{title}</h3>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </Link>
  );
}

function StatusBadge({ status }) {
  const styles = {
    confirmed: 'bg-green-500/20 text-green-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-gray-500/20 text-gray-400',
    cancelled: 'bg-red-500/20 text-red-400',
  };

  return (
    <span className={`text-xs px-3 py-1 rounded-full capitalize whitespace-nowrap ${styles[status] || styles.pending}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function EmptyState({ icon, text, actionLabel, actionTo }) {
  return (
    <div className="text-center py-8">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-gray-400 text-sm mb-3">{text}</p>
      <Link to={actionTo} className="text-primary-500 text-sm font-medium hover:underline">
        {actionLabel} →
      </Link>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-14 bg-dark-900 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}
