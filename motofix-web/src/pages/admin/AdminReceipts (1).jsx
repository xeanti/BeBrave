import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabaseClient';
import { alertAction } from '../../components/ConfirmModal';

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

function sanitizeReceiptSearch(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[%(),`"'\\]/g, '')
    .replace(/[^a-zA-Z0-9ñÑ @._+\-\/#]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 120);
}

function getReceiptAccent(sourceType) {
  if (sourceType === 'product_counter_sale') return 'bg-pink-500/15 text-pink-700 ring-pink-500/25 dark:text-pink-300';
  if (sourceType === 'booking') return 'bg-blue-500/15 text-blue-700 ring-blue-500/25 dark:text-blue-300';
  if (sourceType === 'order') return 'bg-orange-500/15 text-orange-700 ring-orange-500/25 dark:text-orange-300';
  if (sourceType === 'walkin') return 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300';
  return 'bg-slate-500/15 text-slate-700 ring-slate-500/25 dark:text-slate-300';
}

function buildReceiptPrintHtml(receipt, items) {
  const safeItems = Array.isArray(items) ? items : [];
  const amountPaid = Number(receipt?.amount_paid) || 0;
  const totalAmount = Number(receipt?.total_amount) || 0;
  const balanceAmount = Math.max(
    Number(receipt?.balance_amount ?? totalAmount - amountPaid) || 0,
    0
  );
  const status =
    balanceAmount <= 0
      ? 'PAID'
      : amountPaid > 0
        ? 'PARTIALLY PAID'
        : 'UNPAID';

  const rows = safeItems
    .map((item, index) => {
      const quantity = Math.max(1, Number(item?.quantity) || 1);
      const unitPrice = Number(item?.unit_price) || 0;
      const lineTotal =
        Number(item?.line_total) || unitPrice * quantity;

      return `
        <tr>
          <td class="line-no">${index + 1}</td>
          <td>
            <div class="item-name">${escapeHtml(
              item?.item_name || 'MotoFix Item'
            )}</div>
            ${
              item?.description
                ? `<div class="item-description">${escapeHtml(
                    item.description
                  )}</div>`
                : ''
            }
          </td>
          <td class="center">${escapeHtml(
            formatSourceLabel(item?.item_type || 'item')
          )}</td>
          <td class="center">${escapeHtml(quantity)}</td>
          <td class="money">${formatCurrency(unitPrice)}</td>
          <td class="money strong">${formatCurrency(lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  const paymentStatusClass =
    status === 'PAID'
      ? 'status-paid'
      : status === 'PARTIALLY PAID'
        ? 'status-partial'
        : 'status-unpaid';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${escapeHtml(
          receipt?.receipt_number || 'MotoFix Payment Receipt'
        )}</title>

        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #111827;
            font-family:
              Inter,
              Arial,
              Helvetica,
              sans-serif;
            font-size: 12px;
            line-height: 1.45;
          }

          body {
            padding: 0;
          }

          .receipt-page {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            background: #ffffff;
          }

          .receipt-frame {
            overflow: hidden;
            border: 1px solid #d1d5db;
            border-radius: 16px;
          }

          .brand-strip {
            height: 7px;
            background: linear-gradient(
              90deg,
              #db2777 0%,
              #ec4899 45%,
              #f59e0b 100%
            );
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            padding: 24px 26px 20px;
            border-bottom: 1px solid #e5e7eb;
          }

          .brand-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .brand-mark {
            display: grid;
            width: 48px;
            height: 48px;
            place-items: center;
            border-radius: 14px;
            background: #fce7f3;
            color: #db2777;
            font-size: 25px;
            font-weight: 900;
          }

          .brand-name {
            margin: 0;
            font-size: 27px;
            font-weight: 900;
            letter-spacing: -0.04em;
          }

          .brand-name span {
            color: #db2777;
          }

          .brand-subtitle {
            margin: 2px 0 0;
            color: #6b7280;
            font-size: 11px;
            font-weight: 600;
          }

          .document-title {
            min-width: 250px;
            text-align: right;
          }

          .document-title h2 {
            margin: 0;
            color: #111827;
            font-size: 19px;
            font-weight: 900;
            letter-spacing: 0.06em;
          }

          .receipt-number {
            margin-top: 6px;
            color: #db2777;
            font-family: Consolas, Monaco, monospace;
            font-size: 13px;
            font-weight: 900;
            word-break: break-word;
          }

          .issued-date {
            margin-top: 4px;
            color: #6b7280;
            font-size: 11px;
          }

          .status-badge {
            display: inline-flex;
            margin-top: 9px;
            border: 1px solid;
            border-radius: 999px;
            padding: 5px 10px;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.08em;
          }

          .status-paid {
            border-color: #86efac;
            background: #f0fdf4;
            color: #166534;
          }

          .status-partial {
            border-color: #fde68a;
            background: #fffbeb;
            color: #92400e;
          }

          .status-unpaid {
            border-color: #fecaca;
            background: #fef2f2;
            color: #991b1b;
          }

          .content {
            padding: 22px 26px 26px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 22px;
          }

          .info-card {
            min-height: 118px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #f9fafb;
            padding: 14px 16px;
          }

          .info-card-title {
            margin: 0 0 10px;
            color: #9ca3af;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .info-row {
            display: grid;
            grid-template-columns: 90px minmax(0, 1fr);
            gap: 10px;
            margin-top: 7px;
          }

          .info-label {
            color: #6b7280;
            font-size: 10px;
            font-weight: 700;
          }

          .info-value {
            min-width: 0;
            color: #111827;
            font-size: 11px;
            font-weight: 800;
            overflow-wrap: anywhere;
          }

          .section-title {
            margin: 0 0 9px;
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }

          .items-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            overflow: hidden;
            border: 1px solid #d1d5db;
            border-radius: 12px;
          }

          .items-table thead {
            display: table-header-group;
          }

          .items-table th {
            border-bottom: 1px solid #d1d5db;
            background: #111827;
            color: #ffffff;
            padding: 9px 8px;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-align: left;
            text-transform: uppercase;
          }

          .items-table td {
            border-bottom: 1px solid #e5e7eb;
            padding: 9px 8px;
            vertical-align: top;
          }

          .items-table tbody tr:last-child td {
            border-bottom: 0;
          }

          .items-table tbody tr:nth-child(even) {
            background: #f9fafb;
          }

          .line-no {
            width: 32px;
            color: #9ca3af;
            text-align: center;
          }

          .item-name {
            color: #111827;
            font-weight: 800;
          }

          .item-description {
            margin-top: 2px;
            color: #6b7280;
            font-size: 10px;
          }

          .center {
            text-align: center;
          }

          .money {
            white-space: nowrap;
            text-align: right;
          }

          .strong {
            font-weight: 900;
          }

          .empty-row {
            padding: 22px !important;
            color: #6b7280;
            text-align: center;
            font-weight: 700;
          }

          .summary-wrap {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 330px;
            gap: 22px;
            align-items: end;
            margin-top: 20px;
          }

          .payment-note {
            border: 1px dashed #d1d5db;
            border-radius: 12px;
            padding: 14px;
            color: #6b7280;
            font-size: 10px;
          }

          .payment-note strong {
            color: #374151;
          }

          .totals {
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #f9fafb;
            padding: 13px 15px;
          }

          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            padding: 5px 0;
            color: #4b5563;
          }

          .total-row strong {
            color: #111827;
          }

          .total-row.grand-total {
            margin-top: 5px;
            border-top: 1px solid #d1d5db;
            padding-top: 10px;
            color: #111827;
            font-size: 15px;
            font-weight: 900;
          }

          .total-row.amount-paid strong {
            color: #15803d;
          }

          .total-row.balance-due {
            margin-top: 4px;
            border-radius: 8px;
            background: ${
              balanceAmount > 0 ? '#fffbeb' : '#f0fdf4'
            };
            padding: 8px 10px;
            color: ${
              balanceAmount > 0 ? '#92400e' : '#166534'
            };
            font-weight: 900;
          }

          .total-row.balance-due strong {
            color: inherit;
          }

          .footer {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 20px;
            align-items: end;
            margin-top: 26px;
            border-top: 1px solid #e5e7eb;
            padding-top: 16px;
          }

          .footer-message {
            color: #6b7280;
            font-size: 10px;
          }

          .footer-message strong {
            color: #374151;
          }

          .system-note {
            max-width: 240px;
            text-align: right;
            color: #9ca3af;
            font-size: 9px;
          }

          .signature-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-top: 38px;
          }

          .signature {
            border-top: 1px solid #9ca3af;
            padding-top: 6px;
            color: #6b7280;
            font-size: 9px;
            text-align: center;
          }

          @media screen and (max-width: 650px) {
            .header,
            .info-grid,
            .summary-wrap,
            .footer {
              grid-template-columns: 1fr;
            }

            .header {
              display: block;
            }

            .document-title {
              min-width: 0;
              margin-top: 18px;
              text-align: left;
            }

            .info-grid,
            .summary-wrap {
              display: grid;
            }
          }

          @media print {
            html,
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            .receipt-frame {
              break-inside: avoid;
              box-shadow: none;
            }

            .items-table tr,
            .info-card,
            .totals {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <main class="receipt-page">
          <article class="receipt-frame">
            <div class="brand-strip"></div>

            <header class="header">
              <div>
                <div class="brand-row">
                  <div class="brand-mark">🏍️</div>

                  <div>
                    <h1 class="brand-name">Moto<span>Fix</span></h1>
                    <p class="brand-subtitle">
                      Motorcycle Service and Product Management
                    </p>
                  </div>
                </div>
              </div>

              <div class="document-title">
                <h2>PAYMENT RECEIPT</h2>

                <div class="receipt-number">
                  ${escapeHtml(
                    receipt?.receipt_number || 'RECEIPT-PENDING'
                  )}
                </div>

                <div class="issued-date">
                  ${formatDateTime(receipt?.issued_at)}
                </div>

                <span class="status-badge ${paymentStatusClass}">
                  ${status}
                </span>
              </div>
            </header>

            <div class="content">
              <section class="info-grid">
                <div class="info-card">
                  <p class="info-card-title">Customer Information</p>

                  <div class="info-row">
                    <span class="info-label">Name</span>
                    <span class="info-value">
                      ${escapeHtml(
                        receipt?.customer_name || 'Walk-in Customer'
                      )}
                    </span>
                  </div>

                  <div class="info-row">
                    <span class="info-label">Phone</span>
                    <span class="info-value">
                      ${escapeHtml(receipt?.customer_phone || '—')}
                    </span>
                  </div>

                  <div class="info-row">
                    <span class="info-label">Email</span>
                    <span class="info-value">
                      ${escapeHtml(receipt?.customer_email || '—')}
                    </span>
                  </div>
                </div>

                <div class="info-card">
                  <p class="info-card-title">Payment Information</p>

                  <div class="info-row">
                    <span class="info-label">Source</span>
                    <span class="info-value">
                      ${escapeHtml(
                        formatSourceLabel(receipt?.source_type)
                      )}
                    </span>
                  </div>

                  <div class="info-row">
                    <span class="info-label">Method</span>
                    <span class="info-value">
                      ${escapeHtml(receipt?.payment_method || '—')}
                    </span>
                  </div>

                  <div class="info-row">
                    <span class="info-label">Reference</span>
                    <span class="info-value">
                      ${escapeHtml(receipt?.payment_reference || '—')}
                    </span>
                  </div>
                </div>
              </section>

              <section>
                <h3 class="section-title">Transaction Details</h3>

                <table class="items-table">
                  <thead>
                    <tr>
                      <th style="width:32px;">#</th>
                      <th>Item / Service</th>
                      <th style="width:95px;text-align:center;">Type</th>
                      <th style="width:48px;text-align:center;">Qty</th>
                      <th style="width:105px;text-align:right;">Unit Price</th>
                      <th style="width:110px;text-align:right;">Line Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      rows ||
                      `
                        <tr>
                          <td class="empty-row" colspan="6">
                            No receipt items were recorded.
                          </td>
                        </tr>
                      `
                    }
                  </tbody>
                </table>
              </section>

              <section class="summary-wrap">
                <div>
                  <div class="payment-note">
                    <strong>Payment acknowledgment:</strong><br />
                    This document confirms the payment recorded by MotoFix.
                    Keep this receipt for service warranty, payment verification,
                    and future reference.
                  </div>

                  <div class="signature-row">
                    <div class="signature">Customer Signature</div>
                    <div class="signature">Authorized MotoFix Staff</div>
                  </div>
                </div>

                <div class="totals">
                  <div class="total-row">
                    <span>Subtotal</span>
                    <strong>${formatCurrency(receipt?.subtotal)}</strong>
                  </div>

                  <div class="total-row">
                    <span>Discount</span>
                    <strong>- ${formatCurrency(
                      receipt?.discount_amount
                    )}</strong>
                  </div>

                  <div class="total-row">
                    <span>Tax</span>
                    <strong>${formatCurrency(receipt?.tax_amount)}</strong>
                  </div>

                  <div class="total-row grand-total">
                    <span>Total Amount</span>
                    <strong>${formatCurrency(totalAmount)}</strong>
                  </div>

                  <div class="total-row amount-paid">
                    <span>Amount Paid</span>
                    <strong>${formatCurrency(amountPaid)}</strong>
                  </div>

                  <div class="total-row balance-due">
                    <span>Balance</span>
                    <strong>${formatCurrency(balanceAmount)}</strong>
                  </div>
                </div>
              </section>

              <footer class="footer">
                <div class="footer-message">
                  <strong>Thank you for choosing MotoFix.</strong><br />
                  Reliable motorcycle service, repairs, and parts in one place.
                </div>

                <div class="system-note">
                  System-generated official receipt<br />
                  Receipt No.:
                  ${escapeHtml(
                    receipt?.receipt_number || 'RECEIPT-PENDING'
                  )}
                </div>
              </footer>
            </div>
          </article>
        </main>

        <script>
          window.addEventListener('load', function () {
            window.focus();

            window.setTimeout(function () {
              window.print();
            }, 250);
          });

          window.addEventListener('afterprint', function () {
            window.close();
          });
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
  const [appliedSearch, setAppliedSearch] = useState('');
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

  const requestIdRef = useRef(0);
  const refreshTimerRef = useRef(null);

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

  const loadReceipts = useCallback(
    async ({ showLoader = true } = {}) => {
      const requestId = ++requestIdRef.current;

      if (showLoader) setLoading(true);
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

        if (appliedSearch) {
          query = query.or(
            [
              `receipt_number.ilike.%${appliedSearch}%`,
              `customer_name.ilike.%${appliedSearch}%`,
              `customer_phone.ilike.%${appliedSearch}%`,
              `customer_email.ilike.%${appliedSearch}%`,
              `payment_reference.ilike.%${appliedSearch}%`,
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
        if (requestId !== requestIdRef.current) return;

        const nextTotalCount = count || 0;
        const nextTotalPages = Math.max(
          1,
          Math.ceil(nextTotalCount / pageSize)
        );

        // If records were removed and the current page no longer exists,
        // move back to the final valid page before committing the stale page.
        if (page > nextTotalPages) {
          setPage(nextTotalPages);
          return;
        }

        setReceipts(data || []);
        setTotalCount(nextTotalCount);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;

        console.error('Failed to load receipt history:', error);
        setErrorMessage(error.message || 'Failed to load receipts.');
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [
      appliedSearch,
      dateFrom,
      dateTo,
      page,
      pageSize,
      paymentMethod,
      sourceType,
    ]
  );

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    let mounted = true;

    function scheduleRefresh() {
      if (!mounted) return;

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(async () => {
        if (!mounted) return;

        await loadReceipts({ showLoader: false });

        if (selectedReceipt?.id) {
          try {
            const items = await loadReceiptItems(selectedReceipt);

            if (mounted) {
              setSelectedItems(items);
            }
          } catch (error) {
            console.warn(
              'Receipt header refreshed, but receipt items could not be refreshed:',
              error
            );
          }
        }
      }, 180);
    }

    const channel = supabase
      .channel(
        `admin-receipts-live-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipts',
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipt_items',
        },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (!mounted) return;

        if (status === 'CHANNEL_ERROR') {
          console.warn(
            'Receipt live updates are temporarily unavailable. Manual refresh still works.'
          );
        }
      });

    function handleFocus() {
      scheduleRefresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    }

    window.addEventListener('focus', handleFocus);
    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      mounted = false;

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }

      window.removeEventListener('focus', handleFocus);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
      supabase.removeChannel(channel);
    };
  }, [loadReceipts, selectedReceipt]);

  useEffect(() => {
    if (!selectedReceipt) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(
      window.innerWidth - document.documentElement.clientWidth,
      0
    );

    document.body.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        handleCloseModal();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedReceipt]);

  function handleSearchSubmit(event) {
    event.preventDefault();

    const cleanSearch = sanitizeReceiptSearch(search);

    setSearch(cleanSearch);
    setAppliedSearch(cleanSearch);
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setAppliedSearch('');
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
      void alertAction({
        title: 'No Receipt Selected',
        message: 'Please select a receipt before printing.',
        confirmLabel: 'Okay',
        tone: 'warning',
      });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=850,height=900');

    if (!printWindow) {
      void alertAction({
        title: 'Pop-up Blocked',
        message:
          'Please allow pop-ups for MotoFix, then try printing the receipt again.',
        confirmLabel: 'Okay',
        tone: 'warning',
      });
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
                onClick={() => loadReceipts()}
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
                onChange={(event) =>
                  setSearch(
                    sanitizeReceiptSearch(event.target.value)
                  )
                }
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
                {appliedSearch ? ` • Search: “${appliedSearch}”` : ''}
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

      {selectedReceipt &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleCloseModal();
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-receipt-modal-title"
              className="relative mx-auto overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl outline-none dark:border-white/10 dark:bg-[#181818]"
              style={{
                width: 'min(calc(100vw - 32px), 760px)',
                maxWidth: 760,
                maxHeight: 'calc(100dvh - 32px)',
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 p-4 backdrop-blur dark:border-white/10 dark:bg-[#181818]/95">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-pink-600 dark:text-pink-300">
                    Payment Receipt
                  </p>
                  <h2
                    id="admin-receipt-modal-title"
                    className="mt-1 break-words text-lg font-black text-slate-950 dark:text-white"
                  >
                    {selectedReceipt.receipt_number}
                  </h2>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {formatDateTime(selectedReceipt.issued_at)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-lg font-black text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-[#222222] dark:text-slate-200 dark:hover:bg-[#2b2b2b]"
                  aria-label="Close receipt"
                >
                  ×
                </button>
              </div>

              <div
                className="overflow-y-auto p-5"
                style={{
                  maxHeight: 'calc(100dvh - 120px)',
                }}
              >
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
                        <p className="mt-2 break-words font-black text-slate-950 dark:text-white">
                          {selectedReceipt.customer_name || 'Walk-in Customer'}
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-slate-600 dark:text-slate-300">
                          {selectedReceipt.customer_phone || '—'}
                        </p>
                        <p className="break-words text-sm font-medium text-slate-600 dark:text-slate-300">
                          {selectedReceipt.customer_email || '—'}
                        </p>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#101010]">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Payment
                        </p>
                        <p className="mt-2 break-words font-black text-slate-950 dark:text-white">
                          {selectedReceipt.payment_method || '—'}
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-slate-600 dark:text-slate-300">
                          Ref: {selectedReceipt.payment_reference || '—'}
                        </p>
                        <p className="break-words text-sm font-medium text-slate-600 dark:text-slate-300">
                          Source: {formatSourceLabel(selectedReceipt.source_type)}
                        </p>
                      </div>
                    </div>

                    <div className="w-full overflow-x-auto rounded-3xl border border-slate-200 dark:border-white/10">
                      <table className="min-w-[620px] divide-y divide-slate-200 text-sm dark:divide-white/10">
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
                              <td
                                colSpan="5"
                                className="px-3 py-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400"
                              >
                                No receipt items found.
                              </td>
                            </tr>
                          ) : (
                            selectedItems.map((item) => (
                              <tr key={item.id}>
                                <td className="max-w-[220px] break-words px-3 py-3 font-black text-slate-950 dark:text-white">
                                  {item.item_name}
                                </td>
                                <td className="px-3 py-3 capitalize font-semibold text-slate-600 dark:text-slate-300">
                                  {item.item_type}
                                </td>
                                <td className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                                  {item.quantity}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                                  {formatCurrency(item.unit_price)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 text-right font-black text-slate-950 dark:text-white">
                                  {formatCurrency(item.line_total)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-5 ml-auto w-full max-w-sm rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#101010]">
                      <div className="flex justify-between gap-4 py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <span>Subtotal</span>
                        <strong>{formatCurrency(selectedReceipt.subtotal)}</strong>
                      </div>

                      <div className="flex justify-between gap-4 py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <span>Discount</span>
                        <strong>{formatCurrency(selectedReceipt.discount_amount)}</strong>
                      </div>

                      <div className="flex justify-between gap-4 py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <span>Tax</span>
                        <strong>{formatCurrency(selectedReceipt.tax_amount)}</strong>
                      </div>

                      <div className="mt-2 flex justify-between gap-4 border-t border-slate-200 pt-3 text-lg font-black text-slate-950 dark:border-white/10 dark:text-white">
                        <span>Total</span>
                        <span className="text-yellow-600 dark:text-yellow-300">
                          {formatCurrency(selectedReceipt.total_amount)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-4 py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <span>Paid</span>
                        <strong>{formatCurrency(selectedReceipt.amount_paid)}</strong>
                      </div>

                      <div className="flex justify-between gap-4 py-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <span>Balance</span>
                        <strong>{formatCurrency(selectedReceipt.balance_amount)}</strong>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="order-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-[#222222] dark:text-slate-200 dark:hover:bg-[#2b2b2b] sm:order-1"
                      >
                        Close
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePrintReceipt()}
                        className="order-1 rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-500 sm:order-2"
                      >
                        Print Receipt
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}