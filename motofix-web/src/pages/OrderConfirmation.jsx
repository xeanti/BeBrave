import { useLocation, useNavigate, Link } from 'react-router-dom';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMethod(method) {
  const value = String(method || '').toLowerCase();

  if (value === 'paymongo_qrph') return 'PayMongo QR Ph / GCash';
  if (value === 'gcash_manual') return 'GCash Manual Verification';
  if (value === 'cash_on_pickup') return 'Pay at Counter';

  return value ? value.replace(/_/g, ' ') : 'Payment Pending';
}

function getPaymentNotice({ paymentMethod, paymentStatus, downPayment, remainingBalance, checkoutUrl, total }) {
  const paid = String(paymentStatus || '').toLowerCase() === 'paid';

  if (paymentMethod === 'paymongo_qrph') {
    return {
      tone: 'blue',
      title: paid ? '✅ Online Payment Received' : '⚡ PayMongo Payment Created',
      amount: paid ? total : total,
      message: paid
        ? 'Your PayMongo QR Ph / GCash payment has been received. Your order is now being processed.'
        : 'Complete the PayMongo QR Ph / GCash payment page first. The order will only be marked paid after PayMongo webhook confirmation.',
      action: !paid && checkoutUrl ? 'Open PayMongo Checkout' : null,
    };
  }

  if (paymentMethod === 'gcash_manual') {
    return {
      tone: 'yellow',
      title: '📲 GCash Verification Required',
      amount: downPayment,
      message: 'Your GCash reference will be verified by staff/admin before the order is processed.',
      action: null,
    };
  }

  return {
    tone: 'yellow',
    title: '💵 Counter Payment Required',
    amount: remainingBalance,
    message: 'Please pay at the MotoFix counter during pickup or order release.',
    action: null,
  };
}

export default function OrderConfirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state?.order) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No order found.</p>
          <button onClick={() => navigate('/shop')} className="bg-primary-600 px-6 py-2 rounded-lg text-sm">
            Go to Shop
          </button>
        </div>
      </div>
    );
  }

  const {
    order,
    items = [],
    total = Number(order.total_amount) || 0,
    downPayment = Number(order.down_payment_amount) || 0,
    remainingBalance = Number(order.remaining_balance) || 0,
    paymentMethod = order.payment_method,
    paymentStatus = order.payment_status,
    checkoutUrl = order.checkout_url,
  } = state;

  const notice = getPaymentNotice({ paymentMethod, paymentStatus, downPayment, remainingBalance, checkoutUrl, total });
  const paid = String(paymentStatus || '').toLowerCase() === 'paid';

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4 text-3xl">✅</div>
          <h1 className="text-3xl font-bold mb-2">Order Submitted!</h1>
          <p className="text-gray-400">Your order has been submitted successfully.</p>
          <p className="text-xs text-gray-500 mt-1">Order #{order.id.slice(0, 8).toUpperCase()}</p>
        </div>

        <div className="bg-dark-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Order Receipt</h2>
            <span className={`text-xs px-3 py-1 rounded-full ${paid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {paid ? 'Paid' : String(paymentStatus || 'Pending').replace(/_/g, ' ')}
            </span>
          </div>

          <div className="space-y-3 mb-4">
            {items.map((item, i) => {
              const price = Number(item.price || item.unit_price) || 0;
              const quantity = Number(item.quantity) || 1;
              const name = item.name || item.parts?.name || 'Product';
              const imageUrl = item.image_url || item.parts?.image_url;
              return (
                <div key={i} className="flex items-center gap-3 bg-dark-900 rounded-lg p-3">
                  {imageUrl ? <img src={imageUrl} alt={name} className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center text-sm">⚙️</div>}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-gray-400">{formatPeso(price)} × {quantity}</p>
                  </div>
                  <p className="text-sm font-bold text-accent-400">{formatPeso(price * quantity)}</p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-gray-700 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{formatPeso(total)}</span></div>
            <div className="flex justify-between text-gray-400"><span>Payment Method</span><span>{formatMethod(paymentMethod)}</span></div>
            <div className="flex justify-between text-gray-400"><span>Remaining Balance</span><span>{formatPeso(remainingBalance)}</span></div>
            <div className="flex justify-between font-bold text-white text-base"><span>Total</span><span>{formatPeso(total)}</span></div>
          </div>

          <div className={`${notice.tone === 'blue' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-accent-500/10 border-accent-500/30'} border rounded-lg p-4 mt-4`}>
            <p className={`${notice.tone === 'blue' ? 'text-blue-400' : 'text-accent-400'} text-sm font-semibold mb-1`}>{notice.title}</p>
            <p className={`${notice.tone === 'blue' ? 'text-blue-400' : 'text-accent-400'} text-2xl font-bold`}>{formatPeso(notice.amount)}</p>
            <p className="text-xs text-gray-400 mt-1">{notice.message}</p>
            {notice.action && <a href={checkoutUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700">{notice.action}</a>}
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            Ordered on {new Date(order.created_at).toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="bg-dark-800 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-3">What happens next?</h3>
          <div className="space-y-3">
            {(paymentMethod === 'paymongo_qrph' ? [
              { icon: '⚡', text: paid ? 'Your online payment was received.' : 'Complete your PayMongo QR Ph / GCash payment.' },
              { icon: '📋', text: 'The system updates the order automatically after webhook confirmation.' },
              { icon: '🔧', text: 'Staff will process and prepare your products.' },
              { icon: '📦', text: 'Track the order status in My Orders.' },
            ] : [
              { icon: '📋', text: 'Our team will review your order and confirm it shortly.' },
              { icon: '🔧', text: 'Products will be prepared and ready for pickup or release.' },
              { icon: '💰', text: `Payment due: ${formatPeso(notice.amount)}.` },
              { icon: '📦', text: 'Track the order status in My Orders.' },
            ]).map((step, i) => (
              <div key={i} className="flex items-start gap-3"><span className="text-xl">{step.icon}</span><p className="text-sm text-gray-400">{step.text}</p></div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Link to="/my-orders" className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition text-center text-sm">View My Orders</Link>
          <Link to="/shop" className="flex-1 border border-gray-700 hover:border-gray-500 py-3 rounded-lg transition text-center text-sm text-gray-300">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
}
