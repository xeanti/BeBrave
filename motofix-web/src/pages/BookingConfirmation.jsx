import { Link, useLocation, useNavigate } from 'react-router-dom';

const GCASH_QR_IMAGE = 'https://wcqqduuimpjipwvwzyzx.supabase.co/storage/v1/object/public/motorcycle-photos/MISCS/GCASH%20(1).jpg';

function formatPeso(value) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTime(time) {
  if (!time) return '—';

  const [h, m = '00'] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${displayHour}:${m} ${ampm}`;
}

function formatDate(dateString) {
  if (!dateString) return '—';

  const [year, month, day] = dateString.split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(date = new Date()) {
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InfoRow({ label, value, muted = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-200 py-3 last:border-0 dark:border-dark-700">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <span
        className={`max-w-[65%] text-right text-sm font-bold ${
          muted
            ? 'text-gray-500 dark:text-gray-400'
            : 'text-gray-950 dark:text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PriceRow({ label, value, strong = false, accent = false }) {
  return (
    <div
      className={`flex justify-between gap-4 text-sm ${
        strong ? 'border-t border-gray-200 pt-3 dark:border-dark-700' : ''
      }`}
    >
      <span
        className={
          strong
            ? 'font-black text-gray-950 dark:text-white'
            : 'text-gray-600 dark:text-gray-400'
        }
      >
        {label}
      </span>
      <span
        className={
          accent
            ? 'font-black text-accent-600 dark:text-accent-400'
            : strong
            ? 'font-black text-gray-950 dark:text-white'
            : 'font-bold text-gray-900 dark:text-gray-200'
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function BookingConfirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state?.booking) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-6 py-10 text-gray-900 dark:bg-dark-900 dark:text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-900/20 dark:ring-primary-500/20">
              📅
            </div>
            <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
              No booking found
            </h1>
            <p className="mb-6 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Please create a booking first so we can show your confirmation receipt.
            </p>
            <button
              onClick={() => navigate('/booking')}
              className="rounded-2xl bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.98]"
            >
              Book a Service
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { booking, service, mechanic, cartItems = [] } = state;

  const basePrice = Number(service?.base_price) || 0;
  const laborCost = Number(service?.labor_cost) || 0;
  const serviceTotal = basePrice + laborCost;

  const partsTotal =
    Number(booking.cart_total) ||
    cartItems.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      return sum + price * item.quantity;
    }, 0);

  const hasIncludedParts = Boolean(booking.include_cart_parts && partsTotal > 0);
  const estimateTotal =
    Number(booking.grand_total_estimate) ||
    serviceTotal + (hasIncludedParts ? partsTotal : 0);

  const downPayment = Number(booking.down_payment) || 0;
  const remainingBalance =
    Number(booking.remaining_balance) ||
    Math.max(estimateTotal - downPayment, 0);

  const computedDownPaymentPercent =
    estimateTotal > 0 ? Math.round((downPayment / estimateTotal) * 100) : 15;

  const bookingCode = booking.id
    ? `#${booking.id.slice(0, 8).toUpperCase()}`
    : 'Pending ID';

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* Success header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-green-200 bg-white shadow-sm dark:border-green-500/25 dark:bg-dark-800">
          <div className="relative p-6 text-center sm:p-8">
            <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-green-500/10 blur-3xl" />

            <div className="relative">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-green-50 text-4xl ring-1 ring-green-100 dark:bg-green-500/10 dark:ring-green-500/20">
                ✓
              </div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-green-600 dark:text-green-400">
                Booking Request Sent
              </p>
              <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                Booking Submitted!
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                Your appointment request has been received. Please complete your down payment and wait for shop confirmation.
              </p>
              <div className="mt-4 inline-flex items-center rounded-full border border-yellow-200 bg-yellow-50 px-4 py-2 text-xs font-black text-yellow-700 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300">
                {bookingCode} · Pending Confirmation
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Receipt */}
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">
                    Booking Receipt
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Review your appointment details below.
                  </p>
                </div>
                <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-black text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25">
                  Pending Confirmation
                </span>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 dark:border-dark-700 dark:bg-dark-900/60">
                <InfoRow label="Service" value={service?.name || 'Service'} />
                <InfoRow label="Date" value={formatDate(booking.booking_date)} />
                <InfoRow label="Time" value={formatTime(booking.booking_time)} />
                <InfoRow
                  label="Mechanic"
                  value={
                    mechanic
                      ? `${mechanic.first_name} ${mechanic.last_name}`
                      : 'Any available mechanic'
                  }
                  muted={!mechanic}
                />
                {booking.notes && (
                  <InfoRow label="Notes" value={booking.notes} />
                )}
              </div>
            </section>

            {/* Included parts */}
            {hasIncludedParts && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                <div className="mb-4">
                  <h2 className="text-lg font-black tracking-tight text-gray-950 dark:text-white">
                    Included Cart Parts
                  </h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    These parts were included in your booking estimate.
                  </p>
                </div>

                <div className="space-y-3">
                  {cartItems.length > 0 ? (
                    cartItems.map((item) => {
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
                    })
                  ) : (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400">
                      Parts were included in the estimate, but item details were not passed to this page.
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* What's next */}
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <h2 className="mb-4 text-lg font-black tracking-tight text-gray-950 dark:text-white">
                What happens next?
              </h2>

              <div className="space-y-3">
                {[
                  {
                    icon: '1',
                    title: 'Send your down payment',
                    text: `Pay ${formatPeso(downPayment)} using the GCash QR code.`,
                  },
                  {
                    icon: '2',
                    title: 'Keep your receipt',
                    text: 'Save your GCash receipt or screenshot as proof of payment.',
                  },
                  {
                    icon: '3',
                    title: 'Wait for confirmation',
                    text: 'The shop will review your request and confirm your appointment.',
                  },
                  {
                    icon: '4',
                    title: 'Bring your motorcycle',
                    text: 'Arrive on your scheduled date and time.',
                  },
                ].map((step) => (
                  <div key={step.icon} className="flex gap-3 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/60 dark:ring-dark-700">
                    <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-primary-600 text-xs font-black text-white">
                      {step.icon}
                    </div>
                    <div>
                      <p className="text-sm font-black text-gray-950 dark:text-white">
                        {step.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        {step.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right column */}
          <aside className="space-y-6">
            {/* GCash QR */}
            <section className="rounded-3xl border border-primary-200 bg-primary-50 p-5 shadow-sm dark:border-primary-500/25 dark:bg-primary-900/10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-primary-800 dark:text-primary-200">
                    GCash Payment
                  </h2>
                  <p className="mt-1 text-xs text-primary-700/80 dark:text-primary-300/80">
                    Scan to pay the required down payment.
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
                    Amount to pay
                  </span>
                  <span className="text-xl font-black text-accent-600 dark:text-accent-400">
                    {formatPeso(downPayment)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                  {computedDownPaymentPercent}% of the estimate. Keep your receipt for verification.
                </p>
              </div>
            </section>

            {/* Price summary */}
            <section className="sticky top-24 rounded-3xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60 dark:border-dark-700 dark:bg-dark-800 dark:shadow-black/20">
              <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-gray-950 dark:text-white">
                Payment Summary
              </h2>

              <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60">
                <PriceRow label="Base Price" value={formatPeso(basePrice)} />
                <PriceRow label="Labor Cost" value={formatPeso(laborCost)} />

                {hasIncludedParts && (
                  <PriceRow label="Included Parts" value={formatPeso(partsTotal)} />
                )}

                <PriceRow
                  label="Estimated Total"
                  value={formatPeso(estimateTotal)}
                  strong
                />
                <PriceRow
                  label={`Down Payment (${computedDownPaymentPercent}%)`}
                  value={formatPeso(downPayment)}
                  accent
                />
                <PriceRow
                  label="Remaining Balance"
                  value={formatPeso(remainingBalance)}
                />
              </div>

              <div className="mt-4 rounded-2xl border border-accent-200 bg-accent-50 p-4 dark:border-accent-500/30 dark:bg-accent-500/10">
                <p className="text-sm font-black text-accent-700 dark:text-accent-300">
                  Down Payment Required to Confirm
                </p>
                <p className="mt-1 text-2xl font-black text-accent-700 dark:text-accent-300">
                  {formatPeso(downPayment)}
                </p>
                <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                  The shop may verify your payment before confirming your booking.
                </p>
              </div>

              <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                Booked on {formatDateTime()}
              </p>

              <div className="mt-5 grid gap-3">
                <Link
                  to="/appointments"
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-center text-sm font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 active:scale-[0.99]"
                >
                  View My Appointments
                </Link>

                <Link
                  to="/booking"
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-center text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
                >
                  Book Another
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
