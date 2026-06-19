import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="bg-dark-900 text-white min-h-[calc(100vh-65px)]">
      {/* Hero */}
      <section className="relative px-6 pt-24 pb-32 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto">
          <span className="inline-block bg-primary-500/10 text-primary-400 text-xs font-semibold px-3 py-1 rounded-full mb-6 border border-primary-500/20">
            ✨ Powered by Be Brave
          </span>

          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            Your Ride, <span className="text-primary-500">Perfected.</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
            Book motorcycle services, browse compatible parts, and preview your
            customized look with AI — all in one place.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
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
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-gray-800 bg-dark-800/50">
        <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-3 gap-6 text-center">
          <Stat number="100%" label="Digital Booking" />
          <Stat number="AI" label="Appearance Preview" />
          <Stat number="24/7" label="Chat Support" />
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Everything your ride needs</h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            From booking to customization, MotoFix brings the full service shop experience online.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            title="Easy Booking"
            description="Schedule your service appointment with real-time mechanic availability — no more waiting in line."
            icon="🛠️"
            color="bg-blue-500/10 text-blue-400"
          />
          <FeatureCard
            title="AI Appearance Preview"
            description="Choose your motorcycle model, pick new parts, and see a realistic AI-generated preview before you buy."
            icon="✨"
            color="bg-primary-500/10 text-primary-400"
          />
          <FeatureCard
            title="Live Chat Support"
            description="Chat directly with the shop or get instant answers from our AI assistant, anytime."
            icon="💬"
            color="bg-purple-500/10 text-purple-400"
          />
          <FeatureCard
            title="Parts Catalog"
            description="Browse a curated catalog of parts filtered to fit your exact motorcycle model."
            icon="🔧"
            color="bg-orange-500/10 text-orange-400"
          />
          <FeatureCard
            title="Track Your History"
            description="Keep tabs on your bookings, service status, and saved customization previews in one dashboard."
            icon="📊"
            color="bg-green-500/10 text-green-400"
          />
          <FeatureCard
            title="Secure & Reliable"
            description="Your data and account are protected with secure authentication and encrypted storage."
            icon="🔒"
            color="bg-pink-500/10 text-pink-400"
          />
        </div>
      </section>

      {/* CTA */}
      {!user && (
        <section className="px-6 py-20 text-center border-t border-gray-800">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to upgrade your ride?</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Create your free account and start booking services or previewing your custom look today.
          </p>
          <Link
            to="/register"
            className="bg-primary-600 hover:bg-primary-700 px-8 py-3.5 rounded-lg font-semibold transition shadow-lg shadow-primary-600/25 inline-block"
          >
            Create Free Account
          </Link>
        </section>
      )}
    </div>
  );
}

function Stat({ number, label }) {
  return (
    <div>
      <p className="text-2xl font-bold text-primary-500">{number}</p>
      <p className="text-sm text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function FeatureCard({ title, description, icon, color }) {
  return (
    <div className="bg-dark-800 rounded-xl p-6 hover:bg-dark-800/70 transition border border-transparent hover:border-primary-500/20">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl mb-4 ${color}`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
