import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { alertAction } from './ConfirmModal';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value) {
  const date = new Date(value || Date.now());

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString('en-PH');
  }

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
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

function normalizeReceiptItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item, index) => {
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    const lineTotal =
      Number(
        item?.lineTotal ??
          item?.line_total ??
          item?.subtotal ??
          item?.amount
      ) || 0;
    const unitPrice =
      Number(item?.unitPrice ?? item?.unit_price) ||
      (quantity > 0 ? lineTotal / quantity : lineTotal);

    return {
      id: item?.id || `${item?.label || item?.name || 'item'}-${index}`,
      label:
        item?.label ||
        item?.itemName ||
        item?.item_name ||
        item?.name ||
        'MotoFix Item',
      description:
        item?.description ||
        item?.itemType ||
        item?.item_type ||
        '',
      quantity,
      unitPrice,
      lineTotal,
    };
  });
}

function normalizeReceipt(receipt) {
  const items = normalizeReceiptItems(receipt?.items);
  const itemSubtotal = items.reduce(
    (sum, item) => sum + item.lineTotal,
    0
  );
  const subtotal =
    Number(receipt?.subtotal ?? receipt?.subtotalAmount) ||
    itemSubtotal ||
    Number(receipt?.total) ||
    0;
  const discountAmount =
    Number(receipt?.discountAmount ?? receipt?.discount_amount) || 0;
  const taxAmount =
    Number(receipt?.taxAmount ?? receipt?.tax_amount) || 0;
  const total =
    Number(receipt?.total ?? receipt?.totalAmount) ||
    Math.max(subtotal - discountAmount + taxAmount, 0);
  const amountPaid =
    Number(receipt?.amountPaid ?? receipt?.amount_paid) || 0;
  const balance =
    Number(
      receipt?.balance ??
        receipt?.balanceAmount ??
        receipt?.balance_amount
    );

  const safeBalance = Number.isFinite(balance)
    ? Math.max(balance, 0)
    : Math.max(total - amountPaid, 0);

  const status =
    receipt?.status ||
    (safeBalance <= 0
      ? 'paid'
      : amountPaid > 0
        ? 'partially_paid'
        : 'unpaid');

  return {
    customerName: receipt?.customerName || 'Customer',
    customerPhone: receipt?.customerPhone || '—',
    customerEmail: receipt?.customerEmail || '—',
    type: receipt?.type || 'payment',
    sourceLabel:
      receipt?.sourceLabel ||
      receipt?.transactionLabel ||
      formatLabel(receipt?.type || 'payment'),
    transactionLabel:
      receipt?.transactionLabel ||
      receipt?.sourceLabel ||
      formatLabel(receipt?.type || 'payment'),
    paymentType:
      receipt?.paymentType || receipt?.payment_type || 'payment',
    paymentMethod:
      receipt?.paymentMethod ||
      receipt?.payment_method ||
      receipt?.method ||
      'Cash',
    paymentReference:
      receipt?.paymentReference ||
      receipt?.payment_reference ||
      '—',
    receiptNumber:
      receipt?.receiptNumber ||
      receipt?.receipt_number ||
      receipt?.referenceId ||
      'RECEIPT-PENDING',
    issuedAt:
      receipt?.issuedAt ||
      receipt?.receiptIssuedAt ||
      receipt?.receipt_issued_at ||
      new Date().toISOString(),
    referenceId:
      receipt?.referenceId ||
      receipt?.orderId ||
      receipt?.bookingId ||
      receipt?.queueNumber ||
      '—',
    motorcycleModel: receipt?.motorcycleModel || '',
    mechanicName: receipt?.mechanicName || '',
    queueNumber: receipt?.queueNumber || '',
    notes: receipt?.notes || '',
    subtotal,
    discountAmount,
    taxAmount,
    total,
    amountPaid,
    balance: safeBalance,
    status,
    items,
  };
}

function getStatusDetails(status) {
  const value = String(status || '').toLowerCase();

  if (['paid', 'issued', 'completed'].includes(value)) {
    return {
      label: 'PAID',
      className: 'status-paid',
    };
  }

  if (
    ['partial', 'partially_paid', 'down_payment', 'balance'].includes(
      value
    )
  ) {
    return {
      label: 'PARTIALLY PAID',
      className: 'status-partial',
    };
  }

  return {
    label: 'UNPAID',
    className: 'status-unpaid',
  };
}

