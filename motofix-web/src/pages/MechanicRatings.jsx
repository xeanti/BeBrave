import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

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

function getCustomerName(review) {
  const name = `${review.profiles?.first_name || ''} ${review.profiles?.last_name || ''}`.trim();

  return name || 'Customer';
}

function getInitials(profile) {
  const first = profile?.first_name?.[0] || '';
  const last = profile?.last_name?.[0] || '';

  return `${first}${last}`.toUpperCase() || '?';
}

function StarRating({ rating = 0, size = 'text-lg' }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`${size} ${star <= Math.round(Number(rating) || 0) ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>
        {value}
      </p>
    </div>
  );
}

function RatingFilter({ label, value, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-center transition ${
        active
          ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
          : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:text-primary-700 hover:ring-primary-200 dark:bg-dark-800 dark:text-gray-400 dark:ring-dark-700 dark:hover:text-primary-400 dark:hover:ring-primary-500/40'
      }`}
    >
      <span className="block text-sm font-black">{label}</span>
      <span className={`mt-1 block text-[11px] font-bold ${active ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
        {count} {count === 1 ? 'review' : 'reviews'}
      </span>
    </button>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-36 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

function EmptyState({ title, sub, action }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-yellow-50 text-4xl ring-1 ring-yellow-100 dark:bg-yellow-500/10 dark:ring-yellow-500/20">
        ⭐
      </div>
      <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
        {title}
      </h2>
      <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
        {sub}
      </p>
      {action && (
        <button
          type="button"
          onClick={action}
          className="mt-6 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

export default function MechanicRatings() {
  const { user, profile } = useAuth();

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!user?.id) return;

    fetchReviews();

    /*
      Realtime refresh for mechanic ratings.
      Enable Realtime in Supabase for mechanic_ratings, bookings, services, and profiles.
    */
    const ratingsChannel = supabase
      .channel(`mechanic-ratings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mechanic_ratings',
          filter: `mechanic_id=eq.${user.id}`,
        },
        () => fetchReviews(false)
      )
      .subscribe();

    const bookingsChannel = supabase
      .channel('mechanic-ratings-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => fetchReviews(false)
      )
      .subscribe();

    const servicesChannel = supabase
      .channel('mechanic-ratings-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
        },
        () => fetchReviews(false)
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('mechanic-ratings-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => fetchReviews(false)
      )
      .subscribe();

    const handleFocus = () => fetchReviews(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchReviews(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(ratingsChannel);
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(servicesChannel);
      supabase.removeChannel(profilesChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  async function fetchReviews(showLoader = true) {
    if (!user?.id) return;

    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('mechanic_ratings')
      .select(`
        id,
        rating,
        comment,
        created_at,
        profiles!mechanic_ratings_customer_id_fkey(first_name, last_name, profile_photo_url),
        bookings!mechanic_ratings_booking_id_fkey(
          id,
          booking_date,
          services(name)
        )
      `)
      .eq('mechanic_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load ratings.');
      setReviews([]);
      setLoading(false);
      return;
    }

    setReviews(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  const ratingCounts = useMemo(() => {
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((review) => Number(review.rating) === star).length,
    }));
  }, [reviews]);

  const computedAverage = useMemo(() => {
    if (!reviews.length) return 0;

    const total = reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0);
    return total / reviews.length;
  }, [reviews]);

  const averageRating = Number(profile?.rating_avg) || computedAverage || 0;
  const ratingCount = Number(profile?.rating_count) || reviews.length || 0;

  const filteredReviews = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reviews.filter((review) => {
      const matchesRating = ratingFilter === 'all' || Number(review.rating) === Number(ratingFilter);

      const haystack = [
        getCustomerName(review),
        review.comment,
        review.bookings?.services?.name,
        review.bookings?.booking_date,
        review.id,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);

      return matchesRating && matchesSearch;
    });
  }, [reviews, search, ratingFilter]);

  const positiveReviews = reviews.filter((review) => Number(review.rating) >= 4).length;
  const withComments = reviews.filter((review) => review.comment?.trim()).length;
  const positiveRate = reviews.length ? Math.round((positiveReviews / reviews.length) * 100) : 0;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-yellow-400/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  Mechanic Feedback
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  My Ratings & Reviews
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Feedback from customers after completed service bookings.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchReviews(false)}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <Link
                  to="/mechanic-dashboard"
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
                >
                  Back to Jobs
                </Link>
              </div>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Average Rating"
            value={averageRating ? averageRating.toFixed(1) : '—'}
            icon="⭐"
            tone="yellow"
          />
          <StatCard
            label="Total Reviews"
            value={ratingCount}
            icon="💬"
            tone="primary"
          />
          <StatCard
            label="Positive Reviews"
            value={`${positiveRate}%`}
            icon="✅"
            tone="green"
          />
          <StatCard
            label="With Comments"
            value={withComments}
            icon="📝"
            tone="accent"
          />
        </div>

        {/* Rating Summary */}
        <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="grid gap-8 lg:grid-cols-[240px_1fr] lg:items-center">
            <div className="text-center">
              <p className="text-6xl font-black text-yellow-400">
                {averageRating ? averageRating.toFixed(1) : '—'}
              </p>
              <div className="mt-3 flex justify-center">
                <StarRating rating={averageRating} size="text-2xl" />
              </div>
              <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                Based on {ratingCount} {ratingCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>

            <div className="space-y-3">
              {ratingCounts.map(({ star, count }) => {
                const percent = reviews.length ? (count / reviews.length) * 100 : 0;

                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingFilter(String(star))}
                    className="group grid w-full grid-cols-[44px_1fr_36px] items-center gap-3 text-left"
                  >
                    <span className="text-sm font-black text-gray-600 group-hover:text-primary-600 dark:text-gray-400 dark:group-hover:text-primary-400">
                      {star} ★
                    </span>
                    <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-900">
                      <div
                        className="h-full rounded-full bg-yellow-400 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-right text-xs font-black text-gray-500 dark:text-gray-400">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <RatingFilter
                label="All"
                count={reviews.length}
                active={ratingFilter === 'all'}
                onClick={() => setRatingFilter('all')}
              />
              {[5, 4, 3, 2, 1].map((star) => (
                <RatingFilter
                  key={star}
                  label={`${star} ★`}
                  count={reviews.filter((review) => Number(review.rating) === star).length}
                  active={ratingFilter === String(star)}
                  onClick={() => setRatingFilter(String(star))}
                />
              ))}
            </div>

            <div className="relative w-full lg:w-96">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, service, comment, date, or ID..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
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
          </div>
        </section>

        {/* Reviews */}
        {loading ? (
          <ReviewSkeleton />
        ) : reviews.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            sub="Complete bookings and ask customers to rate your service. New feedback will appear here."
          />
        ) : filteredReviews.length === 0 ? (
          <EmptyState
            title="No matching reviews"
            sub="Try changing the rating filter or search keyword."
            action={() => {
              setSearch('');
              setRatingFilter('all');
            }}
          />
        ) : (
          <div className="space-y-4">
            {filteredReviews.map((review, index) => (
              <article
                key={review.id || `${review.created_at}-${index}`}
                className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800 sm:p-6"
              >
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {review.profiles?.profile_photo_url ? (
                      <img
                        src={review.profiles.profile_photo_url}
                        alt={getCustomerName(review)}
                        className="h-12 w-12 flex-shrink-0 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700"
                      />
                    ) : (
                      <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-sm font-black text-white shadow-sm shadow-primary-600/20">
                        {getInitials(review.profiles)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="font-black text-gray-950 dark:text-white">
                        {getCustomerName(review)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {review.bookings?.services?.name || 'Service'}
                        {review.bookings?.booking_date
                          ? ` · ${formatDate(review.bookings.booking_date)}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 flex-col items-start gap-1 sm:items-end">
                    <StarRating rating={review.rating} />
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {formatDate(review.created_at)}
                    </p>
                  </div>
                </div>

                {review.comment ? (
                  <p className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm italic leading-6 text-gray-700 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-300">
                    “{review.comment}”
                  </p>
                ) : (
                  <p className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                    No written comment provided.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
