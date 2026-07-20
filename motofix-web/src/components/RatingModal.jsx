import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const RATING_LABELS = {
  1: 'Very poor',
  2: 'Needs improvement',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

function formatDate(value) {
  if (!value) return 'Date unavailable';

  const [year, month, day] = String(value).split('-').map(Number);

  if (!year || !month || !day) {
    return String(value);
  }

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(value) {
  if (!value) return 'Time unavailable';

  const [rawHour, rawMinute] = String(value).slice(0, 5).split(':');
  const hour = Number(rawHour);
  const minute = rawMinute || '00';

  if (!Number.isFinite(hour)) return String(value);

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

export default function RatingModal({
  booking,
  onClose,
  onSubmitted,
}) {
  const { user } = useAuth();

  const closeButtonRef = useRef(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeRating = hoverRating || rating;
  const ratingLabel = RATING_LABELS[activeRating] || 'Choose a rating';

  const mechanicName = useMemo(() => {
    const mechanic = booking?.profiles;

    if (!mechanic) return 'Assigned mechanic';

    const name = `${mechanic.first_name || ''} ${
      mechanic.last_name || ''
    }`.trim();

    return name || 'Assigned mechanic';
  }, [booking?.profiles]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, submitting]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!rating) {
      setError('Please select a star rating before submitting.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from('mechanic_ratings')
        .insert({
          booking_id: booking.id,
          mechanic_id: booking.mechanic_id,
          customer_id: user.id,
          rating,
          comment: comment.trim() || null,
        });

      if (insertError) throw insertError;

      onSubmitted?.();
    } catch (submitError) {
      setError(
        submitError.message ||
          'Your rating could not be submitted. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function closeFromBackdrop(event) {
    if (event.target !== event.currentTarget || submitting) return;
    onClose?.();
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={closeFromBackdrop}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-modal-title"
        aria-describedby="rating-modal-description"
        onMouseDown={(event) => event.stopPropagation()}
        className="my-auto shrink-0 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-dark-700 dark:bg-dark-800"
        style={{
          width: '460px',
          maxWidth: 'calc(100vw - 32px)',
          minWidth: 0,
          flex: '0 0 auto',
        }}
      >
        <div className="border-b border-gray-100 px-6 pb-5 pt-6 dark:border-dark-700">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-primary-600 dark:text-primary-400">
                Service Feedback
              </p>

              <h2
                id="rating-modal-title"
                className="text-2xl font-black tracking-tight text-gray-950 dark:text-white"
              >
                Rate Your Service
              </h2>

              <p
                id="rating-modal-description"
                className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400"
              >
                Your feedback helps MotoFix improve service quality.
              </p>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close rating dialog"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gray-100 text-lg font-black text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
            <p className="truncate text-sm font-black text-gray-950 dark:text-white">
              {booking?.services?.name || 'Motorcycle service'}
            </p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <span>
                {formatDate(booking?.booking_date)} ·{' '}
                {formatTime(booking?.booking_time)}
              </span>
              <span>{mechanicName}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <fieldset>
              <legend className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                Overall Rating
              </legend>

              <div
                className="mt-4 flex items-center justify-center gap-1 sm:gap-2"
                onMouseLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= activeRating;

                  return (
                    <button
                      key={star}
                      type="button"
                      aria-label={`${star} star${star === 1 ? '' : 's'}`}
                      aria-pressed={rating === star}
                      onClick={() => {
                        setRating(star);
                        setError('');
                      }}
                      onMouseEnter={() => setHoverRating(star)}
                      onFocus={() => setHoverRating(star)}
                      onBlur={() => setHoverRating(0)}
                      className={`grid h-12 w-12 place-items-center rounded-2xl text-3xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-800 ${
                        active
                          ? 'scale-105 bg-amber-50 text-amber-400 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25'
                          : 'text-gray-300 hover:bg-gray-100 hover:text-amber-300 dark:text-gray-600 dark:hover:bg-dark-900 dark:hover:text-amber-400'
                      }`}
                    >
                      ★
                    </button>
                  );
                })}
              </div>

              <p
                className={`mt-3 text-center text-sm font-black ${
                  activeRating
                    ? 'text-primary-700 dark:text-primary-300'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {ratingLabel}
              </p>
            </fieldset>

            <div className="mt-6">
              <label
                htmlFor="rating-comment"
                className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400"
              >
                Comment{' '}
                <span className="font-semibold normal-case text-gray-400">
                  (optional)
                </span>
              </label>

              <textarea
                id="rating-comment"
                value={comment}
                onChange={(event) =>
                  setComment(event.target.value.slice(0, 500))
                }
                rows={4}
                maxLength={500}
                placeholder="Tell us about your experience with this mechanic..."
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold leading-6 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
              />

              <p className="mt-2 text-right text-xs font-semibold text-gray-400">
                {comment.length}/500
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4 dark:border-dark-700 dark:bg-dark-900/40 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-200 dark:hover:bg-dark-700"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-dark-800"
            >
              {submitting ? 'Submitting Rating...' : 'Submit Rating'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}