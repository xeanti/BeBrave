import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getInitials(firstName, lastName) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
}

function isImageFile(url = '') {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url);
}

function StarRating({ value = 0, size = 'text-sm' }) {
  const rounded = Math.round(Number(value) || 0);

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`${size} ${
            star <= rounded
              ? 'text-accent-600 dark:text-accent-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function Avatar({ url, firstName, lastName, size = 'md' }) {
  const sizes = {
    sm: 'h-11 w-11 text-sm',
    md: 'h-14 w-14 text-base',
    lg: 'h-20 w-20 text-2xl',
  };

  const dim = sizes[size] || sizes.md;

  if (url) {
    return (
      <img
        src={url}
        alt={`${firstName || ''} ${lastName || ''}`.trim() || 'Mechanic'}
        className={`${dim} flex-shrink-0 rounded-3xl border-2 border-primary-100 object-cover shadow-sm dark:border-primary-500/30`}
      />
    );
  }

  return (
    <div
      className={`${dim} flex-shrink-0 rounded-3xl bg-primary-600 text-white shadow-sm grid place-items-center font-black`}
    >
      {getInitials(firstName, lastName)}
    </div>
  );
}

function MechanicSkeleton() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mx-auto mb-4 h-20 w-20 animate-pulse rounded-3xl bg-gray-100 dark:bg-dark-900" />
      <div className="mx-auto mb-2 h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
      <div className="mx-auto mb-4 h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
      <div className="h-10 w-full animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
      <div className="mb-2 h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-dark-800" />
      <div className="h-3 w-full animate-pulse rounded bg-gray-200 dark:bg-dark-800" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-dark-800" />
    </div>
  );
}

export default function Mechanics() {
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const [reviews, setReviews] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingCerts, setLoadingCerts] = useState(false);

  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [lightboxName, setLightboxName] = useState('');

  const [search, setSearch] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rating_desc');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMechanics();

    const profileChannel = supabase
      .channel('mechanics-profile-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchMechanics(false)
      )
      .subscribe();

    const ratingsChannel = supabase
      .channel('mechanics-rating-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mechanic_ratings' },
        () => {
          fetchMechanics(false);
          if (selected?.id) fetchReviews(selected.id);
        }
      )
      .subscribe();

    const certsChannel = supabase
      .channel('mechanics-certificate-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mechanic_certificates' },
        () => {
          if (selected?.id) fetchCertificates(selected.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(ratingsChannel);
      supabase.removeChannel(certsChannel);
    };
  }, [selected?.id]);

  async function fetchMechanics(showLoader = true) {
    if (showLoader) setLoading(true);

    setError('');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, phone, profile_photo_url, specialization, rating_avg, rating_count')
        .eq('role', 'mechanic')
        .order('first_name', { ascending: true });

      if (error) throw error;
      setMechanics(data || []);
    } catch (err) {
      console.error('Error fetching mechanics:', err);
      setError(err.message || 'Failed to load mechanics.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchReviews(mechanicId) {
    setLoadingReviews(true);

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
        .eq('mechanic_id', mechanicId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Error fetching reviews:', err);
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  }

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(true);

    try {
      const { data, error } = await supabase
        .from('mechanic_certificates')
        .select('*')
        .eq('mechanic_id', mechanicId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCertificates(data || []);
    } catch (err) {
      console.error('Error fetching certificates:', err);
      setCertificates([]);
    } finally {
      setLoadingCerts(false);
    }
  }

  async function openProfile(mechanic) {
    setSelected(mechanic);
    setReviews([]);
    setCertificates([]);
    setLightboxUrl(null);
    setLightboxName('');

    fetchReviews(mechanic.id);
    fetchCertificates(mechanic.id);
  }

  function closeProfile() {
    setSelected(null);
    setReviews([]);
    setCertificates([]);
    setLightboxUrl(null);
    setLightboxName('');
  }

  const specializations = useMemo(() => {
    const items = mechanics
      .map((mechanic) => mechanic.specialization)
      .filter(Boolean)
      .map((item) => item.trim())
      .filter(Boolean);

    return ['all', ...new Set(items)].sort((a, b) => {
      if (a === 'all') return -1;
      if (b === 'all') return 1;
      return a.localeCompare(b);
    });
  }, [mechanics]);

  const filteredMechanics = useMemo(() => {
    const query = search.toLowerCase().trim();

    const result = mechanics.filter((mechanic) => {
      const fullName = `${mechanic.first_name || ''} ${mechanic.last_name || ''}`;
      const searchText = `${fullName} ${mechanic.specialization || ''}`.toLowerCase();

      const matchesSearch = !query || searchText.includes(query);
      const matchesSpecialization =
        specializationFilter === 'all' || mechanic.specialization === specializationFilter;

      return matchesSearch && matchesSpecialization;
    });

    return [...result].sort((a, b) => {
      const ratingA = Number(a.rating_avg) || 0;
      const ratingB = Number(b.rating_avg) || 0;
      const reviewsA = Number(a.rating_count) || 0;
      const reviewsB = Number(b.rating_count) || 0;
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`;
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`;

      if (sortBy === 'rating_desc') return ratingB - ratingA || reviewsB - reviewsA;
      if (sortBy === 'reviews_desc') return reviewsB - reviewsA || ratingB - ratingA;
      if (sortBy === 'name_asc') return nameA.localeCompare(nameB);

      return 0;
    });
  }, [mechanics, search, specializationFilter, sortBy]);

  const ratingDistribution = useMemo(() => {
    const result = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    reviews.forEach((review) => {
      const rating = Number(review.rating);
      if (result[rating] !== undefined) {
        result[rating] += 1;
      }
    });

    return result;
  }, [reviews]);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 transition-colors dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Service Team
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Our Mechanics
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Meet the mechanics who handle inspections, repairs, upgrades, and maintenance for your motorcycle.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex">
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Mechanics
                  </p>
                  <p className="text-lg font-black text-gray-950 dark:text-white">
                    {mechanics.length}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-center ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    With Reviews
                  </p>
                  <p className="text-lg font-black text-accent-600 dark:text-accent-400">
                    {mechanics.filter((mechanic) => Number(mechanic.rating_count) > 0).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Filters */}
        <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search mechanic or specialization..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-10 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition hover:text-gray-700 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={specializationFilter}
              onChange={(event) => setSpecializationFilter(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
            >
              {specializations.map((item) => (
                <option key={item} value={item}>
                  {item === 'all' ? 'All Specializations' : item}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
            >
              <option value="rating_desc">Top Rated</option>
              <option value="reviews_desc">Most Reviews</option>
              <option value="name_asc">Name A-Z</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSpecializationFilter('all');
                setSortBy('rating_desc');
              }}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
            >
              Clear
            </button>
          </div>
        </section>

        {/* Mechanics grid */}
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <MechanicSkeleton key={item} />
            ))}
          </div>
        ) : filteredMechanics.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-900/20 dark:ring-primary-500/20">
              👤
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No mechanics found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Try another search term or clear the specialization filter.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMechanics.map((mechanic) => (
              <button
                key={mechanic.id}
                onClick={() => openProfile(mechanic)}
                className="group rounded-3xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary-200 hover:shadow-xl hover:shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 dark:hover:shadow-black/20"
              >
                <div className="mb-5 flex items-start gap-4">
                  <Avatar
                    url={mechanic.profile_photo_url}
                    firstName={mechanic.first_name}
                    lastName={mechanic.last_name}
                    size="lg"
                  />

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-black text-gray-950 dark:text-white">
                      {mechanic.first_name} {mechanic.last_name}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">
                      Mechanic
                    </p>

                    {mechanic.specialization && (
                      <span className="mt-3 inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 dark:bg-primary-900/25 dark:text-primary-300">
                        {mechanic.specialization}
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-black text-accent-600 dark:text-accent-400">
                        {mechanic.rating_avg ? Number(mechanic.rating_avg).toFixed(1) : '—'}
                      </p>
                      <StarRating value={mechanic.rating_avg || 0} />
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Reviews
                      </p>
                      <p className="text-lg font-black text-gray-950 dark:text-white">
                        {mechanic.rating_count || 0}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-center text-xs font-black text-primary-600 transition group-hover:text-primary-700 dark:text-primary-400 dark:group-hover:text-primary-300">
                  View Profile →
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Profile modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
          onClick={closeProfile}
        >
          <div
            className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-primary-500/20 dark:bg-dark-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-6 py-5 backdrop-blur dark:border-dark-700 dark:bg-dark-900/95">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar
                    url={selected.profile_photo_url}
                    firstName={selected.first_name}
                    lastName={selected.last_name}
                    size="md"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-black text-gray-950 dark:text-white">
                      {selected.first_name} {selected.last_name}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Mechanic {selected.specialization ? `• ${selected.specialization}` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeProfile}
                  className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-800 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="max-h-[calc(88vh-88px)] overflow-y-auto p-6">
              {/* Rating summary */}
              <section className="mb-6 rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-dark-700 dark:bg-dark-800">
                <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                  <div className="rounded-3xl bg-white p-5 text-center ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                    <p className="text-5xl font-black text-accent-600 dark:text-accent-400">
                      {selected.rating_avg ? Number(selected.rating_avg).toFixed(1) : '—'}
                    </p>
                    <div className="mt-2 flex justify-center">
                      <StarRating value={selected.rating_avg || 0} size="text-base" />
                    </div>
                    <p className="mt-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                      {selected.rating_count || 0} total reviews
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = ratingDistribution[star] || 0;
                      const percent = reviews.length ? (count / reviews.length) * 100 : 0;

                      return (
                        <div key={star} className="flex items-center gap-3 text-xs">
                          <span className="w-4 font-black text-gray-600 dark:text-gray-400">
                            {star}
                          </span>
                          <span className="text-accent-600 dark:text-accent-400">★</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                            <div
                              className="h-full rounded-full bg-accent-500 transition-all dark:bg-accent-400"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="w-8 text-right font-bold text-gray-500 dark:text-gray-400">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                    <p className="pt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      Rating breakdown is based on the latest loaded reviews.
                    </p>
                  </div>
                </div>
              </section>

              {/* Certifications */}
              <section className="mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                      Certifications
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Uploaded credentials and certificates.
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-500 dark:bg-dark-800 dark:text-gray-400">
                    {certificates.length}
                  </span>
                </div>

                {loadingCerts ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="h-32 animate-pulse rounded-3xl bg-gray-100 dark:bg-dark-800"
                      />
                    ))}
                  </div>
                ) : certificates.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-800/60">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      No certifications on file.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {certificates.map((certificate) => {
                      const image = isImageFile(certificate.file_url);

                      return (
                        <button
                          key={certificate.id}
                          type="button"
                          onClick={() => {
                            setLightboxUrl(certificate.file_url);
                            setLightboxName(certificate.name || 'Certificate');
                          }}
                          className="group rounded-3xl border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-primary-300 hover:bg-white dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/40 dark:hover:bg-dark-800/80"
                        >
                          <div className="mb-3 aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-dark-900 dark:ring-dark-700">
                            {image ? (
                              <img
                                src={certificate.file_url}
                                alt={certificate.name || 'Certificate'}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-4xl text-gray-400">
                                📄
                              </div>
                            )}
                          </div>

                          <p className="line-clamp-2 text-xs font-black leading-5 text-gray-950 dark:text-white">
                            {certificate.name || 'Certificate'}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {certificate.verified && (
                              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-black text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25">
                                ✓ Verified
                              </span>
                            )}
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                              {image ? 'Image' : 'File'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Reviews */}
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                      Customer Reviews
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Latest customer feedback for this mechanic.
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-500 dark:bg-dark-800 dark:text-gray-400">
                    {reviews.length}
                  </span>
                </div>

                {loadingReviews ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => (
                      <ReviewSkeleton key={item} />
                    ))}
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-800/60">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      No reviews yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reviews.map((review, index) => (
                      <article
                        key={`${review.created_at}-${index}`}
                        className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-gray-950 dark:text-white">
                              {review.profiles?.first_name} {review.profiles?.last_name}
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {review.bookings?.services?.name || 'Service'} · {formatDate(review.created_at)}
                            </p>
                          </div>
                          <StarRating value={review.rating} />
                        </div>

                        {review.comment ? (
                          <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                            “{review.comment}”
                          </p>
                        ) : (
                          <p className="text-sm italic text-gray-500 dark:text-gray-400">
                            No written comment.
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Certificate lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 px-4 backdrop-blur-md"
          onClick={() => {
            setLightboxUrl(null);
            setLightboxName('');
          }}
        >
          <button
            type="button"
            onClick={() => {
              setLightboxUrl(null);
              setLightboxName('');
            }}
            className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20"
          >
            ✕
          </button>

          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-dark-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-dark-700">
              <div>
                <p className="text-sm font-black text-gray-950 dark:text-white">
                  {lightboxName || 'Certificate'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Certificate preview
                </p>
              </div>
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-primary-600 px-4 py-2 text-xs font-black text-white transition hover:bg-primary-700"
              >
                Open File
              </a>
            </div>

            <div className="flex max-h-[calc(90vh-72px)] items-center justify-center bg-gray-100 p-4 dark:bg-black">
              {isImageFile(lightboxUrl) ? (
                <img
                  src={lightboxUrl}
                  alt={lightboxName || 'Certificate enlarged'}
                  className="max-h-[calc(90vh-104px)] max-w-full rounded-2xl object-contain"
                />
              ) : (
                <iframe
                  src={lightboxUrl}
                  title={lightboxName || 'Certificate'}
                  className="h-[75vh] w-full rounded-2xl border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
