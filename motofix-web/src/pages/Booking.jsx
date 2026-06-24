import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { getDownPaymentPercent } from '../lib/settings';
import { supabase } from '../lib/supabaseClient';
import { useLocation, useNavigate } from 'react-router-dom';
import { notifyRole, notifyUser } from '../lib/notifications';

const GCASH_QR_IMAGE = 'https://wcqqduuimpjipwvwzyzx.supabase.co/storage/v1/object/public/motorcycle-photos/MISCS/GCASH%20(1).jpg';

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
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function normalizeTime(t) {
  return t?.slice(0, 5);
}

function timeToMinutes(t) {
  if (!t) return 0;

  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function normalizeRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 0.15;
  return rate > 1 ? rate / 100 : rate;
}

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StepHeader({ number, title, optional, description }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl bg-primary-50 text-sm font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-900/25 dark:text-primary-300 dark:ring-primary-500/20">
        {number}
      </div>
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
          {title}
          {optional && (
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-dark-900 dark:text-gray-400">
              Optional
            </span>
          )}
        </h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionCard({ children }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-200 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30">
      {children}
    </section>
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

    getDownPaymentPercent()
      .then((value) => setDownPaymentRate(normalizeRate(value)))
      .catch(() => setDownPaymentRate(0.15));

    if (location.state?.service_id) {
      setForm((f) => ({ ...f, service_id: location.state.service_id }));
    }
  }, [location.state?.service_id]);

  async function fetchServices() {
    const { data, error } = await supabase
      .from('services')
      .select('id, name, base_price, labor_cost, estimated_duration_minutes')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (!error && data) setServices(data);
  }

  async function fetchMechanics() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, rating_avg, rating_count')
      .eq('role', 'mechanic')
      .order('first_name', { ascending: true });

    if (!error && data) setMechanics(data);
  }

  async function fetchMechanicSchedule(mechanicId) {
    const { data, error } = await supabase
      .from('bookings')
      .select('booking_date, booking_time, status, services(estimated_duration_minutes)')
      .eq('mechanic_id', mechanicId)
      .in('status', ['pending', 'confirmed', 'in_progress'])
      .gte('booking_date', new Date().toISOString().split('T')[0])
      .order('booking_date', { ascending: true });

    if (!error && data) setMechanicBookings(data);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  const selectedService = services.find((s) => s.id === form.service_id);
  const selectedMechanicProfile = mechanics.find((m) => m.id === selectedMechanic);

  const cartQuantity = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const serviceCost =
    (Number(selectedService?.base_price) || 0) +
    (Number(selectedService?.labor_cost) || 0);

  const effectiveCartTotal = includeCartParts ? cartTotal : 0;
  const grandTotalEstimate = serviceCost + effectiveCartTotal;
  const downpayment = selectedService ? grandTotalEstimate * downPaymentRate : 0;
  const remainingBalance = Math.max(grandTotalEstimate - downpayment, 0);
  const downPaymentPercent = Math.round(downPaymentRate * 100);

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

    if (slotEnd > SHOP_CLOSE * 60) return true;

    return bookedIntervalsForDate.some((b) => slotStart < b.end && slotEnd > b.start);
  }

  const bookedSlotsForDate = new Set(TIME_SLOTS.filter(isSlotBooked));
  const hasScheduleData = Boolean(selectedMechanic && form.booking_date);
  const allSlotsBooked = hasScheduleData && bookedSlotsForDate.size >= TIME_SLOTS.length;

  async function handleSubmit(e) {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    if (!form.service_id) {
      setMessage('Please select a service.');
      setMessageType('error');
      return;
    }

    if (!form.booking_date) {
      setMessage('Please select a booking date.');
      setMessageType('error');
      return;
    }

    if (!form.booking_time) {
      setMessage('Please select a booking time.');
      setMessageType('error');
      return;
    }

    if (hasScheduleData && bookedSlotsForDate.has(form.booking_time)) {
      setMessage('This time slot is no longer available. Please choose another time.');
      setMessageType('error');
      return;
    }

    setMessage('');
    setLoading(true);

    try {
const { data: booking, error } = await supabase
  .from('bookings')
  .insert({
    customer_id: user.id,
    service_id: form.service_id || null,
    mechanic_id: selectedMechanic || null,
    booking_date: form.booking_date,
    booking_time: form.booking_time,
    notes: form.notes,
    status: 'pending',
    down_payment: Number(downpayment) || 0,
  })
  .select('id')
  .single();

if (error) throw error;

await notifyUser({
  userId: user.id,
  title: 'Booking Submitted',
  message: 'Your booking request has been submitted. Please wait for admin confirmation.',
  type: 'booking',
  relatedTable: 'bookings',
  relatedId: booking.id,
});

await notifyRole({
  role: 'admin',
  title: 'New Booking Request',
  message: 'A customer submitted a new service booking request.',
  type: 'booking',
  relatedTable: 'bookings',
  relatedId: booking.id,
});

if (selectedMechanic) {
  await notifyUser({
    userId: selectedMechanic,
    title: 'New Assigned Booking',
    message: 'A customer selected you for a new pending booking.',
    type: 'booking',
    relatedTable: 'bookings',
    relatedId: booking.id,
  });
}

      navigate('/booking-confirmation', {
        state: {
          booking: {
  id: booking.id,
            ...form,
            down_payment: Number(downpayment) || 0,
            include_cart_parts: includeCartParts,
            cart_total: effectiveCartTotal,
            grand_total_estimate: grandTotalEstimate,
            remaining_balance: remainingBalance,
          },
          service: selectedService,
          mechanic: selectedMechanicProfile || null,
          cartItems: includeCartParts ? cart : [],
        },
      });
    } catch (error) {
      setMessage(`Error: ${error.message || 'Failed to submit booking.'}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10"
    >
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                MotoFix Service Booking
              </p>
              <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                Book a Service
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                Schedule your motorcycle service, choose a mechanic, and review the required down payment before submitting.
              </p>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium ${
              messageType === 'success'
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
            }`}
          >
            <span className="mt-0.5 flex-shrink-0">
              {messageType === 'success' ? '✓' : '⚠'}
            </span>
            <span>{message}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Main steps */}
          <div className="space-y-6">
            {/* Step 1 */}
            <SectionCard>
              <StepHeader
                number={1}
                title="Select Service"
                description="Choose the type of repair or maintenance you need."
              />

              <select
                name="service_id"
                value={form.service_id}
                onChange={(e) => {
                  handleChange(e);
                  setForm((f) => ({ ...f, service_id: e.target.value, booking_time: '' }));
                }}
                required
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
              >
                <option value="">Choose a service...</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} — {formatPeso(service.base_price)}
                  </option>
                ))}
              </select>

              {selectedService && (
                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Base Price
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                        {formatPeso(selectedService.base_price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Labor Cost
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                        {formatPeso(selectedService.labor_cost || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Duration
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                        {selectedService.estimated_duration_minutes || 30} mins
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      Required Down Payment ({downPaymentPercent}%)
                    </span>
                    <span className="text-lg font-black text-accent-600 dark:text-accent-400">
                      {formatPeso(downpayment)}
                    </span>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Step 2 */}
            <SectionCard>
              <StepHeader
                number={2}
                title="Choose a Mechanic"
                optional
                description="Pick a preferred mechanic or leave it open for any available mechanic."
              />

              <select
                value={selectedMechanic}
                onChange={(e) => {
                  setSelectedMechanic(e.target.value);
                  setForm((f) => ({ ...f, booking_time: '' }));

                  if (e.target.value) fetchMechanicSchedule(e.target.value);
                  else setMechanicBookings([]);
                }}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
              >
                <option value="">Any available mechanic</option>
                {mechanics.map((mechanic) => (
                  <option key={mechanic.id} value={mechanic.id}>
                    {mechanic.first_name} {mechanic.last_name}
                    {mechanic.rating_avg
                      ? ` — ★ ${mechanic.rating_avg} (${mechanic.rating_count || 0})`
                      : ''}
                  </option>
                ))}
              </select>

              {selectedMechanic && !form.booking_date && (
                <p className="mt-3 rounded-2xl bg-primary-50 px-4 py-3 text-xs font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
                  📅 Pick a date below to see this mechanic&apos;s open time slots.
                </p>
              )}
            </SectionCard>

            {/* Step 3 */}
            <SectionCard>
              <StepHeader
                number={3}
                title="Select Date & Time"
                description="Shop hours are 8:00 AM to 5:00 PM."
              />

              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Date
                  </label>
                  <input
                    type="date"
                    name="booking_date"
                    required
                    value={form.booking_date}
                    onChange={(e) => {
                      handleChange(e);
                      setForm((f) => ({
                        ...f,
                        booking_date: e.target.value,
                        booking_time: '',
                      }));
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition [color-scheme:light] focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:[color-scheme:dark] dark:focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Time
                  </label>

                  {hasScheduleData ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {TIME_SLOTS.map((slot) => {
                          const isBooked = bookedSlotsForDate.has(slot);
                          const isSelected = form.booking_time === slot;

                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={isBooked}
                              onClick={() => setForm((f) => ({ ...f, booking_time: slot }))}
                              className={`rounded-2xl border px-2 py-3 text-xs font-black transition-all ${
                                isBooked
                                  ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-400 line-through opacity-70 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400/60'
                                  : isSelected
                                  ? 'scale-[1.02] border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-300 hover:bg-white hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500/50 dark:hover:text-primary-300'
                              }`}
                            >
                              {formatSlot(slot)}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-300 bg-gray-50 dark:border-dark-700 dark:bg-dark-900" />
                          Available
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full border border-red-300 bg-red-100 dark:border-red-500/30 dark:bg-red-500/20" />
                          Booked
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary-600" />
                          Selected
                        </span>
                      </div>

                      {allSlotsBooked && (
                        <p className="mt-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs font-semibold text-yellow-700 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-300">
                          ⚠ This mechanic is fully booked on this date. Try another date or mechanic.
                        </p>
                      )}
                    </div>
                  ) : (
                    <select
                      name="booking_time"
                      required
                      value={form.booking_time}
                      onChange={handleChange}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:focus:border-primary-500"
                    >
                      <option value="">Select a time...</option>
                      {TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {formatSlot(slot)}
                        </option>
                      ))}
                    </select>
                  )}

                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Service must finish before 5:00 PM.
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Step 4 */}
            <SectionCard>
              <StepHeader
                number={4}
                title="Additional Notes"
                optional
                description="Describe the issue, special requests, or other details."
              />

              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={4}
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-primary-500"
                placeholder="Example: The motorcycle has trouble starting in the morning..."
              />
            </SectionCard>

            {/* Step 5 */}
            <SectionCard>
              <div className="mb-4 flex items-start justify-between gap-4">
                <StepHeader
                  number={5}
                  title="Include Parts from Cart"
                  optional
                  description="Attach cart parts to this booking estimate."
                />

                <button
                  type="button"
                  onClick={() => setIncludeCartParts((value) => !value)}
                  disabled={cart.length === 0}
                  className={`relative mt-1 h-7 w-12 flex-shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    includeCartParts ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  aria-label="Include cart parts"
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                      includeCartParts ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                  Your cart is empty.{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/shop')}
                    className="font-bold text-primary-600 hover:underline dark:text-primary-400"
                  >
                    Browse shop →
                  </button>
                </div>
              ) : includeCartParts ? (
                <div>
                  <div className="space-y-3">
                    {cart.map((item) => {
                      const price = Number(item.price) || 0;
                      const itemTotal = price * item.quantity;

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/60"
                        >
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-lg text-gray-400">
                                ⚙️
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-gray-950 dark:text-white">
                              {item.name}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {formatPeso(price)} × {item.quantity}
                            </p>
                          </div>

                          <span className="shrink-0 text-sm font-black text-accent-600 dark:text-accent-400">
                            {formatPeso(itemTotal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm dark:border-dark-700 dark:bg-dark-900/70">
                    {selectedService && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Service Cost</span>
                        <span className="font-bold text-gray-950 dark:text-white">
                          {formatPeso(serviceCost)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Parts Total ({cartQuantity} {cartQuantity === 1 ? 'item' : 'items'})
                      </span>
                      <span className="font-bold text-gray-950 dark:text-white">
                        {formatPeso(cartTotal)}
                      </span>
                    </div>

                    <div className="flex justify-between border-t border-gray-200 pt-2 font-black dark:border-dark-700">
                      <span className="text-gray-950 dark:text-white">Grand Total Estimate</span>
                      <span className="text-gray-950 dark:text-white">
                        {formatPeso(grandTotalEstimate)}
                      </span>
                    </div>

                    <div className="flex justify-between font-black text-accent-600 dark:text-accent-400">
                      <span>Down Payment ({downPaymentPercent}%)</span>
                      <span>{formatPeso(downpayment)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                  You have{' '}
                  <span className="font-black text-gray-950 dark:text-white">
                    {cartQuantity}
                  </span>{' '}
                  {cartQuantity === 1 ? 'item' : 'items'} in your cart. Toggle this option to include them with the booking estimate.
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right summary */}
          <aside className="space-y-6">
            {/* Payment QR */}
            <section className="rounded-3xl border border-primary-200 bg-primary-50 p-5 shadow-sm dark:border-primary-500/25 dark:bg-primary-900/10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-primary-800 dark:text-primary-200">
                    GCash Down Payment
                  </h2>
                  <p className="mt-1 text-xs text-primary-700/80 dark:text-primary-300/80">
                    Scan this after submitting your booking request.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-300">
                  QR
                </span>
              </div>

              <div className="rounded-3xl bg-white p-3 shadow-inner ring-1 ring-primary-100 dark:bg-dark-800 dark:ring-primary-500/20">
                <img
                  src={GCASH_QR_IMAGE}
                  alt="GCash QR code"
                  className="aspect-square w-full rounded-2xl object-contain"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                    event.currentTarget.nextElementSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden aspect-square w-full flex-col items-center justify-center rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-6 text-center dark:border-primary-500/30 dark:bg-primary-900/20">
                  <p className="text-3xl">📷</p>
                  <p className="mt-3 text-sm font-black text-primary-800 dark:text-primary-200">
                    Add your GCash QR link
                  </p>
                  <p className="mt-1 text-xs leading-5 text-primary-700/80 dark:text-primary-300/80">
                    Replace GCASH_QR_IMAGE at the top of this file with your public image URL.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-white/80 p-4 ring-1 ring-primary-100 dark:bg-dark-800/80 dark:ring-primary-500/20">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    Required payment
                  </span>
                  <span className="text-lg font-black text-accent-600 dark:text-accent-400">
                    {selectedService ? formatPeso(downpayment) : '—'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                  {downPaymentPercent}% of the estimate. Keep your GCash receipt for confirmation.
                </p>
              </div>
            </section>

            {/* Booking summary */}
            <section className="sticky top-24 rounded-3xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
              <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                Booking Summary
              </h2>

              <div className="space-y-3 text-sm">
                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Service
                  </p>
                  <p className="mt-1 font-black text-gray-950 dark:text-white">
                    {selectedService?.name || 'Not selected'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Date
                    </p>
                    <p className="mt-1 font-black text-gray-950 dark:text-white">
                      {form.booking_date || '—'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Time
                    </p>
                    <p className="mt-1 font-black text-gray-950 dark:text-white">
                      {form.booking_time ? formatSlot(form.booking_time) : '—'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Mechanic
                  </p>
                  <p className="mt-1 font-black text-gray-950 dark:text-white">
                    {selectedMechanicProfile
                      ? `${selectedMechanicProfile.first_name} ${selectedMechanicProfile.last_name}`
                      : 'Any available mechanic'}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3 border-t border-gray-200 pt-5 text-sm dark:border-dark-700">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Service estimate</span>
                  <span className="font-bold text-gray-950 dark:text-white">
                    {formatPeso(serviceCost)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Parts included
                  </span>
                  <span className="font-bold text-gray-950 dark:text-white">
                    {includeCartParts ? formatPeso(cartTotal) : formatPeso(0)}
                  </span>
                </div>

                <div className="flex justify-between rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                  <span className="font-black text-gray-950 dark:text-white">
                    Estimate Total
                  </span>
                  <span className="font-black text-gray-950 dark:text-white">
                    {formatPeso(grandTotalEstimate)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-bold text-gray-700 dark:text-gray-300">
                    Down Payment ({downPaymentPercent}%)
                  </span>
                  <span className="font-black text-accent-600 dark:text-accent-400">
                    {selectedService ? formatPeso(downpayment) : '—'}
                  </span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Remaining balance</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300">
                    {selectedService ? formatPeso(remainingBalance) : '—'}
                  </span>
                </div>
              </div>

              {selectedService && (
                <div className="mt-5 rounded-2xl border border-accent-200 bg-accent-50 p-4 text-sm text-accent-700 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-300">
                  ⚠ A down payment of{' '}
                  <strong>{formatPeso(downpayment)}</strong> is required to confirm your booking.
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Booking Request
                    <span>→</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/shop')}
                className="mt-3 w-full rounded-2xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
              >
                Browse Parts
              </button>
            </section>
          </aside>
        </div>
      </div>
    </form>
  );
}
