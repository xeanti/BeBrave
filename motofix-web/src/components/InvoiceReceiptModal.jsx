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

function getStatusClasses(status) {
  const normalized = String(status || '').toLowerCase();

  if (['paid', 'issued', 'completed'].includes(normalized)) {
    return 'bg-green-50 text-green-700 ring-green-200';
  }

  if (['partial', 'pending', 'unpaid'].includes(normalized)) {
    return 'bg-yellow-50 text-yellow-700 ring-yellow-200';
  }

  if (['cancelled', 'refunded', 'void'].includes(normalized)) {
    return 'bg-red-50 text-red-700 ring-red-200';
  }

  return 'bg-gray-100 text-gray-700 ring-gray-200';
}

function normalizeItems({ items = [], order = null, booking = null }) {
  if (items?.length) return items;

  if (order?.order_items?.length) {
    return order.order_items.map((item) => {
      const unitPrice = Number(item.unit_price) || 0;
      const quantity = Number(item.quantity) || 0;

      return {
        label: item.parts?.name || item.name || 'Part',
        description: `${item.parts?.category || 'Part'} · ${formatPeso(unitPrice)} × ${quantity}`,
        quantity,
        amount: Number(item.subtotal) || unitPrice * quantity,
      };
    });
  }

  if (booking?.services) {
    const basePrice = Number(booking.services?.base_price) || 0;
    const laborCost = Number(booking.services?.labor_cost) || 0;

    return [
      {
        label: booking.services?.name || 'Service Booking',
        description: 'Motorcycle service',
        quantity: 1,
        amount: basePrice + laborCost,
      },
    ];
  }

  return [];
}

