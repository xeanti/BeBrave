import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';

export default function AdminReports() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [bookingPayments, setBookingPayments] = useState({}); // bookingId -> [payments]
  const [orderPayments, setOrderPayments] = useState({}); // orderId -> [payments]
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'
  const printRef = useRef();

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function sortRows(rows, accessors) {
    if (!sortField || !accessors[sortField]) return rows;
    const getValue = accessors[sortField];
    const sorted = [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }

  function SortHeader({ field, label, className = '' }) {
    const isActive = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap cursor-pointer select-none hover:text-gray-900 dark:hover:text-white transition ${className}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-[10px] ${isActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-300 dark:text-gray-600'}`}>
            {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </span>
      </th>
    );
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [b, o, a] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name, email), mechanic:profiles!bookings_mechanic_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('*, profiles!orders_customer_id_fkey(first_name, last_name, email), order_items(quantity, unit_price, subtotal, parts(name))')
        .order('created_at', { ascending: false }),
      supabase
        .from('audit_logs')
        .select('*, profiles!audit_logs_performed_by_fkey(first_name, last_name, email, role)')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (b.data) setBookings(b.data);
    if (o.data) setOrders(o.data);
    if (a.data) setAuditLogs(a.data);

    // Fetch payments for all bookings + orders, group by id
    if (b.data?.length) {
      const allBP = await fetchPaymentsFor({ bookingIds: b.data.map((x) => x.id) });
      const groupedBP = {};
      allBP.forEach((p) => {
        if (!groupedBP[p.booking_id]) groupedBP[p.booking_id] = [];
        groupedBP[p.booking_id].push(p);
      });
      setBookingPayments(groupedBP);
    }
    if (o.data?.length) {
      const allOP = await fetchPaymentsFor({ orderIds: o.data.map((x) => x.id) });
      const groupedOP = {};
      allOP.forEach((p) => {
        if (!groupedOP[p.order_id]) groupedOP[p.order_id] = [];
        groupedOP[p.order_id].push(p);
      });
      setOrderPayments(groupedOP);
    }

    setLoading(false);
  }

  function filterByDate(items, dateField = 'created_at') {
    return items.filter((item) => {
      const date = new Date(item[dateField] || item.created_at);
      if (dateFrom && date < new Date(dateFrom)) return false;
      if (dateTo && date > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }

  // Returns { totalPaid, balance, isFullyPaid, lastProcessedBy }
  function getPaymentInfo(records, recordId, total) {
    const list = records[recordId] || [];
    const { totalPaid } = summarizePayments(list);
    const balance = Math.max(total - totalPaid, 0);
    const isFullyPaid = total > 0 && balance <= 0;
    const last = list.length ? list[list.length - 1] : null;
    const lastProcessedBy = last?.profiles
      ? `${last.profiles.first_name} ${last.profiles.last_name}`
      : last
      ? 'System'
      : '—';
    return { totalPaid, balance, isFullyPaid, lastProcessedBy };
  }

  function downloadCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (typeof val === 'object') return JSON.stringify(val);
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // Log the download
    supabase.from('audit_logs').insert({
      action: 'EXPORT_CSV',
      entity: filename,
      performed_by: user.id,
      details: { rows: data.length },
    });
  }

  function handlePrint() {
    window.print();
    supabase.from('audit_logs').insert({
      action: 'PRINT_REPORT',
      entity: activeTab,
      performed_by: user.id,
      details: { tab: activeTab },
    });
  }

  const bookingAccessors = {
    id: (b) => b.id,
    customer: (b) => `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`.trim(),
    service: (b) => b.services?.name || '',
    date: (b) => b.booking_date || '',
    time: (b) => b.booking_time || '',
    mechanic: (b) => b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : 'Unassigned',
    status: (b) => b.status || '',
    total: (b) => (b.services?.base_price || 0) + (b.services?.labor_cost || 0),
    paid: (b) => getPaymentInfo(bookingPayments, b.id, (b.services?.base_price || 0) + (b.services?.labor_cost || 0)).totalPaid,
    balance: (b) => getPaymentInfo(bookingPayments, b.id, (b.services?.base_price || 0) + (b.services?.labor_cost || 0)).balance,
    processed_by: (b) => getPaymentInfo(bookingPayments, b.id, (b.services?.base_price || 0) + (b.services?.labor_cost || 0)).lastProcessedBy,
  };

  const orderAccessors = {
    id: (o) => o.id,
    customer: (o) => `${o.profiles?.first_name || ''} ${o.profiles?.last_name || ''}`.trim(),
    total: (o) => o.total_amount || 0,
    paid: (o) => getPaymentInfo(orderPayments, o.id, o.total_amount || 0).totalPaid,
    balance: (o) => getPaymentInfo(orderPayments, o.id, o.total_amount || 0).balance,
    status: (o) => o.status || '',
    processed_by: (o) => getPaymentInfo(orderPayments, o.id, o.total_amount || 0).lastProcessedBy,
    date: (o) => o.created_at || '',
  };

  const auditAccessors = {
    time: (l) => l.created_at || '',
    action: (l) => l.action || '',
    entity: (l) => l.entity || '',
    performed_by: (l) => l.profiles ? `${l.profiles.first_name} ${l.profiles.last_name}` : 'System',
    role: (l) => l.profiles?.role || '',
  };

  const filteredBookings = sortRows(filterByDate(bookings, 'booking_date'), bookingAccessors);
  const filteredOrders = sortRows(filterByDate(orders), orderAccessors);
  const filteredAuditLogs = sortRows(filterByDate(auditLogs), auditAccessors);

  const bookingRevenue = filteredBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => {
      const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
      return sum + getPaymentInfo(bookingPayments, b.id, total).totalPaid;
    }, 0);

  const orderRevenue = filteredOrders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + getPaymentInfo(orderPayments, o.id, o.total_amount || 0).totalPaid, 0);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-6xl mx-auto" ref={printRef}>
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">Reports & Audit Logs</h1>
            <p className="text-gray-400">View, filter, and download system reports.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="border border-gray-600 hover:border-gray-400 px-4 py-2 rounded-lg text-sm transition"
            >
              🖨️ Print
            </button>
            <button
              onClick={() => {
                if (activeTab === 'bookings') {
                  downloadCSV(filteredBookings.map(b => {
                    const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
                    const info = getPaymentInfo(bookingPayments, b.id, total);
                    return {
                      id: b.id.slice(0,8),
                      customer: `${b.profiles?.first_name} ${b.profiles?.last_name}`,
                      email: b.profiles?.email,
                      service: b.services?.name,
                      date: b.booking_date,
                      time: b.booking_time,
                      status: b.status,
                      mechanic: b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : 'Unassigned',
                      service_total: total.toFixed(2),
                      total_paid: info.totalPaid.toFixed(2),
                      balance: info.balance.toFixed(2),
                      payment_status: info.isFullyPaid ? 'Fully Paid' : 'Partial/Unpaid',
                      processed_by: info.lastProcessedBy,
                    };
                  }), 'bookings-report.csv');
                } else if (activeTab === 'orders') {
                  downloadCSV(filteredOrders.map(o => {
                    const info = getPaymentInfo(orderPayments, o.id, o.total_amount || 0);
                    return {
                      id: o.id.slice(0,8),
                      customer: `${o.profiles?.first_name} ${o.profiles?.last_name}`,
                      email: o.profiles?.email,
                      total: o.total_amount,
                      status: o.status,
                      total_paid: info.totalPaid.toFixed(2),
                      balance: info.balance.toFixed(2),
                      payment_status: info.isFullyPaid ? 'Fully Paid' : 'Partial/Unpaid',
                      processed_by: info.lastProcessedBy,
                      date: new Date(o.created_at).toLocaleDateString(),
                    };
                  }), 'orders-report.csv');
                } else {
                  downloadCSV(filteredAuditLogs.map(l => ({
                    id: l.id.slice(0,8),
                    action: l.action,
                    entity: l.entity,
                    performed_by: l.profiles ? `${l.profiles.first_name} ${l.profiles.last_name}` : 'System',
                    role: l.profiles?.role,
                    date: new Date(l.created_at).toLocaleString(),
                    details: JSON.stringify(l.details),
                  })), 'audit-logs.csv');
                }
              }}
              className="bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg text-sm transition"
            >
              ⬇ Download CSV
            </button>
          </div>
        </div>

        {/* Date filter */}
        <div className="bg-dark-800 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
          <span className="text-sm text-gray-400">Filter by date:</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="bg-dark-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-primary-400 hover:underline">
              Clear filter
            </button>
          )}
        </div>

        {/* Revenue summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Bookings" value={filteredBookings.length} color="text-blue-400" />
          <SummaryCard label="Completed Bookings" value={filteredBookings.filter(b => b.status === 'completed').length} color="text-green-400" />
          <SummaryCard label="Total Orders" value={filteredOrders.length} color="text-purple-400" />
          <SummaryCard label="Collected Revenue" value={`₱${(bookingRevenue + orderRevenue).toFixed(2)}`} color="text-accent-400" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {['bookings', 'orders', 'audit'].map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab); setSortField(null); setSortDirection('asc'); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
                activeTab === tab ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}>
              {tab === 'audit' ? 'Audit Logs' : tab}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <>
            {/* Bookings report */}
            {activeTab === 'bookings' && (
              <div className="bg-dark-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-700 flex justify-between">
                  <h2 className="font-semibold">Bookings Report ({filteredBookings.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">ID</th>
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
                    <tbody>
                      {filteredBookings.map((b) => {
                        const total = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
                        const info = getPaymentInfo(bookingPayments, b.id, total);
                        return (
<tr key={b.id} className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-dark-900/50 transition-colors">                            <td className="px-4 py-3 text-xs text-gray-500">{b.id.slice(0,8)}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{b.profiles?.first_name} {b.profiles?.last_name}</p>
                              <p className="text-xs text-gray-500">{b.profiles?.email}</p>
                            </td>
                            <td className="px-4 py-3">{b.services?.name}</td>
                            <td className="px-4 py-3">{b.booking_date}</td>
                            <td className="px-4 py-3">{b.booking_time}</td>
                            <td className="px-4 py-3">
                              {b.mechanic ? `${b.mechanic.first_name} ${b.mechanic.last_name}` : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={b.status} />
                            </td>
                            <td className="px-4 py-3 text-gray-300">₱{total.toFixed(2)}</td>
                            <td className="px-4 py-3 text-green-400 font-medium">₱{info.totalPaid.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              {info.isFullyPaid ? (
                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">Paid</span>
                              ) : (
                                <span className="text-yellow-400 font-medium">₱{info.balance.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">{info.lastProcessedBy}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredBookings.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-8">No bookings found.</p>
                  )}
                </div>
              </div>
            )}

            {/* Orders report */}
            {activeTab === 'orders' && (
              <div className="bg-dark-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-700">
                  <h2 className="font-semibold">Orders Report ({filteredOrders.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">ID</th>
                        <SortHeader field="customer" label="Customer" />
                        <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Items</th>
                        <SortHeader field="total" label="Total" />
                        <SortHeader field="paid" label="Paid" />
                        <SortHeader field="balance" label="Balance" />
                        <SortHeader field="status" label="Status" />
                        <SortHeader field="processed_by" label="Processed By" />
                        <SortHeader field="date" label="Date" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => {
                        const info = getPaymentInfo(orderPayments, o.id, o.total_amount || 0);
                        return (
<tr key={o.id} className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-dark-900/50 transition-colors">                            <td className="px-4 py-3 text-xs text-gray-500">{o.id.slice(0,8)}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{o.profiles?.first_name} {o.profiles?.last_name}</p>
                              <p className="text-xs text-gray-500">{o.profiles?.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-0.5">
                                {o.order_items?.map((item, i) => (
                                  <p key={i} className="text-xs text-gray-400">
                                    {item.parts?.name} × {item.quantity}
                                  </p>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-accent-400">₱{o.total_amount}</td>
                            <td className="px-4 py-3 text-green-400 font-medium">₱{info.totalPaid.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              {info.isFullyPaid ? (
                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">Paid</span>
                              ) : (
                                <span className="text-yellow-400 font-medium">₱{info.balance.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                            <td className="px-4 py-3 text-xs text-gray-400">{info.lastProcessedBy}</td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(o.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredOrders.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-8">No orders found.</p>
                  )}
                </div>
              </div>
            )}

            {/* Audit logs */}
            {activeTab === 'audit' && (
              <div className="bg-dark-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-700">
                  <h2 className="font-semibold">Audit Logs ({filteredAuditLogs.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <SortHeader field="time" label="Time" />
                        <SortHeader field="action" label="Action" />
                        <SortHeader field="entity" label="Entity" />
                        <SortHeader field="performed_by" label="Processed By" />
                        <SortHeader field="role" label="Role" />
                        <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditLogs.map((log) => (
<tr key={log.id} className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-dark-900/50 transition-colors">                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              log.action.includes('DELETE') ? 'bg-red-500/20 text-red-400' :
                              log.action.includes('CREATE') || log.action.includes('INSERT') ? 'bg-green-500/20 text-green-400' :
                              log.action.includes('UPDATE') ? 'bg-blue-500/20 text-blue-400' :
                              log.action.includes('PAYMENT') ? 'bg-accent-500/20 text-accent-400' :
                              log.action.includes('EXPORT') || log.action.includes('PRINT') ? 'bg-purple-500/20 text-purple-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">{log.entity}</td>
                          <td className="px-4 py-3">
                            {log.profiles ? (
                              <div>
                                <p className="font-medium text-xs">{log.profiles.first_name} {log.profiles.last_name}</p>
                                <p className="text-xs text-gray-500">{log.profiles.email}</p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">System</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs capitalize text-gray-400">{log.profiles?.role || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                            {log.details ? JSON.stringify(log.details) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAuditLogs.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-8">No audit logs found.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-dark-800 rounded-xl p-4">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    confirmed: 'bg-green-500/20 text-green-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-gray-500/20 text-gray-400',
    cancelled: 'bg-red-500/20 text-red-400',
    preparing: 'bg-purple-500/20 text-purple-400',
    ready: 'bg-cyan-500/20 text-cyan-400',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full capitalize whitespace-nowrap ${styles[status] || styles.pending}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}