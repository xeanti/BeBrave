import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const inputBase =
  'w-full pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-colors';

const labelBase = 'block text-sm text-gray-600 dark:text-gray-300 mb-1';

function FieldIcon({ children }) {
  return (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base leading-none opacity-70 pointer-events-none">
      {children}
    </span>
  );
}

function FeatureRow({ icon, color, title, description }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 dark:bg-dark-900 rounded-xl p-3.5 border border-transparent">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="font-medium text-sm text-gray-900 dark:text-white leading-tight">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function Login() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to log in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white px-4 sm:px-6 py-8 sm:py-10 transition-colors flex items-center justify-center">
      <div className="w-full max-w-3xl">
        <div className="relative rounded-2xl bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 shadow-sm dark:shadow-none overflow-hidden transition-colors md:flex">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-500 to-accent-400" />

          {/* Brand panel */}
          <div className="md:w-[40%] p-6 sm:p-7 pl-7 sm:pl-8 border-b md:border-b-0 md:border-r border-gray-200 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center text-lg font-bold text-white shrink-0 shadow-md shadow-primary-500/30">
                🏍️
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-accent-600 dark:text-accent-400">
                  {greeting()}
                </p>
                <h1 className="text-xl font-bold leading-tight">Welcome back</h1>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">
              Log in to check on your bookings, message your mechanic, and manage your ride.
            </p>

            <div className="mt-6 space-y-2.5">
              <FeatureRow
                icon="📅"
                color="bg-blue-500/10 text-blue-500 dark:text-blue-400"
                title="Live booking status"
                description="Know exactly where your bike's at"
              />
              <FeatureRow
                icon="🔧"
                color="bg-primary-500/10 text-primary-500 dark:text-primary-400"
                title="Service history"
                description="Every visit, logged in one place"
              />
              <FeatureRow
                icon="👤"
                color="bg-purple-500/10 text-purple-500 dark:text-purple-400"
                title="GCash & Maya"
                description="Pay your way, no cash required"
              />
            </div>
          </div>

          {/* Form panel */}
          <div className="flex-1 p-6 sm:p-7 pl-7 sm:pl-8 flex flex-col justify-center">
            <h2 className="text-lg font-semibold mb-5">Log in to your account</h2>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-xl p-3 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelBase}>Email</label>
                <div className="relative">
                  <FieldIcon>✉️</FieldIcon>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputBase}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelBase + ' mb-0'}>Password</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="text-[11px] font-semibold text-primary-600 dark:text-primary-500 hover:underline"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="relative">
                  <FieldIcon>🔒</FieldIcon>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputBase}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl shadow-md shadow-primary-500/30 transition"
              >
                {loading && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            <p className="text-gray-500 dark:text-gray-400 text-sm text-center mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-600 dark:text-primary-500 hover:underline font-medium">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}