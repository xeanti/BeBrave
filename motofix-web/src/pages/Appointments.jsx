import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import RatingModal from '../components/RatingModal';

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;
const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];

function generateTimeSlots() {
  const slots = [];

  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }

  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function normalizeTime(time) {
  return time?.slice(0, 5) || '';
}

function timeToMinutes(time) {
  if (!time) return 0;

  const [hours, minutes] = normalizeTime(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function formatSlot(slot) {
  const normalized = normalizeTime(slot);
  if (!normalized) return '—';

  const [h, m] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) return '—';

  const [year, month, day] = dateString.split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isPastSlot(date, slot) {
  if (date !== getTodayString()) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return timeToMinutes(slot) <= currentMinutes;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: '⏳',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  },
  confirmed: {
    label: 'Confirmed',
    icon: '✓',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
  in_progress: {
    label: 'In Progress',
    icon: '🔧',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  completed: {
    label: 'Completed',
    icon: '★',
    classes:
      'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  },
  cancelled: {
    label: 'Cancelled',
    icon: '✕',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ring-1 ${config.classes}`}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

export default function Appointments() {
  const { user } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const [ratingBooking, setRatingBooking] = useState(null);
  const [ratedBookings, setRatedBookings] = useState(new Set());
  const [ratedBookingIds, setRatedBookingIds] = useState(new Set());

  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleConflicts, setRescheduleConflicts] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [cancelSaving, setCancelSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    fetchBookings();

    const channel = supabase
      .channel(`customer-appointments-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `customer_id=eq.${user.id}`,
        },
        () => fetchBookings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!reschedulingBooking || !newDate) {
      setRescheduleConflicts([]);
      return;
    }

    fetchRescheduleConflicts(reschedulingBooking, newDate);
  }, [reschedulingBooking?.id, newDate]);

  async function fetchBookings() {
    if (!user?.id) return;

    setLoading(true);

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        services(name, base_price, labor_cost, estimated_duration_minutes),
        profiles!bookings_mechanic_id_fkey(first_name, last_name)
      `)
      .eq('customer_id', user.id)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (!error) setBookings(data || []);

    const { data: ratings } = await supabase
      .from('mechanic_ratings')
      .select('booking_id')
      .eq('customer_id', user.id);

    if (ratings) {
      setRatedBookingIds(new Set(ratings.map((rating) => rating.booking_id)));
    }

    setLoading(false);
  }

  async function fetchRescheduleConflicts(booking, date) {
    if (!booking?.mechanic_id || !date) {
      setRescheduleConflicts([]);
      return;
    }

    setLoadingSlots(true);

    const { data, error } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, status, services(estimated_duration_minutes)')
      .eq('mechanic_id', booking.mechanic_id)
      .eq('booking_date', date)
      .in('status', ACTIVE_STATUSES)
      .neq('id', booking.id)
      .order('booking_time', { ascending: true });

    if (!error) setRescheduleConflicts(data || []);
    else setRescheduleConflicts([]);

    setLoadingSlots(false);
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
    setNewDate(booking.booking_date || getTodayString());
    setNewTime(normalizeTime(booking.booking_time));
    setRescheduleError('');
    setRescheduleConflicts([]);
  }

  function closeReschedule() {
    setReschedulingBooking(null);
    setNewDate('');
    setNewTime('');
    setRescheduleError('');
    setRescheduleConflicts([]);
  }

  function getBlockedSlotsForReschedule() {
    if (!reschedulingBooking || !newDate) return new Set();

    const duration = reschedulingBooking.services?.estimated_duration_minutes || 30;
    const blockedSlots = new Set();

    const conflicts = rescheduleConflicts.map((booking) => {
      const start = timeToMinutes(booking.booking_time);
      const bookingDuration = booking.services?.estimated_duration_minutes || 30;

      return {
        start,
        end: start + bookingDuration,
      };
    });

    TIME_SLOTS.forEach((slot) => {
      const slotStart = timeToMinutes(slot);
      const slotEnd = slotStart + duration;

      const outsideShopHours = slotEnd > SHOP_CLOSE * 60;
      const past = isPastSlot(newDate, slot);
      const overlaps = conflicts.some((conflict) => slotStart < conflict.end && slotEnd > conflict.start);

      if (outsideShopHours || past || overlaps) {
        blockedSlots.add(slot);
      }
    });

    return blockedSlots;
  }

  const blockedSlots = getBlockedSlotsForReschedule();

  async function submitReschedule(e) {
    e.preventDefault();

    if (!reschedulingBooking) return;

    setRescheduleError('');

    if (!newDate || !newTime) {
      setRescheduleError('Please select both a date and a time.');
      return;
    }

    if (blockedSlots.has(newTime)) {
      setRescheduleError('That time is not available. Please choose another slot.');
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

  const counts = useMemo(() => {
    const result = {
      all: bookings.length,
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };

    bookings.forEach((booking) => {
      if (result[booking.status] !== undefined) {
        result[booking.status] += 1;
      }
    });

    return result;
  }, [bookings]);

  const filtered = useMemo(
    () => bookings.filter((booking) => filter === 'all' || booking.status === filter),
    [bookings, filter]
  );

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                MotoFix Appointments
              </p>
              <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                My Appointments
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                View your service bookings, reschedule pending appointments, cancel requests, and rate completed jobs.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-wrap gap-2">
            {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((status) => {
              const active = filter === status;
              const label = status === 'all' ? 'All' : status.replace('_', ' ');

              return (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                    active
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                  }`}
                >
                  {label}
                  <span className={active ? 'ml-1 opacity-80' : 'ml-1 opacity-60'}>
                    ({counts[status] || 0})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-600" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Loading appointments...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-900/20 dark:ring-primary-500/20">
              📅
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No appointments found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              You do not have appointments under this filter yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((booking) => {
              const isRateable =
                booking.status === 'completed' &&
                !ratedBookings.has(booking.id) &&
                !ratedBookingIds.has(booking.id);

              const serviceTotal =
                (Number(booking.services?.base_price) || 0) +
                (Number(booking.services?.labor_cost) || 0);

              return (
                <article
                  key={booking.id}
                  className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:border-primary-200 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30"
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <StatusBadge status={booking.status} />
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                            #{booking.id?.slice(0, 8).toUpperCase()}
                          </span>
                        </div>

                        <h2 className="truncate text-lg font-black text-gray-950 dark:text-white">
                          {booking.services?.name || 'Service'}
                        </h2>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Date & Time
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-950 dark:text-white">
                              {formatDate(booking.booking_date)}
                            </p>
                            <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                              {formatSlot(booking.booking_time)}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Mechanic
                            </p>
                            <p className="mt-1 text-sm font-bold text-gray-950 dark:text-white">
                              {booking.profiles
                                ? `${booking.profiles.first_name} ${booking.profiles.last_name}`
                                : 'Any available mechanic'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {booking.mechanic_id ? 'Assigned' : 'Not assigned yet'}
                            </p>
                          </div>
                        </div>

                        {booking.notes && (
                          <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                            <span className="font-black text-gray-900 dark:text-white">Note:</span>{' '}
                            {booking.notes}
                          </div>
                        )}
                      </div>

                      <div className="w-full shrink-0 lg:w-56">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">
                              Estimate
                            </span>
                            <span className="font-black text-gray-950 dark:text-white">
                              {formatPeso(serviceTotal)}
                            </span>
                          </div>

                          {booking.down_payment !== null && booking.down_payment !== undefined && (
                            <div className="mt-2 flex justify-between text-sm">
                              <span className="text-gray-600 dark:text-gray-400">
                                Down Payment
                              </span>
                              <span className="font-black text-accent-600 dark:text-accent-400">
                                {formatPeso(booking.down_payment)}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 lg:flex-col">
                          {booking.status === 'pending' && (
                            <>
                              <button
                                onClick={() => openReschedule(booking)}
                                className="flex-1 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 lg:flex-none"
                              >
                                Reschedule
                              </button>
                              <button
                                onClick={() => setCancellingBooking(booking)}
                                className="flex-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-black text-red-700 transition hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 lg:flex-none"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {isRateable && (
                            <button
                              onClick={() => setRatingBooking(booking)}
                              className="flex-1 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-xs font-black text-primary-700 transition hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20 lg:flex-none"
                            >
                              ★ Rate Mechanic
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {ratingBooking && (
        <RatingModal
          booking={ratingBooking}
          onClose={() => setRatingBooking(null)}
          onSubmitted={() => {
            setRatedBookings((previous) => new Set(previous).add(ratingBooking.id));
            setRatedBookingIds((previous) => new Set(previous).add(ratingBooking.id));
            setRatingBooking(null);
          }}
        />
      )}

      {/* Reschedule modal */}
      {reschedulingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={closeReschedule}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-700 dark:bg-dark-800"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-[0.2em] text-primary-600 dark:text-primary-400">
                  Reschedule
                </p>
                <h2 className="text-xl font-black text-gray-950 dark:text-white">
                  Change Appointment Slot
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {reschedulingBooking.services?.name || 'Service'} · current slot:{' '}
                  <span className="font-bold text-gray-900 dark:text-white">
                    {formatDate(reschedulingBooking.booking_date)} at{' '}
                    {formatSlot(reschedulingBooking.booking_time)}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={closeReschedule}
                className="grid h-9 w-9 place-items-center rounded-2xl bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {rescheduleError && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {rescheduleError}
              </div>
            )}

            <form onSubmit={submitReschedule} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  New Date
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(event) => {
                    setNewDate(event.target.value);
                    setNewTime('');
                  }}
                  min={getTodayString()}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition [color-scheme:light] focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:[color-scheme:dark] dark:focus:border-primary-500"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    New Time
                  </label>
                  {loadingSlots && (
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Checking slots...
                    </span>
                  )}
                </div>

                {reschedulingBooking.mechanic_id ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {TIME_SLOTS.map((slot) => {
                      const isBlocked = blockedSlots.has(slot);
                      const isSelected = newTime === slot;

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={isBlocked || loadingSlots}
                          onClick={() => setNewTime(slot)}
                          className={`rounded-2xl border px-2 py-3 text-xs font-black transition-all ${
                            isBlocked
                              ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-400 line-through opacity-70 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400/60'
                              : isSelected
                              ? 'scale-[1.02] border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-300 hover:bg-white hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500/50 dark:hover:text-primary-300'
                          }`}
                        >
                          {formatSlot(slot)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <select
                    required
                    value={newTime}
                    onChange={(event) => setNewTime(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
                  >
                    <option value="">Select a time...</option>
                    {TIME_SLOTS.map((slot) => {
                      const blocked = isPastSlot(newDate, slot);

                      return (
                        <option key={slot} value={slot} disabled={blocked}>
                          {formatSlot(slot)}
                        </option>
                      );
                    })}
                  </select>
                )}

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>Shop hours: 8:00 AM – 5:00 PM</span>
                  {reschedulingBooking.mechanic_id && (
                    <>
                      <span>•</span>
                      <span>Red slots are unavailable for this mechanic.</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeReschedule}
                  className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 dark:border-dark-700 dark:text-gray-300 dark:hover:border-dark-600 dark:hover:bg-dark-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleSaving || loadingSlots}
                  className="flex-1 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {rescheduleSaving ? 'Saving...' : 'Confirm Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancellingBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => !cancelSaving && setCancellingBooking(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-700 dark:bg-dark-800"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-red-50 text-2xl text-red-600 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20">
              ⚠
            </div>

            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              Cancel appointment?
            </h2>
            <p className="mb-5 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {cancellingBooking.services?.name || 'This service'} on{' '}
              <span className="font-bold text-gray-900 dark:text-white">
                {formatDate(cancellingBooking.booking_date)}
              </span>{' '}
              at{' '}
              <span className="font-bold text-gray-900 dark:text-white">
                {formatSlot(cancellingBooking.booking_time)}
              </span>{' '}
              will be cancelled. This cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                disabled={cancelSaving}
                className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 dark:border-dark-700 dark:text-gray-300 dark:hover:bg-dark-900 disabled:opacity-50"
              >
                Keep It
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelSaving}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-50"
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
