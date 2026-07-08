import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getMotorcycleLabel(assessment) {
  const makeModel = `${assessment.motorcycle_make || ''} ${assessment.motorcycle_model || ''}`.trim();

  if (!makeModel && !assessment.motorcycle_year) return 'Motorcycle not specified';

  return `${makeModel}${assessment.motorcycle_year ? ` (${assessment.motorcycle_year})` : ''}`.trim();
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: '⏳',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  },
  reviewed: {
    label: 'Reviewed',
    icon: '✓',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  converted: {
    label: 'Converted',
    icon: '📅',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${config.classes}`}>
      <span>{config.icon}</span>
      {config.label || status}
    </span>
  );
}

function AssessmentSkeleton() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-2 h-5 w-48 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
        </div>
        <div className="h-7 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-dark-900" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
        ))}
      </div>
    </div>
  );
}

function PriceCard({ label, value, accent = false, strong = false }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
      <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`text-sm font-black ${
          accent
            ? 'text-accent-600 dark:text-accent-400'
            : strong
            ? 'text-gray-950 dark:text-white'
            : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {formatPeso(value)}
      </p>
    </div>
  );
}

export default function MyAssessments() {
  const { user } = useAuth();

  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user?.id) return;

    fetchAssessments();

    const channel = supabase
      .channel(`my-assessments-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pre_assessments',
          filter: `customer_id=eq.${user.id}`,
        },
        () => fetchAssessments(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function fetchAssessments(showLoader = true) {
    if (!user?.id) return;
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('pre_assessments')
      .select('*, services(name)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load assessments.');
      setAssessments([]);
    } else {
      setAssessments(data || []);
    }

    setLoading(false);
  }

  const counts = useMemo(() => {
    const result = {
      all: assessments.length,
      pending: 0,
      reviewed: 0,
      converted: 0,
    };

    assessments.forEach((assessment) => {
      if (result[assessment.status] !== undefined) {
        result[assessment.status] += 1;
      }
    });

    return result;
  }, [assessments]);

  const filteredAssessments = useMemo(
    () =>
      assessments.filter((assessment) => {
        return filter === 'all' || assessment.status === filter;
      }),
    [assessments, filter]
  );

  const totalEstimateValue = useMemo(
    () =>
      filteredAssessments.reduce(
        (sum, assessment) => sum + (Number(assessment.estimated_total) || 0),
        0
      ),
    [filteredAssessments]
  );

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Estimates
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  My Assessments
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  View your pre-assessment cost estimates, down payment amounts, and review status.
                </p>
              </div>

              <Link
                to="/pre-assessment"
                className="inline-flex items-center justify-center rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.99]"
              >
                + New Assessment
              </Link>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total Assessments
            </p>
            <p className="mt-2 text-2xl font-black text-gray-950 dark:text-white">
              {assessments.length}
            </p>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Pending
            </p>
            <p className="mt-2 text-2xl font-black text-yellow-600 dark:text-yellow-300">
              {counts.pending}
            </p>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Filtered Estimate Total
            </p>
            <p className="mt-2 text-2xl font-black text-accent-600 dark:text-accent-400">
              {formatPeso(totalEstimateValue)}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-wrap gap-2">
            {['all', 'pending', 'reviewed', 'converted'].map((status) => {
              const active = filter === status;
              const label = status === 'all' ? 'All' : status;

              return (
                <button
                  key={status}
                  type="button"
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

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <AssessmentSkeleton key={item} />
            ))}
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-900/20 dark:ring-primary-500/20">
              📋
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No assessments found
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              {filter === 'all'
                ? 'You do not have any pre-assessments yet.'
                : `You do not have ${filter} assessments yet.`}
            </p>
            <Link
              to="/pre-assessment"
              className="inline-flex rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
            >
              Get your first cost estimate →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAssessments.map((assessment) => {

              return (
                <article
                  key={assessment.id}
                  className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:border-primary-200 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30"
                >
                  <div className="p-5 sm:p-6">
                    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={assessment.status} />
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                            {formatDate(assessment.created_at)}
                          </span>
                        </div>

                        <h2 className="text-lg font-black text-gray-950 dark:text-white">
                          {getMotorcycleLabel(assessment)}
                        </h2>

                        <p className="mt-1 text-sm font-semibold text-primary-600 dark:text-primary-400">
                          {assessment.services?.name || 'Service not found'}
                        </p>

                        {assessment.issue_description && (
                          <p className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm italic leading-6 text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                            “{assessment.issue_description}”
                          </p>
                        )}
                      </div>

                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <PriceCard
                        label="Parts / Base Cost"
                        value={assessment.estimated_parts_cost}
                      />
                      <PriceCard
                        label="Labor Cost"
                        value={assessment.estimated_labor_cost}
                      />
                      <PriceCard
                        label="Total Estimate"
                        value={assessment.estimated_total}
                        strong
                      />
                      <PriceCard
                        label="Down Payment"
                        value={assessment.down_payment_required}
                        accent
                      />
                    </div>

                    {assessment.status === 'pending' && (
                      <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300">
                        ⏳ This estimate is still pending review. Final pricing may change after shop verification.
                      </div>
                    )}

                    {assessment.status === 'reviewed' && (
                      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300">
                        ✓ This estimate has been reviewed by the shop.
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
