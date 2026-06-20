import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function MechanicRatings() {
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, [user]);

  async function fetchReviews() {
    const { data } = await supabase
      .from('mechanic_ratings')
      .select(`
        rating,
        comment,
        created_at,
        profiles!mechanic_ratings_customer_id_fkey(first_name, last_name),
        bookings!mechanic_ratings_booking_id_fkey(services(name))
      `)
      .eq('mechanic_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setReviews(data);
    setLoading(false);
  }

  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">My Ratings & Reviews</h1>
        <p className="text-gray-400 mb-8">Feedback from your completed service bookings.</p>

        {/* Summary card */}
        <div className="bg-dark-800 rounded-xl p-6 mb-6 flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <p className="text-5xl font-bold text-yellow-400">
              {profile?.rating_avg ? profile.rating_avg.toFixed(1) : '—'}
            </p>
            <div className="flex gap-0.5 justify-center mt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={star <= Math.round(profile?.rating_avg || 0) ? 'text-yellow-400 text-lg' : 'text-gray-600 text-lg'}
                >
                  ★
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-400 mt-1">{profile?.rating_count || 0} reviews</p>
          </div>

          <div className="flex-1 space-y-2 min-w-48">
            {ratingCounts.map(({ star, count }) => {
              const pct = reviews.length ? (count / reviews.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 w-4 text-right">{star}</span>
                  <span className="text-yellow-400 text-xs">★</span>
                  <div className="flex-1 bg-dark-900 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs w-4">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reviews list */}
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : reviews.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-4xl mb-3">⭐</p>
            <p className="text-gray-400">No reviews yet. Complete bookings to receive ratings.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div key={i} className="bg-dark-800 rounded-xl p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">
                      {r.profiles?.first_name} {r.profiles?.last_name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.bookings?.services?.name || 'Service'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span
                          key={star}
                          className={star <= r.rating ? 'text-yellow-400' : 'text-gray-600'}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {r.comment && (
                  <p className="text-sm text-gray-300 italic mt-2">"{r.comment}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}