// Shared helpers and UI components for the Staff Dashboard.
// Place this file at:
// motofix-web/src/pages/staff/staff-dashboard/StaffDashboardShared.jsx

export const SHOP_OPEN = 8;
export const SHOP_CLOSE = 17;

export const TIME_SLOTS = (() => {
  const slots = [];

  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }

  return slots;
})();

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'gcash', label: 'GCash Manual', icon: '📱' },
];

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export function sanitizePlainText(value, maxLength = 255) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeSearch(value, maxLength = 100) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9ñÑ @._+\-'/,:#]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

export function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

export function isValidOptionalPhone(value) {
  if (!value) return true;
  return /^09\d{9}$/.test(value);
}

export function sanitizeReference(value) {
  return String(value || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
}

export function sanitizeMoneyInput(value) {
  const cleaned = String(value || '')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*)\./g, '$1');

  const [whole = '', cents = ''] = cleaned.split('.');

  return cents ? `${whole.slice(0, 8)}.${cents.slice(0, 2)}` : whole.slice(0, 8);
}

export function toMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return 0;

  return Math.max(amount, 0);
}

export function formatPeso(value) {
  const amount = toMoney(value);

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(value) {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(time) {
  if (!time) return '—';

  const normalized = String(time).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = Number.parseInt(h, 10);
  const minute = String(m).padStart(2, '0').slice(0, 2);

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return '—';

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${display}:${minute} ${ampm}`;
}

export function formatStatus(value, fallback = 'pending') {
  return String(value || fallback)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getCustomerName(record) {
  if (record?.walkin_customer_name) {
    return sanitizePlainText(record.walkin_customer_name, 80) || 'Guest Customer';
  }

  if (record?.guest_name) {
    return sanitizePlainText(record.guest_name, 80) || 'Guest Customer';
  }

  const profile = record?.profiles || record?.customer || record;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  if (name) return sanitizePlainText(name, 80);

  if (record?.walkin_customer_phone) {
    return `Guest ${sanitizePhone(record.walkin_customer_phone)}`;
  }

  if (profile?.phone) {
    return `Customer ${sanitizePhone(profile.phone)}`;
  }

  if (profile?.email) {
    return sanitizePlainText(profile.email, 120);
  }

  return 'Guest Customer';
}

export function getCustomerContact(record) {
  const profile = record?.profiles || record?.customer || record;

  return sanitizePlainText(
    record?.walkin_customer_phone ||
      record?.guest_phone ||
      profile?.phone ||
      profile?.email ||
      '',
    120
  );
}

export function getServicePrice(service) {
  return toMoney(service?.base_price) + toMoney(service?.labor_cost);
}

export function getBookingServices(booking) {
  if (Array.isArray(booking?.booking_services) && booking.booking_services.length > 0) {
    return booking.booking_services;
  }

  if (booking?.services) {
    return [booking.services];
  }

  return [];
}

export function getBookingServicesSummary(booking) {
  if (booking?.services_summary) return sanitizePlainText(booking.services_summary, 180);

  const serviceNames = getBookingServices(booking)
    .map((item) => item.service_name || item.name || item.services?.name)
    .filter(Boolean)
    .map((name) => sanitizePlainText(name, 80));

  return serviceNames.length > 0 ? serviceNames.join(', ') : 'Service';
}

export function calculateBookingTotal(booking) {
  const explicitTotal = Number(booking?.total_amount);

  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return explicitTotal;
  }

  const serviceTotal = Number(booking?.service_total);
  const partsTotal = Number(booking?.parts_total ?? booking?.product_total);

  if (Number.isFinite(serviceTotal) || Number.isFinite(partsTotal)) {
    return Math.max((Number(serviceTotal) || 0) + (Number(partsTotal) || 0), 0);
  }

  const selectedServices = getBookingServices(booking);

  if (selectedServices.length > 0) {
    return selectedServices.reduce((sum, service) => sum + getServicePrice(service), 0);
  }

  return 0;
}

export function getReservationFee(booking) {
  const savedFee = Number(booking?.reservation_fee);

  if (Number.isFinite(savedFee) && savedFee > 0) return savedFee;

  const total = calculateBookingTotal(booking);

  if (total <= 0) return 0;

  return Number((total * 0.2).toFixed(2));
}

export function bookingRequiresReservationPayment(booking) {
  if (!booking || booking.is_walkin) return false;

  const status = String(booking.payment_status || '').toLowerCase();

  return getReservationFee(booking) > 0 || Boolean(status);
}

export function isReservationPaid(booking) {
  const status = String(booking?.payment_status || '').toLowerCase();

  return ['paid', 'verified', 'completed', 'success', 'successful'].includes(status);
}

export function getReservationPaidAmount(booking) {
  return isReservationPaid(booking) ? getReservationFee(booking) : 0;
}

export function formatModulePaymentStatus(status) {
  return formatStatus(status || 'unpaid');
}

export const MODULE_PAYMENT_STYLES = {
  paid:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  verified:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  completed:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  unpaid:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  checkout_created:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  pending_payment:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  pending_verification:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  partially_paid:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  partial:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  failed:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  expired:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
  cancelled:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  canceled:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  refunded:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
};

export function ModulePaymentBadge({ status }) {
  const paymentStatus = String(status || 'unpaid').toLowerCase();

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${
        MODULE_PAYMENT_STYLES[paymentStatus] || MODULE_PAYMENT_STYLES.unpaid
      }`}
    >
      {paymentStatus === 'paid' ? 'Reservation Paid' : formatModulePaymentStatus(paymentStatus)}
    </span>
  );
}

