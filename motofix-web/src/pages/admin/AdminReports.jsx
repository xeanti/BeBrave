import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';

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
  const name = `${row.profiles?.first_name || ''} ${row.profiles?.last_name || ''}`.trim();
  return name || 'Unknown Customer';
}

function getMechanicName(booking) {
  const name = `${booking.mechanic?.first_name || ''} ${booking.mechanic?.last_name || ''}`.trim();
  return name || 'Unassigned';
}

function getBookingTotal(booking) {
  return (Number(booking.services?.base_price) || 0) + (Number(booking.services?.labor_cost) || 0);
}

function getOrderItemsLabel(order) {
  const items = order.order_items || [];

  if (!items.length) return 'No items';

  return items
    .map((item) => `${item.parts?.name || 'Part'} × ${item.quantity}`)
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

function TableShell({ title, count, children }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-700">
        <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
          {title} <span className="text-gray-400">({count})</span>
        </h2>
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
  const [auditLogs, setAuditLogs] = useState([]);

  const [bookingPayments, setBookingPayments] = useState({});
  const [orderPayments, setOrderPayments] = useState({});

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [toast, setToast] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

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
      const [bookingResult, orderResult, auditResult] = await Promise.all([
        supabase
          .from('bookings')
          .select(`
            *,
            services(name, base_price, labor_cost),
            profiles!bookings_customer_id_fkey(first_name, last_name, email),
            mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('orders')
          .select(`
            *,
            profiles!orders_customer_id_fkey(first_name, last_name, email),
            order_items(quantity, unit_price, subtotal, parts(name))
          `)
          .order('created_at', { ascending: false }),

        supabase
          .from('audit_logs')
          .select('*, profiles!audit_logs_performed_by_fkey(first_name, last_name, email, role)')
          .order('created_at', { ascending: false })
          .limit(150),
      ]);

      const firstError = [bookingResult, orderResult, auditResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const bookingRows = bookingResult.data || [];
      const orderRows = orderResult.data || [];

      setBookings(bookingRows);
      setOrders(orderRows);
      setAuditLogs(auditResult.data || []);

      if (bookingRows.length) {
        const allBookingPayments = await fetchPaymentsFor({
          bookingIds: bookingRows.map((booking) => booking.id),
        });

        const grouped = {};
        (allBookingPayments || []).forEach((payment) => {
          if (!grouped[payment.booking_id]) grouped[payment.booking_id] = [];
          grouped[payment.booking_id].push(payment);
        });

        setBookingPayments(grouped);
      } else {
        setBookingPayments({});
      }

      if (orderRows.length) {
        const allOrderPayments = await fetchPaymentsFor({
          orderIds: orderRows.map((order) => order.id),
        });

        const grouped = {};
        (allOrderPayments || []).forEach((payment) => {
          if (!grouped[payment.order_id]) grouped[payment.order_id] = [];
          grouped[payment.order_id].push(payment);
        });

        setOrderPayments(grouped);
      } else {
        setOrderPayments({});
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }

  function filterByDate(items, dateField = 'created_at') {
    return items.filter((item) => {
      const raw = item[dateField] || item.created_at;
      const date = new Date(raw);

      if (dateFrom && date < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo && date > new Date(`${dateTo}T23:59:59`)) return false;

      return true;
    });
  }

  function getPaymentInfo(records, recordId, total) {
    const list = records[recordId] || [];
    const { totalPaid } = summarizePayments(list);
    const balance = Math.max((Number(total) || 0) - totalPaid, 0);
    const isFullyPaid = Number(total) > 0 && balance <= 0;
    const last = list.length ? list[list.length - 1] : null;

    const lastProcessedBy = last?.profiles
      ? `${last.profiles.first_name} ${last.profiles.last_name}`
      : last
      ? 'System'
      : '—';

    return {
      totalPaid,
      balance,
      isFullyPaid,
      lastProcessedBy,
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
    const from = dateFrom || 'All';
    const to = dateTo || 'Present';

    return `MotoFix ${reportType} Report ${from} - ${to}.csv`;
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
    if (!data.length) {
      setToast('No rows to export.');
      return;
    }

    const headers = Object.keys(data[0]);
    const headerLabels = headers.map((header) =>
      header.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    );

    const lines = [];

    lines.push(escapeCSVValue(reportTitle));
    lines.push(escapeCSVValue(`Date Range: ${dateFrom || 'All'} to ${dateTo || 'Present'}`));
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
    anchor.download = filename;
    anchor.click();

    URL.revokeObjectURL(url);

    logReportAction('EXPORT_CSV', filename, {
      rows: data.length,
      active_tab: activeTab,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    });

    setToast(`Exported ${data.length} rows.`);
  }

  function handleExport() {
    if (activeTab === 'bookings') {
      downloadCSV(
        filteredBookings.map((booking) => {
          const total = getBookingTotal(booking);
          const info = getPaymentInfo(bookingPayments, booking.id, total);

          return {
            id: booking.id?.slice(0, 8),
            customer: getCustomerName(booking),
            email: booking.profiles?.email,
            service: booking.services?.name,
            date: booking.booking_date,
            time: formatTime(booking.booking_time),
            status: booking.status,
            mechanic: getMechanicName(booking),
            service_total: total.toFixed(2),
            total_paid: info.totalPaid.toFixed(2),
            balance: info.balance.toFixed(2),
            payment_status: info.isFullyPaid ? 'Fully Paid' : 'Partial/Unpaid',
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
          const info = getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0);

          return {
            id: order.id?.slice(0, 8),
            customer: getCustomerName(order),
            email: order.profiles?.email,
            items: getOrderItemsLabel(order),
            total: Number(order.total_amount || 0).toFixed(2),
            status: order.status,
            total_paid: info.totalPaid.toFixed(2),
            balance: info.balance.toFixed(2),
            payment_status: info.isFullyPaid ? 'Fully Paid' : 'Partial/Unpaid',
            processed_by: info.lastProcessedBy,
            date: formatDate(order.created_at),
          };
        }),
        getReportFilename('Orders'),
        'MotoFix Orders Report'
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
        details: JSON.stringify(log.details || {}),
      })),
      getReportFilename('Audit Log'),
      'MotoFix Audit Log'
    );
  }

  function handlePrint() {
    window.print();

    logReportAction('PRINT_REPORT', activeTab, {
      active_tab: activeTab,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    });
  }

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setSearch('');
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
        }}
        className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
          active
            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
        }`}
      >
        {tab === 'audit' ? 'Audit Logs' : tab}
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
    balance: (booking) => getPaymentInfo(bookingPayments, booking.id, getBookingTotal(booking)).balance,
    processed_by: (booking) => getPaymentInfo(bookingPayments, booking.id, getBookingTotal(booking)).lastProcessedBy,
  };

  const orderAccessors = {
    customer: (order) => getCustomerName(order),
    total: (order) => Number(order.total_amount) || 0,
    paid: (order) => getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0).totalPaid,
    balance: (order) => getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0).balance,
    status: (order) => order.status || '',
    processed_by: (order) => getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0).lastProcessedBy,
    date: (order) => order.created_at || '',
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
    const query = search.trim().toLowerCase();

    const dateFiltered = filterByDate(bookings, 'booking_date');

    const searched = dateFiltered.filter((booking) => {
      const total = getBookingTotal(booking);
      const info = getPaymentInfo(bookingPayments, booking.id, total);
      const haystack = [
        booking.id,
        getCustomerName(booking),
        booking.profiles?.email,
        booking.services?.name,
        getMechanicName(booking),
        booking.status,
        info.lastProcessedBy,
      ]
        .join(' ')
        .toLowerCase();

      return !query || haystack.includes(query);
    });

    return sortRows(searched, bookingAccessors);
  }, [bookings, bookingPayments, dateFrom, dateTo, search, sortField, sortDirection]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    const dateFiltered = filterByDate(orders);

    const searched = dateFiltered.filter((order) => {
      const info = getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0);
      const haystack = [
        order.id,
        getCustomerName(order),
        order.profiles?.email,
        getOrderItemsLabel(order),
        order.status,
        info.lastProcessedBy,
      ]
        .join(' ')
        .toLowerCase();

      return !query || haystack.includes(query);
    });

    return sortRows(searched, orderAccessors);
  }, [orders, orderPayments, dateFrom, dateTo, search, sortField, sortDirection]);

  const filteredAuditLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const dateFiltered = filterByDate(auditLogs);

    const searched = dateFiltered.filter((log) => {
      const haystack = [
        log.id,
        log.action,
        log.entity,
        log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'System',
        log.profiles?.email,
        log.profiles?.role,
        JSON.stringify(log.details || {}),
      ]
        .join(' ')
        .toLowerCase();

      return !query || haystack.includes(query);
    });

    return sortRows(searched, auditAccessors);
  }, [auditLogs, dateFrom, dateTo, search, sortField, sortDirection]);

  const reportStats = useMemo(() => {
    const bookingRevenue = filteredBookings
      .filter((booking) => booking.status === 'completed')
      .reduce((sum, booking) => {
        const total = getBookingTotal(booking);
        return sum + getPaymentInfo(bookingPayments, booking.id, total).totalPaid;
      }, 0);

    const orderRevenue = filteredOrders
      .filter((order) => order.status === 'completed')
      .reduce(
        (sum, order) =>
          sum + getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0).totalPaid,
        0
      );

    const bookingBalance = filteredBookings.reduce((sum, booking) => {
      const total = getBookingTotal(booking);
      return sum + getPaymentInfo(bookingPayments, booking.id, total).balance;
    }, 0);

    const orderBalance = filteredOrders.reduce(
      (sum, order) =>
        sum + getPaymentInfo(orderPayments, order.id, Number(order.total_amount) || 0).balance,
      0
    );

    return {
      bookingRevenue,
      orderRevenue,
      collectedRevenue: bookingRevenue + orderRevenue,
      outstandingBalance: bookingBalance + orderBalance,
      completedBookings: filteredBookings.filter((booking) => booking.status === 'completed').length,
      completedOrders: filteredOrders.filter((order) => order.status === 'completed').length,
    };
  }, [filteredBookings, filteredOrders, bookingPayments, orderPayments]);

  const currentRows =
    activeTab === 'bookings'
      ? filteredBookings.length
      : activeTab === 'orders'
      ? filteredOrders.length
      : filteredAuditLogs.length;

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
              {['bookings', 'orders', 'audit'].map(tabButton)}
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
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
                onChange={(event) => setDateTo(event.target.value)}
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
                  onChange={(event) => setSearch(event.target.value)}
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

        {/* Summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Report Rows" value={currentRows} icon="📄" tone="primary" />
          <StatCard label="Completed Bookings" value={reportStats.completedBookings} icon="📅" tone="green" />
          <StatCard label="Completed Orders" value={reportStats.completedOrders} icon="📦" tone="purple" />
          <StatCard label="Collected Revenue" value={formatPeso(reportStats.collectedRevenue)} icon="💰" tone="accent" />
          <StatCard label="Outstanding Balance" value={formatPeso(reportStats.outstandingBalance)} icon="⚠️" tone={reportStats.outstandingBalance > 0 ? 'yellow' : 'default'} />
        </div>

        {loading ? (
          <ReportSkeleton />
        ) : (
          <>
            {activeTab === 'bookings' && (
              <TableShell title="Bookings Report" count={filteredBookings.length}>
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
                        <SortHeader field="balance" label="Balance" />
                        <SortHeader field="processed_by" label="Processed By" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                      {filteredBookings.map((booking) => {
                        const total = getBookingTotal(booking);
                        const info = getPaymentInfo(bookingPayments, booking.id, total);

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
                                {booking.profiles?.email || 'No email'}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-semibold text-gray-700 dark:text-gray-300">
                              {booking.services?.name || '—'}
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
              <TableShell title="Orders Report" count={filteredOrders.length}>
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
                        <SortHeader field="balance" label="Balance" />
                        <SortHeader field="status" label="Status" />
                        <SortHeader field="processed_by" label="Processed By" />
                        <SortHeader field="date" label="Date" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                      {filteredOrders.map((order) => {
                        const total = Number(order.total_amount) || 0;
                        const info = getPaymentInfo(orderPayments, order.id, total);

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
                                {order.profiles?.email || 'No email'}
                              </p>
                            </td>
                            <td className="min-w-56 px-4 py-4">
                              <div className="space-y-1">
                                {(order.order_items || []).length === 0 ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">No items</p>
                                ) : (
                                  order.order_items.map((item, index) => (
                                    <p key={`${order.id}-${index}`} className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                      {item.parts?.name || 'Part'} × {item.quantity}
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

            {activeTab === 'audit' && (
              <TableShell title="Audit Logs" count={filteredAuditLogs.length}>
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
                      {filteredAuditLogs.map((log) => (
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
                          <td className="max-w-sm px-4 py-4">
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={log.details ? JSON.stringify(log.details) : '—'}>
                              {log.details ? JSON.stringify(log.details) : '—'}
                            </p>
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
