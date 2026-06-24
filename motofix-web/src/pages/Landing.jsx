import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDownPaymentPercent } from '../lib/settings';

export default function Landing() {
  const { user } = useAuth();
  const [downPaymentRate, setDownPaymentRate] = useState(0.15);

  useEffect(() => {
    getDownPaymentPercent().then(setDownPaymentRate);
  }, []);

  return (
    <div className="bg-dark-900 text-white overflow-hidden">
      {/* ───────── Hero ───────── */}
      <section className="relative px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        {/* Mesh background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-20 w-[500px] h-[500px] bg-primary-600/25 rounded-full blur-[120px]" />
          <div className="absolute top-40 -right-20 w-[420px] h-[420px] bg-accent-500/15 rounded-full blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.2fr_0.8fr] gap-12 items-center">
          {/* Left: copy */}
          <div>
            <span className="inline-flex items-center gap-2 bg-primary-500/10 text-primary-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-primary-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
              Powered by Be Brave
            </span>

            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.02] mb-6 tracking-tight">
              Your ride,
              <br />
              <span className="relative inline-block">
                <span className="relative z-10 text-primary-500">perfected</span>
                <span className="absolute left-0 bottom-1 md:bottom-2 w-full h-3 md:h-4 bg-primary-500/20 -z-0" />
              </span>
              .
            </h1>

            <p className="text-gray-400 text-lg mb-10 max-w-md">
              Book motorcycle services, browse compatible parts, and preview your
              customized look with AI — all in one place.
            </p>

            <div className="flex gap-4 flex-wrap mb-10">
              {user ? (
                <Link
                  to="/dashboard"
                  className="bg-primary-600 hover:bg-primary-700 px-8 py-3.5 rounded-lg font-semibold transition shadow-lg shadow-primary-600/25"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="bg-primary-600 hover:bg-primary-700 px-8 py-3.5 rounded-lg font-semibold transition shadow-lg shadow-primary-600/25"
                  >
                    Get Started Free
                  </Link>
                  <Link
                    to="/login"
                    className="border border-gray-700 hover:border-primary-500 hover:bg-dark-800 px-8 py-3.5 rounded-lg font-semibold transition"
                  >
                    Login
                  </Link>
                </>
              )}
            </div>

            {/* Mini trust row */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex -space-x-2">
                {['🔧', '🏍️', '✨', '💬'].map((e, i) => (
                  <span
                    key={i}
                    className="w-8 h-8 rounded-full bg-dark-800 border border-dark-900 flex items-center justify-center text-sm"
                  >
                    {e}
                  </span>
                ))}
              </div>
              <span>Booking, parts, AI preview & support — one shop, one app.</span>
            </div>
          </div>

          {/* Right: floating stat card */}
          <div className="relative hidden lg:block pb-10 pl-8">
            <div className="bg-dark-800 border border-gray-800 rounded-2xl p-6 shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-300">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">AI Appearance Preview</p>
                <span className="text-xs bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded-full">
                  ✨ Live
                </span>
              </div>
              {/* Real motorcycle photo */}
              <div className="aspect-video rounded-xl overflow-hidden border border-primary-500/10 mb-4">
                <img
                  src="https://wcqqduuimpjipwvwzyzx.supabase.co/storage/v1/object/public/motorcycle-photos/MOTORCYCLE%20PHOTOS/sample.png"
                  alt="Motorcycle preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Exhaust + Rims swap</span>
                <span className="text-accent-400 font-semibold">₱4,250 est.</span>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 bg-dark-800 border border-gray-800 rounded-xl px-4 py-3 shadow-xl -rotate-3">
              <p className="text-2xl font-bold text-primary-500">{Math.round(downPaymentRate * 100)}%</p>
              <p className="text-xs text-gray-400">down payment only</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Ticker strip ───────── */}
      <section className="border-y border-gray-800 bg-dark-800 py-3 overflow-hidden">
        <div className="flex gap-10 whitespace-nowrap animate-[scroll_28s_linear_infinite]">
          {Array(2)
            .fill([
              '100% Digital Booking',
              'AI Appearance Preview',
              '24/7 Chat Support',
              'Curated Parts Catalog',
              'Real Mechanic Ratings',
              'Secure Down Payments',
            ])
            .flat()
            .map((item, i) => (
              <span key={i} className="text-sm text-gray-500 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                {item}
              </span>
            ))}
        </div>
        <style>{`
          @keyframes scroll {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}</style>
      </section>

      {/* ───────── Bento features ───────── */}
      <section className="px-6 py-24 max-w-6xl mx-auto">
        <div className="mb-12 max-w-xl">
          <span className="text-primary-500 text-sm font-semibold tracking-wide uppercase">
            Everything in one shop
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mt-2">
            Built for riders who don't want the runaround.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 auto-rows-fr gap-4">
          {/* Big card */}
          <div className="md:col-span-2 md:row-span-2 bg-dark-800 border border-primary-500/20 rounded-2xl p-8 flex flex-col justify-between min-h-[320px]">
            <div className="w-14 h-14 rounded-xl bg-primary-500/10 text-primary-400 flex items-center justify-center text-2xl mb-6">
              ✨
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-3">AI Appearance Preview</h3>
              <p className="text-gray-400 leading-relaxed max-w-md">
                Choose your motorcycle model, pick new parts — rims, exhaust, decals — and
                see a realistic AI-generated preview before you spend a single peso.
              </p>
            </div>
          </div>

          <FeatureCard
            title="Easy Booking"
            description="Real-time mechanic availability, no waiting in line."
            icon="🛠️"
          />
          <FeatureCard
            title="Live Chat Support"
            description="Talk to the shop or get instant AI answers, anytime."
            icon="💬"
          />
          <FeatureCard
            title="Parts Catalog"
            description="Curated parts filtered to fit your exact model."
            icon="🔧"
          />
          <FeatureCard
            title="Track Everything"
            description="Bookings, status, and AI previews in one dashboard."
            icon="📊"
          />
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section className="px-6 py-20 border-t border-gray-800 bg-dark-800/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">From idea to appointment in 3 steps</h2>
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-7 left-[calc(16.6%+1.75rem)] right-[calc(16.6%+1.75rem)] h-px bg-gradient-to-r from-primary-500/40 via-gray-700 to-primary-500/40 -z-0" />
            <Step number="1" title="Pick a service" text="Choose a service, get an instant cost estimate, no surprises." />
            <Step number="2" title="Preview & book" text="Try the AI appearance preview, then lock in your date and mechanic." />
            <Step number="3" title="Ride in, ride out" text={`Pay ${Math.round(downPaymentRate * 100)}% down, bring your bike, and we handle the rest.`} />
          </div>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      {!user && (
        <section className="px-6 py-24 text-center">
          <div className="max-w-2xl mx-auto rounded-2xl p-[1px] bg-gradient-to-r from-primary-600/60 via-accent-500/40 to-primary-600/60">
            <div className="bg-dark-900 rounded-2xl px-8 py-14">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to upgrade your ride?</h2>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">
                Create your free account and start booking services or previewing your custom
                look today.
              </p>
              <Link
                to="/register"
                className="bg-primary-600 hover:bg-primary-700 px-8 py-3.5 rounded-lg font-semibold transition shadow-lg shadow-primary-600/25 inline-block"
              >
                Create Free Account
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function FeatureCard({ title, description, icon }) {
  return (
    <div className="bg-dark-800 rounded-2xl p-6 hover:bg-dark-800/70 transition border border-transparent hover:border-primary-500/20">
      <div className="w-11 h-11 rounded-lg bg-dark-900 flex items-center justify-center text-xl mb-4">
        {icon}
      </div>
      <h3 className="font-semibold mb-1.5">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, text }) {
  return (
    <div className="relative bg-dark-800 border border-gray-800 rounded-xl p-6">
      <div className="w-14 h-14 rounded-full bg-dark-800 border border-primary-500/30 text-primary-400 font-bold flex items-center justify-center mb-4 relative z-10">
        {number}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{text}</p>
    </div>
  );
}