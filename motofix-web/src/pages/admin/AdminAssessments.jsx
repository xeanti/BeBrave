import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { confirmAction } from '../../components/ConfirmModal';

const STATUS_OPTIONS = ['pending', 'reviewed', 'converted'];
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

function sanitizePageSize(value) {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : 10;
}

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

const TIME_SLOTS = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
];

function getCustomerName(assessment) {
  const name = `${assessment.profiles?.first_name || ''} ${assessment.profiles?.last_name || ''}`.trim();

  return name || 'Unknown Customer';
}

function getMotorcycleLabel(assessment) {
  const makeModel = `${assessment.motorcycle_make || ''} ${assessment.motorcycle_model || ''}`.trim();

  if (!makeModel && !assessment.motorcycle_year) return 'Motorcycle not specified';

  return `${makeModel}${assessment.motorcycle_year ? ` (${assessment.motorcycle_year})` : ''}`.trim();
}

const STATUS_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  reviewed:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  converted:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
};

const ACTION_STYLES = {
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25 dark:hover:bg-yellow-500/20',
  reviewed:
    'bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25 dark:hover:bg-blue-500/20',
  converted:
    'bg-green-50 text-green-700 ring-green-200 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25 dark:hover:bg-green-500/20',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {String(status || 'pending').replace('_', ' ')}
    </span>
  );
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    blue: 'text-blue-600 dark:text-blue-300',
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

function AssessmentSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-64 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function AdminAssessments() {
  const { user } = useAuth();

  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [updating, setUpdating] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [mechanics, setMechanics] = useState([]);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertForm, setConvertForm] = useState({
    booking_date: getTodayString(),
    booking_time: '',
    mechanic_id: '',
  });
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    fetchAssessments();

    /*
      Realtime refresh for admin assessment management.
      Enable Realtime in Supabase for pre_assessments, services, and profiles.
    */
    const assessmentsChannel = supabase
      .channel('admin-assessments-pre-assessments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pre_assessments',
        },
        () => fetchAssessments(false)
      )
      .subscribe();

    const servicesChannel = supabase
      .channel('admin-assessments-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
        },
        () => fetchAssessments(false)
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('admin-assessments-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => fetchAssessments(false)
      )
      .subscribe();

    const handleFocus = () => fetchAssessments(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchAssessments(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(assessmentsChannel);
      supabase.removeChannel(servicesChannel);
      supabase.removeChannel(profilesChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search, pageSize]);

  async function fetchAssessments(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const [assessmentsResult, mechanicsResult] = await Promise.all([
      supabase
        .from('pre_assessments')
        .select(`
          *,
          services(
            id,
            name,
            description,
            base_price,
            labor_cost,
            estimated_duration_minutes
          ),
          profiles(first_name, last_name, email)
        `)
        .order('created_at', { ascending: false }),

      supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role, is_active')
        .eq('role', 'mechanic')
        .order('first_name', { ascending: true }),
    ]);

    if (assessmentsResult.error) {
      setFetchError(assessmentsResult.error.message || 'Failed to load pre-assessments.');
      setAssessments([]);
      setLoading(false);
      return;
    }

    if (mechanicsResult.error) {
      console.warn('Failed to load mechanics:', mechanicsResult.error.message);
    }

    setAssessments(assessmentsResult.data || []);
    setMechanics((mechanicsResult.data || []).filter((mechanic) => mechanic.is_active !== false));
    setLastUpdated(new Date());
    setLoading(false);
  }

  async function insertAuditLog(assessmentId, status) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action: 'UPDATE_ASSESSMENT_STATUS',
      entity: 'pre_assessments',
      entity_id: assessmentId,
      performed_by: user.id,
      details: {
        new_status: status,
      },
    });
  }

  async function updateStatus(id, status) {
    const assessment = assessments.find((item) => item.id === id);
    const customerName = assessment ? getCustomerName(assessment) : 'this customer';
    const motorcycle = assessment ? getMotorcycleLabel(assessment) : 'this assessment';
    const statusLabel = String(status || '').replace('_', ' ');

    const confirmed = await confirmAction(
      `Are you sure you want to mark ${customerName}'s assessment for ${motorcycle} as "${statusLabel}"?`
    );

    if (!confirmed) return;

    setUpdating(`${id}-${status}`);
    setFetchError('');

    try {
      const { error } = await supabase
        .from('pre_assessments')
        .update({
          status,
        })
        .eq('id', id);

      if (error) throw error;

      await insertAuditLog(id, status);

      setAssessments((previous) =>
        previous.map((assessment) =>
          assessment.id === id ? { ...assessment, status } : assessment
        )
      );

      await fetchAssessments(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to update assessment status.');
    } finally {
      setUpdating(null);
    }
  }

  function getMechanicName(mechanic) {
    const name = `${mechanic?.first_name || ''} ${mechanic?.last_name || ''}`.trim();
    return name || mechanic?.email || 'Mechanic';
  }

  function openConvertModal(assessment) {
    setFetchError('');

    if (!assessment?.customer_id) {
      setFetchError('Cannot convert this assessment because the customer is missing.');
      return;
    }

    if (assessment.status === 'converted') {
      setFetchError('This assessment is already converted.');
      return;
    }

    setConvertTarget(assessment);
    setConvertForm({
      booking_date: getTodayString(),
      booking_time: '',
      mechanic_id: '',
    });
  }

  function closeConvertModal() {
    if (converting) return;

    setConvertTarget(null);
    setConvertForm({
      booking_date: getTodayString(),
      booking_time: '',
      mechanic_id: '',
    });
  }

  async function tryInsertBookingFromAssessment(payload) {
    const { data, error } = await supabase
      .from('bookings')
      .insert(payload)
      .select('id, booking_date, booking_time')
      .single();

    if (!error) return data;

    const message = String(error.message || '').toLowerCase();

    if (
      message.includes('schema cache') ||
      message.includes('column') ||
      message.includes('service_total') ||
      message.includes('services_summary') ||
      message.includes('total_amount') ||
      message.includes('reservation_fee') ||
      message.includes('payment_status') ||
      message.includes('estimated_duration_minutes') ||
      message.includes('payment_method')
    ) {
      const fallback = {
        customer_id: payload.customer_id,
        service_id: payload.service_id,
        mechanic_id: payload.mechanic_id,
        booking_date: payload.booking_date,
        booking_time: payload.booking_time,
        status: payload.status,
        notes: payload.notes,
      };

      const retry = await supabase
        .from('bookings')
        .insert(fallback)
        .select('id, booking_date, booking_time')
        .single();

      if (retry.error) throw retry.error;
      return retry.data;
    }

    throw error;
  }

  async function insertBookingServiceFromAssessment(bookingId, assessment) {
    const service = assessment.services;
    const serviceName = service?.name || 'Pre-assessment service';

    const row = {
      booking_id: bookingId,
      service_id: assessment.service_id || service?.id || null,
      service_name: serviceName,
      base_price:
        Number(service?.base_price) ||
        Number(assessment.estimated_parts_cost) ||
        0,
      labor_cost:
        Number(service?.labor_cost) ||
        Number(assessment.estimated_labor_cost) ||
        0,
      estimated_duration_minutes:
        Number(service?.estimated_duration_minutes) ||
        30,
      quantity: 1,
    };

    const { error } = await supabase.from('booking_services').insert(row);

    if (error) {
      console.warn('Converted booking service insert skipped:', error.message);
    }
  }

  async function convertAssessmentToBooking() {
    if (!convertTarget) return;

    if (!convertForm.booking_date) {
      setFetchError('Select a booking date before converting.');
      return;
    }

    if (convertForm.booking_date < getTodayString()) {
      setFetchError('Booking date cannot be in the past.');
      return;
    }

    if (!convertForm.booking_time) {
      setFetchError('Select a booking time before converting.');
      return;
    }

    const customerName = getCustomerName(convertTarget);
    const motorcycle = getMotorcycleLabel(convertTarget);
    const serviceName = convertTarget.services?.name || 'Pre-assessment service';
    const totalAmount = Number(convertTarget.estimated_total) || 0;
    const reservationFee = Number(convertTarget.down_payment_required) || 0;

    const confirmed = await confirmAction(
      `Convert ${customerName}'s pre-assessment for ${motorcycle} into a booking on ${convertForm.booking_date} at ${convertForm.booking_time}?`
    );

    if (!confirmed) return;

    setConverting(true);
    setFetchError('');

    try {
      const notes = [
        'CONVERTED FROM PRE-ASSESSMENT',
        `Pre-assessment ID: ${convertTarget.id}`,
        `Customer concern: ${convertTarget.issue_description || 'No issue description.'}`,
        convertTarget.notes ? `Assessment notes:\n${convertTarget.notes}` : null,
      ]
        .filter(Boolean)
        .join('\n\n');

      const bookingPayload = {
        customer_id: convertTarget.customer_id,
        service_id: convertTarget.service_id || convertTarget.services?.id || null,
        mechanic_id: convertForm.mechanic_id || null,
        booking_date: convertForm.booking_date,
        booking_time: convertForm.booking_time,
        status: 'pending',
        payment_status: 'unpaid',
        payment_method: 'pending',
        service_total: totalAmount,
        services_summary: serviceName,
        total_amount: totalAmount,
        reservation_fee: reservationFee,
        estimated_duration_minutes:
          Number(convertTarget.services?.estimated_duration_minutes) || 30,
        notes,
      };

      const booking = await tryInsertBookingFromAssessment(bookingPayload);

      await insertBookingServiceFromAssessment(booking.id, convertTarget);

      const { error: assessmentError } = await supabase
        .from('pre_assessments')
        .update({ status: 'converted' })
        .eq('id', convertTarget.id);

      if (assessmentError) throw assessmentError;

      if (user?.id) {
        await supabase.from('audit_logs').insert({
          action: 'CONVERT_PRE_ASSESSMENT_TO_BOOKING',
          entity: 'pre_assessments',
          entity_id: convertTarget.id,
          performed_by: user.id,
          details: {
            booking_id: booking.id,
            customer_id: convertTarget.customer_id,
            service_id: bookingPayload.service_id,
            mechanic_id: bookingPayload.mechanic_id,
            booking_date: bookingPayload.booking_date,
            booking_time: bookingPayload.booking_time,
            total_amount: totalAmount,
          },
        });
      }

      setAssessments((previous) =>
        previous.map((assessment) =>
          assessment.id === convertTarget.id
            ? { ...assessment, status: 'converted' }
            : assessment
        )
      );

      setConvertTarget(null);
      setConvertForm({
        booking_date: getTodayString(),
        booking_time: '',
        mechanic_id: '',
      });

      await fetchAssessments(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to convert assessment to booking.');
    } finally {
      setConverting(false);
    }
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

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return assessments.filter((assessment) => {
      const matchesStatus = filter === 'all' || assessment.status === filter;
      const customerName = getCustomerName(assessment).toLowerCase();
      const email = String(assessment.profiles?.email || '').toLowerCase();
      const serviceName = String(assessment.services?.name || '').toLowerCase();
      const motorcycle = getMotorcycleLabel(assessment).toLowerCase();
      const issue = String(assessment.issue_description || '').toLowerCase();
      const id = String(assessment.id || '').toLowerCase();

      const matchesSearch =
        !searchTerm ||
        customerName.includes(searchTerm) ||
        email.includes(searchTerm) ||
        serviceName.includes(searchTerm) ||
        motorcycle.includes(searchTerm) ||
        issue.includes(searchTerm) ||
        id.includes(searchTerm);

      return matchesStatus && matchesSearch;
    });
  }, [assessments, filter, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, assessment) => {
        acc.parts += Number(assessment.estimated_parts_cost) || 0;
        acc.labor += Number(assessment.estimated_labor_cost) || 0;
        acc.total += Number(assessment.estimated_total) || 0;
        acc.downPayment += Number(assessment.down_payment_required) || 0;

        return acc;
      },
      {
        parts: 0,
        labor: 0,
        total: 0,
        downPayment: 0,
      }
    );
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedAssessments = filtered.slice(startIndex, endIndex);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Admin
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Pre-Assessments
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Review customer cost estimate requests, check issue descriptions, and update assessment status.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchAssessments(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Filtered Assessments" value={filtered.length} icon="📋" tone="primary" />
          <StatCard label="Total Estimate" value={formatPeso(totals.total)} icon="💰" tone="accent" />
          <StatCard label="Down Payments" value={formatPeso(totals.downPayment)} icon="✅" tone="green" />
          <StatCard label="Pending Review" value={counts.pending} icon="⏳" tone={counts.pending > 0 ? 'yellow' : 'default'} />
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {['all', ...STATUS_OPTIONS].map((status) => {
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

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, service, motorcycle, issue, email, or ID..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 lg:w-96"
            />
          </div>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Showing {startIndex + 1}–{Math.min(endIndex, filtered.length)} of {filtered.length} assessments
              </p>
              <p className="mt-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
                Page {safeCurrentPage} of {totalPages}
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Per page
              <select
                value={pageSize}
                onChange={(event) => setPageSize(sanitizePageSize(event.target.value))}
                className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {loading ? (
          <AssessmentSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              📋
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No assessments found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Try changing the status filter or search keyword.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedAssessments.map((assessment) => (
              <article
                key={assessment.id}
                className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800"
              >
                <div className="p-5 sm:p-6">
                  {/* Header Row */}
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={assessment.status} />
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-black text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                          #{assessment.id?.slice(0, 8).toUpperCase()}
                        </span>
                      </div>

                      <h2 className="text-xl font-black text-gray-950 dark:text-white">
                        {getMotorcycleLabel(assessment)}
                      </h2>

                      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        👤 {getCustomerName(assessment)}
                        {assessment.profiles?.email ? ` · ${assessment.profiles.email}` : ''}
                      </p>

                      <p className="mt-1 text-sm font-black text-primary-600 dark:text-primary-400">
                        🔧 {assessment.services?.name || 'No service selected'}
                      </p>

                      <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Requested on {formatDateTime(assessment.created_at)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 px-4 py-3 text-right ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Total Estimate
                      </p>
                      <p className="text-xl font-black text-gray-950 dark:text-white">
                        {formatPeso(assessment.estimated_total)}
                      </p>
                    </div>
                  </div>

                  {/* Issue */}
                  {assessment.issue_description && (
                    <div className="mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm italic leading-6 text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                      “{assessment.issue_description}”
                    </div>
                  )}

                  {/* Costs */}
                  <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <PriceCard label="Base / Products Cost" value={assessment.estimated_parts_cost} />
                    <PriceCard label="Labor Cost" value={assessment.estimated_labor_cost} />
                    <PriceCard label="Total Estimate" value={assessment.estimated_total} strong />
                    <PriceCard label="Down Payment" value={assessment.down_payment_required} accent />
                  </div>

                  {/* Status Actions */}
                  <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                    <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Update Status
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.filter((status) => status !== assessment.status).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            status === 'converted'
                              ? openConvertModal(assessment)
                              : updateStatus(assessment.id, status)
                          }
                          disabled={updating === `${assessment.id}-${status}` || converting}
                          className={`rounded-2xl px-4 py-2 text-xs font-black capitalize ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${ACTION_STYLES[status]}`}
                        >
                          {updating === `${assessment.id}-${status}`
                            ? 'Updating...'
                            : status === 'converted'
                            ? 'Convert to Booking'
                            : status === 'pending'
                            ? 'Reset to Pending'
                            : `Mark as ${status}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {totalPages > 1 && (
              <div className="flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                  Page {safeCurrentPage} of {totalPages}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage <= 1}
                    className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                  >
                    First
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                    disabled={safeCurrentPage <= 1}
                    className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                  >
                    Prev
                  </button>

                  <span className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-black text-gray-700 dark:bg-dark-900 dark:text-gray-300">
                    {safeCurrentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                    disabled={safeCurrentPage >= totalPages}
                    className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                  >
                    Next
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage >= totalPages}
                    className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      {convertTarget && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-gray-950/60 px-4 py-6 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="convert-assessment-title"
            className="flex max-h-[90vh] shrink-0 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-dark-700 dark:bg-dark-800"
            style={{
              width: '560px',
              maxWidth: 'calc(100vw - 32px)',
              minWidth: 0,
              flex: '0 0 auto',
            }}
          >
            <div className="border-b border-gray-100 p-5 dark:border-dark-700">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                Convert Assessment
              </p>
              <h2
                id="convert-assessment-title"
                className="mt-1 text-2xl font-black text-gray-950 dark:text-white"
              >
                Create Booking
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                This will create a real booking record from the reviewed pre-assessment.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/60 dark:ring-dark-700">
                <p className="text-sm font-black text-gray-950 dark:text-white">
                  {getCustomerName(convertTarget)}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {getMotorcycleLabel(convertTarget)}
                </p>
                <p className="mt-1 text-sm font-black text-primary-600 dark:text-primary-400">
                  {convertTarget.services?.name || 'No service selected'} · {formatPeso(convertTarget.estimated_total)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Booking Date
                  </span>
                  <input
                    type="date"
                    value={convertForm.booking_date}
                    min={getTodayString()}
                    onChange={(event) =>
                      setConvertForm((current) => ({
                        ...current,
                        booking_date: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Booking Time
                  </span>
                  <select
                    value={convertForm.booking_time}
                    onChange={(event) =>
                      setConvertForm((current) => ({
                        ...current,
                        booking_time: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  >
                    <option value="">Select time</option>
                    {TIME_SLOTS.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Assign Mechanic Optional
                </span>
                <select
                  value={convertForm.mechanic_id}
                  onChange={(event) =>
                    setConvertForm((current) => ({
                      ...current,
                      mechanic_id: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                >
                  <option value="">Unassigned</option>
                  {mechanics.map((mechanic) => (
                    <option key={mechanic.id} value={mechanic.id}>
                      {getMechanicName(mechanic)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 p-5 dark:border-dark-700 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeConvertModal}
                disabled={converting}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:text-gray-300 dark:hover:bg-dark-900"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={convertAssessmentToBooking}
                disabled={converting}
                className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {converting ? 'Creating Booking...' : 'Create Booking'}
              </button>
            </div>
          </section>
        </div>
      )}
      </div>
    </div>
  );
}
