import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import CustomerPicker from '../../components/CustomerPicker';
import ReceiptModal from '../../components/ReceiptModal';
import { fetchPaymentsFor, summarizePayments } from '../../lib/payments';
import { getDownPaymentPercent } from '../../lib/settings';

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;

const TIME_SLOTS = (() => {
  const slots = [];

  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }

  return slots;
})();

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'gcash', label: 'GCash', icon: '📱' },
  { id: 'card', label: 'Card', icon: '💳' },
];

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

function formatTime(time) {
  if (!time) return '—';

  const normalized = String(time).slice(0, 5);
  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${display}:${m} ${ampm}`;
}

function getCustomerName(record) {
  const profile = record?.profiles || record;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();

  return name || 'Walk-in Customer';
}

function calculateBookingTotal(booking) {
  return (
    (Number(booking.services?.base_price) || 0) +
    (Number(booking.services?.labor_cost) || 0) ||
    Number(booking.total_amount) ||
    0
  );
}

function Banner({ message }) {
  if (!message) return null;

  const isError = message.startsWith('Error') || message.startsWith('❌');

  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
        isError
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
          : 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
      }`}
    >
      <span className="mt-0.5">{isError ? '⚠️' : '✅'}</span>
      <span>{isError ? message.replace('Error: ', '') : message}</span>
    </div>
  );
}

