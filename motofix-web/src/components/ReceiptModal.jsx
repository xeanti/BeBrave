export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;

  const issuedAt = receipt.issuedAt || receipt.receiptIssuedAt || new Date().toISOString();
  const receiptNumber =
    receipt.receiptNumber ||
    receipt.receipt_number ||
    receipt.referenceId ||
    'TEMP-RECEIPT';

  const paymentType = receipt.paymentType || receipt.payment_type || receipt.type || 'payment';
  const paymentMethod = receipt.paymentMethod || receipt.method || 'cash';

  function formatPeso(value) {
    return `₱${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDateTime(value) {
    if (!value) return new Date().toLocaleString('en-PH');

    return new Date(value).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 print:static print:bg-white print:p-0"
      style={{
        backdropFilter: 'blur(8px)',
        backgroundColor: 'rgba(0,0,0,0.7)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 text-black shadow-2xl print:max-w-none print:rounded-none print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center">
          <p className="text-2xl font-black">MotoFix</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Official Receipt
          </p>
          <p className="mt-1 text-xs text-gray-500">{formatDateTime(issuedAt)}</p>
        </div>

        <div className="mb-4 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Receipt Number
          </p>
          <p className="text-sm font-black text-gray-950">{receiptNumber}</p>
        </div>

        <div className="mb-3 space-y-1.5 border-y border-gray-300 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Customer</span>
            <span className="text-right font-semibold">{receipt.customerName || 'Customer'}</span>
          </div>

          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Transaction</span>
            <span className="text-right font-semibold capitalize">{receipt.type || 'payment'}</span>
          </div>

          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Payment Type</span>
            <span className="text-right font-semibold capitalize">
              {String(paymentType).replaceAll('_', ' ')}
            </span>
          </div>

          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Method</span>
            <span className="text-right font-semibold uppercase">{paymentMethod}</span>
          </div>

          {receipt.items?.map((item, i) => (
            <div key={`${item.label}-${i}`} className="flex justify-between gap-3 pt-1">
              <span className="text-gray-600">{item.label}</span>
              <span className="font-semibold">{formatPeso(item.amount)}</span>
            </div>
          ))}
        </div>

        <div className="mb-3 space-y-1 text-sm">
          <div className="flex justify-between text-base font-black">
            <span>Total</span>
            <span>{formatPeso(receipt.total)}</span>
          </div>

          <div className="flex justify-between font-bold text-pink-600">
            <span>Amount Paid</span>
            <span>{formatPeso(receipt.amountPaid)}</span>
          </div>

          <div className="flex justify-between text-gray-600">
            <span>Balance</span>
            <span>
              {formatPeso(
                Math.max(Number(receipt.total || 0) - Number(receipt.amountPaid || 0), 0)
              )}
            </span>
          </div>
        </div>

        <div className="mb-4 border-t border-dashed border-gray-300 pt-3 text-center">
          <p className="text-xs text-gray-500">
            Reference ID: {receipt.referenceId || receiptNumber}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            Thank you for choosing MotoFix.
          </p>
        </div>

        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-pink-600 py-2 text-sm font-bold text-white transition hover:bg-pink-700"
          >
            🖨️ Print
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-semibold transition hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}