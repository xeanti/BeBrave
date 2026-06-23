import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Mechanics() {
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingCerts, setLoadingCerts] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    fetchMechanics();
  }, []);

  async function fetchMechanics() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, phone, profile_photo_url, specialization, rating_avg, rating_count')
        .eq('role', 'mechanic');

      if (error) throw error;
      if (data) setMechanics(data);
    } catch (err) {
      console.error("Error fetching mechanics:", err);
    } finally {
      setLoading(false);
    }
  }

  async function openProfile(mechanic) {
    setSelected(mechanic);
    setLoadingReviews(true);
    setLoadingCerts(true);

    try {
      const { data, error } = await supabase
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

      if (error) throw error;
      if (data) setReviews(data);
    } catch (err) {
      console.error("Error fetching reviews:", err);
    } finally {
      setLoadingReviews(false);
    }

    try {
      const { data, error } = await supabase
        .from('mechanic_certificates')
        .select('*')
        .eq('mechanic_id', mechanic.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setCertificates(data);
    } catch (err) {
      console.error("Error fetching certificates:", err);
    } finally {
      setLoadingCerts(false);
    }
  }

  function closeProfile() {
    setSelected(null);
    setReviews([]);
    setCertificates([]);
  }

  // ── Shared avatar component ───────────────────────────────────────────────
  function Avatar({ url, firstName, lastName, size = 'md' }) {
    const initials = (firstName?.[0] || '') + (lastName?.[0] || '');
    const dims = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-12 h-12 text-lg';
    return url ? (
      <img
        src={url}
        alt={`${firstName} ${lastName}`}
        className={`${dims} rounded-full object-cover border-2 border-primary-200 dark:border-primary-500/30 flex-shrink-0 shadow-sm`}
      />
    ) : (
      <div className={`${dims} rounded-full bg-primary-600 flex items-center justify-center font-bold text-white flex-shrink-0 shadow-sm`}>
        {initials}
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white px-6 py-10 transition-colors">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Our Mechanics</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Meet the team that keeps your ride in top shape.</p>

        {loading ? (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 dark:bg-dark-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : mechanics.length === 0 ? (
          <div className="bg-white dark:bg-dark-800 rounded-xl p-10 text-center border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none">
            <p className="text-gray-500 dark:text-gray-400">No mechanics found yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {mechanics.map((m) => (
              <button
                key={m.id}
                onClick={() => openProfile(m)}
                className="bg-white dark:bg-dark-800 rounded-xl p-5 text-center hover:bg-gray-50 dark:hover:bg-dark-800/70 hover:-translate-y-0.5 hover:border-primary-500/30 border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none transition w-full"
              >
                <div className="flex justify-center mb-3">
                  <Avatar url={m.profile_photo_url} firstName={m.first_name} lastName={m.last_name} size="lg" />
                </div>

                <p className="font-semibold">
                  {m.first_name} {m.last_name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Mechanic</p>

                {m.specialization && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-1 font-medium">{m.specialization}</p>
                )}

                <div className="flex items-center justify-center gap-1 mt-2.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className={star <= Math.round(m.rating_avg || 0) ? 'text-accent-600 dark:text-accent-400' : 'text-gray-300 dark:text-gray-600'}>★</span>
                  ))}
                  <span className="text-sm font-medium ml-1">{m.rating_avg ? m.rating_avg.toFixed(1) : '—'}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-500">({m.rating_count || 0})</span>
                </div>
                <p className="text-xs text-primary-600 dark:text-primary-400 mt-3 font-medium">View Profile →</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Glass modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-md"
          onClick={closeProfile}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 max-h-[85vh] overflow-y-auto bg-white dark:bg-dark-900 border border-gray-200 dark:border-primary-500/20 shadow-2xl text-gray-900 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Avatar url={selected.profile_photo_url} firstName={selected.first_name} lastName={selected.last_name} size="md" />
                <div>
                  <p className="font-semibold">{selected.first_name} {selected.last_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Mechanic {selected.specialization && `• ${selected.specialization}`}
                  </p>
                </div>
              </div>
              <button
                onClick={closeProfile}
                className="text-gray-400 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Rating summary */}
            <div className="bg-gray-100 dark:bg-black/30 rounded-xl p-4 mb-5 flex items-center gap-4 border border-gray-200 dark:border-white/5">
              <div className="text-center shrink-0">
                <p className="text-3xl font-bold text-accent-600 dark:text-accent-400">
                  {selected.rating_avg ? selected.rating_avg.toFixed(1) : '—'}
                </p>
                <div className="flex gap-0.5 justify-center mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className={star <= Math.round(selected.rating_avg || 0) ? 'text-accent-600 dark:text-accent-400' : 'text-gray-300 dark:text-gray-600'}>★</span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{selected.rating_count || 0} reviews</p>
              </div>
              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = reviews.filter((r) => r.rating === star).length;
                  const pct = reviews.length ? (count / reviews.length) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 dark:text-gray-400 w-2">{star}</span>
                      <span className="text-accent-600 dark:text-accent-400 text-xs">★</span>
                      <div className="flex-1 bg-gray-200 dark:bg-dark-800 rounded-full h-1.5">
                        <div
                          className="bg-accent-500 dark:bg-accent-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-gray-500 dark:text-gray-500 w-4">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Certifications */}
            <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Certifications</h3>
            {loadingCerts ? (
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-gray-200 dark:bg-dark-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : certificates.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-500 text-sm mb-5">No certifications on file.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 mb-5">
                {certificates.map((cert) => (
                  <button
                    key={cert.id}
                    type="button"
                    onClick={() => setLightboxUrl(cert.file_url)}
                    className="bg-gray-100 dark:bg-black/30 hover:bg-gray-200 dark:hover:bg-black/40 border border-gray-200 dark:border-white/5 hover:border-primary-500/30 rounded-lg p-2 text-left transition group"
                  >
                    <div className="aspect-square rounded-md bg-gray-200 dark:bg-dark-800 mb-1.5 overflow-hidden flex items-center justify-center">
                      {cert.file_url ? (
                        <img
                          src={cert.file_url}
                          alt={cert.title}
                          className="w-full h-full object-cover group-hover:opacity-90 transition"
                        />
                      ) : (
                        <span className="text-lg">📄</span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium leading-tight line-clamp-2">{cert.name}</p>
                    {cert.verified && (
                      <span className="text-[9px] bg-green-500/15 text-green-700 dark:text-green-400 ring-1 ring-green-500/20 rounded-full px-1.5 py-0.5 font-medium inline-block mt-1">
                        ✓ Verified
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Reviews */}
            <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Customer Reviews</h3>
            {loadingReviews ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 bg-gray-200 dark:bg-dark-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-500 text-sm">No reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r, i) => (
                  <div key={i} className="rounded-lg p-3 bg-gray-100 dark:bg-black/30 border border-gray-200 dark:border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium">
                          {r.profiles?.first_name} {r.profiles?.last_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {r.bookings?.services?.name || 'Service'}
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span key={star} className={star <= r.rating ? 'text-accent-600 dark:text-accent-400 text-xs' : 'text-gray-300 dark:text-gray-600 text-xs'}>★</span>
                        ))}
                      </div>
                    </div>
                    {r.comment && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{r.comment}</p>
                    )}
                    <p className="text-xs mt-1 text-gray-500 dark:text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Certificate lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-5 right-5 text-white text-3xl leading-none hover:text-gray-300"
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt="Certificate enlarged"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}