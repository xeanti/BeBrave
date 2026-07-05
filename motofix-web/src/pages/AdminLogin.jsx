import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const PORTAL_ROLES = ['admin', 'super_admin', 'staff', 'mechanic'];

function getPortalHome(role) {
  if (role === 'admin' || role === 'super_admin') return '/admin';
  if (role === 'staff') return '/staff';
  if (role === 'mechanic') return '/mechanic-dashboard';
  return '/dashboard';
}

function getFriendlyError(err) {
  const message = err?.message || '';

  if (message.toLowerCase().includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }

  if (message.toLowerCase().includes('email not confirmed')) {
    return 'Please confirm your email first before logging in.';
  }

  return message || 'Admin login failed. Please try again.';
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;

    if (PORTAL_ROLES.includes(profile.role)) {
      navigate(getPortalHome(profile.role), { replace: true });
    }
  }, [user, profile, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (loginError) throw loginError;

      const userId = data?.user?.id;

      if (!userId) {
        throw new Error('No user account was returned.');
      }

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, first_name, last_name, email')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      if (!PORTAL_ROLES.includes(profileRow?.role)) {
        await supabase.auth.signOut();

        setError(
          'This portal is only for MotoFix staff, mechanics, admins, and super admins. Customers should use the customer login page.'
        );
        return;
      }

      await refreshProfile?.();

      navigate(getPortalHome(profileRow.role), { replace: true });
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900 dark:bg-dark-950 dark:text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-dark-900 lg:grid-cols-2">
          <section className="hidden bg-gradient-to-br from-yellow-500 via-yellow-600 to-orange-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">
                  🛠️
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/70">
                    MotoFix
                  </p>
                  <h1 className="text-2xl font-black">Admin Portal</h1>
                </div>
              </div>

              <h2 className="text-4xl font-black leading-tight">
                Personnel access for MotoFix operations.
              </h2>

              <p className="mt-5 max-w-md text-sm leading-7 text-white/80">
                Use this portal for bookings, walk-ins, orders, inventory,
                payments, mechanics, staff accounts, reports, and system
                administration.
              </p>
            </div>

            <div className="rounded-3xl bg-black/20 p-5 text-sm text-white/80">
              Customers should not use this page. They must log in through the
              normal customer login.
            </div>
          </section>

          <section className="p-6 sm:p-10">
            <div className="mb-8">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-primary-600 dark:text-primary-400">
                Secure Login
              </p>
              <h1 className="mt-2 text-3xl font-black">Admin / Staff Login</h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Sign in using your MotoFix personnel account.
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-600 dark:text-gray-300">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-white/10 dark:bg-dark-950 dark:text-white"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-bold text-gray-600 dark:text-gray-300">
                    Password
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-xs font-black text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-white/10 dark:bg-dark-950 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-primary-600 px-5 py-3 font-black text-white shadow-lg shadow-primary-600/25 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Checking access...' : 'Log in to Admin Portal'}
              </button>
            </form>

            <div className="mt-6 rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-dark-950 dark:text-gray-400">
              Customer account?{' '}
              <Link
                to="/login"
                className="font-black text-primary-600 hover:underline dark:text-primary-400"
              >
                Go to customer login
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}