import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'booking', label: 'Booking' },
  { value: 'order', label: 'Order' },
  { value: 'walkin', label: 'Walk-in' },
  { value: 'service', label: 'Service' },
  { value: 'product_counter_sale', label: 'Product Counter Sale' },
];

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All Payments' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'PayMongo', label: 'PayMongo' },
  { value: 'QRPH', label: 'QRPH' },
];

const TABLE_SCROLL_FIX_STYLE = {
  display: 'table',
  overflowX: 'visible',
};

function formatCurrency(value) {
  const amount = Number(value || 0);

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0);

  return `₱${amount.toLocaleString('en-PH', {
    maximumFractionDigits: 0,
  })}`;
}

function formatDateTime(value) {
  if (!value) return '—';

  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSourceLabel(value) {
  if (!value) return '—';

  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getReceiptAccent(sourceType) {
  if (sourceType === 'product_counter_sale') return 'bg-pink-500/15 text-pink-700 ring-pink-500/25 dark:text-pink-300';
  if (sourceType === 'booking') return 'bg-blue-500/15 text-blue-700 ring-blue-500/25 dark:text-blue-300';
  if (sourceType === 'order') return 'bg-orange-500/15 text-orange-700 ring-orange-500/25 dark:text-orange-300';
  if (sourceType === 'walkin') return 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300';
  return 'bg-slate-500/15 text-slate-700 ring-slate-500/25 dark:text-slate-300';
}

function buildReceiptPrintHtml(receipt, items) {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.item_name)}</td>
          <td>${escapeHtml(item.item_type)}</td>
          <td style="text-align:center;">${escapeHtml(item.quantity)}</td>
          <td style="text-align:right;">${formatCurrency(item.unit_price)}</td>
          <td style="text-align:right;">${formatCurrency(item.line_total)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(receipt.receipt_number || 'MotoFix Receipt')}</title>
        <style>
          @page {
            size: A4;
            margin: 12mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #111827;
            font-family: Arial, sans-serif;
            font-size: 13px;
          }

          .receipt {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            border: 1px solid #e5e7eb;
            padding: 24px;
          }

          .top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            border-bottom: 2px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 18px;
          }

          h1,
          h2,
          h3,
          p {
            margin: 0;
          }

          .brand {
            font-size: 24px;
            font-weight: 800;
          }

          .muted {
            color: #6b7280;
          }

          .receipt-title {
            text-align: right;
          }

          .receipt-title h2 {
            font-size: 20px;
            margin-bottom: 4px;
          }

          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 18px;
          }

          .box {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
          }

          .label {
            color: #6b7280;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 2px;
          }

          .value {
            font-weight: 700;
            margin-bottom: 8px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }

          th {
            background: #f3f4f6;
            text-align: left;
            padding: 10px 8px;
            border: 1px solid #e5e7eb;
            font-size: 12px;
          }

          td {
            padding: 9px 8px;
            border: 1px solid #e5e7eb;
          }

          .totals {
            width: 320px;
            margin-left: auto;
            margin-top: 18px;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 7px 0;
            border-bottom: 1px solid #e5e7eb;
          }

          .grand {
            font-size: 18px;
            font-weight: 800;
          }

          .footer {
            margin-top: 24px;
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 12px;
          }

          @media print {
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>

      <body>
        <main class="receipt">
          <section class="top">
            <div>
              <h1 class="brand">MotoFix</h1>
              <p class="muted">Motorcycle Service and Product Management</p>
              <p class="muted">Official E-Receipt</p>
            </div>

            <div class="receipt-title">
              <h2>OFFICIAL RECEIPT</h2>
              <p><strong>${escapeHtml(receipt.receipt_number)}</strong></p>
              <p class="muted">${formatDateTime(receipt.issued_at)}</p>
            </div>
          </section>

          <section class="grid">
            <div class="box">
              <p class="label">Customer</p>
              <p class="value">${escapeHtml(receipt.customer_name || 'Walk-in Customer')}</p>

              <p class="label">Phone</p>
              <p class="value">${escapeHtml(receipt.customer_phone || '—')}</p>

              <p class="label">Email</p>
              <p class="value">${escapeHtml(receipt.customer_email || '—')}</p>
            </div>

            <div class="box">
              <p class="label">Source</p>
              <p class="value">${escapeHtml(formatSourceLabel(receipt.source_type))}</p>

              <p class="label">Payment Method</p>
              <p class="value">${escapeHtml(receipt.payment_method || '—')}</p>

              <p class="label">Reference</p>
              <p class="value">${escapeHtml(receipt.payment_reference || '—')}</p>
            </div>
          </section>

          <section>
            <h3>Items</h3>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th style="text-align:center;">Qty</th>
                  <th style="text-align:right;">Unit Price</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>

              <tbody>
                ${
                  rows ||
                  `
                    <tr>
                      <td colspan="5" style="text-align:center;color:#6b7280;">
                        No receipt items found.
                      </td>
                    </tr>
                  `
                }
              </tbody>
            </table>
          </section>

          <section class="totals">
            <div class="total-row">
              <span>Subtotal</span>
              <strong>${formatCurrency(receipt.subtotal)}</strong>
            </div>

            <div class="total-row">
              <span>Discount</span>
              <strong>${formatCurrency(receipt.discount_amount)}</strong>
            </div>

            <div class="total-row">
              <span>Tax</span>
              <strong>${formatCurrency(receipt.tax_amount)}</strong>
            </div>

            <div class="total-row grand">
              <span>Total</span>
              <span>${formatCurrency(receipt.total_amount)}</span>
            </div>

            <div class="total-row">
              <span>Amount Paid</span>
              <strong>${formatCurrency(receipt.amount_paid)}</strong>
            </div>

            <div class="total-row">
              <span>Balance</span>
              <strong>${formatCurrency(receipt.balance_amount)}</strong>
            </div>
          </section>

          <section class="footer">
            <p>This receipt is system-generated by MotoFix.</p>
            <p>Receipt Number: ${escapeHtml(receipt.receipt_number)}</p>
          </section>
        </main>

        <script>
          window.onload = function () {
            window.focus();
            window.print();
            window.onafterprint = function () {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `;
}

function StatCard({ label, value, icon, tone = 'pink' }) {
  const toneClass =
    tone === 'yellow'
      ? 'bg-yellow-500/15 text-yellow-700 ring-yellow-500/25 dark:text-yellow-300'
      : tone === 'green'
        ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300'
        : tone === 'blue'
          ? 'bg-blue-500/15 text-blue-700 ring-blue-500/25 dark:text-blue-300'
          : 'bg-pink-500/15 text-pink-700 ring-pink-500/25 dark:text-pink-300';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#181818]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
            {value}
          </p>
        </div>

        <div className={`grid h-11 w-11 place-items-center rounded-2xl text-lg ring-1 ${toneClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function AdminReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);

  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  const visibleTotal = useMemo(() => {
    return receipts.reduce((sum, receipt) => sum + Number(receipt.total_amount || 0), 0);
  }, [receipts]);

  const cashCount = useMemo(() => {
    return receipts.filter((receipt) => String(receipt.payment_method || '').toLowerCase().includes('cash')).length;
  }, [receipts]);

  const productCounterCount = useMemo(() => {
    return receipts.filter((receipt) => receipt.source_type === 'product_counter_sale').length;
  }, [receipts]);

  useEffect(() => {
    loadReceipts();
  }, [page, pageSize, sourceType, paymentMethod, dateFrom, dateTo]);

  async function loadReceipts() {
    setLoading(true);
    setErrorMessage('');

    try {
      let query = supabase
        .from('receipts')
        .select(
          `
            id,
            receipt_number,
            source_type,
            source_id,
            customer_id,
            customer_name,
            customer_phone,
            customer_email,
            payment_method,
            payment_reference,
            subtotal,
            discount_amount,
            tax_amount,
            total_amount,
            amount_paid,
            balance_amount,
            status,
            issued_at,
            issued_by
          `,
          { count: 'exact' }
        )
        .order('issued_at', { ascending: false });

      const cleanSearch = search.trim();

      if (cleanSearch) {
        const safeSearch = cleanSearch.replaceAll('%', '').replaceAll(',', '');

        query = query.or(
          [
            `receipt_number.ilike.%${safeSearch}%`,
            `customer_name.ilike.%${safeSearch}%`,
            `customer_phone.ilike.%${safeSearch}%`,
            `customer_email.ilike.%${safeSearch}%`,
            `payment_reference.ilike.%${safeSearch}%`,
          ].join(',')
        );
      }

      if (sourceType !== 'all') {
        query = query.eq('source_type', sourceType);
      }

      if (paymentMethod !== 'all') {
        query = query.ilike('payment_method', `%${paymentMethod}%`);
      }

      if (dateFrom) {
        query = query.gte('issued_at', `${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        query = query.lte('issued_at', `${dateTo}T23:59:59`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setReceipts(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || 'Failed to load receipts.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchSubmit(event) {
    event.preventDefault();
    setPage(1);
    await loadReceipts();
  }

  function clearFilters() {
    setSearch('');
    setSourceType('all');
    setPaymentMethod('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  async function loadReceiptItems(receipt) {
    const { data, error } = await supabase
      .from('receipt_items')
      .select(
        `
          id,
          item_type,
          item_name,
          description,
          quantity,
          unit_price,
          line_total,
          related_service_id,
          related_part_id,
          created_at
        `
      )
      .eq('receipt_id', receipt.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data || [];
  }

  async function handleViewReceipt(receipt) {
    setViewLoading(true);
    setErrorMessage('');

    try {
      const items = await loadReceiptItems(receipt);

      setSelectedReceipt(receipt);
      setSelectedItems(items);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || 'Failed to load receipt items.');
    } finally {
      setViewLoading(false);
    }
  }

  async function handleQuickPrint(receipt) {
    setErrorMessage('');

    try {
      const items = await loadReceiptItems(receipt);
      handlePrintReceipt(receipt, items);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || 'Failed to print receipt.');
    }
  }

  function handlePrintReceipt(receipt = selectedReceipt, items = selectedItems) {
    if (!receipt) {
      alert('Please select a receipt first.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=850,height=900');

    if (!printWindow) {
      alert('Please allow pop-ups to print the receipt.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildReceiptPrintHtml(receipt, items || []));
    printWindow.document.close();
  }

  function handleCloseModal() {
    setSelectedReceipt(null);
    setSelectedItems([]);
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8] p-4 text-slate-950 md:p-6 dark:bg-[#0f0f10] dark:text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#181818]">
          <div className="flex flex-col gap-5 bg-gradient-to-br from-white via-white to-pink-50 p-5 dark:from-[#1b1b1b] dark:via-[#1b1b1b] dark:to-[#2b1722] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-3xl bg-pink-500/15 text-2xl ring-1 ring-pink-500/25">
                🧾
              </div>

              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.35em] text-pink-600 dark:text-pink-300">
                  MotoFix Records
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                  Receipts
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                  Search, view, and reprint official MotoFix receipts.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-[#202020] dark:text-slate-200 dark:hover:bg-[#282828]"
              >
                Clear Filters
              </button>

              <button
                type="button"
                onClick={loadReceipts}
                className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-500 focus:outline-none focus:ring-4 focus:ring-pink-500/20"
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Receipts" value={totalCount} icon="🧾" tone="pink" />
          <StatCard label="This Page Value" value={formatCompactCurrency(visibleTotal)} icon="💰" tone="yellow" />
          <StatCard label="Cash Receipts" value={cashCount} icon="💵" tone="green" />
          <StatCard label="Counter Sales" value={productCounterCount} icon="📦" tone="blue" />
        </section>

        <form
          onSubmit={handleSearchSubmit}
          className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#181818]"
        >
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Search
              </label>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Receipt no., name, phone, reference"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-500/10 dark:border-white/10 dark:bg-[#101010] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Source
              </label>

              <select
                value={sourceType}
                onChange={(event) => {
                  setSourceType(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-500/10 dark:border-white/10 dark:bg-[#101010] dark:text-white"
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Payment
              </label>

              <select
                value={paymentMethod}
                onChange={(event) => {
                  setPaymentMethod(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-500/10 dark:border-white/10 dark:bg-[#101010] dark:text-white"
              >
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                From
              </label>

              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-500/10 dark:border-white/10 dark:bg-[#101010] dark:text-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                To
              </label>

              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-500/10 dark:border-white/10 dark:bg-[#101010] dark:text-white"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
              <span>Rows</span>

              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-950 dark:border-white/10 dark:bg-[#101010] dark:text-white"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-500 focus:outline-none focus:ring-4 focus:ring-pink-500/20"
            >
              Search Receipts
            </button>
          </div>
        </form>

        {errorMessage && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
            {errorMessage}
          </div>
        )}

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#181818]">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">
                Receipt History
              </h2>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Page {page} of {totalPages} • {totalCount} receipt(s)
              </p>
            </div>

            {loading && (
              <span className="rounded-full bg-pink-500/15 px-3 py-1 text-xs font-black text-pink-700 ring-1 ring-pink-500/25 dark:text-pink-300">
                Loading...
              </span>
            )}
          </div>

          <div className="w-full max-w-full overflow-x-auto">
            <table
              className="min-w-[980px] divide-y divide-slate-200 text-sm dark:divide-white/10"
              style={TABLE_SCROLL_FIX_STYLE}
            >
              <thead className="bg-slate-50 dark:bg-[#202020]">
                <tr>
                  <th className="px-4 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Receipt
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Customer
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Source
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Payment
                  </th>
                  <th className="px-4 py-4 text-right text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total
                  </th>
                  <th className="px-4 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-4 text-right text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-12 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                      Loading receipts...
                    </td>
                  </tr>
                ) : receipts.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-12 text-center">
                      <div className="mx-auto grid max-w-sm place-items-center gap-3">
                        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-pink-500/15 text-3xl ring-1 ring-pink-500/25">
                          🧾
                        </div>
                        <div>
                          <p className="font-black text-slate-950 dark:text-white">
                            No receipts found
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                            Try another search or clear the filters.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  receipts.map((receipt) => (
                    <tr key={receipt.id} className="transition hover:bg-pink-50/50 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-4 align-top">
                        <p className="max-w-[150px] break-words text-sm font-black leading-tight text-slate-950 dark:text-white">
                          {receipt.receipt_number}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {receipt.status || 'issued'}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <p className="max-w-[150px] break-words text-sm font-black text-slate-950 dark:text-white">
                          {receipt.customer_name || 'Walk-in Customer'}
                        </p>
                        <p className="mt-1 max-w-[160px] break-words text-xs font-medium text-slate-500 dark:text-slate-400">
                          {receipt.customer_phone || receipt.customer_email || '—'}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span className={`inline-flex max-w-[170px] items-center rounded-full px-3 py-1 text-xs font-black ring-1 ${getReceiptAccent(receipt.source_type)}`}>
                          {formatSourceLabel(receipt.source_type)}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <p className="text-sm font-black capitalize text-slate-800 dark:text-slate-100">
                          {receipt.payment_method || '—'}
                        </p>
                        <p className="mt-1 max-w-[210px] break-words text-xs font-medium text-slate-500 dark:text-slate-400">
                          {receipt.payment_reference || 'No reference'}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-right align-top">
                        <p className="text-base font-black text-yellow-600 dark:text-yellow-300">
                          {formatCurrency(receipt.total_amount)}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <p className="max-w-[120px] text-sm font-bold text-slate-700 dark:text-slate-300">
                          {formatDateTime(receipt.issued_at)}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewReceipt(receipt)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-[#222222] dark:text-slate-200 dark:hover:bg-[#2b2b2b]"
                          >
                            View
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickPrint(receipt)}
                            className="rounded-xl bg-pink-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-500"
                          >
                            Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-white/10 dark:bg-[#151515] md:flex-row md:items-center md:justify-between">
            <div className="font-bold text-slate-600 dark:text-slate-300">
              Showing page {page} of {totalPages} • {totalCount} receipt(s)
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-[#222222] dark:text-slate-200 dark:hover:bg-[#2b2b2b]"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-[#222222] dark:text-slate-200 dark:hover:bg-[#2b2b2b]"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#181818]">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 p-4 backdrop-blur dark:border-white/10 dark:bg-[#181818]/95">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-pink-600 dark:text-pink-300">
                  Official Receipt
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                  {selectedReceipt.receipt_number}
                </h2>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {formatDateTime(selectedReceipt.issued_at)}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-[#222222] dark:text-slate-200 dark:hover:bg-[#2b2b2b]"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              {viewLoading ? (
                <div className="py-10 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                  Loading receipt...
                </div>
              ) : (
                <>
                  <div className="mb-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#101010]">
                      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Customer
                      </p>
                      <p className="mt-2 font-black text-slate-950 dark:text-white">
                        {selectedReceipt.customer_name || 'Walk-in Customer'}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                        {selectedReceipt.customer_phone || '—'}
                      </p>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        {selectedReceipt.customer_email || '—'}
                      </p>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#101010]">
                      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Payment
                      </p>
                      <p className="mt-2 font-black text-slate-950 dark:text-white">
                        {selectedReceipt.payment_method || '—'}
                      </p>
                      <p className="mt-1 break-words text-sm font-medium text-slate-600 dark:text-slate-300">
                        Ref: {selectedReceipt.payment_reference || '—'}
                      </p>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        Source: {formatSourceLabel(selectedReceipt.source_type)}
                      </p>
                    </div>
                  </div>

                  <div className="w-full max-w-full overflow-x-auto rounded-3xl border border-slate-200 dark:border-white/10">
                    <table
                      className="min-w-full divide-y divide-slate-200 text-sm dark:divide-white/10"
                      style={TABLE_SCROLL_FIX_STYLE}
                    >
                      <thead className="bg-slate-50 dark:bg-[#202020]">
                        <tr>
                          <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Item
                          </th>
                          <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Type
                          </th>
                          <th className="px-3 py-3 text-center text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Qty
                          </th>
                          <th className="px-3 py-3 text-right text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Unit
                          </th>
                          <th className="px-3 py-3 text-right text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Total
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                        {selectedItems.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="px-3 py-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                              No receipt items found.
                            </td>
                          </tr>
                        ) : (
                          selectedItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-3 font-black text-slate-950 dark:text-white">
                                {item.item_name}
                              </td>
                              <td className="px-3 py-3 capitalize font-semibold text-slate-600 dark:text-slate-300">
                                {item.item_type}
                              </td>
                              <td className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                                {formatCurrency(item.unit_price)}
                              </td>
                              <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">
                                {formatCurrency(item.line_total)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5 ml-auto max-w-sm rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#101010]">
                    <div className="flex justify-between py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>Subtotal</span>
                      <strong>{formatCurrency(selectedReceipt.subtotal)}</strong>
                    </div>

                    <div className="flex justify-between py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>Discount</span>
                      <strong>{formatCurrency(selectedReceipt.discount_amount)}</strong>
                    </div>

                    <div className="flex justify-between py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>Tax</span>
                      <strong>{formatCurrency(selectedReceipt.tax_amount)}</strong>
                    </div>

                    <div className="mt-2 flex justify-between border-t border-slate-200 pt-3 text-lg font-black text-slate-950 dark:border-white/10 dark:text-white">
                      <span>Total</span>
                      <span className="text-yellow-600 dark:text-yellow-300">
                        {formatCurrency(selectedReceipt.total_amount)}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>Paid</span>
                      <strong>{formatCurrency(selectedReceipt.amount_paid)}</strong>
                    </div>

                    <div className="flex justify-between py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>Balance</span>
                      <strong>{formatCurrency(selectedReceipt.balance_amount)}</strong>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintReceipt()}
                      className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-500"
                    >
                      Print Receipt
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}