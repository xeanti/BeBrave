export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <div className="bg-white text-black rounded-xl max-w-sm w-full p-6 print:shadow-none"
        onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <p className="text-xl font-bold">MotoFix</p>
          <p className="text-xs text-gray-500">Official Receipt</p>
          <p className="text-xs text-gray-500">{new Date().toLocaleString('en-PH')}</p>
        </div>

        <div className="border-t border-b border-gray-300 py-3 space-y-1.5 text-sm mb-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Customer</span>
            <span>{receipt.customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Type</span>
            <span className="capitalize">{receipt.type}</span>
          </div>
          {receipt.items?.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-gray-600">{item.label}</span>
              <span>₱{Number(item.amount).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm mb-3">
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span>₱{Number(receipt.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-pink-600 font-semibold">
            <span>Amount Paid ({receipt.paymentMethod})</span>
            <span>₱{Number(receipt.amountPaid).toFixed(2)}</span>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mb-4">Receipt #{receipt.referenceId}</p>

        <div className="flex gap-2 print:hidden">
          <button onClick={() => window.print()}
            className="flex-1 bg-pink-600 text-white py-2 rounded-lg text-sm font-medium">
            🖨️ Print
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-300 py-2 rounded-lg text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}