export function getLatestOnlinePayment(paymentList = []) {
  if (!Array.isArray(paymentList) || paymentList.length === 0) return null;

  const sorted = [...paymentList].sort((a, b) => {
    const dateA = new Date(a?.paid_at || a?.created_at || 0).getTime();
    const dateB = new Date(b?.paid_at || b?.created_at || 0).getTime();

    return dateA - dateB;
  });

  return sorted[sorted.length - 1] || null;
}

export function getOnlinePaymentReference(booking, latestPayment) {
  return sanitizePlainText(
    latestPayment?.reference_number ||
      latestPayment?.provider_payment_id ||
      booking?.payment_reference ||
      booking?.paymongo_checkout_session_id ||
      '—',
    120
  );
}

export function Banner({ message }) {
  if (!message) return null;

  const text = String(message || '');
  const isError = text.startsWith('Error') || text.startsWith('❌');

  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
        isError
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
          : 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
      }`}
    >
      <span className="mt-0.5">{isError ? '⚠️' : '✅'}</span>
      <span>{isError ? text.replace(/^Error:\s*/, '') : text}</span>
    </div>
  );
}

export function StepHeader({ number, title, sub }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-xs font-black text-white shadow-lg shadow-primary-600/20">
        {number}
      </div>
      <div>
        <p className="text-sm font-black text-gray-950 dark:text-white">{title}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export function Section({ children, className = '' }) {
  return (
    <section
      className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800 ${className}`}
    >
      {children}
    </section>
  );
}

export function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    red: 'text-red-600 dark:text-red-300',
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>{value}</p>
    </div>
  );
}

export function CustomerAvatar({ profile }) {
  if (profile?.profile_photo_url) {
    return (
      <img
        src={profile.profile_photo_url}
        alt={getCustomerName(profile)}
        className="h-12 w-12 flex-shrink-0 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700"
      />
    );
  }

  const initials = `${profile?.first_name?.[0] || '?'}${profile?.last_name?.[0] || ''}`.toUpperCase();

  return (
    <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-sm font-black text-white shadow-sm shadow-primary-600/20">
      {initials}
    </div>
  );
}

export function PaymentMethodPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PAYMENT_METHODS.map((method) => (
        <button
          key={method.id}
          type="button"
          onClick={() => onChange?.(method.id)}
          className={`flex flex-col items-center rounded-2xl border py-3 text-xs font-black transition ${
            value === method.id
              ? 'border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-600/20'
              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400'
          }`}
        >
          <span className="mb-1 text-lg">{method.icon}</span>
          {method.label}
        </button>
      ))}
    </div>
  );
}

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const safePage = Math.min(Math.max(Number(page) || 1, 1), Math.max(Number(totalPages) || 1, 1));
  const safeTotalPages = Math.max(Number(totalPages) || 1, 1);
  const safeTotalItems = Math.max(Number(totalItems) || 0, 0);
  const safePageSize = PAGE_SIZE_OPTIONS.includes(Number(pageSize)) ? Number(pageSize) : 10;

  if (safeTotalItems === 0) return null;

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Page {safePage} of {safeTotalPages} · {safeTotalItems} record(s)
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={safePageSize}
          onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
          className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 outline-none transition focus:border-primary-500 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} / page
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onPageChange?.(safePage - 1)}
          disabled={safePage <= 1}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
        >
          Previous
        </button>

        <button
          type="button"
          onClick={() => onPageChange?.(safePage + 1)}
          disabled={safePage >= safeTotalPages}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
