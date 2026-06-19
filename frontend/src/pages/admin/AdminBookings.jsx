import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

export default function AdminBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
    fetchMechanics();
  }, []);

  async function fetchBookings() {
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        services(name, base_price),
        profiles!bookings_customer_id_fkey(first_name, last_name, email, phone),
        mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `)
      .order('booking_date', { ascending: false });
    if (data) setBookings(data);
    setLoading(false);
  }

  async function fetchMechanics() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'mechanic');
    if (data) setMechanics(data);
  }

  async function updateStatus(id, status) {
    await supabase.from('bookings').update({ status }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_BOOKING_STATUS',
      entity: 'bookings',
      entity_id: id,
      performed_by: user.id,
      details: { new_status: status },
    });
    fetchBookings();
  }

  async function assignMechanic(id, mechanicId) {
    await supabase.from('bookings')
      .update({ mechanic_id: mechanicId || null })
      .eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'ASSIGN_MECHANIC',
      entity: 'bookings',
      entity_id: id,
      performed_by: user.id,
      details: { mechanic_id: mechanicId || null },
    });
    fetchBookings();
  }

  const filtered = bookings.filter(b => filter === 'all' || b.status === filter);

  const counts = {
    all: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Manage Bookings</h1>
          <p className="text-gray-400">View, assign mechanics, and update booking statuses.</p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
                filter === f ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.replace('_', ' ')} <span className="opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-gray-400">No bookings found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((b) => (
              <div key={b.id} className="bg-dark-800 rounded-xl p-5">

                {/* Top row */}
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <p className="font-semibold text-lg">
                      {b.profiles?.first_name} {b.profiles?.last_name}
                    </p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      👤 {b.profiles?.email}
                      {b.profiles?.phone ? ` · ${b.profiles.phone}` : ''}
                    </p>
                    <p className="text-sm text-primary-400 mt-0.5">
                      🔧 {b.services?.name || 'No service selected'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {b.booking_date} at {b.booking_time}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${STATUS_COLORS[b.status] || STATUS_COLORS.pending}`}>
                    {b.status?.replace('_', ' ')}
                  </span>
                </div>

                {/* Notes */}
                {b.notes && (
                  <div className="bg-dark-900 rounded-lg px-4 py-3 mb-4 text-sm text-gray-300 italic">
                    "{b.notes}"
                  </div>
                )}

                {/* Cost breakdown grid */}
                <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Base Price</p>
                    <p className="font-medium">₱{b.services?.base_price || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Down Payment</p>
                    <p className="font-medium text-accent-400">₱{b.down_payment || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Mechanic</p>
                    <p className="font-medium">
                      {b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Booking ID</p>
                    <p className="font-medium text-gray-400">{b.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                </div>

                {/* Assign mechanic */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1.5">Assign Mechanic</p>
                  <select
                    value={b.mechanic_id || ''}
                    onChange={(e) => assignMechanic(b.id, e.target.value)}
                    className="bg-dark-900 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-white w-full md:w-auto"
                  >
                    <option value="">Unassigned</option>
                    {mechanics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status actions */}
                <div className="flex gap-2 flex-wrap items-center">
                  <p className="text-xs text-gray-500 mr-1">Update status:</p>
                  {['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']
                    .filter(s => s !== b.status)
                    .map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(b.id, s)}
                        className={`text-xs px-3 py-1.5 rounded-md transition capitalize ${ACTION_STYLES[s]}`}
                      >
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-green-500/20 text-green-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

const ACTION_STYLES = {
  pending: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-400 hover:bg-green-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  completed: 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30',
  cancelled: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
};