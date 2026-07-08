import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const inputBase =
  'w-full pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-colors';

const labelBase = 'block text-sm text-gray-600 dark:text-gray-300 mb-1';

const CUSTOMER_ROLES = ['customer', 'user'];
const ADMIN_PORTAL_ROLES = ['admin', 'super_admin', 'staff'];
const MOBILE_ONLY_ROLES = ['mechanic'];

function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

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

function getFriendlyLoginError(err) {
  const message = err?.message || '';

  if (message.toLowerCase().includes('email not confirmed')) {
    return {
      title: 'Please confirm your email first',
      message:
        'Your account was created, but you need to open the verification email sent to your Email before logging in.',
      tips: [
        'Check your Inbox, Spam, or Promotions folder.',
        'Click the confirmation link in the email.',
        'After confirming, return here and log in again.',
      ],
      canResend: true,
    };
  }

  if (message.toLowerCase().includes('invalid login credentials')) {
    return {
      title: 'Incorrect email or password',
      message: 'Please check your email and password, then try again.',
      tips: [],
      canResend: false,
    };
  }

  if (message.toLowerCase().includes('auth session missing')) {
    return {
      title: 'Login failed',
      message: 'Your login session could not be read. Please try logging in again.',
      tips: [],
      canResend: false,
    };
  }

  return {
    title: 'Login failed',
    message: message || 'Something went wrong while logging in. Please try again.',
    tips: [],
    canResend: false,
  };
}

function getRoleAccessError(role) {
  if (ADMIN_PORTAL_ROLES.includes(role)) {
    return {
      title: 'Use the Admin Login',
      message:
        'This account is not a customer account. Please use the Admin Login page.',
      tips: ['Click “Use the Admin Login” below to continue.'],
      canResend: false,
    };
  }

  if (MOBILE_ONLY_ROLES.includes(role)) {
    return {
      title: 'Use the MotoFix Mobile App',
      message:
        'Mechanic accounts must use the MotoFix mobile application.',
      tips: [],
      canResend: false,
    };
  }

  return {
    title: 'Access Restricted',
    message: 'This account role is not allowed to access the customer web portal.',
    tips: [],
    canResend: false,
  };
}

export default function Login() {
  const { signIn, signOut, user, profile } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;

    async function handleExistingSession() {
      const role = normalizeRole(profile.role);

      if (CUSTOMER_ROLES.includes(role)) {
        navigate('/dashboard', { replace: true });
        return;
      }

      // Important:
      // Do not silently redirect non-customer accounts.
      // Sign them out and show a clear message on this login page.
      await signOut();
      setError(getRoleAccessError(role));
    }

    handleExistingSession();
  }, [user, profile, navigate, signOut]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError({
        title: 'Missing login details',
        message: 'Please enter your email and password.',
        tips: [],
        canResend: false,
      });
      return;
    }

    setLoading(true);

    try {
      const authData = await signIn({
        email: cleanEmail,
        password,
      });

      const userId = authData?.user?.id;

      if (!userId) {
        throw new Error('No authenticated user was found.');
      }

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

      if (profileError) throw profileError;

      const profileRow = profileRows?.[0];
      const metadataRole = authData?.user?.user_metadata?.role;
      const role = normalizeRole(profileRow?.role || metadataRole);

      if (!CUSTOMER_ROLES.includes(role)) {
        await signOut();
        setError(getRoleAccessError(role));
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getFriendlyLoginError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    setError(null);
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError({
        title: 'Email is required',
        message: 'Please enter your email address first before resending the confirmation email.',
        tips: [],
        canResend: false,
      });
      return;
    }

    setResendLoading(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (resendError) throw resendError;

      setSuccessMessage(
        'Confirmation email sent again. Please check your Inbox, Spam, or Promotions folder.'
      );
    } catch (err) {
      setError({
        title: 'Could not resend confirmation email',
        message: err.message || 'Please try again later.',
        tips: [],
        canResend: false,
      });
    } finally {
      setResendLoading(false);
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
              <div className="w-12 h-12 flex items-center justify-center shrink-0 overflow-hidden">
                <img
                  src="/favicon.png"
                  alt="MotoFix Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-accent-600 dark:text-accent-400">
                  {greeting()}
                </p>
                <h1 className="text-xl font-bold leading-tight">Welcome back</h1>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">
              Log in to check your appointments, orders, pre-assessments, messages, and profile.
            </p>

            <div className="mt-6 space-y-2.5">
              <FeatureRow
                icon="📅"
                color="bg-blue-500/10 text-blue-500 dark:text-blue-400"
                title="Appointment tracking"
                description="View your booking status"
              />
              <FeatureRow
                icon="📋"
                color="bg-primary-500/10 text-primary-500 dark:text-primary-400"
                title="Pre-assessments"
                description="Check service estimates"
              />
              <FeatureRow
                icon="💬"
                color="bg-purple-500/10 text-purple-500 dark:text-purple-400"
                title="Customer messages"
                description="Chat with MotoFix support"
              />
            </div>
          </div>

          {/* Form panel */}
          <div className="flex-1 p-6 sm:p-7 pl-7 sm:pl-8 flex flex-col justify-center">
            <h2 className="text-lg font-semibold mb-5">Log in to your account</h2>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-xl p-4 mb-4">
                <p className="font-semibold text-red-700 dark:text-red-300 mb-1">
                  {error.title}
                </p>

                <p className="leading-relaxed">
                  {error.message}
                </p>

                {error.tips?.length > 0 && (
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-xs leading-relaxed">
                    {error.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                )}

                {error.canResend && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resendLoading}
                    className="mt-3 inline-flex items-center justify-center rounded-lg bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 transition"
                  >
                    {resendLoading ? 'Sending...' : 'Resend confirmation email'}
                  </button>
                )}
              </div>
            )}

            {successMessage && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm rounded-xl p-3 mb-4">
                {successMessage}
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
                    disabled={loading}
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
                    disabled={loading}
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
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl shadow-md shadow-primary-500/30 transition"
              >
                {loading && (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                )}
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            <div className="mt-5 rounded-xl bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-white/10 p-3 text-xs text-gray-500 dark:text-gray-400">
              Staff, admin, or super admin?{' '}
              <Link
                to="/admin/login"
                className="font-semibold text-primary-600 dark:text-primary-500 hover:underline"
              >
                Use the Personnel Login
              </Link>
              <br />
              <span className="mt-1 inline-block">
                Mechanic account? Use the MotoFix mobile app.
              </span>
            </div>

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
