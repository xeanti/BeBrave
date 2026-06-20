import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';

export default function MechanicDashboard() {
  const { user, profile } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, [user]);

  async function fetchBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, base_price), profiles!bookings_customer_id_fkey(first_name, last_name, phone)')
      .eq('mechanic_id', user.id)
      .order('booking_date', { ascending: true });

    if (!error) setBookings(data || []);
    setLoading(false);
  }

  async function updateStatus(id, status) {
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .eq('mechanic_id', user.id);

    if (!error) fetchBookings();
  }

  const counts = {
    total: bookings.length,
    pending: bookings.filter((b) => b.status === 'pending').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    in_progress: bookings.filter((b) => b.status === 'in_progress').length,
    completed: bookings.filter((b) => b.status === 'completed').length,
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-4xl mx-auto">
        
        {/* Welcome Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-800">
          <div className="flex items-center gap-4">
            {profile?.mechanic_photo_url ? (
              <img 
                src={profile.mechanic_photo_url} 
                alt="Profile"    
                className="w-16 h-16 rounded-full object-cover border-2 border-primary-500/30 shadow-md" 
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-2xl font-bold shadow-md">
                {(profile?.first_name?.[0] || '') + (profile?.last_name?.[0] || '')}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Mechanic Dashboard</h1>
              <p className="text-gray-400 mt-0.5">
                Welcome, {profile?.first_name} {profile?.last_name}
              </p>
              {profile?.specialization && (
                <p className="text-sm text-primary-400 mt-1 flex items-center gap-1.5">
                  <span>🔧</span> {profile.specialization}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col md:items-end justify-center gap-1.5 bg-dark-800/40 p-4 rounded-xl border border-gray-800/60 min-w-[200px]">
            <div className="flex items-center gap-1.5">
              <span className="text-yellow-400 text-lg">★</span>
              <span className="font-semibold text-lg">{profile?.rating_avg ? profile.rating_avg.toFixed(1) : '—'}</span>
              <span className="text-xs text-gray-500">({profile?.rating_count || 0} ratings)</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <Link to="/mechanic-ratings" className="text-xs text-primary-400 hover:underline">
                View all reviews →
              </Link>
              <span className="text-gray-700 text-xs">|</span>
              <Link to="/profile" className="text-xs text-primary-400 hover:underline">
                Edit Profile →
              </Link>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          <StatCard label="Total" value={counts.total} />
          <StatCard label="Pending" value={counts.pending} color="text-yellow-400" />
          <StatCard label="Confirmed" value={counts.confirmed} color="text-green-400" />
          <StatCard label="In Progress" value={counts.in_progress} color="text-blue-400" />
          <StatCard label="Completed" value={counts.completed} color="text-gray-400" />
        </div>

        {/* Booking list */}
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : bookings.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-gray-400">No bookings assigned to you yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="bg-dark-800 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="font-semibold">{b.services?.name || 'Service'}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {b.booking_date} at {b.booking_time}
                  </p>
                  {b.profiles && (
                    <p className="text-sm text-gray-400 mt-1">
                      Customer: {b.profiles.first_name} {b.profiles.last_name} ({b.profiles.phone || 'no phone'})
                    </p>
                  )}
                  {b.notes && <p className="text-sm text-gray-500 mt-1">Note: {b.notes}</p>}
                </div>

                <select
                  value={b.status}
                  onChange={(e) => updateStatus(b.id, e.target.value)}
                  className="bg-dark-900 border border-gray-700 rounded-md px-3 py-1.5 text-sm capitalize"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-dark-800 rounded-xl p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}