export default function InvoiceReceiptModal({
  isOpen,
  type = 'invoice',
  invoice = null,
  receipt = null,
  payment = null,
  payments = [],
  order = null,
  booking = null,
  customerName = 'Customer',
  items = [],
  onClose,
}) {
  const documentType = type === 'receipt' ? 'receipt' : 'invoice';
  const activeReceipt = receipt || payment || null;
  const visible = isOpen ?? Boolean(invoice || activeReceipt);

  if (!visible) return null;

  const displayItems = normalizeItems({ items, order, booking });

  const invoiceNumber =
    invoice?.invoice_number || invoice?.invoiceNumber || 'INV-PENDING';

  const receiptNumber =
    activeReceipt?.receipt_number ||
    activeReceipt?.receiptNumber ||
    activeReceipt?.referenceId ||
    'OR-PENDING';

  const documentNumber =
    documentType === 'receipt' ? receiptNumber : invoiceNumber;

  const issuedAt =
    documentType === 'receipt'
      ? activeReceipt?.receipt_issued_at ||
        activeReceipt?.receiptIssuedAt ||
        activeReceipt?.created_at ||
        activeReceipt?.issuedAt
      : invoice?.issued_at || invoice?.issuedAt || invoice?.created_at;

  const totalAmount =
    documentType === 'receipt'
      ? Number(activeReceipt?.total || activeReceipt?.total_amount || order?.total_amount || booking?.total_amount || 0)
      : Number(invoice?.total_amount || invoice?.totalAmount || order?.total_amount || booking?.total_amount || 0);

  const amountPaid =
    documentType === 'receipt'
      ? Number(activeReceipt?.amount || activeReceipt?.amountPaid || activeReceipt?.amount_paid || 0)
      : Number(invoice?.amount_paid || invoice?.amountPaid || 0);

  const balanceDue =
    documentType === 'receipt'
      ? Math.max(totalAmount - amountPaid, 0)
      : Number(invoice?.balance_due || invoice?.balanceDue || Math.max(totalAmount - amountPaid, 0));

  const status =
    documentType === 'receipt'
      ? activeReceipt?.receipt_status || activeReceipt?.receiptStatus || 'issued'
      : invoice?.status || 'unpaid';

  const method =
    activeReceipt?.method || activeReceipt?.paymentMethod || activeReceipt?.payment_method || '—';

  const paymentType =
    activeReceipt?.payment_type || activeReceipt?.paymentType || 'payment';

  const referenceId =
    invoice?.order_id ||
    invoice?.booking_id ||
    activeReceipt?.order_id ||
    activeReceipt?.booking_id ||
    order?.id ||
    booking?.id ||
    documentNumber;

  function handlePrint() {
  const printContent = document.querySelector('.invoice-receipt-print-area');

  if (!printContent) {
    alert('Receipt content not found.');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=800,height=900');

  if (!printWindow) {
    alert('Please allow pop-ups to print the receipt.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${documentType === 'receipt' ? 'MotoFix Receipt' : 'MotoFix Invoice'}</title>
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
            background: white;
            font-family: Arial, sans-serif;
            color: #111827;
          }

          .print-wrapper {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
          }

          button,
          .invoice-receipt-actions {
            display: none !important;
          }

          .invoice-receipt-print-area {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        </style>
      </head>

      <body>
        <div class="print-wrapper">
          ${printContent.innerHTML}
        </div>

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
  `);

  printWindow.document.close();
  }

  return (
    <>
      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .invoice-receipt-print-area,
          .invoice-receipt-print-area * {
            visibility: visible !important;
          }

          .invoice-receipt-actions,
          .invoice-receipt-actions * {
            display: none !important;
            visibility: hidden !important;
          }

          .invoice-receipt-overlay {
            position: static !important;
            inset: auto !important;
            display: block !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 0 !important;
          }

          .invoice-receipt-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div
      className="invoice-receipt-overlay fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm print:static print:block print:bg-white print:p-0"
      onClick={onClose}
    >
      <div
        className="invoice-receipt-print-area w-full max-w-2xl overflow-hidden rounded-3xl bg-white text-gray-950 shadow-2xl print:max-w-none print:rounded-none print:shadow-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-5 print:bg-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-2xl font-black tracking-tight">
                Moto<span className="text-pink-600">Fix</span>
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-gray-500">
                {documentType === 'receipt' ? 'Official E-Receipt' : 'Customer Invoice'}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Generated on {formatDateTime(issuedAt || new Date().toISOString())}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                {documentType === 'receipt' ? 'Receipt No.' : 'Invoice No.'}
              </p>
              <p className="mt-1 font-mono text-sm font-black text-gray-950">
                {documentNumber}
              </p>
              <span
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${getStatusClasses(status)}`}
              >
                {String(status).replaceAll('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                Billed To
              </p>
              <p className="mt-1 text-sm font-black">{customerName}</p>
              <p className="mt-1 text-xs text-gray-500">
                Reference: {String(referenceId || '').slice(0, 8).toUpperCase()}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                Transaction Details
              </p>
              {documentType === 'receipt' ? (
                <>
                  <p className="mt-1 text-sm font-black capitalize">
                    {String(paymentType).replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 text-xs uppercase text-gray-500">Method: {method}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm font-black capitalize">
                    {order ? 'Parts Order' : booking ? 'Service Booking' : 'Invoice'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Due date: {invoice?.due_date || invoice?.dueDate || 'Upon confirmation'}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mb-5 overflow-hidden rounded-2xl border border-gray-200">
            <div className="grid grid-cols-[1fr_90px] bg-gray-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-gray-500">
              <span>Description</span>
              <span className="text-right">Amount</span>
            </div>

            {displayItems.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {displayItems.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="grid grid-cols-[1fr_90px] gap-3 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-black">{item.label}</p>
                      {item.description && (
                        <p className="mt-1 text-xs text-gray-500">{item.description}</p>
                      )}
                    </div>
                    <p className="text-right font-black">{formatPeso(item.amount)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5 text-center text-sm font-semibold text-gray-500">
                No line items available.
              </div>
            )}
          </div>

          {documentType === 'invoice' && payments.length > 0 && (
            <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500">
                Payments Applied
              </p>
              <div className="space-y-2">
                {payments.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3 text-xs">
                    <span className="text-gray-600">
                      {item.receipt_number || 'Receipt pending'} ·{' '}
                      {String(item.payment_type || 'payment').replaceAll('_', ' ')}
                    </span>
                    <span className="font-black">{formatPeso(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ml-auto max-w-sm space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Amount</span>
              <span className="font-black">{formatPeso(totalAmount)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {documentType === 'receipt' ? 'Amount Paid' : 'Amount Paid'}
              </span>
              <span className="font-black text-green-600">{formatPeso(amountPaid)}</span>
            </div>

            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between text-base">
                <span className="font-black">Balance Due</span>
                <span
                  className={`font-black ${balanceDue > 0 ? 'text-yellow-600' : 'text-green-600'}`}
                >
                  {formatPeso(balanceDue)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-gray-300 p-4 text-center">
            <p className="text-xs font-semibold text-gray-500">
              {documentType === 'receipt'
                ? 'This e-receipt is system-generated after a payment has been recorded by MotoFix.'
                : 'This invoice is system-generated for billing and balance tracking.'}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Thank you for choosing MotoFix.
            </p>
          </div>
        </div>

        <div className="invoice-receipt-actions flex gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 rounded-2xl bg-pink-600 px-4 py-3 text-sm font-black text-white transition hover:bg-pink-700"
          >
            🖨️ Print / Save PDF
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-gray-300 px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-white"
          >
            Close
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