function buildProfessionalReceiptHtml(receipt) {
  const data = normalizeReceipt(receipt);
  const status = getStatusDetails(data.status);

  const itemRows = data.items
    .map(
      (item, index) => `
        <tr>
          <td class="line-number">${index + 1}</td>
          <td>
            <div class="item-name">${escapeHtml(item.label)}</div>
            ${
              item.description
                ? `<div class="item-description">${escapeHtml(
                    formatLabel(item.description)
                  )}</div>`
                : ''
            }
          </td>
          <td class="center">${item.quantity}</td>
          <td class="money">${formatPeso(item.unitPrice)}</td>
          <td class="money strong">${formatPeso(item.lineTotal)}</td>
        </tr>
      `
    )
    .join('');

  const optionalDetails = [
    data.queueNumber
      ? `<div class="detail-row"><span>Queue</span><strong>${escapeHtml(
          data.queueNumber
        )}</strong></div>`
      : '',
    data.motorcycleModel
      ? `<div class="detail-row"><span>Motorcycle</span><strong>${escapeHtml(
          data.motorcycleModel
        )}</strong></div>`
      : '',
    data.mechanicName
      ? `<div class="detail-row"><span>Mechanic</span><strong>${escapeHtml(
          data.mechanicName
        )}</strong></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${escapeHtml(data.receiptNumber)}</title>

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
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.45;
          }

          .receipt-page {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
          }

          .receipt-card {
            overflow: hidden;
            border: 1px solid #d1d5db;
            border-radius: 16px;
            background: #ffffff;
          }

          .accent-strip {
            height: 7px;
            background: linear-gradient(
              90deg,
              #db2777 0%,
              #ec4899 48%,
              #f59e0b 100%
            );
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            border-bottom: 1px solid #e5e7eb;
            padding: 23px 25px 19px;
          }

          .brand {
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
            font-size: 18px;
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
            font-size: 10px;
            font-weight: 700;
          }

          .document {
            min-width: 255px;
            text-align: right;
          }

          .document h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: 0.08em;
          }

          .receipt-number {
            margin-top: 5px;
            color: #db2777;
            font-family: Consolas, Monaco, monospace;
            font-size: 13px;
            font-weight: 900;
            overflow-wrap: anywhere;
          }

          .issued-at {
            margin-top: 3px;
            color: #6b7280;
            font-size: 10px;
          }

          .status {
            display: inline-flex;
            margin-top: 8px;
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
            padding: 21px 25px 25px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 13px;
            margin-bottom: 20px;
          }

          .info-card {
            min-height: 122px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #f9fafb;
            padding: 14px 15px;
          }

          .info-title {
            margin: 0 0 9px;
            color: #9ca3af;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .detail-row {
            display: grid;
            grid-template-columns: 90px minmax(0, 1fr);
            gap: 10px;
            margin-top: 6px;
          }

          .detail-row span {
            color: #6b7280;
            font-size: 10px;
            font-weight: 700;
          }

          .detail-row strong {
            min-width: 0;
            color: #111827;
            font-size: 10px;
            overflow-wrap: anywhere;
            text-align: right;
          }

          .section-title {
            margin: 0 0 8px;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }

          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            overflow: hidden;
            border: 1px solid #d1d5db;
            border-radius: 12px;
          }

          thead {
            display: table-header-group;
          }

          th {
            border-bottom: 1px solid #d1d5db;
            background: #111827;
            color: #ffffff;
            padding: 9px 8px;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.05em;
            text-align: left;
            text-transform: uppercase;
          }

          td {
            border-bottom: 1px solid #e5e7eb;
            padding: 9px 8px;
            vertical-align: top;
          }

          tbody tr:last-child td {
            border-bottom: 0;
          }

          tbody tr:nth-child(even) {
            background: #f9fafb;
          }

          .line-number {
            width: 32px;
            color: #9ca3af;
            text-align: center;
          }

          .item-name {
            font-weight: 800;
          }

          .item-description {
            margin-top: 2px;
            color: #6b7280;
            font-size: 9px;
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

          .summary {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 325px;
            gap: 20px;
            align-items: end;
            margin-top: 19px;
          }

          .acknowledgment {
            border: 1px dashed #d1d5db;
            border-radius: 12px;
            padding: 13px;
            color: #6b7280;
            font-size: 10px;
          }

          .acknowledgment strong {
            color: #374151;
          }

          .notes {
            margin-top: 8px;
            overflow-wrap: anywhere;
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
            gap: 18px;
            padding: 5px 0;
            color: #4b5563;
          }

          .total-row strong {
            white-space: nowrap;
            color: #111827;
          }

          .grand-total {
            margin-top: 5px;
            border-top: 1px solid #d1d5db;
            padding-top: 10px;
            color: #111827;
            font-size: 15px;
            font-weight: 900;
          }

          .amount-paid strong {
            color: #15803d;
          }

          .balance {
            margin-top: 4px;
            border-radius: 8px;
            background: ${
              data.balance > 0 ? '#fffbeb' : '#f0fdf4'
            };
            padding: 8px 10px;
            color: ${
              data.balance > 0 ? '#92400e' : '#166534'
            };
            font-weight: 900;
          }

          .balance strong {
            color: inherit;
          }

          .signature-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 38px;
            margin-top: 36px;
          }

          .signature {
            border-top: 1px solid #9ca3af;
            padding-top: 6px;
            color: #6b7280;
            font-size: 9px;
            text-align: center;
          }

          .footer {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            margin-top: 24px;
            border-top: 1px solid #e5e7eb;
            padding-top: 14px;
            color: #6b7280;
            font-size: 9px;
          }

          .footer strong {
            color: #374151;
          }

          .footer-reference {
            max-width: 250px;
            overflow-wrap: anywhere;
            text-align: right;
          }

          @media print {
            html,
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            .receipt-card,
            .info-card,
            .totals,
            tr {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <main class="receipt-page">
          <article class="receipt-card">
            <div class="accent-strip"></div>

            <header class="header">
              <div class="brand">
                <div class="brand-mark">MF</div>

                <div>
                  <h1 class="brand-name">Moto<span>Fix</span></h1>
                  <p class="brand-subtitle">
                    Motorcycle Service and Product Management
                  </p>
                </div>
              </div>

              <div class="document">
                <h2>PAYMENT RECEIPT</h2>

                <div class="receipt-number">
                  ${escapeHtml(data.receiptNumber)}
                </div>

                <div class="issued-at">
                  ${formatDateTime(data.issuedAt)}
                </div>

                <span class="status ${status.className}">
                  ${status.label}
                </span>
              </div>
            </header>

            <div class="content">
              <section class="info-grid">
                <div class="info-card">
                  <p class="info-title">Customer Information</p>

                  <div class="detail-row">
                    <span>Name</span>
                    <strong>${escapeHtml(data.customerName)}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Phone</span>
                    <strong>${escapeHtml(data.customerPhone)}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Email</span>
                    <strong>${escapeHtml(data.customerEmail)}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Reference ID</span>
                    <strong>${escapeHtml(data.referenceId)}</strong>
                  </div>
                </div>

                <div class="info-card">
                  <p class="info-title">Transaction Information</p>

                  <div class="detail-row">
                    <span>Transaction</span>
                    <strong>${escapeHtml(data.transactionLabel)}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Payment Type</span>
                    <strong>${escapeHtml(
                      formatLabel(data.paymentType)
                    )}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Method</span>
                    <strong>${escapeHtml(
                      formatLabel(data.paymentMethod)
                    )}</strong>
                  </div>

                  <div class="detail-row">
                    <span>Payment Ref.</span>
                    <strong>${escapeHtml(data.paymentReference)}</strong>
                  </div>

                  ${optionalDetails}
                </div>
              </section>

              <section>
                <h3 class="section-title">Items and Services</h3>

                <table>
                  <thead>
                    <tr>
                      <th style="width:32px;">#</th>
                      <th>Item / Service</th>
                      <th style="width:50px;text-align:center;">Qty</th>
                      <th style="width:105px;text-align:right;">Unit Price</th>
                      <th style="width:110px;text-align:right;">Line Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      itemRows ||
                      `
                        <tr>
                          <td class="empty-row" colspan="5">
                            No receipt items were recorded.
                          </td>
                        </tr>
                      `
                    }
                  </tbody>
                </table>
              </section>

              <section class="summary">
                <div>
                  <div class="acknowledgment">
                    <strong>Payment acknowledgment:</strong><br />
                    This document confirms the payment recorded by MotoFix.
                    Keep it for payment verification, warranty, and future
                    service reference.

                    ${
                      data.notes
                        ? `<div class="notes"><strong>Note:</strong> ${escapeHtml(
                            data.notes
                          )}</div>`
                        : ''
                    }
                  </div>

                  <div class="signature-grid">
                    <div class="signature">Customer Signature</div>
                    <div class="signature">Authorized MotoFix Staff</div>
                  </div>
                </div>

                <div class="totals">
                  <div class="total-row">
                    <span>Subtotal</span>
                    <strong>${formatPeso(data.subtotal)}</strong>
                  </div>

                  <div class="total-row">
                    <span>Discount</span>
                    <strong>- ${formatPeso(data.discountAmount)}</strong>
                  </div>

                  <div class="total-row">
                    <span>Tax</span>
                    <strong>${formatPeso(data.taxAmount)}</strong>
                  </div>

                  <div class="total-row grand-total">
                    <span>Total Amount</span>
                    <strong>${formatPeso(data.total)}</strong>
                  </div>

                  <div class="total-row amount-paid">
                    <span>Amount Paid</span>
                    <strong>${formatPeso(data.amountPaid)}</strong>
                  </div>

                  <div class="total-row balance">
                    <span>Balance</span>
                    <strong>${formatPeso(data.balance)}</strong>
                  </div>
                </div>
              </section>

              <footer class="footer">
                <div>
                  <strong>Thank you for choosing MotoFix.</strong><br />
                  Reliable motorcycle service, repairs, and parts.
                </div>

                <div class="footer-reference">
                  System-generated receipt<br />
                  ${escapeHtml(data.receiptNumber)}
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

export default function ReceiptModal({ receipt, onClose }) {
  useEffect(() => {
    if (!receipt) return undefined;

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
        onClose?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [receipt, onClose]);

  if (!receipt) return null;

  const data = normalizeReceipt(receipt);
  const status = getStatusDetails(data.status);

  async function handlePrint() {
    const printWindow = window.open(
      '',
      '_blank',
      'width=900,height=950'
    );

    if (!printWindow) {
      await alertAction('Please allow pop-ups to print the receipt.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      buildProfessionalReceiptHtml(receipt)
    );
    printWindow.document.close();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="motofix-immediate-receipt-title"
        className="relative mx-auto overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-950 shadow-2xl"
        style={{
          width: 'min(calc(100vw - 32px), 520px)',
          maxWidth: 520,
          maxHeight: 'calc(100dvh - 32px)',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white/95 p-5 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-600">
              Payment Receipt
            </p>

            <h2
              id="motofix-immediate-receipt-title"
              className="mt-1 break-all text-lg font-black"
            >
              {data.receiptNumber}
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {formatDateTime(data.issuedAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-gray-200 bg-gray-50 text-lg font-black text-gray-500 transition hover:bg-gray-100 hover:text-gray-950"
          >
            ×
          </button>
        </div>

        <div
          className="overflow-y-auto p-5"
          style={{
            maxHeight: 'calc(100dvh - 126px)',
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="text-xs font-black text-gray-950">
                Moto<span className="text-pink-600">Fix</span>
              </p>
              <p className="mt-1 text-[10px] font-semibold text-gray-500">
                {data.transactionLabel}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black ring-1 ${
                status.className === 'status-paid'
                  ? 'bg-green-50 text-green-700 ring-green-200'
                  : status.className === 'status-partial'
                    ? 'bg-yellow-50 text-yellow-700 ring-yellow-200'
                    : 'bg-red-50 text-red-700 ring-red-200'
              }`}
            >
              {status.label}
            </span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Customer
              </p>
              <p className="mt-2 break-words text-sm font-black">
                {data.customerName}
              </p>
              <p className="mt-1 break-words text-xs text-gray-500">
                {data.customerPhone}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Payment
              </p>
              <p className="mt-2 text-sm font-black">
                {formatLabel(data.paymentMethod)}
              </p>
              <p className="mt-1 break-all text-xs text-gray-500">
                Ref: {data.paymentReference}
              </p>
            </div>
          </div>

          <div className="mb-4 overflow-hidden rounded-2xl border border-gray-200">
            {data.items.length === 0 ? (
              <p className="p-5 text-center text-sm font-semibold text-gray-500">
                No receipt items recorded.
              </p>
            ) : (
              data.items.map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-4 text-sm ${
                    index > 0 ? 'border-t border-gray-200' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="break-words font-black">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.quantity} × {formatPeso(item.unitPrice)}
                    </p>
                  </div>

                  <p className="whitespace-nowrap font-black">
                    {formatPeso(item.lineTotal)}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="ml-auto mb-5 max-w-sm space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Subtotal</span>
              <strong>{formatPeso(data.subtotal)}</strong>
            </div>

            {data.discountAmount > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Discount</span>
                <strong>- {formatPeso(data.discountAmount)}</strong>
              </div>
            )}

            <div className="flex justify-between gap-4 border-t border-gray-200 pt-2 text-base">
              <span className="font-black">Total</span>
              <strong>{formatPeso(data.total)}</strong>
            </div>

            <div className="flex justify-between gap-4 text-green-700">
              <span className="font-bold">Amount Paid</span>
              <strong>{formatPeso(data.amountPaid)}</strong>
            </div>

            <div className="flex justify-between gap-4">
              <span className="font-bold">Balance</span>
              <strong
                className={
                  data.balance > 0
                    ? 'text-yellow-700'
                    : 'text-green-700'
                }
              >
                {formatPeso(data.balance)}
              </strong>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="order-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50 sm:order-1"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="order-1 rounded-2xl bg-pink-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-700 sm:order-2"
            >
              Print Receipt
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
