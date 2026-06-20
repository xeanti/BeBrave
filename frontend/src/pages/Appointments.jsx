import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import RatingModal from '../components/RatingModal';

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;

function generateTimeSlots() {
  const slots = [];
  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function formatSlot(slot) {
  const [h, m] = slot.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

export default function Appointments() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [ratingBooking, setRatingBooking] = useState(null);
  const [ratedBookings, setRatedBookings] = useState(new Set());
  const [ratedBookingIds, setRatedBookingIds] = useState(new Set());

  // Reschedule state
  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  // Cancel confirmation state
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [cancelSaving, setCancelSaving] = useState(false);

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

    const { data: ratings } = await supabase
      .from('mechanic_ratings')
      .select('booking_id')
      .eq('customer_id', user.id);

    if (ratings) {
      setRatedBookingIds(new Set(ratings.map((r) => r.booking_id)));
    }

    setLoading(false);
  }

  async function confirmCancel() {
    if (!cancellingBooking) return;
    setCancelSaving(true);

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', cancellingBooking.id)
      .eq('customer_id', user.id)
      .eq('status', 'pending');

    setCancelSaving(false);

    if (error) {
      alert('Failed to cancel: ' + error.message);
    } else {
      setCancellingBooking(null);
      fetchBookings();
    }
  }

  function openReschedule(booking) {
    setReschedulingBooking(booking);
    setNewDate(booking.booking_date);
    setNewTime(booking.booking_time?.slice(0, 5) || '');
    setRescheduleError('');
  }

  function closeReschedule() {
    setReschedulingBooking(null);
    setNewDate('');
    setNewTime('');
    setRescheduleError('');
  }

  async function submitReschedule(e) {
    e.preventDefault();
    if (!reschedulingBooking) return;
    setRescheduleError('');

    if (!newDate || !newTime) {
      setRescheduleError('Please select both a date and a time.');
      return;
    }

    setRescheduleSaving(true);

    const { error } = await supabase
      .from('bookings')
      .update({
        booking_date: newDate,
        booking_time: newTime,
      })
      .eq('id', reschedulingBooking.id)
      .eq('customer_id', user.id)
      .eq('status', 'pending');

    setRescheduleSaving(false);

    if (error) {
      setRescheduleError('Failed to reschedule: ' + error.message);
    } else {
      closeReschedule();
      fetchBookings();
    }
  }

  const filtered = bookings.filter((b) => filter === 'all' || b.status === filter);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">My Appointments</h1>
        <p className="text-gray-400 mb-6">View and manage your service bookings.</p>

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
                    {b.booking_date} at {formatSlot(b.booking_time?.slice(0, 5) || '')}
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
                    <>
                      <button
                        onClick={() => openReschedule(b)}
                        className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/50 px-3 py-1.5 rounded-md transition"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => setCancellingBooking(b)}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 px-3 py-1.5 rounded-md transition"
                      >
                        Cancel
                      </button>
                    </>
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

      {/* Reschedule modal — matches the app's bg-dark-800 card theme */}
      {reschedulingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
          onClick={closeReschedule}
        >
          <div
            className="w-full max-w-md bg-dark-800 border border-gray-700 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-lg text-white">Reschedule Appointment</h2>
              <button
                onClick={closeReschedule}
                className="text-gray-400 hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              {reschedulingBooking.services?.name || 'Service'} — current slot:{' '}
              {reschedulingBooking.booking_date} at{' '}
              {formatSlot(reschedulingBooking.booking_time?.slice(0, 5) || '')}
            </p>

            {rescheduleError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 mb-4">
                {rescheduleError}
              </div>
            )}

            <form onSubmit={submitReschedule} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">New Date</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">New Time</label>
                <select
                  required
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">Select a time...</option>
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {formatSlot(slot)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Shop hours: 8:00 AM – 5:00 PM</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeReschedule}
                  className="flex-1 border border-gray-700 hover:border-gray-500 py-2.5 rounded-lg text-sm transition text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleSaving}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition text-sm"
                >
                  {rescheduleSaving ? 'Saving...' : 'Confirm New Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal — replaces browser confirm() */}
      {cancellingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !cancelSaving && setCancellingBooking(null)}
        >
          <div
            className="w-full max-w-sm bg-dark-800 border border-gray-700 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
              <span className="text-red-400 text-xl">⚠</span>
            </div>

            <h2 className="font-semibold text-lg text-white mb-1">Cancel Appointment?</h2>
            <p className="text-sm text-gray-400 mb-5">
              {cancellingBooking.services?.name || 'This service'} on{' '}
              <span className="text-gray-300">{cancellingBooking.booking_date}</span> at{' '}
              <span className="text-gray-300">
                {formatSlot(cancellingBooking.booking_time?.slice(0, 5) || '')}
              </span>{' '}
              will be cancelled. This can't be undone.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                disabled={cancelSaving}
                className="flex-1 border border-gray-700 hover:border-gray-500 py-2.5 rounded-lg text-sm transition text-gray-300 disabled:opacity-50"
              >
                Keep It
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelSaving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition text-sm"
              >
                {cancelSaving ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
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