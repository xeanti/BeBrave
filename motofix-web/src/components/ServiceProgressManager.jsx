import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const STATUS_OPTIONS = [
  {
    value: 'confirmed',
    label: 'Booking Confirmed',
    progress: 25,
    description: 'Your booking has been confirmed by MotoFix.',
  },
  {
    value: 'in_progress',
    label: 'Service Started',
    progress: 40,
    description: 'The assigned mechanic has started working on your motorcycle.',
  },
  {
    value: 'inspection',
    label: 'Motorcycle Inspection',
    progress: 50,
    description: 'The mechanic is inspecting your motorcycle and checking the reported issue.',
  },
  {
    value: 'repairing',
    label: 'Repair in Progress',
    progress: 70,
    description: 'Repair or maintenance work is currently being performed.',
  },
  {
    value: 'quality_check',
    label: 'Quality Check',
    progress: 85,
    description: 'The service is being checked before completion.',
  },
  {
    value: 'ready_for_pickup',
    label: 'Ready for Pickup',
    progress: 95,
    description: 'Your motorcycle is ready for pickup.',
  },
  {
    value: 'completed',
    label: 'Service Completed',
    progress: 100,
    description: 'The service has been completed.',
  },
  {
    value: 'note',
    label: 'Progress Note Only',
    progress: 0,
    description: 'Add a timeline note without changing the booking status.',
  },
];

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(status) {
  return String(status || 'note')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTimelineIcon(status) {
  const icons = {
    pending: '📝',
    confirmed: '✅',
    in_progress: '🔧',
    inspection: '🔍',
    repairing: '🛠️',
    quality_check: '☑️',
    ready_for_pickup: '🏁',
    completed: '🎉',
    cancelled: '✕',
    rejected: '⚠️',
    no_show: '🚫',
    note: '💬',
  };

  return icons[status] || '•';
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

export default function ServiceProgressManager({
  booking,
  bookingId,
  onUpdated,
  compact = false,
}) {
  const targetBookingId = bookingId || booking?.id;

  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('inspection');
  const [title, setTitle] = useState('Motorcycle Inspection');
  const [description, setDescription] = useState(
    'The mechanic is inspecting your motorcycle and checking the reported issue.'
  );
  const [progressPercent, setProgressPercent] = useState(50);
  const [photoUrl, setPhotoUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  useEffect(() => {
    if (!targetBookingId) return;

    fetchEvents();

    const channel = supabase
      .channel(`service-progress-manager-${targetBookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_progress_events',
          filter: `booking_id=eq.${targetBookingId}`,
        },
        () => fetchEvents(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetBookingId]);

  const selectedOption = useMemo(
    () => STATUS_OPTIONS.find((option) => option.value === status),
    [status]
  );

  const latestEvent = events[events.length - 1];

  async function fetchEvents(showLoader = true) {
    if (!targetBookingId) return;

    if (showLoader) setEventsLoading(true);

    const { data, error } = await supabase
      .from('service_progress_events')
      .select('*')
      .eq('booking_id', targetBookingId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Failed to fetch service progress events:', error.message);
      setEvents([]);
    } else {
      setEvents(data || []);
    }

    setEventsLoading(false);
  }

  function handleStatusChange(nextStatus) {
    const option = STATUS_OPTIONS.find((item) => item.value === nextStatus);

    setStatus(nextStatus);

    if (option) {
      setTitle(option.label);
      setDescription(option.description);

      if (nextStatus !== 'note') {
        setProgressPercent(option.progress);
      } else {
        setProgressPercent(Number(latestEvent?.progress_percent) || 0);
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!targetBookingId || loading) return;

    if (!status) {
      setMessageType('error');
      setMessage('Please select a progress status.');
      return;
    }

    if (!title.trim()) {
      setMessageType('error');
      setMessage('Please enter a progress title.');
      return;
    }

    const progress = Math.max(0, Math.min(100, Number(progressPercent) || 0));

    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.rpc('update_booking_service_progress', {
        p_booking_id: targetBookingId,
        p_status: status,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_progress_percent: progress,
        p_event_type: status === 'note' ? 'mechanic_update' : 'mechanic_update',
        p_photo_url: photoUrl.trim() || null,
        p_metadata: normalizeMetadata({
          source: 'ServiceProgressManager.jsx',
          compact,
          selected_option_label: selectedOption?.label || null,
        }),
      });

      if (error) throw error;

      setMessageType('success');
      setMessage('Service progress updated successfully.');
      setPhotoUrl('');

      await fetchEvents(false);
      if (typeof onUpdated === 'function') await onUpdated();
    } catch (error) {
      console.error('Service progress update error:', error);
      setMessageType('error');
      setMessage(error.message || 'Failed to update service progress.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
            Service Progress Manager
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Update the customer&apos;s service progress timeline.
          </p>
        </div>

        {latestEvent && (
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
            Latest: {Number(latestEvent.progress_percent) || 0}%
          </span>
        )}
      </div>

      {message && (
        <div
          className={`mb-4 rounded-2xl border p-3 text-sm font-semibold ${
            messageType === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
            Progress Status
          </label>
          <select
            value={status}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} {option.value !== 'note' ? `(${option.progress}%)` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
            Timeline Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
            placeholder="Example: Inspection Started"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
            Progress Description
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
            placeholder="Add a short update for the customer..."
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
              Progress Percent
            </label>
            <span className="text-xs font-black text-primary-600 dark:text-primary-400">
              {Math.max(0, Math.min(100, Number(progressPercent) || 0))}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={progressPercent}
            onChange={(event) => setProgressPercent(event.target.value)}
            className="w-full accent-primary-600"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
            Photo URL Optional
          </label>
          <input
            type="url"
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
            placeholder="https://..."
          />
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Use this only if you already uploaded a service progress photo somewhere public.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !targetBookingId}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Updating...
            </>
          ) : (
            <>
              Update Service Progress
              <span>→</span>
            </>
          )}
        </button>
      </form>

      {!compact && (
        <div className="mt-6 border-t border-gray-200 pt-5 dark:border-dark-700">
          <p className="mb-4 text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
            Recent Timeline Events
          </p>

          {eventsLoading ? (
            <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-dark-900 dark:text-gray-400">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-400">
              No progress events yet.
            </div>
          ) : (
            <div className="space-y-3">
              {events
                .slice()
                .reverse()
                .slice(0, 5)
                .map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70"
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-white text-lg ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                        {getTimelineIcon(event.status)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-black text-gray-950 dark:text-white">
                            {event.title || getStatusLabel(event.status)}
                          </p>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-gray-500 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-400 dark:ring-dark-700">
                            {Number(event.progress_percent) || 0}%
                          </span>
                        </div>

                        {event.description && (
                          <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                            {event.description}
                          </p>
                        )}

                        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                          {formatDateTime(event.created_at)} · {getStatusLabel(event.status)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
