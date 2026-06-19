import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import RatingModal from '../components/RatingModal';

export default function Appointments() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [ratingBooking, setRatingBooking] = useState(null);
  const [ratedBookings, setRatedBookings] = useState(new Set());
  const [ratedBookingIds, setRatedBookingIds] = useState(new Set());

  useEffect(() => {
    fetchBookings();
  }, [user]);

  async function fetchBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, base_price), profiles!bookings_mechanic_id_fkey(first_name, last_name)')
      .eq('customer_id', user.id)
      .order('booking_date', { ascending: false });

    if (!error) setBookings(data || []);

    // Fetch which bookings this user has already rated
    const { data: ratings } = await supabase
      .from('mechanic_ratings')
      .select('booking_id')
      .eq('customer_id', user.id);

    if (ratings) {
      setRatedBookingIds(new Set(ratings.map((r) => r.booking_id)));
    }

    setLoading(false);
  }

  async function cancelBooking(id) {
    if (!confirm('Cancel this appointment?')) return;
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('customer_id', user.id)
      .eq('status', 'pending');

    if (error) {
      alert('Failed to cancel: ' + error.message);
    } else {
      fetchBookings();
    }
  }

  const filtered = bookings.filter((b) => filter === 'all' || b.status === filter);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">My Appointments</h1>
        <p className="text-gray-400 mb-6">View and manage your service bookings.</p>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-gray-400">No appointments found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <div key={b.id} className="bg-dark-800 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="font-semibold">{b.services?.name || 'Service'}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {b.booking_date} at {b.booking_time}
                  </p>
                  {b.profiles && (
                    <p className="text-sm text-gray-400 mt-1">
                      Mechanic: {b.profiles.first_name} {b.profiles.last_name}
                    </p>
                  )}
                  {b.notes && <p className="text-sm text-gray-500 mt-1">Note: {b.notes}</p>}
                  {b.services?.base_price && (
                    <p className="text-sm text-primary-400 mt-1">₱{b.services.base_price}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge status={b.status} />
                  {b.status === 'pending' && (
                    <button
                      onClick={() => cancelBooking(b.id)}
                      className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 px-3 py-1.5 rounded-md transition"
                    >
                      Cancel
                    </button>
                  )}
                  {b.status === 'completed' && !ratedBookings.has(b.id) && !ratedBookingIds.has(b.id) && (
                    <button
                      onClick={() => setRatingBooking(b)}
                      className="text-xs text-primary-400 hover:text-primary-300 border border-primary-500/30 hover:border-primary-500/50 px-3 py-1.5 rounded-md transition"
                    >
                      ★ Rate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ratingBooking && (
        <RatingModal
          booking={ratingBooking}
          onClose={() => setRatingBooking(null)}
          onSubmitted={() => {
            setRatedBookings((prev) => new Set(prev).add(ratingBooking.id));
            setRatedBookingIds((prev) => new Set(prev).add(ratingBooking.id));
            setRatingBooking(null);
          }}
        />
      )}
    </div>
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