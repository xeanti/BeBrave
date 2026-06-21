import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-green-500/20 text-green-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

export default function MechanicDashboard() {
  const { user, profile } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const filteredBookings = bookings.filter((b) => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const customerName = `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`.toLowerCase();
    const serviceName = (b.services?.name || '').toLowerCase();
    const query = search.trim().toLowerCase();
    const matchesSearch = query === '' || customerName.includes(query) || serviceName.includes(query);
    return matchesStatus && matchesSearch;
  });

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

          <div className="flex flex-col md:items-end justify-center gap-1.5 bg-gray-100 dark:bg-dark-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-800/60 min-w-[200px]">
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

        {/* Stats — doubles as status filter */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total" value={counts.total} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          <StatCard label="Pending" value={counts.pending} color="text-yellow-400" active={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')} />
          <StatCard label="Confirmed" value={counts.confirmed} color="text-green-400" active={statusFilter === 'confirmed'} onClick={() => setStatusFilter('confirmed')} />
          <StatCard label="In Progress" value={counts.in_progress} color="text-blue-400" active={statusFilter === 'in_progress'} onClick={() => setStatusFilter('in_progress')} />
          <StatCard label="Completed" value={counts.completed} color="text-gray-400" active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} />
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 text-sm">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer or service name..."
            className="w-full pl-9 pr-8 py-2.5 rounded-lg bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 placeholder-gray-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Booking list */}
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : bookings.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-gray-400">No bookings assigned to you yet.</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-400 mb-2">No bookings match your search.</p>
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); }}
              className="text-primary-400 text-sm hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((b) => (
              <div key={b.id} className="bg-dark-800 rounded-xl p-5 flex items-start justify-between gap-4">

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-white">{b.services?.name || 'Service'}</p>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full capitalize font-medium whitespace-nowrap ${STATUS_COLORS[b.status] || STATUS_COLORS.pending}`}>
                      {b.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">
                    {b.booking_date} at {b.booking_time}
                  </p>
                  {b.profiles && (
                    <p className="text-sm text-gray-300 mt-1">
                      👤 {b.profiles.first_name} {b.profiles.last_name}
                      <span className="text-gray-500"> · {b.profiles.phone || 'no phone'}</span>
                    </p>
                  )}
                  {b.notes && (
                    <p className="text-sm text-gray-400 mt-1.5 italic break-words">"{b.notes}"</p>
                  )}
                </div>

                <select
                  value={b.status}
                  onChange={(e) => updateStatus(b.id, e.target.value)}
                  className="bg-dark-900 border border-gray-700 rounded-md px-3 py-1.5 text-sm capitalize text-white shrink-0"
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

function StatCard({ label, value, color = 'text-white', active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl p-4 text-center transition border ${
        active ? 'bg-primary-600/20 border-primary-500' : 'bg-dark-800 border-transparent hover:border-gray-700'
      }`}
    >
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </button>
  );
}