import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { getDownPaymentPercent } from '../lib/settings';
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

function normalizeTime(t) {
  return t?.slice(0, 5);
}

// Helper to convert time strings (HH:MM) to total minutes
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function StepHeader({ number, title, optional }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-primary-600/15 border border-primary-500/30 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
        {number}
      </div>
      <h2 className="text-sm font-semibold text-gray-200 tracking-wide">
        {title}
        {optional && (
          <span className="text-gray-500 font-normal ml-1.5">(optional)</span>
        )}
      </h2>
    </div>
  );
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
  const [downPaymentRate, setDownPaymentRate] = useState(0.15);

  useEffect(() => {
    fetchServices();
    fetchMechanics();
    getDownPaymentPercent().then(setDownPaymentRate);

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

  // Updated to select estimated_duration_minutes from nested services relationship
  async function fetchMechanicSchedule(mechanicId) {
    const { data } = await supabase
      .from('bookings')
      .select('booking_date, booking_time, status, services(estimated_duration_minutes)')
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
    ? (
        (
          (selectedService.base_price || 0) +
          (selectedService.labor_cost || 0) +
          effectiveCartTotal
        ) * downPaymentRate
      ).toFixed(2)
    : null;

  // New Duration-Aware Blocked Slots Logic
  const selectedDuration = selectedService?.estimated_duration_minutes || 30;
  
  const bookedIntervalsForDate = mechanicBookings
    .filter((b) => b.booking_date === form.booking_date)
    .map((b) => {
      const start = timeToMinutes(normalizeTime(b.booking_time));
      const duration = b.services?.estimated_duration_minutes || 30;
      return { start, end: start + duration };
    });

  function isSlotBooked(slot) {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + selectedDuration;
    
    // Block the slot if the service wouldn't finish before closing time
    if (slotEnd > SHOP_CLOSE * 60) return true; 
    
    // Check if the requested interval overlaps with any existing booked interval
    return bookedIntervalsForDate.some((b) => slotStart < b.end && slotEnd > b.start);
  }

  const bookedSlotsForDate = new Set(TIME_SLOTS.filter(isSlotBooked));

  const hasScheduleData = Boolean(selectedMechanic && form.booking_date);
  const allSlotsBooked = hasScheduleData && bookedSlotsForDate.size >= TIME_SLOTS.length;

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
          <div className={`flex items-start gap-2.5 text-sm rounded-lg p-4 mb-6 border ${
            messageType === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            <span className="flex-shrink-0">{messageType === 'success' ? '✓' : '⚠'}</span>
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Step 1: Service */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <StepHeader number={1} title="Select Service" />

            <select
              name="service_id"
              value={form.service_id}
              onChange={handleChange}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition mb-3"
            >
              <option value="">Choose a service...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — ₱{s.base_price}
                </option>
              ))}
            </select>

            {selectedService && (
              <div className="bg-dark-900 rounded-lg p-4 space-y-2 text-sm border border-gray-800">
                <div className="flex justify-between text-gray-400">
                  <span>Base Price</span>
                  <span className="text-gray-300">₱{selectedService.base_price}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Labor Cost</span>
                  <span className="text-gray-300">₱{selectedService.labor_cost || 0}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Duration</span>
                  <span className="text-gray-300">{selectedService.estimated_duration_minutes} mins</span>
                </div>
                <div className="border-t border-gray-700 pt-2.5 mt-1 flex justify-between font-semibold text-accent-400">
                  <span>
                    Required Down Payment ({Math.round(downPaymentRate * 100)}%)
                  </span>
                  <span>₱{downpayment}</span>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Mechanic */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <StepHeader number={2} title="Choose a Mechanic" optional />

            <select
              value={selectedMechanic}
              onChange={(e) => {
                setSelectedMechanic(e.target.value);
                setForm((f) => ({ ...f, booking_time: '' }));
                if (e.target.value) fetchMechanicSchedule(e.target.value);
                else setMechanicBookings([]);
              }}
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition"
            >
              <option value="">Any available mechanic</option>
              {mechanics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                  {m.rating_avg ? ` — ★ ${m.rating_avg} (${m.rating_count})` : ''}
                </option>
              ))}
            </select>

            {selectedMechanic && !form.booking_date && (
              <p className="text-xs text-gray-500 mt-3 flex items-center gap-1.5">
                <span>📅</span> Pick a date below to see this mechanic's open time slots.
              </p>
            )}
          </div>

          {/* Step 3: Date & Time */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <StepHeader number={3} title="Select Date & Time" />

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1.5">Date</label>
              <input
                type="date"
                name="booking_date"
                required
                value={form.booking_date}
                onChange={(e) => {
                  handleChange(e);
                  setForm((f) => ({ ...f, booking_date: e.target.value, booking_time: '' }));
                }}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition [color-scheme:dark]"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Time</label>

              {hasScheduleData ? (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {TIME_SLOTS.map((slot) => {
                      const isBooked = bookedSlotsForDate.has(slot);
                      const isSelected = form.booking_time === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={isBooked}
                          onClick={() => setForm((f) => ({ ...f, booking_time: slot }))}
                          className={`text-xs px-2 py-2.5 rounded-lg font-medium border transition-all ${
                            isBooked
                              ? 'bg-red-500/10 border-red-500/20 text-red-400/50 cursor-not-allowed line-through'
                              : isSelected
                              ? 'bg-primary-600 border-primary-600 text-white shadow-md shadow-primary-600/20 scale-[1.02]'
                              : 'bg-dark-900 border-gray-700 text-gray-300 hover:border-primary-500/50 hover:bg-dark-900/50'
                          }`}
                        >
                          {formatSlot(slot)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-4 mt-3.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-dark-900 border border-gray-700 inline-block" />
                      Available
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/30 inline-block" />
                      Booked
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary-600 inline-block" />
                      Selected
                    </span>
                  </div>

                  {allSlotsBooked && (
                    <p className="text-xs text-yellow-400 mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
                      <span>⚠</span> This mechanic is fully booked on this date. Try another date or mechanic.
                    </p>
                  )}
                </>
              ) : (
                <select
                  name="booking_time"
                  required
                  value={form.booking_time}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition"
                >
                  <option value="">Select a time...</option>
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {formatSlot(slot)}
                    </option>
                  ))}
                </select>
              )}

              <p className="text-xs text-gray-500 mt-2">Shop hours: 8:00 AM – 5:00 PM</p>
            </div>
          </div>

          {/* Step 4: Notes */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <StepHeader number={4} title="Additional Notes" optional />

            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition resize-none placeholder:text-gray-600"
              placeholder="Describe the issue, special requests, or anything we should know..."
            />
          </div>

          {/* Step 5: Parts from cart */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <StepHeader number={5} title="Include Parts from Cart" optional />
              <button
                type="button"
                onClick={() => setIncludeCartParts((v) => !v)}
                disabled={cart.length === 0}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                  includeCartParts ? 'bg-primary-600' : 'bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow ${
                  includeCartParts ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-gray-500 mt-3">
                Your cart is empty.{' '}
                <a href="/shop" className="text-primary-400 hover:underline">Browse shop →</a>
              </p>
            ) : includeCartParts ? (
              <div className="mt-3">
                <div className="space-y-2 mb-3">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-dark-900 rounded-lg p-3 border border-gray-800">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center text-sm flex-shrink-0">⚙️</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-white">{item.name}</p>
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
                      <span className="text-gray-300">₱{((selectedService.base_price || 0) + (selectedService.labor_cost || 0)).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-400">
                    <span>Parts Total ({cart.reduce((s, i) => s + i.quantity, 0)} items)</span>
                    <span className="text-gray-300">₱{cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white border-t border-gray-700 pt-2">
                    <span>Grand Total Estimate</span>
                    <span>₱{((selectedService?.base_price || 0) + (selectedService?.labor_cost || 0) + cartTotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-accent-400 font-semibold">
                    <span>
                      Down Payment ({Math.round(downPaymentRate * 100)}%)
                    </span>
                    <span>
                      ₱{(
                        (
                          (selectedService?.base_price || 0) +
                          (selectedService?.labor_cost || 0) +
                          cartTotal
                        ) * downPaymentRate
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-3">
                You have {cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''} in your cart.
                Toggle to include them with this booking.
              </p>
            )}
          </div>

          {selectedService && (
            <div className="bg-accent-500/10 border border-accent-500/30 rounded-lg p-4 text-sm text-accent-400 flex items-start gap-2.5">
              <span className="flex-shrink-0">⚠️</span>
              <span>
                A down payment of <strong>₱{downpayment}</strong> (
                {Math.round(downPaymentRate * 100)}% of total) is required to confirm your booking.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg transition-all text-base shadow-lg shadow-primary-600/10 hover:shadow-primary-600/20"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              'Submit Booking Request'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}