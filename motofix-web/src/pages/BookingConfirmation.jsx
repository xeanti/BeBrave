import { useLocation, useNavigate, Link } from 'react-router-dom';

export default function BookingConfirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state?.booking) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No booking found.</p>
          <button onClick={() => navigate('/booking')}
            className="bg-primary-600 px-6 py-2 rounded-lg text-sm">
            Book a Service
          </button>
        </div>
      </div>
    );
  }

  const { booking, service, mechanic } = state;

  function formatTime(time) {
    if (!time) return '';
    const [h] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${display}:00 ${ampm}`;
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-xl mx-auto">

        {/* Success header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4 text-3xl">
            📅
          </div>
          <h1 className="text-3xl font-bold mb-2">Booking Submitted!</h1>
          <p className="text-gray-400">
            Your appointment request has been received.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Booking #{booking.id?.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Booking receipt */}
        <div className="bg-dark-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Booking Receipt</h2>
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full">
              Pending Confirmation
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-700">
              <span className="text-gray-400">Service</span>
              <span className="font-medium">{service?.name || 'Service'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-700">
              <span className="text-gray-400">Date</span>
              <span className="font-medium">
                {new Date(booking.booking_date).toLocaleDateString('en-PH', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                })}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-700">
              <span className="text-gray-400">Time</span>
              <span className="font-medium">{formatTime(booking.booking_time)}</span>
            </div>
            {mechanic && (
              <div className="flex justify-between py-2 border-b border-gray-700">
                <span className="text-gray-400">Mechanic</span>
                <span className="font-medium">{mechanic.first_name} {mechanic.last_name}</span>
              </div>
            )}
            {!mechanic && (
              <div className="flex justify-between py-2 border-b border-gray-700">
                <span className="text-gray-400">Mechanic</span>
                <span className="text-gray-500">Any available mechanic</span>
              </div>
            )}
            {booking.notes && (
              <div className="flex justify-between py-2 border-b border-gray-700">
                <span className="text-gray-400">Notes</span>
                <span className="font-medium text-right max-w-xs">{booking.notes}</span>
              </div>
            )}
          </div>

          {/* Pricing */}
          {service && (
            <div className="mt-4 bg-dark-900 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Base Price</span>
                <span>₱{service.base_price}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Labor Cost</span>
                <span>₱{service.labor_cost || 0}</span>
              </div>
              <div className="flex justify-between font-bold text-white border-t border-gray-700 pt-2">
                <span>Estimated Total</span>
                <span>₱{((service.base_price || 0) + (service.labor_cost || 0)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-accent-400 font-semibold">
                <span>Down Payment (15%)</span>
                <span>₱{booking.down_payment?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          )}

          {/* Down payment notice */}
          <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg p-4 mt-4">
            <p className="text-sm font-semibold text-accent-400">
              ⚠️ Down Payment Required to Confirm
            </p>
            <p className="text-2xl font-bold text-accent-400 mt-1">
              ₱{booking.down_payment?.toFixed(2) || '0.00'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Please prepare this amount. The shop will contact you to confirm your appointment.
            </p>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            Booked on {new Date().toLocaleDateString('en-PH', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </p>
        </div>

        {/* What's next */}
        <div className="bg-dark-800 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-3">What happens next?</h3>
          <div className="space-y-3">
            {[
              { icon: '📞', text: 'The shop will review and confirm your appointment.' },
              { icon: '💰', text: `Prepare your down payment of ₱${booking.down_payment?.toFixed(2) || '0.00'}.` },
              { icon: '🔔', text: 'You will receive a reminder 3 days before your appointment.' },
              { icon: '🏍️', text: 'Bring your motorcycle on the scheduled date and time.' },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-xl">{step.icon}</span>
                <p className="text-sm text-gray-400">{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link to="/appointments"
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition text-center text-sm">
            View My Appointments
          </Link>
          <Link to="/booking"
            className="flex-1 border border-gray-700 hover:border-gray-500 py-3 rounded-lg transition text-center text-sm text-gray-300">
            Book Another
          </Link>
        </div>
      </div>
    </div>
  );
}