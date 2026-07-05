// Place this file at:
// motofix-web/src/pages/staff/staff-dashboard/StaffMechanicSchedule.jsx

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

import {
  Banner,
  Section,
  StatCard,
  CustomerAvatar,
  formatPeso,
  formatTime,
  getCustomerName,
} from './StaffDashboardShared';

const ACTIVE_SCHEDULE_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'inspection',
  'repairing',
  'quality_check',
  'ready_for_pickup',
  'completed',
];

const HIDDEN_SCHEDULE_STATUSES = [
  'cancelled',
  'canceled',
  'rejected',
  'no_show',
  'returned',
];

const VIEW_MODES = ['month', 'week', 'day'];

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function formatStatus(value) {
  return String(value || 'pending')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9ñÑ@._+\-#:/\s]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function toISODateString(date) {
  const safeDate = date instanceof Date ? date : new Date(date);
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseISODate(value) {
  if (!value) return new Date();

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);

  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  copy.setDate(copy.getDate() + diff);

  return copy;
}

function endOfWeek(date) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date, months) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isToday(date) {
  return toISODateString(date) === toISODateString(new Date());
}

function formatMonthTitle(date) {
  return date.toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDayShort(date) {
  return date.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(date) {
  return date.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getRangeForView(anchorDate, viewMode) {
  if (viewMode === 'day') {
    return {
      start: new Date(anchorDate),
      end: new Date(anchorDate),
    };
  }

  if (viewMode === 'week') {
    return {
      start: startOfWeek(anchorDate),
      end: endOfWeek(anchorDate),
    };
  }

  const monthStart = startOfMonth(anchorDate);
  const monthEnd = endOfMonth(anchorDate);

  return {
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  };
}

function getCalendarDays(anchorDate, viewMode) {
  const range = getRangeForView(anchorDate, viewMode);
  const days = [];

  let current = new Date(range.start);

  while (current <= range.end) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }

  return days;
}

function getMechanicName(mechanic) {
  const name = `${mechanic?.first_name || ''} ${mechanic?.last_name || ''}`.trim();

  return name || mechanic?.email || 'Unnamed Mechanic';
}

function getBookingMechanicName(booking) {
  const mechanic = booking?.mechanic || {};
  const name = `${mechanic.first_name || ''} ${mechanic.last_name || ''}`.trim();

  return name || 'Unassigned';
}


function addMinutesToTime(time, minutes) {
  if (!time) return '';

  const [hour = 0, minute = 0] = String(time).slice(0, 5).split(':').map(Number);
  const total = hour * 60 + minute + (Number(minutes) || 0);
  const nextHour = Math.floor(total / 60);
  const nextMinute = total % 60;

  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
}

function getBookingDurationMinutes(booking) {
  const savedDuration = Number(booking?.estimated_duration_minutes) || 0;

  if (savedDuration > 0) return Math.max(30, savedDuration);

  const selectedServices = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (selectedServices.length > 0) {
    const totalDuration = selectedServices.reduce((sum, item) => {
      const duration =
        Number(item?.estimated_duration_minutes) ||
        Number(item?.services?.estimated_duration_minutes) ||
        30;

      const quantity = Math.max(1, Number(item?.quantity) || 1);

      return sum + duration * quantity;
    }, 0);

    return Math.max(30, totalDuration || 30);
  }

  return Math.max(30, Number(booking?.services?.estimated_duration_minutes) || 30);
}


function getBookingServicesSummary(booking) {
  if (booking?.services_summary) return booking.services_summary;

  const selectedServices = Array.isArray(booking?.booking_services)
    ? booking.booking_services
    : [];

  if (selectedServices.length > 0) {
    return selectedServices
      .map((item) => item.service_name || item.name || item.services?.name)
      .filter(Boolean)
      .join(', ');
  }

  return booking?.services?.name || 'Service';
}

function getStatusClass(status) {
  const value = normalizeStatus(status);

  if (value === 'completed') {
    return 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25';
  }

  if (value === 'ready_for_pickup') {
    return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25';
  }

  if (['in_progress', 'inspection', 'repairing', 'quality_check'].includes(value)) {
    return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25';
  }

  if (value === 'confirmed') {
    return 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25';
  }

  return 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25';
}

function getStatusBorderClass(status) {
  const value = normalizeStatus(status);

  if (value === 'completed') return 'border-l-gray-400';
  if (value === 'ready_for_pickup') return 'border-l-green-500';
  if (['in_progress', 'inspection', 'repairing', 'quality_check'].includes(value)) {
    return 'border-l-blue-500';
  }
  if (value === 'confirmed') return 'border-l-primary-500';

  return 'border-l-yellow-500';
}

function getMechanicLoad(bookings, mechanicId) {
  return bookings.filter((booking) => booking.mechanic_id === mechanicId).length;
}

function getDateBookings(bookings, dayString) {
  return bookings
    .filter((booking) => String(booking.booking_date || '') === dayString)
    .sort((a, b) => String(a.booking_time || '').localeCompare(String(b.booking_time || '')));
}

function getVisibleBookings(bookings, mechanicFilter, showCompleted) {
  return bookings.filter((booking) => {
    if (mechanicFilter !== 'all' && booking.mechanic_id !== mechanicFilter) {
      return false;
    }

    if (!showCompleted && normalizeStatus(booking.status) === 'completed') {
      return false;
    }

    return true;
  });
}

function BookingEventCard({ booking, compact = false }) {
  const total = Number(booking.total_amount) || Number(booking.service_total) || 0;
  const durationMinutes = getBookingDurationMinutes(booking);
  const endTime = addMinutesToTime(booking.booking_time, durationMinutes);

  return (
    <article
      className={`border-l-4 ${getStatusBorderClass(
        booking.status
      )} rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-dark-700 dark:bg-dark-800`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[11px] font-black text-primary-600 dark:text-primary-400">
          {formatTime(booking.booking_time)}{endTime ? ` - ${formatTime(endTime)}` : ''}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ring-1 ${getStatusClass(
            booking.status
          )}`}
        >
          {formatStatus(booking.status)}
        </span>
      </div>

      <p className={`${compact ? 'line-clamp-1' : 'line-clamp-2'} text-xs font-black text-gray-950 dark:text-white`}>
        {getBookingServicesSummary(booking)}
      </p>

      <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
        {getCustomerName(booking)}
      </p>

      <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
        🔧 {getBookingMechanicName(booking)} · ⏱ {durationMinutes} mins
      </p>

      {!compact && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold text-gray-400">
          <span>#{booking.id?.slice(0, 8).toUpperCase()}</span>
          <span>{total > 0 ? formatPeso(total) : ''}</span>
        </div>
      )}
    </article>
  );
}

function DayDetails({ selectedDay, bookings }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
            Selected Day
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
            {formatFullDate(selectedDay)}
          </p>
        </div>

        <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
          {bookings.length} booking{bookings.length === 1 ? '' : 's'}
        </span>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-900/70">
          <p className="text-2xl">✅</p>
          <p className="mt-2 text-sm font-black text-gray-950 dark:text-white">No scheduled jobs</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            All mechanics are free for this date.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <BookingEventCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarLegend() {
  const rows = [
    ['Pending', 'border-l-yellow-500', 'bg-yellow-500'],
    ['Confirmed', 'border-l-primary-500', 'bg-primary-500'],
    ['In Progress', 'border-l-blue-500', 'bg-blue-500'],
    ['Ready', 'border-l-green-500', 'bg-green-500'],
    ['Completed', 'border-l-gray-400', 'bg-gray-400'],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {rows.map(([label, , dotClass]) => (
        <span
          key={label}
          className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-2 text-[11px] font-black text-gray-600 ring-1 ring-gray-100 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

export default function StaffMechanicSchedule() {
  const [mechanics, setMechanics] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('month');
  const [mechanicFilter, setMechanicFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const calendarDays = useMemo(
    () => getCalendarDays(anchorDate, viewMode),
    [anchorDate, viewMode]
  );

  const range = useMemo(() => getRangeForView(anchorDate, viewMode), [anchorDate, viewMode]);

  useEffect(() => {
    fetchSchedule();

    const bookingsChannel = supabase
      .channel('staff-mechanic-calendar-bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => fetchSchedule(false)
      )
      .subscribe();

    const bookingServicesChannel = supabase
      .channel('staff-mechanic-calendar-booking-services')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_services' },
        () => fetchSchedule(false)
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('staff-mechanic-calendar-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchSchedule(false)
      )
      .subscribe();

    const handleFocus = () => fetchSchedule(false);

    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(bookingServicesChannel);
      supabase.removeChannel(profilesChannel);
      window.removeEventListener('focus', handleFocus);
    };
  }, [anchorDate, viewMode, showCompleted]);

  async function fetchSchedule(showLoader = true) {
    if (showLoader) setLoading(true);
    if (!showLoader) setRefreshing(true);

    setError('');

    const selectedRange = getRangeForView(anchorDate, viewMode);
    const startDate = toISODateString(selectedRange.start);
    const endDate = toISODateString(selectedRange.end);

    const [mechanicsResult, bookingsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, profile_photo_url, role, is_active')
        .eq('role', 'mechanic')
        .order('first_name', { ascending: true }),

      supabase
        .from('bookings')
        .select(
          `
          id,
          customer_id,
          mechanic_id,
          service_id,
          booking_date,
          booking_time,
          status,
          payment_status,
          services_summary,
          estimated_duration_minutes,
          total_amount,
          service_total,
          is_walkin,
          services(name, base_price, labor_cost, estimated_duration_minutes),
          booking_services(id, service_id, service_name, base_price, labor_cost, estimated_duration_minutes, quantity, services(name)),
          profiles!bookings_customer_id_fkey(first_name, last_name, phone, email, profile_photo_url),
          mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name, profile_photo_url)
        `
        )
        .or('is_walkin.is.null,is_walkin.eq.false')
        .gte('booking_date', startDate)
        .lte('booking_date', endDate)
        .in('status', ACTIVE_SCHEDULE_STATUSES)
        .order('booking_date', { ascending: true })
        .order('booking_time', { ascending: true }),
    ]);

    if (mechanicsResult.error || bookingsResult.error) {
      setError(
        mechanicsResult.error?.message ||
          bookingsResult.error?.message ||
          'Failed to load mechanic calendar.'
      );
      setMechanics([]);
      setBookings([]);
    } else {
      const mechanicRows = (mechanicsResult.data || []).filter(
        (mechanic) => mechanic.is_active !== false
      );

      const bookingRows = (bookingsResult.data || []).filter(
        (booking) =>
          booking.mechanic_id &&
          !HIDDEN_SCHEDULE_STATUSES.includes(normalizeStatus(booking.status)) &&
          (showCompleted || normalizeStatus(booking.status) !== 'completed')
      );

      setMechanics(mechanicRows);
      setBookings(bookingRows);
      setLastUpdated(new Date());
    }

    setLoading(false);
    setRefreshing(false);
  }

  function handleSearchChange(event) {
    setSearch(sanitizeSearch(event.target.value));
  }

  function goPrevious() {
    if (viewMode === 'month') {
      setAnchorDate((current) => addMonths(current, -1));
      return;
    }

    if (viewMode === 'week') {
      setAnchorDate((current) => addDays(current, -7));
      return;
    }

    setAnchorDate((current) => addDays(current, -1));
    setSelectedDate((current) => addDays(current, -1));
  }

  function goNext() {
    if (viewMode === 'month') {
      setAnchorDate((current) => addMonths(current, 1));
      return;
    }

    if (viewMode === 'week') {
      setAnchorDate((current) => addDays(current, 7));
      return;
    }

    setAnchorDate((current) => addDays(current, 1));
    setSelectedDate((current) => addDays(current, 1));
  }

  function goToday() {
    const today = new Date();
    setAnchorDate(today);
    setSelectedDate(today);
  }

  function changeViewMode(nextView) {
    if (!VIEW_MODES.includes(nextView)) return;

    setViewMode(nextView);

    if (nextView === 'day') {
      setAnchorDate(selectedDate);
    }
  }

  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const mechanicFiltered = getVisibleBookings(bookings, mechanicFilter, showCompleted);

    if (!query) return mechanicFiltered;

    return mechanicFiltered.filter((booking) => {
      const haystack = [
        booking.id,
        booking.booking_date,
        booking.booking_time,
        booking.status,
        booking.payment_status,
        getCustomerName(booking),
        getBookingMechanicName(booking),
        getBookingServicesSummary(booking),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [bookings, mechanicFilter, search, showCompleted]);

  const visibleMechanics = useMemo(() => {
    if (mechanicFilter !== 'all') {
      return mechanics.filter((mechanic) => mechanic.id === mechanicFilter);
    }

    return mechanics;
  }, [mechanics, mechanicFilter]);

  const selectedDayBookings = useMemo(() => {
    return getDateBookings(filteredBookings, toISODateString(selectedDate));
  }, [filteredBookings, selectedDate]);

  const totalBookings = filteredBookings.length;
  const activeBookings = filteredBookings.filter((booking) =>
    ['confirmed', 'in_progress', 'inspection', 'repairing', 'quality_check'].includes(
      normalizeStatus(booking.status)
    )
  ).length;
  const readyBookings = filteredBookings.filter(
    (booking) => normalizeStatus(booking.status) === 'ready_for_pickup'
  ).length;
  const unassignedBookings = filteredBookings.filter((booking) => !booking.mechanic_id).length;
  const busiestMechanic = visibleMechanics
    .map((mechanic) => ({
      mechanic,
      count: getMechanicLoad(filteredBookings, mechanic.id),
    }))
    .sort((a, b) => b.count - a.count)[0];

  if (loading) {
    return (
      <Section>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Loading mechanic calendar...
            </p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <div>
      {error && <Banner message={`Error: ${error}`} />}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Mechanics" value={mechanics.length} icon="🔧" tone="primary" />
        <StatCard label="Calendar Jobs" value={totalBookings} icon="📅" tone="accent" />
        <StatCard label="Active Jobs" value={activeBookings} icon="🏍️" tone="blue" />
        <StatCard label="Ready" value={readyBookings} icon="✅" tone="green" />
        <StatCard
          label="Busiest"
          value={busiestMechanic?.count ? getMechanicName(busiestMechanic.mechanic) : '—'}
          icon="🔥"
          tone={busiestMechanic?.count ? 'yellow' : 'default'}
          subtext={busiestMechanic?.count ? `${busiestMechanic.count} booking(s)` : 'No bookings'}
        />
      </div>

      <Section>
        <div className="mb-5 flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
              Mechanics Calendar
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Full calendar view of assigned mechanic schedules for registered bookings.
            </p>
            <p className="mt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
              {viewMode === 'month'
                ? formatMonthTitle(anchorDate)
                : `${formatFullDate(range.start)} – ${formatFullDate(range.end)}`}
              {lastUpdated ? ` · Last updated ${lastUpdated.toLocaleString('en-PH')}` : ''}
            </p>
          </div>

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="relative w-full xl:w-80">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search mechanic, customer, service, date..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-10 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-sm font-black text-gray-400 transition hover:text-gray-900 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={mechanicFilter}
              onChange={(event) => setMechanicFilter(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs font-black text-gray-700 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300"
            >
              <option value="all">All mechanics</option>
              {mechanics.map((mechanic) => (
                <option key={mechanic.id} value={mechanic.id}>
                  {getMechanicName(mechanic)}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeViewMode(mode)}
                  className={`rounded-2xl px-4 py-3 text-xs font-black capitalize ring-1 transition ${
                    viewMode === mode
                      ? 'bg-primary-600 text-white ring-primary-600'
                      : 'bg-gray-50 text-gray-700 ring-gray-200 hover:ring-primary-400 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900">
          <CalendarLegend />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={goPrevious}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-2xl bg-primary-600 px-4 py-3 text-xs font-black text-white transition hover:bg-primary-700"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
            >
              Next →
            </button>
            <button
              type="button"
              onClick={() => setShowCompleted((value) => !value)}
              className={`rounded-2xl px-4 py-3 text-xs font-black ring-1 transition ${
                showCompleted
                  ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
                  : 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700'
              }`}
            >
              {showCompleted ? '✓ Completed' : 'Hide Completed'}
            </button>
            <button
              type="button"
              onClick={() => fetchSchedule(false)}
              disabled={refreshing}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {unassignedBookings > 0 && (
          <p className="mb-5 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs font-semibold text-yellow-700 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300">
            {unassignedBookings} booking{unassignedBookings === 1 ? '' : 's'} in this range have no assigned mechanic, so they are hidden from mechanic-specific scheduling.
          </p>
        )}

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800">
            {viewMode !== 'day' && (
              <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-900">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <div
                    key={day}
                    className="border-r border-gray-200 px-3 py-3 text-center text-xs font-black uppercase tracking-wider text-gray-500 last:border-r-0 dark:border-dark-700 dark:text-gray-400"
                  >
                    {day}
                  </div>
                ))}
              </div>
            )}

            <div
              className={
                viewMode === 'day'
                  ? 'grid grid-cols-1'
                  : 'grid grid-cols-7'
              }
            >
              {calendarDays.map((day) => {
                const dayKey = toISODateString(day);
                const dayBookings = getDateBookings(filteredBookings, dayKey);
                const selected = dayKey === toISODateString(selectedDate);
                const faded = viewMode === 'month' && !sameMonth(day, anchorDate);

                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day);
                      if (viewMode === 'day') setAnchorDate(day);
                    }}
                    className={`min-h-[170px] border-r border-b border-gray-200 p-3 text-left transition last:border-r-0 hover:bg-primary-50/40 dark:border-dark-700 dark:hover:bg-primary-500/5 ${
                      selected ? 'bg-primary-50/60 dark:bg-primary-500/10' : ''
                    } ${faded ? 'bg-gray-50/60 text-gray-400 dark:bg-dark-900/50' : 'bg-white dark:bg-dark-800'}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-black ${
                            isToday(day)
                              ? 'bg-primary-600 text-white'
                              : selected
                                ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300'
                                : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {day.getDate()}
                        </p>
                        {viewMode === 'day' && (
                          <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {formatFullDate(day)}
                          </p>
                        )}
                      </div>

                      {dayBookings.length > 0 && (
                        <span className="rounded-full bg-accent-500 px-2 py-1 text-[10px] font-black text-white">
                          {dayBookings.length}
                        </span>
                      )}
                    </div>

                    {dayBookings.length === 0 ? (
                      <div className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-[11px] font-semibold text-gray-400 dark:border-dark-700 dark:bg-dark-900/70">
                        Free
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dayBookings.slice(0, viewMode === 'month' ? 3 : 10).map((booking) => (
                          <BookingEventCard
                            key={booking.id}
                            booking={booking}
                            compact={viewMode === 'month'}
                          />
                        ))}

                        {viewMode === 'month' && dayBookings.length > 3 && (
                          <p className="rounded-xl bg-gray-100 px-3 py-2 text-center text-[11px] font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                            +{dayBookings.length - 3} more
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <DayDetails selectedDay={selectedDate} bookings={selectedDayBookings} />
        </div>
      </Section>
    </div>
  );
}