function StepHeader({ number, title, sub }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-xs font-black text-white shadow-lg shadow-primary-600/20">
        {number}
      </div>
      <div>
        <p className="text-sm font-black text-gray-950 dark:text-white">{title}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function Section({ children, className = '' }) {
  return (
    <section className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800 ${className}`}>
      {children}
    </section>
  );
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>{value}</p>
    </div>
  );
}

function CustomerAvatar({ profile }) {
  if (profile?.profile_photo_url) {
    return (
      <img
        src={profile.profile_photo_url}
        alt={getCustomerName(profile)}
        className="h-12 w-12 flex-shrink-0 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700"
      />
    );
  }

  return (
    <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-primary-600 text-sm font-black text-white shadow-sm shadow-primary-600/20">
      {(profile?.first_name?.[0] || '?') + (profile?.last_name?.[0] || '')}
    </div>
  );
}

function PaymentMethodPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAYMENT_METHODS.map((method) => (
        <button
          key={method.id}
          type="button"
          onClick={() => onChange(method.id)}
          className={`flex flex-col items-center rounded-2xl border py-3 text-xs font-black transition ${
            value === method.id
              ? 'border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-600/20'
              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400'
          }`}
        >
          <span className="mb-1 text-lg">{method.icon}</span>
          {method.label}
        </button>
      ))}
    </div>
  );
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('booking');
  const [receipt, setReceipt] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const tabs = [
    { id: 'booking', label: 'Walk-in Booking', icon: '📅' },
    { id: 'pos', label: 'Parts POS', icon: '🧾' },
    { id: 'pending', label: 'Pending Payments', icon: '💰' },
  ];

  useEffect(() => {
    const updateStamp = () => setLastUpdated(new Date());

    const tables = ['bookings', 'orders', 'payments', 'parts', 'services', 'profiles'];

    const channels = tables.map((table) =>
      supabase
        .channel(`staff-dashboard-${table}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          updateStamp
        )
        .subscribe()
    );

    updateStamp();

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, []);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Staff
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Staff Dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Create walk-in bookings, process parts sales, and confirm customer payments.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Live updates active · Last activity: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-3xl bg-gray-100 p-2 dark:bg-dark-900">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black transition sm:text-sm ${
                      tab === item.id
                        ? 'bg-white text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-400'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {tab === 'booking' && <WalkInBooking staffId={user?.id} onReceipt={setReceipt} />}
        {tab === 'pos' && <WalkInPOS staffId={user?.id} onReceipt={setReceipt} />}
        {tab === 'pending' && <PendingPayments staffId={user?.id} onReceipt={setReceipt} />}
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function WalkInBooking({ staffId, onReceipt }) {
  const [customer, setCustomer] = useState(null);
  const [services, setServices] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [mechanicSchedule, setMechanicSchedule] = useState([]);

  const [form, setForm] = useState({
    service_id: '',
    mechanic_id: '',
    booking_date: '',
    booking_time: '',
    notes: '',
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [downPaymentRate, setDownPaymentRate] = useState(0.15);

  useEffect(() => {
    fetchSetup();

    const servicesChannel = supabase
      .channel('staff-booking-services')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, fetchSetup)
      .subscribe();

    const profilesChannel = supabase
      .channel('staff-booking-mechanics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchSetup)
      .subscribe();

    return () => {
      supabase.removeChannel(servicesChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  useEffect(() => {
    if (!form.mechanic_id || !form.booking_date) {
      setMechanicSchedule([]);
      return;
    }

    fetchMechanicSchedule();

    const channel = supabase
      .channel(`staff-booking-schedule-${form.mechanic_id}-${form.booking_date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        fetchMechanicSchedule
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [form.mechanic_id, form.booking_date]);

  async function fetchSetup() {
    setLoading(true);

    const [servicesResult, mechanicsResult, rate] = await Promise.all([
      supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, first_name, last_name, specialization, profile_photo_url')
        .eq('role', 'mechanic')
        .order('first_name', { ascending: true }),
      getDownPaymentPercent(),
    ]);

    setServices(servicesResult.data || []);
    setMechanics(mechanicsResult.data || []);
    setDownPaymentRate(rate || 0.15);
    setLoading(false);
  }

  async function fetchMechanicSchedule() {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_time, status')
      .eq('mechanic_id', form.mechanic_id)
      .eq('booking_date', form.booking_date)
      .in('status', ['pending', 'confirmed', 'in_progress']);

    setMechanicSchedule(data || []);
  }

  const selectedService = services.find((service) => service.id === form.service_id);
  const total = selectedService
    ? (Number(selectedService.base_price) || 0) + (Number(selectedService.labor_cost) || 0)
    : 0;
  const downPayment = selectedService ? Number((total * downPaymentRate).toFixed(2)) : 0;
  const blockedTimes = mechanicSchedule.map((booking) => String(booking.booking_time).slice(0, 5));

  async function handleSubmit(event) {
    event.preventDefault();

    if (!customer) {
      setMessage('Error: Select or create a customer first.');
      return;
    }

    if (!form.service_id || !form.booking_date || !form.booking_time) {
      setMessage('Error: Select service, date, and time.');
      return;
    }

    if (form.mechanic_id && blockedTimes.includes(form.booking_time)) {
      setMessage('Error: This mechanic already has a booking at that time.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          customer_id: customer.id,
          service_id: form.service_id || null,
          mechanic_id: form.mechanic_id || null,
          booking_date: form.booking_date,
          booking_time: form.booking_time,
          notes: form.notes?.trim() || null,
          status: 'confirmed',
          down_payment: downPayment,
          total_amount: total,
          is_walkin: true,
          created_by: staffId,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (downPayment > 0) {
        const { error: paymentError } = await supabase.from('payments').insert({
          booking_id: data.id,
          amount: downPayment,
          payment_type: 'down_payment',
          method: 'cash',
          processed_by: staffId,
        });

        if (paymentError) throw paymentError;
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_WALKIN_BOOKING',
        entity: 'bookings',
        entity_id: data.id,
        performed_by: staffId,
        details: {
          customer_id: customer.id,
          service_id: form.service_id,
          total,
          down_payment: downPayment,
        },
      });

      onReceipt({
        customerName: getCustomerName(customer),
        type: 'booking',
        items: [{ label: selectedService?.name || 'Service', amount: total }],
        total,
        amountPaid: downPayment,
        paymentMethod: 'cash',
        referenceId: data.id.slice(0, 8).toUpperCase(),
      });

      setMessage('Walk-in booking created. Down payment recorded and receipt generated.');
      setForm({
        service_id: '',
        mechanic_id: '',
        booking_date: '',
        booking_time: '',
        notes: '',
      });
      setCustomer(null);
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to create walk-in booking.'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Banner message={message} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Active Services" value={services.length} icon="🛠️" tone="primary" />
        <StatCard label="Available Mechanics" value={mechanics.length} icon="🔧" tone="green" />
        <StatCard label="Down Payment Rate" value={`${Math.round(downPaymentRate * 100)}%`} icon="💰" tone="accent" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Section>
            <StepHeader number="1" title="Customer" />
            <CustomerPicker selected={customer} onSelect={setCustomer} />
          </Section>

          <Section>
            <StepHeader number="2" title="Select Service" />
            {loading ? (
              <div className="h-32 animate-pulse rounded-3xl bg-gray-100 dark:bg-dark-900" />
            ) : services.length === 0 ? (
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                No active services found.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {services.map((service) => {
                  const active = form.service_id === service.id;
                  const serviceTotal =
                    (Number(service.base_price) || 0) + (Number(service.labor_cost) || 0);

                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setForm({ ...form, service_id: service.id })}
                      className={`relative rounded-3xl border p-4 text-left transition ${
                        active
                          ? 'border-primary-500 bg-primary-50 ring-4 ring-primary-500/10 dark:bg-primary-500/10'
                          : 'border-gray-200 bg-gray-50 hover:border-primary-400 dark:border-dark-700 dark:bg-dark-900 dark:hover:border-primary-500'
                      }`}
                    >
                      {active && (
                        <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-primary-600 text-xs font-black text-white">
                          ✓
                        </span>
                      )}
                      <p className={`pr-6 text-sm font-black ${active ? 'text-primary-700 dark:text-primary-400' : 'text-gray-950 dark:text-white'}`}>
                        {service.name}
                      </p>
                      <p className="mt-2 text-lg font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(serviceTotal)}
                      </p>
                      {Number(service.labor_cost) > 0 && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Includes {formatPeso(service.labor_cost)} labor
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          <Section>
            <StepHeader number="3" title="Assign Mechanic" sub="Optional" />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, mechanic_id: '' })}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  !form.mechanic_id
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                }`}
              >
                🔧 Any Available
              </button>

              {mechanics.map((mechanic) => {
                const active = form.mechanic_id === mechanic.id;
                const initials = `${mechanic.first_name?.[0] || ''}${mechanic.last_name?.[0] || ''}`;

                return (
                  <button
                    key={mechanic.id}
                    type="button"
                    onClick={() => setForm({ ...form, mechanic_id: mechanic.id })}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition ${
                      active
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                    }`}
                  >
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-white dark:bg-dark-800'}`}>
                      {initials}
                    </span>
                    {mechanic.first_name} {mechanic.last_name}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section>
            <StepHeader number="4" title="Date & Time" />
            <input
              type="date"
              required
              value={form.booking_date}
              onChange={(event) => setForm({ ...form, booking_date: event.target.value, booking_time: '' })}
              min={new Date().toISOString().split('T')[0]}
              className="mb-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {TIME_SLOTS.map((slot) => {
                const active = form.booking_time === slot;
                const blocked = form.mechanic_id && blockedTimes.includes(slot);

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={blocked}
                    onClick={() => setForm({ ...form, booking_time: slot })}
                    className={`rounded-2xl border py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? 'border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : blocked
                        ? 'border-red-200 bg-red-50 text-red-500 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400'
                    }`}
                  >
                    {formatTime(slot)}
                  </button>
                );
              })}
            </div>

            {form.mechanic_id && form.booking_date && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Booked time slots for the selected mechanic are disabled.
              </p>
            )}
          </Section>

          <Section>
            <StepHeader number="5" title="Notes" sub="Optional" />
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              rows={4}
              placeholder="Special instructions, part requests, customer concerns..."
              className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
            />
          </Section>

          {selectedService && (
            <Section className="border-accent-500/30 bg-accent-500/10 dark:bg-accent-500/10">
              <p className="mb-3 text-xs font-black uppercase tracking-wider text-accent-600 dark:text-accent-400">
                Booking Summary
              </p>

              <div className="space-y-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                <div className="flex justify-between gap-3">
                  <span>Service Total</span>
                  <span className="font-black text-gray-950 dark:text-white">{formatPeso(total)}</span>
                </div>
                <div className="flex justify-between gap-3 border-t border-accent-500/20 pt-2">
                  <span>Down Payment ({Math.round(downPaymentRate * 100)}%)</span>
                  <span className="text-lg font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(downPayment)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>Remaining Balance</span>
                  <span>{formatPeso(total - downPayment)}</span>
                </div>
              </div>
            </Section>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-3xl bg-primary-600 py-4 text-base font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating...' : '📅 Create Walk-in Booking'}
          </button>
        </div>
      </div>
    </form>
  );
}

function WalkInPOS({ staffId, onReceipt }) {
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [parts, setParts] = useState([]);
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [lastSearchLoading, setLastSearchLoading] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setParts([]);
      return;
    }

    setLastSearchLoading(true);

    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('parts')
        .select('*')
        .ilike('name', `%${search.trim()}%`)
        .gt('stock_quantity', 0)
        .eq('is_active', true)
        .limit(10);

      setParts(data || []);
      setLastSearchLoading(false);
    }, 250);

    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const channel = supabase
      .channel('staff-pos-parts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parts',
        },
        () => {
          setCart((current) =>
            current.map((item) => ({
              ...item,
              stock_quantity: Number(item.stock_quantity) || 0,
            }))
          );
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  function addToCart(part) {
    setMessage('');

    setCart((previous) => {
      const existing = previous.find((item) => item.id === part.id);
      const stock = Number(part.stock_quantity) || 0;

      if (existing) {
        if (existing.quantity >= stock) {
          setMessage(`Error: Only ${stock} ${part.name} in stock.`);
          return previous;
        }

        return previous.map((item) =>
          item.id === part.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...previous, { ...part, quantity: 1 }];
    });

    setSearch('');
    setParts([]);
  }

  function updateQty(id, qty) {
    if (qty < 1) {
      setCart((previous) => previous.filter((item) => item.id !== id));
      return;
    }

    setCart((previous) =>
      previous.map((item) => {
        if (item.id !== id) return item;

        const maxStock = Number(item.stock_quantity) || 0;
        const safeQty = Math.min(qty, maxStock);

        if (qty > maxStock) {
          setMessage(`Error: Only ${maxStock} ${item.name} in stock.`);
        }

        return { ...item, quantity: safeQty };
      })
    );
  }

  const total = cart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
    0
  );

  async function handleCheckout() {
    if (!customer) {
      setMessage('Error: Select or create a customer first.');
      return;
    }

    if (cart.length === 0) {
      setMessage('Error: Cart is empty.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: customer.id,
          total_amount: total,
          status: 'pending',
          is_walkin: true,
          created_by: staffId,
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      const items = cart.map((item) => ({
        order_id: order.id,
        part_id: item.id,
        quantity: item.quantity,
        unit_price: Number(item.price) || 0,
        subtotal: (Number(item.price) || 0) * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const { error: stockError } = await supabase.rpc('decrement_stock', {
          part_id: item.id,
          qty: item.quantity,
        });

        if (stockError) throw stockError;
      }

      await supabase.from('audit_logs').insert({
        action: 'CREATE_WALKIN_ORDER',
        entity: 'orders',
        entity_id: order.id,
        performed_by: staffId,
        details: {
          customer_id: customer.id,
          total,
          items: cart.map((item) => ({
            part_id: item.id,
            name: item.name,
            quantity: item.quantity,
          })),
        },
      });

      setMessage('Order created. Confirm payment in the Pending Payments tab.');
      setCart([]);
      setCustomer(null);
      setSearch('');
      setParts([]);
    } catch (err) {
      setMessage(`Error: ${err.message || 'Failed to create order.'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Banner message={message} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Cart Items" value={cart.length} icon="🛒" tone="primary" />
        <StatCard label="Cart Quantity" value={cart.reduce((sum, item) => sum + item.quantity, 0)} icon="📦" tone="green" />
        <StatCard label="Cart Total" value={formatPeso(total)} icon="💰" tone="accent" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Section>
            <StepHeader number="1" title="Customer" />
            <CustomerPicker selected={customer} onSelect={setCustomer} />
          </Section>

          <Section>
            <StepHeader number="2" title="Search Parts" />
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
                🔍
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Type part name..."
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>

            {lastSearchLoading && search.trim() && (
              <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
                Searching parts...
              </p>
            )}

            {parts.length > 0 && (
              <div className="mt-3 space-y-2">
                {parts.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => addToCart(part)}
                    className="group flex w-full items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-primary-400 hover:bg-primary-50 dark:border-dark-700 dark:bg-dark-900 dark:hover:border-primary-500 dark:hover:bg-primary-500/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-gray-950 group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-400">
                        {part.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {part.stock_quantity} in stock · {part.category || 'General'}
                      </p>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-3">
                      <span className="text-sm font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(part.price)}
                      </span>
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-600 text-lg font-black text-white">
                        +
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {search.trim() && !lastSearchLoading && parts.length === 0 && (
              <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
                No parts found matching “{search}”.
              </p>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section>
            <StepHeader
              number="3"
              title={`Cart${cart.length > 0 ? ` (${cart.length} item${cart.length > 1 ? 's' : ''})` : ''}`}
            />

            {cart.length === 0 ? (
              <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 py-10 text-gray-500 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                <span className="mb-3 text-5xl">🛒</span>
                <p className="text-sm font-semibold">Add parts from the search to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatPeso(item.price)} each · {item.stock_quantity} stock
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, item.quantity - 1)}
                        className="grid h-9 w-9 place-items-center rounded-2xl border border-gray-200 bg-white text-lg font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
                      >
                        −
                      </button>

                      <span className="w-8 text-center text-sm font-black text-gray-950 dark:text-white">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() => updateQty(item.id, item.quantity + 1)}
                        disabled={item.quantity >= Number(item.stock_quantity)}
                        className="grid h-9 w-9 place-items-center rounded-2xl border border-gray-200 bg-white text-lg font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
                      >
                        +
                      </button>
                    </div>

                    <span className="w-24 flex-shrink-0 text-right text-sm font-black text-accent-600 dark:text-accent-400">
                      {formatPeso((Number(item.price) || 0) * item.quantity)}
                    </span>
                  </div>
                ))}

                <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-dark-700">
                  <span className="text-sm font-black text-gray-950 dark:text-white">Total</span>
                  <span className="text-2xl font-black text-primary-600 dark:text-primary-400">
                    {formatPeso(total)}
                  </span>
                </div>
              </div>
            )}
          </Section>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={submitting || cart.length === 0}
            className="w-full rounded-3xl bg-primary-600 py-4 text-base font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Processing...' : '🧾 Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingPayments({ staffId, onReceipt }) {
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookingPayments, setBookingPayments] = useState({});
  const [orderPayments, setOrderPayments] = useState({});

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPending();

    const tables = ['bookings', 'orders', 'payments'];

    const channels = tables.map((table) =>
      supabase
        .channel(`staff-pending-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => fetchPending(false))
        .subscribe()
    );

    const handleFocus = () => fetchPending(false);

    window.addEventListener('focus', handleFocus);

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  async function fetchPending(showLoader = true) {
    if (showLoader) setLoading(true);

    setBookingPayments({});
    setOrderPayments({});
    setError('');

    const [bookingsResult, ordersResult] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, services(name, base_price, labor_cost), profiles!bookings_customer_id_fkey(first_name, last_name, profile_photo_url)')
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('*, profiles!orders_customer_id_fkey(first_name, last_name, profile_photo_url)')
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
    ]);

    if (bookingsResult.error || ordersResult.error) {
      setError(bookingsResult.error?.message || ordersResult.error?.message || 'Failed to load pending payments.');
      setLoading(false);
      return;
    }

    const bookingsData = bookingsResult.data || [];
    const ordersData = ordersResult.data || [];

    let groupedBookingPayments = {};

    if (bookingsData.length) {
      const allBookingPayments = await fetchPaymentsFor({
        bookingIds: bookingsData.map((booking) => booking.id),
      });

      allBookingPayments.forEach((payment) => {
        if (!groupedBookingPayments[payment.booking_id]) {
          groupedBookingPayments[payment.booking_id] = [];
        }
        groupedBookingPayments[payment.booking_id].push(payment);
      });
    }

    let groupedOrderPayments = {};

    if (ordersData.length) {
      const allOrderPayments = await fetchPaymentsFor({
        orderIds: ordersData.map((order) => order.id),
      });

      allOrderPayments.forEach((payment) => {
        if (!groupedOrderPayments[payment.order_id]) {
          groupedOrderPayments[payment.order_id] = [];
        }
        groupedOrderPayments[payment.order_id].push(payment);
      });
    }

    setBookings(
      bookingsData.filter((booking) => {
        const total = calculateBookingTotal(booking);
        return total - summarizePayments(groupedBookingPayments[booking.id] || []).totalPaid > 0;
      })
    );

    setOrders(
      ordersData.filter((order) => {
        return (
          (Number(order.total_amount) || 0) -
            summarizePayments(groupedOrderPayments[order.id] || []).totalPaid >
          0
        );
      })
    );

    setBookingPayments(groupedBookingPayments);
    setOrderPayments(groupedOrderPayments);
    setLoading(false);
  }

  function openConfirm(type, record, due, total, totalPaid) {
    setConfirming({
      type,
      record,
      due,
      total,
      totalPaid,
    });
    setAmount(due.toFixed(2));
    setMethod('cash');
    setError('');
  }

  async function confirmPayment() {
    if (!confirming) return;

    const { type, record, due, total } = confirming;
    const paidAmount = parseFloat(amount);

    if (!paidAmount || paidAmount <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }

    if (paidAmount > due) {
      setError(`Amount cannot exceed ${formatPeso(due)}.`);
      return;
    }

    const isFullPayment = paidAmount >= due;

    try {
      if (type === 'booking') {
        const { error: paymentError } = await supabase.from('payments').insert({
          booking_id: record.id,
          amount: paidAmount,
          payment_type: isFullPayment ? 'full' : 'balance',
          method,
          processed_by: staffId,
        });

        if (paymentError) throw paymentError;

        if (isFullPayment) {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', record.id);

          if (updateError) throw updateError;
        }
      } else {
        const { error: paymentError } = await supabase.from('payments').insert({
          order_id: record.id,
          amount: paidAmount,
          payment_type: isFullPayment ? 'full' : 'balance',
          method,
          processed_by: staffId,
        });

        if (paymentError) throw paymentError;

        if (isFullPayment) {
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              payment_received: true,
              payment_method: method,
              payment_received_at: new Date().toISOString(),
              payment_received_by: staffId,
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', record.id);

          if (updateError) throw updateError;
        }
      }

      await supabase.from('audit_logs').insert({
        action: 'CONFIRM_PAYMENT',
        entity: type === 'booking' ? 'bookings' : 'orders',
        entity_id: record.id,
        performed_by: staffId,
        details: {
          method,
          amount: paidAmount,
          is_full_payment: isFullPayment,
        },
      });

      onReceipt({
        customerName: getCustomerName(record),
        type,
        items:
          type === 'booking'
            ? [{ label: record.services?.name || 'Service', amount: total }]
            : [{ label: 'Parts order', amount: Number(record.total_amount) || 0 }],
        total,
        amountPaid: paidAmount,
        paymentMethod: method,
        referenceId: record.id.slice(0, 8).toUpperCase(),
      });

      setConfirming(null);
      setError('');
      await fetchPending(false);
    } catch (err) {
      setError(err.message || 'Failed to confirm payment.');
    }
  }

  const totalPending = bookings.length + orders.length;

  const totals = useMemo(() => {
    const bookingDue = bookings.reduce((sum, booking) => {
      const total = calculateBookingTotal(booking);
      const { totalPaid } = summarizePayments(bookingPayments[booking.id] || []);
      return sum + Math.max(total - totalPaid, 0);
    }, 0);

    const orderDue = orders.reduce((sum, order) => {
      const total = Number(order.total_amount) || 0;
      const { totalPaid } = summarizePayments(orderPayments[order.id] || []);
      return sum + Math.max(total - totalPaid, 0);
    }, 0);

    return {
      bookingDue,
      orderDue,
      totalDue: bookingDue + orderDue,
    };
  }, [bookings, orders, bookingPayments, orderPayments]);

  function PaymentRow({ type, record, payments }) {
    const total = type === 'booking' ? calculateBookingTotal(record) : Number(record.total_amount) || 0;
    const { totalPaid } = summarizePayments(payments);
    const due = Math.max(total - totalPaid, 0);
    const percent = total > 0 ? Math.min(Math.round((totalPaid / total) * 100), 100) : 0;

    return (
      <div className="flex items-center gap-4 rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900">
        <CustomerAvatar profile={record.profiles} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-gray-950 dark:text-white">
            {getCustomerName(record)}
          </p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {type === 'booking' ? record.services?.name || 'Service' : 'Parts order'} · {formatPeso(total)} total
          </p>

          {totalPaid > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} />
              </div>
              <span className="whitespace-nowrap text-[10px] font-black text-green-600 dark:text-green-300">
                {percent}% paid
              </span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-black text-accent-600 dark:text-accent-400">
            {formatPeso(due)}
          </p>
          <p className="mb-2 text-[10px] font-bold text-gray-400">due</p>
          <button
            type="button"
            onClick={() => openConfirm(type, record, due, total, totalPaid)}
            className="rounded-2xl bg-primary-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-gray-200 bg-white py-20 shadow-sm dark:border-dark-700 dark:bg-dark-800">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Loading payments...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending Records" value={totalPending} icon="💰" tone="primary" />
        <StatCard label="Bookings Due" value={formatPeso(totals.bookingDue)} icon="📅" tone="accent" />
        <StatCard label="Orders Due" value={formatPeso(totals.orderDue)} icon="📦" tone="yellow" />
      </div>

      {totalPending === 0 ? (
        <Section>
          <div className="py-12 text-center">
            <span className="text-5xl">🎉</span>
            <p className="mt-4 text-lg font-black text-gray-950 dark:text-white">All caught up!</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No pending payments right now.</p>
          </div>
        </Section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-black text-gray-950 dark:text-white">Bookings</h2>
              {bookings.length > 0 && (
                <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-black text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25">
                  {bookings.length} pending
                </span>
              )}
            </div>

            {bookings.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-gray-300 py-8 text-center text-sm font-semibold text-gray-500 dark:border-dark-700 dark:text-gray-400">
                None pending ✓
              </p>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <PaymentRow
                    key={booking.id}
                    type="booking"
                    record={booking}
                    payments={bookingPayments[booking.id] || []}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-black text-gray-950 dark:text-white">Orders</h2>
              {orders.length > 0 && (
                <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-black text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25">
                  {orders.length} pending
                </span>
              )}
            </div>

            {orders.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-gray-300 py-8 text-center text-sm font-semibold text-gray-500 dark:border-dark-700 dark:text-gray-400">
                None pending ✓
              </p>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <PaymentRow
                    key={order.id}
                    type="order"
                    record={order}
                    payments={orderPayments[order.id] || []}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-700 dark:bg-dark-800">
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-primary-50 text-2xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
                💳
              </div>
              <h3 className="text-xl font-black text-gray-950 dark:text-white">Confirm Payment</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {getCustomerName(confirming.record)} —{' '}
                <span className="font-black text-accent-600 dark:text-accent-400">
                  {formatPeso(confirming.due)} due
                </span>
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Amount Received
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mb-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-lg font-black text-gray-950 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            />

            <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Payment Method
            </p>
            <div className="mb-5">
              <PaymentMethodPicker value={method} onChange={setMethod} />
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmPayment}
                className="w-full rounded-2xl bg-primary-600 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
              >
                Confirm & Generate Receipt
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirming(null);
                  setError('');
                }}
                className="w-full rounded-2xl border border-gray-200 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 dark:border-dark-700 dark:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
