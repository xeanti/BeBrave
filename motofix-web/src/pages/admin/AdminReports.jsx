import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { summarizePayments } from '../../lib/payments';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return '—';

  const str = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

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

function formatTime(time) {
  if (!time) return '—';

  const normalized = String(time).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function getCustomerName(row) {
  if (row?.walkin_customer_name) {
    return row.walkin_customer_name;
  }

  if (row?.guest_name) {
    return row.guest_name;
  }

  const profile = row?.profiles || row?.customer || row;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  if (name) return name;

  if (row?.walkin_customer_phone) {
    return `Guest ${row.walkin_customer_phone}`;
  }

  if (profile?.phone) {
    return `Customer ${profile.phone}`;
  }

  if (profile?.email) {
    return profile.email;
  }

  return 'Guest Customer';
}

function getCustomerContact(row) {
  const profile = row?.profiles || row?.customer || row;

  return (
    row?.walkin_customer_phone ||
    profile?.phone ||
    profile?.email ||
    'Guest customer'
  );
}

function getMechanicName(booking) {
  const name = `${booking.mechanic?.first_name || ''} ${booking.mechanic?.last_name || ''}`.trim();
  return name || 'Unassigned';
}

function getBookingTotal(booking) {
  const savedTotal = Number(booking?.total_amount) || 0;
  if (savedTotal > 0) return savedTotal;

  const savedServiceTotal = Number(booking?.service_total) || 0;
  if (savedServiceTotal > 0) return savedServiceTotal;

  return (Number(booking?.services?.base_price) || 0) + (Number(booking?.services?.labor_cost) || 0);
}

function getOrderItemsLabel(order) {
  const items = order.order_items || [];

  if (!items.length) return 'No items';

  return items
    .map((item) => `${item.parts?.name || 'Product'} × ${item.quantity}`)
    .join(', ');
}

function getPaymentRecordAmount(payment) {
  return Number(
    payment?.amount ??
      payment?.amount_paid ??
      payment?.paid_amount ??
      payment?.total_paid ??
      payment?.payment_amount ??
      payment?.total_amount ??
      payment?.amount_received ??
      payment?.cash_received ??
      0
  );
}

function isPaidPaymentRecord(payment) {
  const statusValues = [
    payment?.status,
    payment?.payment_status,
    payment?.receipt_status,
  ]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);

  if (!statusValues.length) return true;

  const paidStatuses = [
    'paid',
    'succeeded',
    'success',
    'completed',
    'confirmed',
    'verified',
    'issued',
    'settled',
    'captured',
  ];

  const blockedStatuses = [
    'unpaid',
    'checkout_created',
    'pending',
    'pending_payment',
    'pending_verification',
    'failed',
    'expired',
    'cancelled',
    'canceled',
    'refunded',
    'void',
  ];

  if (statusValues.some((status) => paidStatuses.includes(status))) return true;
  if (statusValues.some((status) => blockedStatuses.includes(status))) return false;

  return Boolean(normalizeReceiptNumber(payment) && getPaymentRecordAmount(payment) > 0);
}

function normalizeReceiptNumber(payment) {
  return (
    payment?.receipt_number ||
    payment?.reference_number ||
    payment?.payment_reference ||
    payment?.provider_checkout_session_id ||
    payment?.checkout_session_id ||
    payment?.id?.slice?.(0, 8) ||
    ''
  );
}

function getServiceLabelFromList(value) {
  if (!Array.isArray(value) || value.length === 0) return '';

  return value
    .map((item) => item?.service_name || item?.name || item?.title)
    .filter(Boolean)
    .join(', ');
}

function getBookingServiceLabel(booking) {
  return (
    booking?.services_summary ||
    getServiceLabelFromList(booking?.booking_services) ||
    booking?.services?.name ||
    '—'
  );
}

function getWalkinServiceLabel(queueItem) {
  return (
    getServiceLabelFromList(queueItem?.services) ||
    queueItem?.services_summary ||
    'Walk-in Service'
  );
}

function getWalkinProductLabel(queueItem) {
  const products = Array.isArray(queueItem?.products) ? queueItem.products : [];

  if (!products.length) return 'No products';

  return products
    .map((item) => `${item.name || 'Product'} × ${item.quantity || 1}`)
    .join(', ');
}

const STATUS_STYLES = {
  confirmed:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  pending:
    'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  in_progress:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  completed:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  cancelled:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  preparing:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  ready:
    'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25',
  returned:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
};

