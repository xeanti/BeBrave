import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Mechanics() {
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  useEffect(() => {
    fetchMechanics();
  }, []);

  async function fetchMechanics() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, phone, moto_photo_url, rating_avg, rating_count')
      .eq('role', 'mechanic');
    if (data) setMechanics(data);
    setLoading(false);
  }

  // Fix 5: updated query to include service name via bookings join
  async function openProfile(mechanic) {
    setSelected(mechanic);
    setLoadingReviews(true);
    const { data } = await supabase
      .from('mechanic_ratings')
      .select(`
        rating,
        comment,
        created_at,
        profiles!mechanic_ratings_customer_id_fkey(first_name, last_name),
        bookings!mechanic_ratings_booking_id_fkey(services(name))
      `)
      .eq('mechanic_id', mechanic.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setReviews(data);
    setLoadingReviews(false);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Our Mechanics</h1>
        <p className="text-gray-400 mb-8">Meet the team that keeps your ride in top shape.</p>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : mechanics.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-10 text-center">
            <p className="text-gray-400">No mechanics found yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {mechanics.map((m) => (
              <button
                key={m.id}
                onClick={() => openProfile(m)}
                className="bg-dark-800 rounded-xl p-5 text-center hover:bg-dark-800/70 hover:border-primary-500/30 border border-transparent transition text-left w-full"
              >
                <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-xl font-bold mx-auto mb-3">
                  {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                </div>
                <p className="font-semibold text-center">
                  {m.first_name} {m.last_name}
                </p>
                <p className="text-sm text-gray-400 mt-1 text-center">Mechanic</p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  {[1,2,3,4,5].map((star) => (
                    <span key={star} className={star <= Math.round(m.rating_avg || 0) ? 'text-yellow-400' : 'text-gray-600'}>★</span>
                  ))}
                  <span className="text-sm font-medium ml-1">{m.rating_avg ? m.rating_avg.toFixed(1) : '—'}</span>
                  <span className="text-xs text-gray-500">({m.rating_count || 0})</span>
                </div>
                <p className="text-xs text-primary-400 mt-3 text-center">View Profile →</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Glass modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
            style={{
              background: 'rgba(15, 15, 15, 0.95)',       // Fix 1: darker background
              border: '1px solid rgba(236, 72, 153, 0.2)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
              color: 'white',                              // Fix 1: explicit text color
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center text-lg font-bold">
                  {(selected.first_name?.[0] || '') + (selected.last_name?.[0] || '')}
                </div>
                <div>
                  {/* Fix 1: explicit color on name and role */}
                  <p className="font-semibold" style={{color:'white'}}>{selected.first_name} {selected.last_name}</p>
                  <p className="text-sm" style={{color:'#9ca3af'}}>Mechanic</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Rating summary */}
            <div className="bg-dark-900/60 rounded-xl p-4 mb-5 flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-400">
                  {selected.rating_avg ? selected.rating_avg.toFixed(1) : '—'}
                </p>
                <div className="flex gap-0.5 justify-center mt-1">
                  {[1,2,3,4,5].map((star) => (
                    <span key={star} className={star <= Math.round(selected.rating_avg || 0) ? 'text-yellow-400' : 'text-gray-600'}>★</span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">{selected.rating_count || 0} reviews</p>
              </div>
              <div className="flex-1 space-y-1">
                {[5,4,3,2,1].map((star) => {
                  const count = reviews.filter(r => r.rating === star).length;
                  const pct = reviews.length ? (count / reviews.length) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 w-2">{star}</span>
                      <span className="text-yellow-400 text-xs">★</span>
                      <div className="flex-1 bg-dark-800 rounded-full h-1.5">
                        <div
                          className="bg-yellow-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-gray-500 w-4">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reviews */}
            {/* Fix 1: explicit color on heading */}
            <h3 className="text-sm font-semibold mb-3" style={{color:'#d1d5db'}}>Customer Reviews</h3>
            {loadingReviews ? (
              <p className="text-gray-400 text-sm">Loading reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="text-gray-500 text-sm">No reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {/* Fix 1 + 5: updated review card with explicit colors and service name */}
                {reviews.map((r, i) => (
                  <div key={i} className="rounded-lg p-3" style={{backgroundColor:'rgba(0,0,0,0.5)'}}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium" style={{color:'white'}}>
                          {r.profiles?.first_name} {r.profiles?.last_name}
                        </p>
                        {/* Fix 5: show service name below reviewer name */}
                        <p className="text-xs" style={{color:'#9ca3af'}}>
                          {r.bookings?.services?.name || 'Service'}
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map((star) => (
                          <span key={star} className={star <= r.rating ? 'text-yellow-400 text-xs' : 'text-gray-600 text-xs'}>★</span>
                        ))}
                      </div>
                    </div>
                    {r.comment && (
                      <p className="text-sm italic" style={{color:'#d1d5db'}}>"{r.comment}"</p>
                    )}
                    <p className="text-xs mt-1" style={{color:'#6b7280'}}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}