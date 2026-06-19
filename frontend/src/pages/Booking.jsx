import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';
import { useLocation, useNavigate } from 'react-router-dom';

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;

function generateTimeSlots() {
  const slots = [];
  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function formatSlot(slot) {
  const [h, m] = slot.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

export default function Booking() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { cart, total: cartTotal } = useCart();
  const [includeCartParts, setIncludeCartParts] = useState(false);

  const [services, setServices] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [selectedMechanic, setSelectedMechanic] = useState('');
  const [mechanicBookings, setMechanicBookings] = useState([]);
  const [form, setForm] = useState({
    service_id: '',
    booking_date: '',
    booking_time: '',
    notes: '',
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchServices();
    fetchMechanics();
    if (location.state?.service_id) {
      setForm((f) => ({ ...f, service_id: location.state.service_id }));
    }
  }, []);

  async function fetchServices() {
    const { data } = await supabase
      .from('services')
      .select('id, name, base_price, labor_cost, estimated_duration_minutes')
      .eq('is_active', true);
    if (data) setServices(data);
  }

  async function fetchMechanics() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, rating_avg, rating_count')
      .eq('role', 'mechanic');
    if (data) setMechanics(data);
  }

  async function fetchMechanicSchedule(mechanicId) {
    const { data } = await supabase
      .from('bookings')
      .select('booking_date, booking_time, status')
      .eq('mechanic_id', mechanicId)
      .in('status', ['pending', 'confirmed', 'in_progress'])
      .gte('booking_date', new Date().toISOString().split('T')[0])
      .order('booking_date', { ascending: true });
    if (data) setMechanicBookings(data);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  const selectedService = services.find((s) => s.id === form.service_id);
  const effectiveCartTotal = includeCartParts ? cartTotal : 0;
  const downpayment = selectedService
    ? (((selectedService.base_price || 0) + (selectedService.labor_cost || 0) + effectiveCartTotal) * 0.15).toFixed(2)
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    const { error } = await supabase.from('bookings').insert({
      customer_id: user.id,
      service_id: form.service_id || null,
      mechanic_id: selectedMechanic || null,
      booking_date: form.booking_date,
      booking_time: form.booking_time,
      notes: form.notes,
      status: 'pending',
      down_payment: downpayment ? parseFloat(downpayment) : 0,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
      setMessageType('error');
    } else {
      const service = services.find((s) => s.id === form.service_id);
      const mechanic = mechanics.find((m) => m.id === selectedMechanic);
      navigate('/booking-confirmation', {
        state: {
          booking: {
            ...form,
            down_payment: parseFloat(downpayment || 0),
          },
          service,
          mechanic: mechanic || null,
        }
      });
    }
    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Book a Service</h1>
          <p className="text-gray-400">Schedule your motorcycle service appointment.</p>
        </div>

        {message && (
          <div className={`text-sm rounded-lg p-4 mb-6 border ${
            messageType === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Step 1: Service */}
          <div className="bg-dark-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              1. Select Service
            </h2>
            <select
              name="service_id"
              value={form.service_id}
              onChange={handleChange}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 mb-3"
            >
              <option value="">Choose a service...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — ₱{s.base_price}
                </option>
              ))}
            </select>

            {selectedService && (
              <div className="bg-dark-900 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Base Price</span>
                  <span>₱{selectedService.base_price}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Labor Cost</span>
                  <span>₱{selectedService.labor_cost || 0}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Duration</span>
                  <span>{selectedService.estimated_duration_minutes} mins</span>
                </div>
                <div className="border-t border-gray-700 pt-2 mt-1 flex justify-between font-semibold text-accent-400">
                  <span>Required Down Payment (15%)</span>
                  <span>₱{downpayment}</span>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Mechanic */}
          <div className="bg-dark-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              2. Choose a Mechanic <span className="text-gray-500 normal-case font-normal">(optional)</span>
            </h2>
            <select
              value={selectedMechanic}
              onChange={(e) => {
                setSelectedMechanic(e.target.value);
                if (e.target.value) fetchMechanicSchedule(e.target.value);
                else setMechanicBookings([]);
              }}
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 mb-3"
            >
              <option value="">Any available mechanic</option>
              {mechanics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                  {m.rating_avg ? ` — ★ ${m.rating_avg} (${m.rating_count})` : ''}
                </option>
              ))}
            </select>

            {selectedMechanic && (
              <div className="bg-dark-900 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-300 mb-2">📅 Upcoming Schedule</p>
                {mechanicBookings.length === 0 ? (
                  <p className="text-sm text-green-400">✅ Fully available — no upcoming bookings!</p>
                ) : (
                  <>
                    <ul className="space-y-1.5 mb-3">
                      {mechanicBookings.map((b, i) => (
                        <li key={i} className="text-xs text-gray-400 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                          <span className="text-gray-300">{b.booking_date}</span>
                          <span>at</span>
                          <span className="text-gray-300">{formatSlot(b.booking_time)}</span>
                          <span className="capitalize text-gray-500">({b.status})</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-yellow-400">
                      ⚠ This mechanic has {mechanicBookings.length} upcoming booking{mechanicBookings.length > 1 ? 's' : ''}. Choose a different date/time to avoid conflicts.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Date & Time */}
          <div className="bg-dark-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              3. Select Date & Time
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  name="booking_date"
                  required
                  value={form.booking_date}
                  onChange={handleChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Time</label>
                <select
                  name="booking_time"
                  required
                  value={form.booking_time}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">Select a time...</option>
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {formatSlot(slot)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Shop hours: 8:00 AM – 5:00 PM</p>
              </div>
            </div>
          </div>

          {/* Step 4: Notes */}
          <div className="bg-dark-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              4. Additional Notes <span className="text-gray-500 normal-case font-normal">(optional)</span>
            </h2>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 resize-none"
              placeholder="Describe the issue, special requests, or anything we should know..."
            />
          </div>

          {/* Step 5: Add parts from cart (optional) */}
          <div className="bg-dark-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                5. Include Parts from Cart
                <span className="text-gray-500 normal-case font-normal ml-1">(optional)</span>
              </h2>
              <button
                type="button"
                onClick={() => setIncludeCartParts((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  includeCartParts ? 'bg-primary-600' : 'bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  includeCartParts ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-gray-500">
                Your cart is empty.{' '}
                <a href="/shop" className="text-primary-400 hover:underline">Browse shop →</a>
              </p>
            ) : includeCartParts ? (
              <div>
                <div className="space-y-2 mb-3">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-dark-900 rounded-lg p-3">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center text-sm flex-shrink-0">⚙️</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'white' }}>{item.name}</p>
                        <p className="text-xs text-gray-400">₱{parseFloat(item.price).toFixed(2)} × {item.quantity}</p>
                      </div>
                      <span className="text-sm font-semibold text-accent-400 flex-shrink-0">
                        ₱{(parseFloat(item.price) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-700 pt-3 space-y-1.5 text-sm">
                  {selectedService && (
                    <div className="flex justify-between text-gray-400">
                      <span>Service Cost</span>
                      <span>₱{((selectedService.base_price || 0) + (selectedService.labor_cost || 0)).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-400">
                    <span>Parts Total ({cart.reduce((s, i) => s + i.quantity, 0)} items)</span>
                    <span>₱{cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white border-t border-gray-700 pt-2">
                    <span>Grand Total Estimate</span>
                    <span>₱{((selectedService?.base_price || 0) + (selectedService?.labor_cost || 0) + cartTotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-accent-400 font-semibold">
                    <span>Down Payment (15%)</span>
                    <span>₱{(((selectedService?.base_price || 0) + (selectedService?.labor_cost || 0) + cartTotal) * 0.15).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                You have {cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''} in your cart.
                Toggle to include them with this booking.
              </p>
            )}
          </div>

          {selectedService && (
            <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg p-4 text-sm text-accent-400">
              ⚠️ A down payment of <strong>₱{downpayment}</strong> (15% of total) is required to confirm your booking.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition text-base"
          >
            {loading ? 'Submitting...' : 'Submit Booking Request'}
          </button>
        </form>
      </div>
    </div>
  );
}