const ACTION_STYLES = {
  DELETE:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  CREATE:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  INSERT:
    'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  UPDATE:
    'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  PAYMENT:
    'bg-accent-500/10 text-accent-600 ring-accent-500/25 dark:text-accent-400',
  EXPORT:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  PRINT:
    'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  DEFAULT:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const AUDIT_LOG_LIMIT = 1000;

function sanitizePlainText(value, maxLength = 160) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeSearchText(value) {
  return sanitizePlainText(value, 120);
}

function sanitizeDateInput(value) {
  const text = String(value || '').trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function getDateBoundary(value, endOfDay = false) {
  const cleanDate = sanitizeDateInput(value);

  if (!cleanDate) return null;

  const date = new Date(`${cleanDate}T${endOfDay ? '23:59:59' : '00:00:00'}`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateRangeInvalid(from, to) {
  const start = getDateBoundary(from);
  const end = getDateBoundary(to, true);

  return Boolean(start && end && start > end);
}

function getSafeDateRangeLabel(from, to) {
  return `${sanitizeDateInput(from) || 'All'} to ${sanitizeDateInput(to) || 'Present'}`;
}

function sanitizeFilename(value) {
  const text = sanitizePlainText(value, 180).replace(/[\\/:*?"<>|]+/g, '-');

  return text || 'MotoFix Report.csv';
}

function normalizePageSize(value) {
  const size = Number(value);

  return PAGE_SIZE_OPTIONS.includes(size) ? size : 25;
}

function buildSearchText(values) {
  return values
    .map((value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
    .join(' ')
    .toLowerCase();
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {String(status || 'pending').replace('_', ' ')}
    </span>
  );
}

function ActionBadge({ action }) {
  const key = Object.keys(ACTION_STYLES).find((item) => item !== 'DEFAULT' && String(action || '').includes(item));
  const classes = ACTION_STYLES[key] || ACTION_STYLES.DEFAULT;

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classes}`}>
      {action || 'ACTION'}
    </span>
  );
}

function humanizeAuditKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeAuditValue(value) {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (typeof value === 'number') return String(value);

  if (Array.isArray(value)) {
    if (!value.length) return 'None';

    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const name =
            item.name ||
            item.part_name ||
            item.product_name ||
            item.service_name ||
            item.title;
          const quantity = item.quantity ?? item.qty;

          if (name && quantity !== undefined) return `${name} × ${quantity}`;
          if (name) return String(name);

          return Object.entries(item)
            .map(([key, val]) => `${humanizeAuditKey(key)}: ${humanizeAuditValue(val)}`)
            .join(', ');
        }

        return String(item);
      })
      .join(', ');
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => `${humanizeAuditKey(key)}: ${humanizeAuditValue(val)}`)
      .join(', ');
  }

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return formatDateTime(text);
  }

  return text.replace(/_/g, ' ');
}

function getAuditSummary(log) {
  const action = String(log?.action || '').toLowerCase();
  const entity = String(log?.entity || '').toLowerCase();
  const details = log?.details || {};

  if (!details || typeof details !== 'object') {
    return 'No extra details';
  }

  if (action.includes('inventory_stock_adjusted')) {
    const reason = details.reason || 'Stock adjusted';
    const quantity = details.quantity ?? details.qty ?? details.stock_quantity;
    const previousStock =
      details.previous_stock_quantity ??
      details.previous_stock ??
      details.old_stock ??
      details.from;
    const newStock =
      details.new_stock_quantity ??
      details.new_stock ??
      details.current_stock ??
      details.to;
    const product =
      details.product_name ||
      details.part_name ||
      details.name ||
      details.product ||
      details.part;

    const pieces = [reason];

    if (product) pieces.push(`Product: ${product}`);
    if (quantity !== undefined) pieces.push(`Quantity: ${quantity}`);
    if (previousStock !== undefined && newStock !== undefined) {
      pieces.push(`Stock: ${previousStock} → ${newStock}`);
    }

    return pieces.join(' • ');
  }

  if ((action.includes('create') || action.includes('insert')) && entity === 'parts') {
    return `Created product${details.name ? `: ${details.name}` : ''}`;
  }

  if (action.includes('update') && entity === 'parts') {
    const productName = details.name || details.product_name || details.part_name;
    const previousStock = details.previous_stock_quantity ?? details.previous_stock;
    const newStock = details.new_stock_quantity ?? details.new_stock;

    if (previousStock !== undefined && newStock !== undefined) {
      return `Updated product${productName ? `: ${productName}` : ''} • Stock: ${previousStock} → ${newStock}`;
    }

    return `Updated product${productName ? `: ${productName}` : ''}`;
  }

  if (action.includes('deactivate')) {
    return `Deactivated${details.name ? `: ${details.name}` : ''}`;
  }

  if (action.includes('reactivate')) {
    return `Reactivated${details.name ? `: ${details.name}` : ''}`;
  }

  if (action.includes('payment')) {
    const amount = details.amount ? formatPeso(details.amount) : '';
    const method = details.method ? humanizeAuditValue(details.method) : '';
    const type = details.payment_type ? humanizeAuditValue(details.payment_type) : '';

    return [type, amount, method].filter(Boolean).join(' • ') || 'Payment record updated';
  }

  if (action.includes('return_order')) {
    const items = Array.isArray(details.items)
      ? details.items
          .map((item) => `${item.name || item.part_id || 'Product'} × ${item.quantity || 0}`)
          .join(', ')
      : '';

    return items ? `Returned to inventory: ${items}` : 'Order returned to inventory';
  }

  if (action.includes('export')) {
    const rows = details.rows !== undefined ? `${details.rows} row(s)` : '';
    const tab = details.active_tab ? `Report: ${humanizeAuditValue(details.active_tab)}` : '';

    return [tab, rows].filter(Boolean).join(' • ') || 'CSV exported';
  }

  if (action.includes('print')) {
    return details.active_tab ? `Printed ${humanizeAuditValue(details.active_tab)} report` : 'Report printed';
  }

  const entries = Object.entries(details);

  if (!entries.length) return 'No extra details';

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${humanizeAuditKey(key)}: ${humanizeAuditValue(value)}`)
    .join(' • ');
}

function AuditDetails({ log }) {
  const details = log?.details || {};
  const entries = Object.entries(details || {});
  const summary = getAuditSummary(log);

  if (!entries.length) {
    return <span className="text-xs font-semibold text-gray-400">—</span>;
  }

  return (
    <details className="group max-w-lg">
      <summary className="cursor-pointer list-none">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 transition group-open:border-primary-100 group-open:bg-primary-50/60 dark:border-dark-700 dark:bg-dark-900/70 dark:group-open:border-primary-500/25 dark:group-open:bg-primary-500/10">
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 text-xs font-bold leading-5 text-gray-700 dark:text-gray-300">
              {summary}
            </p>

            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-gray-500 ring-1 ring-gray-200 group-open:hidden dark:bg-dark-800 dark:text-gray-400 dark:ring-dark-700">
              View
            </span>
            <span className="hidden shrink-0 rounded-full bg-primary-600 px-2 py-1 text-[10px] font-black text-white group-open:inline-flex">
              Hide
            </span>
          </div>
        </div>
      </summary>

      <div className="mt-2 grid gap-2 rounded-2xl border border-gray-100 bg-white p-3 dark:border-dark-700 dark:bg-dark-800">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="grid gap-1 rounded-xl bg-gray-50 px-3 py-2 dark:bg-dark-900/70"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
              {humanizeAuditKey(key)}
            </p>
            <p className="break-words text-xs font-bold leading-5 text-gray-700 dark:text-gray-300">
              {humanizeAuditValue(value)}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function PaymentBadge({ isFullyPaid, balance }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${
        isFullyPaid
          ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
          : 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25'
      }`}
    >
      {isFullyPaid ? 'Paid' : formatPeso(balance)}
    </span>
  );
}


function ReceiptNumberList({ payments }) {
  const receiptNumbers = (payments || [])
    .map(normalizeReceiptNumber)
    .filter(Boolean);

  if (!receiptNumbers.length) {
    return <span className="text-xs font-semibold text-gray-400">—</span>;
  }

  return (
    <div className="flex max-w-xs flex-wrap gap-1.5">
      {receiptNumbers.slice(0, 3).map((receiptNumber) => (
        <span
          key={receiptNumber}
          className="rounded-full bg-primary-50 px-2.5 py-1 font-mono text-[11px] font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25"
        >
          {receiptNumber}
        </span>
      ))}
      {receiptNumbers.length > 3 && (
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-black text-gray-500 ring-1 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25">
          +{receiptNumbers.length - 3} more
        </span>
      )}
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
    blue: 'text-blue-600 dark:text-blue-300',
    purple: 'text-purple-600 dark:text-purple-300',
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

function TableShell({
  title,
  count,
  pageSize,
  onPageSizeChange,
  page,
  totalPages,
  startIndex,
  endIndex,
  onFirst,
  onPrev,
  onNext,
  onLast,
  children,
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-700">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
            {title} <span className="text-gray-400">({count})</span>
          </h2>
          <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
            Showing {count === 0 ? 0 : startIndex + 1}–{Math.min(endIndex, count)} of {count}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Rows
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onFirst}
            disabled={page <= 1}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
          >
            First
          </button>

          <button
            type="button"
            onClick={onPrev}
            disabled={page <= 1}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
          >
            Prev
          </button>

          <span className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 dark:bg-dark-900 dark:text-gray-300">
            {page} / {totalPages}
          </span>

          <button
            type="button"
            onClick={onNext}
            disabled={page >= totalPages}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
          >
            Next
          </button>

          <button
            type="button"
            onClick={onLast}
            disabled={page >= totalPages}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
          >
            Last
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {children}
      </div>
    </section>
  );
}

function EmptyTable({ text }) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary-50 text-3xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
        📄
      </div>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
        {text}
      </p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="h-20 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function AdminReports() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [walkinQueue, setWalkinQueue] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const [bookingPayments, setBookingPayments] = useState({});
  const [orderPayments, setOrderPayments] = useState({});
  const [walkinPayments, setWalkinPayments] = useState({});

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [toast, setToast] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const printRef = useRef(null);

  useEffect(() => {
    fetchAll();

    /*
      Realtime refresh for reports.
      Enable Realtime in Supabase for bookings, orders, payments, audit_logs, order_items,
      services, profiles, and parts for the most complete live reports.
    */
    const tables = [
      'bookings',
      'orders',
      'payments',
      'booking_payments',
      'walkin_queue',
      'walkin_queue_payments',
      'audit_logs',
      'order_items',
      'services',
      'profiles',
      'parts',
    ];

    const channels = tables.map((table) =>
      supabase
        .channel(`admin-reports-${table}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          () => fetchAll(false)
        )
        .subscribe()
    );

    const handleFocus = () => fetchAll(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchAll(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timeout = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, dateFrom, dateTo, search, sortField, sortDirection, pageSize]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function sortRows(rows, accessors) {
    if (!sortField || !accessors[sortField]) return rows;

    const getValue = accessors[sortField];

    const sorted = [...rows].sort((a, b) => {
      const valueA = getValue(a);
      const valueB = getValue(b);

      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return 1;
      if (valueB == null) return -1;

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return valueA - valueB;
      }

      return String(valueA).localeCompare(String(valueB), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }

  function SortHeader({ field, label, className = '' }) {
    const active = sortField === field;

    return (
      <th
        onClick={() => handleSort(field)}
        className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-gray-500 transition hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 ${className}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-300 dark:text-gray-600'}>
            {active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </span>
      </th>
    );
  }

  async function fetchAll(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    try {
      const [bookingResult, orderResult, walkinResult, auditResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(`
            *,
            services(name, base_price, labor_cost),
            booking_services(service_name, base_price, labor_cost, quantity),
            profiles!bookings_customer_id_fkey(first_name, last_name, email, phone),
            mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('orders')
          .select(`
            *,
            profiles!orders_customer_id_fkey(first_name, last_name, email, phone),
            order_items(quantity, unit_price, subtotal, parts(name))
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('walkin_queue')
          .select(`
            *,
            profiles!walkin_queue_customer_id_fkey(first_name, last_name, email, phone),
            mechanic:profiles!walkin_queue_mechanic_id_fkey(first_name, last_name)
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('audit_logs')
          .select('*, profiles!audit_logs_performed_by_fkey(first_name, last_name, email, role)')
          .order('created_at', { ascending: false })
          .limit(AUDIT_LOG_LIMIT),
      ]);

      const firstError = [bookingResult, orderResult, walkinResult, auditResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const bookingRows = bookingResult.data || [];
      const orderRows = orderResult.data || [];
      const walkinRows = walkinResult.data || [];

      setBookings(bookingRows);
      setOrders(orderRows);
      setWalkinQueue(walkinRows);
      setAuditLogs(auditResult.data || []);

      const allPayments = await fetchReportPayments({
        bookingIds: bookingRows.map((booking) => booking.id),
        orderIds: orderRows.map((order) => order.id),
        walkinIds: walkinRows.map((item) => item.id),
      });

      const groupedBookingPayments = {};
      const groupedOrderPayments = {};
      const groupedWalkinPayments = {};

      (allPayments || []).forEach((payment) => {
        if (payment.booking_id) {
          if (!groupedBookingPayments[payment.booking_id]) {
            groupedBookingPayments[payment.booking_id] = [];
          }
          groupedBookingPayments[payment.booking_id].push(payment);
        }

        if (payment.order_id) {
          if (!groupedOrderPayments[payment.order_id]) {
            groupedOrderPayments[payment.order_id] = [];
          }
          groupedOrderPayments[payment.order_id].push(payment);
        }

        if (payment.walkin_queue_id) {
          if (!groupedWalkinPayments[payment.walkin_queue_id]) {
            groupedWalkinPayments[payment.walkin_queue_id] = [];
          }
          groupedWalkinPayments[payment.walkin_queue_id].push(payment);
        }
      });

      setBookingPayments(groupedBookingPayments);
      setOrderPayments(groupedOrderPayments);
      setWalkinPayments(groupedWalkinPayments);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }

  function filterByDate(items, dateField = 'created_at') {
    const start = getDateBoundary(dateFrom);
    const end = getDateBoundary(dateTo, true);

    if (isDateRangeInvalid(dateFrom, dateTo)) return [];

    return items.filter((item) => {
      const raw = item?.[dateField] || item?.created_at;

      if (!raw) return false;

      const date = new Date(raw);

      if (Number.isNaN(date.getTime())) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;

      return true;
    });
  }

  async function fetchReportPayments({ bookingIds = [], orderIds = [], walkinIds = [] }) {
    const selectFields = `
      *,
      profiles!payments_processed_by_fkey(first_name, last_name, email, role)
    `;

    const results = [];

    if (bookingIds.length) {
      const { data, error } = await supabase
        .from('payments')
        .select(selectFields)
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: true });

      if (error) throw error;
      results.push(...(data || []));
    }

    if (bookingIds.length) {
      const { data, error } = await supabase
        .from('booking_payments')
        .select('*')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('booking_payments report fetch skipped:', error.message);
      } else {
        results.push(
          ...(data || []).map((payment) => ({
            ...payment,
            amount: Number(payment.amount) || 0,
            payment_type: 'reservation_fee',
            payment_method: payment.payment_method || 'paymongo_qrph',
            receipt_number: payment.reference_number || payment.provider_checkout_session_id || payment.id?.slice(0, 8),
            receipt_issued_at: payment.paid_at || payment.created_at,
            created_at: payment.paid_at || payment.created_at,
            profiles: null,
          }))
        );
      }
    }

    if (orderIds.length) {
      const { data, error } = await supabase
        .from('payments')
        .select(selectFields)
        .in('order_id', orderIds)
        .order('created_at', { ascending: true });

      if (error) throw error;
      results.push(...(data || []));
    }

    if (walkinIds.length) {
      const { data, error } = await supabase
        .from('walkin_queue_payments')
        .select('*')
        .in('walkin_queue_id', walkinIds)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('walkin_queue_payments report fetch skipped:', error.message);
      } else {
        results.push(
          ...(data || []).map((payment) => ({
            ...payment,
            amount: Number(payment.amount) || 0,
            payment_type: payment.payment_type || 'walkin_payment',
            payment_method: payment.method || payment.payment_method || 'cash',
            receipt_number: payment.receipt_number || payment.reference_number || payment.id?.slice(0, 8),
            receipt_issued_at: payment.receipt_issued_at || payment.created_at,
            created_at: payment.receipt_issued_at || payment.created_at,
            profiles: null,
          }))
        );
      }
    }

    return results;
  }

  function getPaymentInfo(records, recordId, total, record = null) {
    const list = records[recordId] || [];
    const paidList = list.filter(isPaidPaymentRecord);
    const recordPaymentStatus = String(record?.payment_status || '').toLowerCase();
    const recordStatus = String(record?.status || '').toLowerCase();

    const paidSum = paidList.reduce(
      (sum, payment) => sum + getPaymentRecordAmount(payment),
      0
    );

    /*
      Some POS/counter-sale receipts are already marked as issued/paid,
      but the amount field can be missing or stored under a different column.
      If a receipt exists and the order/queue/booking is marked paid, use the
      record total as the paid amount so the report will not show a false balance.
    */
    const hasReceipt = list.some((payment) => normalizeReceiptNumber(payment));
    const hasIssuedReceipt = list.some((payment) => {
      const receiptStatus = String(payment?.receipt_status || payment?.status || '').toLowerCase();

      return normalizeReceiptNumber(payment) &&
        ['issued', 'paid', 'verified', 'confirmed', 'completed'].includes(receiptStatus);
    });

    const shouldUseRecordTotal =
      paidSum <= 0 &&
      Number(total) > 0 &&
      (recordPaymentStatus === 'paid' ||
        recordStatus === 'completed' ||
        paidList.length > 0 ||
        hasIssuedReceipt ||
        hasReceipt);

    const totalPaid = shouldUseRecordTotal ? Number(total) || 0 : paidSum;

    const isReturnedOrCancelled = ['returned', 'cancelled', 'refunded'].includes(recordStatus);

    const balance = isReturnedOrCancelled
      ? 0
      : Math.max((Number(total) || 0) - totalPaid, 0);

    const isFullyPaid =
      Number(total) > 0 &&
      (balance <= 0 || recordPaymentStatus === 'paid' || shouldUseRecordTotal || hasIssuedReceipt);

    const last = paidList.length ? paidList[paidList.length - 1] : list.length ? list[list.length - 1] : null;

    const lastProcessedBy = last?.profiles
      ? `${last.profiles.first_name || ''} ${last.profiles.last_name || ''}`.trim()
      : last
      ? 'System / Staff'
      : recordPaymentStatus === 'paid'
      ? 'System'
      : '—';

    const receiptNumbers = list
      .map(normalizeReceiptNumber)
      .filter(Boolean);

    const receiptSummary = receiptNumbers.length ? receiptNumbers.join(', ') : '—';
    const lastReceiptNumber = normalizeReceiptNumber(last) || '—';
    const lastReceiptStatus = last?.receipt_status || last?.status || recordPaymentStatus || '—';
    const lastReceiptIssuedAt = last?.receipt_issued_at || last?.paid_at || last?.created_at || null;

    return {
      totalPaid,
      balance,
      isFullyPaid,
      lastProcessedBy,
      receiptNumbers,
      receiptSummary,
      lastReceiptNumber,
      lastReceiptStatus,
      lastReceiptIssuedAt,
    };
  }

  function escapeCSVValue(value) {
    if (value == null) return '';

    let text = value;

    if (typeof text === 'object') text = JSON.stringify(text);

    const str = String(text);

    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  function getReportFilename(reportType) {
    return sanitizeFilename(
      `MotoFix ${reportType} Report ${getSafeDateRangeLabel(dateFrom, dateTo)}.csv`
    );
  }

  async function logReportAction(action, entity, details = {}) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity,
      performed_by: user.id,
      details,
    });
  }

  function downloadCSV(data, filename, reportTitle) {
    if (isDateRangeInvalid(dateFrom, dateTo)) {
      setToast('Invalid date range. The From date must be before the To date.');
      return;
    }

    if (!data.length) {
      setToast('No rows to export.');
      return;
    }

    const confirmed = window.confirm(
      `Export ${data.length} row${data.length === 1 ? '' : 's'} from ${reportTitle}?`
    );

    if (!confirmed) return;

    const headers = Object.keys(data[0]);
    const headerLabels = headers.map((header) =>
      header.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    );

    const lines = [];

    lines.push(escapeCSVValue(reportTitle));
    lines.push(escapeCSVValue(`Date Range: ${getSafeDateRangeLabel(dateFrom, dateTo)}`));
    lines.push(escapeCSVValue(`Generated: ${new Date().toLocaleString('en-PH')}`));
    lines.push('');
    lines.push(headerLabels.map(escapeCSVValue).join(','));

    data.forEach((row) => {
      lines.push(headers.map((header) => escapeCSVValue(row[header])).join(','));
    });

    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = sanitizeFilename(filename);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    logReportAction('EXPORT_CSV', 'reports', {
      filename: sanitizeFilename(filename),
      rows: data.length,
      active_tab: activeTab,
      date_from: sanitizeDateInput(dateFrom) || null,
      date_to: sanitizeDateInput(dateTo) || null,
    });

    setToast(`Exported ${data.length} rows.`);
  }

  function handleExport() {
    if (isDateRangeInvalid(dateFrom, dateTo)) {
      setToast('Invalid date range. The From date must be before the To date.');
      return;
    }

    if (activeTab === 'bookings') {
      downloadCSV(
        filteredBookings.map((booking) => {
          const total = getBookingTotal(booking);
          const info = getPaymentInfo(bookingPayments, booking.id, total, booking);

          return {
            id: booking.id?.slice(0, 8),
            customer: getCustomerName(booking),
            contact: getCustomerContact(booking),
            service: getBookingServiceLabel(booking),
            date: booking.booking_date,
            time: formatTime(booking.booking_time),
            status: booking.status,
            mechanic: getMechanicName(booking),
            service_total: total.toFixed(2),
            total_paid: info.totalPaid.toFixed(2),
            balance: info.balance.toFixed(2),
            payment_status: info.isFullyPaid ? 'Fully Paid' : 'Partial/Unpaid',
            receipt_numbers: info.receiptSummary,
            last_receipt_number: info.lastReceiptNumber,
            last_receipt_issued_at: info.lastReceiptIssuedAt ? formatDateTime(info.lastReceiptIssuedAt) : '',
            processed_by: info.lastProcessedBy,
          };
        }),
        getReportFilename('Bookings'),
        'MotoFix Bookings Report'
      );

      return;
    }

    if (activeTab === 'orders') {
      downloadCSV(
        filteredOrders.map((order) => {
          const info = getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order);

          return {
            id: order.id?.slice(0, 8),
            customer: getCustomerName(order),
            contact: getCustomerContact(order),
            items: getOrderItemsLabel(order),
            total: Number(order.total_amount || 0).toFixed(2),
            status: order.status,
            total_paid: info.totalPaid.toFixed(2),
            balance: info.balance.toFixed(2),
            payment_status: info.isFullyPaid ? 'Fully Paid' : 'Partial/Unpaid',
            receipt_numbers: info.receiptSummary,
            last_receipt_number: info.lastReceiptNumber,
            last_receipt_issued_at: info.lastReceiptIssuedAt ? formatDateTime(info.lastReceiptIssuedAt) : '',
            processed_by: info.lastProcessedBy,
            date: formatDate(order.created_at),
          };
        }),
        getReportFilename('Orders'),
        'MotoFix Orders Report'
      );

      return;
    }

    if (activeTab === 'walkins') {
      downloadCSV(
        filteredWalkins.map((item) => {
          const total = Number(item.total_amount) || 0;
          const info = getPaymentInfo(walkinPayments, item.id, total, item);

          return {
            id: item.id?.slice(0, 8),
            queue_number: item.queue_number,
            customer: getCustomerName(item),
            contact: getCustomerContact(item),
            motorcycle_model: item.motorcycle_model || '',
            services: getWalkinServiceLabel(item),
            products: getWalkinProductLabel(item),
            total: total.toFixed(2),
            status: item.status,
            total_paid: info.totalPaid.toFixed(2),
            balance: info.balance.toFixed(2),
            payment_status: info.isFullyPaid ? 'Fully Paid' : 'Partial/Unpaid',
            receipt_numbers: info.receiptSummary,
            last_receipt_number: info.lastReceiptNumber,
            last_receipt_issued_at: info.lastReceiptIssuedAt ? formatDateTime(info.lastReceiptIssuedAt) : '',
            processed_by: info.lastProcessedBy,
            date: formatDate(item.queue_date || item.created_at),
          };
        }),
        getReportFilename('Walk-ins'),
        'MotoFix Walk-in Queue Report'
      );

      return;
    }

    downloadCSV(
      filteredAuditLogs.map((log) => ({
        id: log.id?.slice(0, 8),
        action: log.action,
        entity: log.entity,
        performed_by: log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'System',
        role: log.profiles?.role || '',
        date: formatDateTime(log.created_at),
        details: getAuditSummary(log),
        raw_details: JSON.stringify(log.details || {}),
      })),
      getReportFilename('Audit Log'),
      'MotoFix Audit Log'
    );
  }

  function handlePrint() {
    if (isDateRangeInvalid(dateFrom, dateTo)) {
      setToast('Invalid date range. The From date must be before the To date.');
      return;
    }

    const confirmed = window.confirm(
      `Print the ${activeTab === 'audit' ? 'Audit Logs' : activeTab} report?`
    );

    if (!confirmed) return;

    window.print();

    logReportAction('PRINT_REPORT', 'reports', {
      active_tab: activeTab,
      date_from: sanitizeDateInput(dateFrom) || null,
      date_to: sanitizeDateInput(dateTo) || null,
    });
  }

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setCurrentPage(1);
  }

  function tabButton(tab) {
    const active = activeTab === tab;

    return (
      <button
        key={tab}
        type="button"
        onClick={() => {
          setActiveTab(tab);
          setSortField(null);
          setSortDirection('asc');
          setCurrentPage(1);
        }}
        className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
          active
            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
        }`}
      >
        {tab === 'audit' ? 'Audit Logs' : tab === 'walkins' ? 'Walk-ins' : tab}
      </button>
    );
  }

  const bookingAccessors = {
    customer: (booking) => getCustomerName(booking),
    service: (booking) => booking.services?.name || '',
    date: (booking) => booking.booking_date || '',
    time: (booking) => booking.booking_time || '',
    mechanic: (booking) => getMechanicName(booking),
    status: (booking) => booking.status || '',
    total: (booking) => getBookingTotal(booking),
    paid: (booking) => getPaymentInfo(bookingPayments, booking.id, getBookingTotal(booking)).totalPaid,
    receipt: (booking) => getPaymentInfo(bookingPayments, booking.id, getBookingTotal(booking)).receiptSummary,
    balance: (booking) => getPaymentInfo(bookingPayments, booking.id, getBookingTotal(booking)).balance,
    processed_by: (booking) => getPaymentInfo(bookingPayments, booking.id, getBookingTotal(booking)).lastProcessedBy,
  };

  const orderAccessors = {
    customer: (order) => getCustomerName(order),
    total: (order) => Number(order.total_amount) || 0,
    paid: (order) => getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order).totalPaid,
    receipt: (order) => getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order).receiptSummary,
    balance: (order) => getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order).balance,
    status: (order) => order.status || '',
    processed_by: (order) => getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order).lastProcessedBy,
    date: (order) => order.created_at || '',
  };

  const walkinAccessors = {
    queue_number: (item) => item.queue_number || '',
    customer: (item) => getCustomerName(item),
    service: (item) => getWalkinServiceLabel(item),
    total: (item) => Number(item.total_amount) || 0,
    paid: (item) => getPaymentInfo(walkinPayments, item.id, Number(item.total_amount) || 0, item).totalPaid,
    receipt: (item) => getPaymentInfo(walkinPayments, item.id, Number(item.total_amount) || 0, item).receiptSummary,
    balance: (item) => getPaymentInfo(walkinPayments, item.id, Number(item.total_amount) || 0, item).balance,
    status: (item) => item.status || '',
    date: (item) => item.queue_date || item.created_at || '',
  };

  const auditAccessors = {
    time: (log) => log.created_at || '',
    action: (log) => log.action || '',
    entity: (log) => log.entity || '',
    performed_by: (log) =>
      log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'System',
    role: (log) => log.profiles?.role || '',
  };

  const filteredBookings = useMemo(() => {
    const query = sanitizeSearchText(search).toLowerCase();

    const dateFiltered = filterByDate(bookings, 'booking_date');

    const searched = dateFiltered.filter((booking) => {
      const total = getBookingTotal(booking);
      const info = getPaymentInfo(bookingPayments, booking.id, total, booking);
      const haystack = buildSearchText([
        booking.id,
        getCustomerName(booking),
        booking.profiles?.email,
        booking.profiles?.phone,
        booking.walkin_customer_phone,
        getBookingServiceLabel(booking),
        getMechanicName(booking),
        booking.status,
        info.lastProcessedBy,
        info.receiptSummary,
        info.lastReceiptNumber,
      ]);

      return !query || haystack.includes(query);
    });

    return sortRows(searched, bookingAccessors);
  }, [bookings, bookingPayments, dateFrom, dateTo, search, sortField, sortDirection]);

  const filteredOrders = useMemo(() => {
    const query = sanitizeSearchText(search).toLowerCase();

    const dateFiltered = filterByDate(orders);

    const searched = dateFiltered.filter((order) => {
      const info = getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order);
      const haystack = buildSearchText([
        order.id,
        getCustomerName(order),
        order.profiles?.email,
        order.profiles?.phone,
        order.walkin_customer_phone,
        getOrderItemsLabel(order),
        order.status,
        info.lastProcessedBy,
        info.receiptSummary,
        info.lastReceiptNumber,
      ]);

      return !query || haystack.includes(query);
    });

    return sortRows(searched, orderAccessors);
  }, [orders, orderPayments, dateFrom, dateTo, search, sortField, sortDirection]);

  const filteredWalkins = useMemo(() => {
    const query = sanitizeSearchText(search).toLowerCase();

    const dateFiltered = filterByDate(walkinQueue, 'queue_date');

    const searched = dateFiltered.filter((item) => {
      const info = getPaymentInfo(walkinPayments, item.id, Number(item.total_amount) || 0, item);
      const haystack = buildSearchText([
        item.id,
        item.queue_number,
        getCustomerName(item),
        getCustomerContact(item),
        item.motorcycle_model,
        getWalkinServiceLabel(item),
        getWalkinProductLabel(item),
        item.status,
        item.payment_status,
        info.lastProcessedBy,
        info.receiptSummary,
        info.lastReceiptNumber,
      ]);

      return !query || haystack.includes(query);
    });

    return sortRows(searched, walkinAccessors);
  }, [walkinQueue, walkinPayments, dateFrom, dateTo, search, sortField, sortDirection]);

  const filteredAuditLogs = useMemo(() => {
    const query = sanitizeSearchText(search).toLowerCase();

    const dateFiltered = filterByDate(auditLogs);

    const searched = dateFiltered.filter((log) => {
      const haystack = buildSearchText([
        log.id,
        log.action,
        log.entity,
        log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'System',
        log.profiles?.email,
        log.profiles?.role,
        JSON.stringify(log.details || {}),
      ]);

      return !query || haystack.includes(query);
    });

    return sortRows(searched, auditAccessors);
  }, [auditLogs, dateFrom, dateTo, search, sortField, sortDirection]);

  const reportStats = useMemo(() => {
    const bookingRevenue = filteredBookings
      .filter((booking) => !['cancelled', 'rejected', 'no_show', 'refunded'].includes(String(booking.status || '').toLowerCase()))
      .reduce((sum, booking) => {
        const total = getBookingTotal(booking);
        return sum + getPaymentInfo(bookingPayments, booking.id, total, booking).totalPaid;
      }, 0);

    const orderRevenue = filteredOrders
      .filter((order) => !['returned', 'cancelled', 'refunded'].includes(String(order.status || '').toLowerCase()))
      .reduce(
        (sum, order) =>
          sum + getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order).totalPaid,
        0
      );

    const walkinRevenue = filteredWalkins
      .filter((item) => !['cancelled', 'refunded'].includes(String(item.status || '').toLowerCase()))
      .reduce(
        (sum, item) =>
          sum + getPaymentInfo(walkinPayments, item.id, Number(item.total_amount) || 0, item).totalPaid,
        0
      );

    const bookingBalance = filteredBookings.reduce((sum, booking) => {
      const total = getBookingTotal(booking);
      return sum + getPaymentInfo(bookingPayments, booking.id, total, booking).balance;
    }, 0);

    const orderBalance = filteredOrders.reduce(
      (sum, order) =>
        sum + getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0, order).balance,
      0
    );

    const walkinBalance = filteredWalkins.reduce(
      (sum, item) =>
        sum + getPaymentInfo(walkinPayments, item.id, Number(item.total_amount) || 0, item).balance,
      0
    );

    return {
      bookingRevenue,
      orderRevenue,
      walkinRevenue,
      collectedRevenue: bookingRevenue + orderRevenue + walkinRevenue,
      outstandingBalance: bookingBalance + orderBalance + walkinBalance,
      completedBookings: filteredBookings.filter((booking) => booking.status === 'completed').length,
      completedOrders: filteredOrders.filter((order) => order.status === 'completed').length,
      completedWalkins: filteredWalkins.filter((item) => item.status === 'completed').length,
    };
  }, [filteredBookings, filteredOrders, filteredWalkins, bookingPayments, orderPayments, walkinPayments]);

  const currentRows =
    activeTab === 'bookings'
      ? filteredBookings.length
      : activeTab === 'orders'
      ? filteredOrders.length
      : activeTab === 'walkins'
      ? filteredWalkins.length
      : filteredAuditLogs.length;

  const totalPages = Math.max(1, Math.ceil(currentRows / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const paginatedBookings = filteredBookings.slice(startIndex, endIndex);
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);
  const paginatedWalkins = filteredWalkins.slice(startIndex, endIndex);
  const paginatedAuditLogs = filteredAuditLogs.slice(startIndex, endIndex);

  const tablePaginationProps = {
    pageSize,
    onPageSizeChange: (size) => setPageSize(normalizePageSize(size)),
    page: safeCurrentPage,
    totalPages,
    startIndex,
    endIndex,
    onFirst: () => setCurrentPage(1),
    onPrev: () => setCurrentPage((page) => Math.max(page - 1, 1)),
    onNext: () => setCurrentPage((page) => Math.min(page + 1, totalPages)),
    onLast: () => setCurrentPage(totalPages),
  };

  const dateRangeInvalid = isDateRangeInvalid(dateFrom, dateTo);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl" ref={printRef}>
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm print:border-0 print:shadow-none dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl print:hidden" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl print:hidden" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Admin
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Reports & Audit Logs
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Filter, sort, print, and export booking, order, payment, and audit reports.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => fetchAll(false)}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  🖨️ Print
                </button>

                <button
                  type="button"
                  onClick={handleExport}
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.99]"
                >
                  ⬇ Download CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 print:hidden dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm print:hidden dark:border-dark-700 dark:bg-dark-800">
          <div className="grid gap-3 lg:grid-cols-[auto_auto_auto_1fr_auto] lg:items-center">
            <div className="flex flex-wrap gap-2 lg:col-span-5">
              {['bookings', 'orders', 'walkins', 'audit'].map(tabButton)}
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(sanitizeDateInput(event.target.value))}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(sanitizeDateInput(event.target.value))}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Search
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
                  🔍
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(sanitizeSearchText(event.target.value))}
                  placeholder="Search customer, service, order item, action, status, or ID..."
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

            <div className="flex lg:items-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!dateFrom && !dateTo && !search}
                className="w-full rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {dateRangeInvalid && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 print:hidden dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Invalid date range. The From date must be before the To date.
          </div>
        )}

        {/* Summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label="Report Rows" value={currentRows} icon="📄" tone="primary" />
          <StatCard label="Completed Bookings" value={reportStats.completedBookings} icon="📅" tone="green" />
          <StatCard label="Completed Orders" value={reportStats.completedOrders} icon="📦" tone="purple" />
          <StatCard label="Completed Walk-ins" value={reportStats.completedWalkins} icon="🎫" tone="blue" />
          <StatCard label="Collected Revenue" value={formatPeso(reportStats.collectedRevenue)} icon="💰" tone="accent" />
          <StatCard label="Outstanding Balance" value={formatPeso(reportStats.outstandingBalance)} icon="⚠️" tone={reportStats.outstandingBalance > 0 ? 'yellow' : 'default'} />
        </div>

        {loading ? (
          <ReportSkeleton />
        ) : (
          <>
            {activeTab === 'bookings' && (
              <TableShell title="Bookings Report" count={filteredBookings.length} {...tablePaginationProps}>
                {filteredBookings.length === 0 ? (
                  <EmptyTable text="No bookings found." />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-dark-900/70">
                      <tr className="border-b border-gray-200 dark:border-dark-700">
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          ID
                        </th>
                        <SortHeader field="customer" label="Customer" />
                        <SortHeader field="service" label="Service" />
                        <SortHeader field="date" label="Date" />
                        <SortHeader field="time" label="Time" />
                        <SortHeader field="mechanic" label="Mechanic" />
                        <SortHeader field="status" label="Status" />
                        <SortHeader field="total" label="Total" />
                        <SortHeader field="paid" label="Paid" />
                        <SortHeader field="receipt" label="Receipt No." />
                        <SortHeader field="balance" label="Balance" />
                        <SortHeader field="processed_by" label="Processed By" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                      {paginatedBookings.map((booking) => {
                        const total = getBookingTotal(booking);
                        const info = getPaymentInfo(bookingPayments, booking.id, total, booking);

                        return (
                          <tr key={booking.id} className="transition hover:bg-gray-50 dark:hover:bg-dark-900/50">
                            <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-bold text-gray-500">
                              {booking.id?.slice(0, 8)}
                            </td>
                            <td className="px-4 py-4">
                              <p className="whitespace-nowrap font-black text-gray-950 dark:text-white">
                                {getCustomerName(booking)}
                              </p>
                              <p className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                {getCustomerContact(booking)}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-semibold text-gray-700 dark:text-gray-300">
                              {getBookingServiceLabel(booking)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-400">
                              {formatDate(booking.booking_date)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-400">
                              {formatTime(booking.booking_time)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-400">
                              {getMechanicName(booking)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <StatusBadge status={booking.status} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-black text-gray-950 dark:text-white">
                              {formatPeso(total)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-black text-green-600 dark:text-green-300">
                              {formatPeso(info.totalPaid)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <ReceiptNumberList payments={bookingPayments[booking.id] || []} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <PaymentBadge isFullyPaid={info.isFullyPaid} balance={info.balance} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                              {info.lastProcessedBy}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </TableShell>
            )}

            {activeTab === 'orders' && (
              <TableShell title="Orders Report" count={filteredOrders.length} {...tablePaginationProps}>
                {filteredOrders.length === 0 ? (
                  <EmptyTable text="No orders found." />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-dark-900/70">
                      <tr className="border-b border-gray-200 dark:border-dark-700">
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          ID
                        </th>
                        <SortHeader field="customer" label="Customer" />
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Items
                        </th>
                        <SortHeader field="total" label="Total" />
                        <SortHeader field="paid" label="Paid" />
                        <SortHeader field="receipt" label="Receipt No." />
                        <SortHeader field="balance" label="Balance" />
                        <SortHeader field="status" label="Status" />
                        <SortHeader field="processed_by" label="Processed By" />
                        <SortHeader field="date" label="Date" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                      {paginatedOrders.map((order) => {
                        const total = Number(order.total_amount) || 0;
                        const info = getPaymentInfo(orderPayments, order.id, total, order);

                        return (
                          <tr key={order.id} className="transition hover:bg-gray-50 dark:hover:bg-dark-900/50">
                            <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-bold text-gray-500">
                              {order.id?.slice(0, 8)}
                            </td>
                            <td className="px-4 py-4">
                              <p className="whitespace-nowrap font-black text-gray-950 dark:text-white">
                                {getCustomerName(order)}
                              </p>
                              <p className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                {getCustomerContact(order)}
                              </p>
                            </td>
                            <td className="min-w-56 px-4 py-4">
                              <div className="space-y-1">
                                {(order.order_items || []).length === 0 ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">No items</p>
                                ) : (
                                  order.order_items.map((item, index) => (
                                    <p key={`${order.id}-${index}`} className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                      {item.parts?.name || 'Product'} × {item.quantity}
                                    </p>
                                  ))
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-black text-accent-600 dark:text-accent-400">
                              {formatPeso(total)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-black text-green-600 dark:text-green-300">
                              {formatPeso(info.totalPaid)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <ReceiptNumberList payments={orderPayments[order.id] || []} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <PaymentBadge isFullyPaid={info.isFullyPaid} balance={info.balance} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <StatusBadge status={order.status} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                              {info.lastProcessedBy}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(order.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </TableShell>
            )}

            {activeTab === 'walkins' && (
              <TableShell title="Walk-in Queue Report" count={filteredWalkins.length} {...tablePaginationProps}>
                {filteredWalkins.length === 0 ? (
                  <EmptyTable text="No walk-ins found." />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-dark-900/70">
                      <tr className="border-b border-gray-200 dark:border-dark-700">
                        <SortHeader field="queue_number" label="Queue No." />
                        <SortHeader field="customer" label="Customer" />
                        <SortHeader field="service" label="Services" />
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Products
                        </th>
                        <SortHeader field="total" label="Total" />
                        <SortHeader field="paid" label="Paid" />
                        <SortHeader field="receipt" label="Receipt No." />
                        <SortHeader field="balance" label="Balance" />
                        <SortHeader field="status" label="Status" />
                        <SortHeader field="date" label="Date" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                      {paginatedWalkins.map((item) => {
                        const total = Number(item.total_amount) || 0;
                        const info = getPaymentInfo(walkinPayments, item.id, total, item);

                        return (
                          <tr key={item.id} className="transition hover:bg-gray-50 dark:hover:bg-dark-900/50">
                            <td className="whitespace-nowrap px-4 py-4 font-black text-primary-600 dark:text-primary-400">
                              {item.queue_number || item.id?.slice(0, 8)}
                            </td>
                            <td className="px-4 py-4">
                              <p className="whitespace-nowrap font-black text-gray-950 dark:text-white">
                                {getCustomerName(item)}
                              </p>
                              <p className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                {getCustomerContact(item)}
                              </p>
                            </td>
                            <td className="min-w-56 px-4 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400">
                              {getWalkinServiceLabel(item)}
                            </td>
                            <td className="min-w-56 px-4 py-4 text-xs font-semibold text-gray-600 dark:text-gray-400">
                              {getWalkinProductLabel(item)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-black text-accent-600 dark:text-accent-400">
                              {formatPeso(total)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-black text-green-600 dark:text-green-300">
                              {formatPeso(info.totalPaid)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <ReceiptNumberList payments={walkinPayments[item.id] || []} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <PaymentBadge isFullyPaid={info.isFullyPaid} balance={info.balance} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(item.queue_date || item.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </TableShell>
            )}

            {activeTab === 'audit' && (
              <TableShell title="Audit Logs" count={filteredAuditLogs.length} {...tablePaginationProps}>
                {filteredAuditLogs.length === 0 ? (
                  <EmptyTable text="No audit logs found." />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-dark-900/70">
                      <tr className="border-b border-gray-200 dark:border-dark-700">
                        <SortHeader field="time" label="Time" />
                        <SortHeader field="action" label="Action" />
                        <SortHeader field="entity" label="Entity" />
                        <SortHeader field="performed_by" label="Processed By" />
                        <SortHeader field="role" label="Role" />
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Details
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                      {paginatedAuditLogs.map((log) => (
                        <tr key={log.id} className="transition hover:bg-gray-50 dark:hover:bg-dark-900/50">
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-gray-500 dark:text-gray-400">
                            {formatDateTime(log.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <ActionBadge action={log.action} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs font-black text-gray-700 dark:text-gray-300">
                            {log.entity || '—'}
                          </td>
                          <td className="px-4 py-4">
                            {log.profiles ? (
                              <div>
                                <p className="whitespace-nowrap text-xs font-black text-gray-950 dark:text-white">
                                  {log.profiles.first_name} {log.profiles.last_name}
                                </p>
                                <p className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                  {log.profiles.email}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                System
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black capitalize text-gray-600 ring-1 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25">
                              {log.profiles?.role || '—'}
                            </span>
                          </td>
                          <td className="max-w-lg px-4 py-4 align-top">
                            <AuditDetails log={log} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </TableShell>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[130] max-w-xs rounded-3xl border border-primary-100 bg-white px-5 py-4 text-sm font-black text-gray-950 shadow-2xl print:hidden dark:border-primary-500/25 dark:bg-dark-800 dark:text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
