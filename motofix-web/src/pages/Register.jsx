import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user]);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showDPA, setShowDPA] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!agreedToTerms) {
      setError('You must agree to the Terms and Conditions and Data Privacy consent before registering.');
      return;
    }

    setLoading(true); // <-- was loading(true), which crashes
    try {
      await signUp({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center bg-dark-900 px-4 py-8">
      <div className="bg-dark-800 rounded-xl shadow-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          Create Your Account
        </h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 text-sm rounded-md p-3 mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500 text-green-400 text-sm rounded-md p-3 mb-4">
            Account created! Redirecting to login...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">First Name</label>
              <input
                name="firstName"
                required
                value={form.firstName}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Last Name</label>
              <input
                name="lastName"
                required
                value={form.lastName}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Phone</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
              placeholder="09XX XXX XXXX"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                value={form.password}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Confirm</label>
              <input
                type="password"
                name="confirmPassword"
                required
                value={form.confirmPassword}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-md bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Terms & DPA Consent */}
          <div className="bg-dark-900/50 border border-gray-700 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 accent-primary-500 flex-shrink-0"
              />
              <span className="text-sm text-gray-400 leading-relaxed">
                I have read and agree to the{' '}
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  className="text-primary-400 hover:underline"
                >
                  Terms and Conditions
                </button>{' '}
                and consent to the collection and processing of my personal data in accordance with the{' '}
                <button
                  type="button"
                  onClick={() => setShowDPA(true)}
                  className="text-primary-400 hover:underline"
                >
                  Data Privacy Act of 2012 (RA 10173)
                </button>
                .
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-2 rounded-md transition"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="text-gray-400 text-sm text-center mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-500 hover:underline">
            Log in
          </Link>
        </p>
      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowTerms(false)}
        >
          <div
            className="bg-dark-800 border border-gray-700 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Terms and Conditions</h2>
              <button onClick={() => setShowTerms(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="text-sm text-gray-400 space-y-3 leading-relaxed">
              <p><strong className="text-white">1. Acceptance of Terms</strong><br />
                By registering, you agree to be bound by these Terms and Conditions.</p>
              <p><strong className="text-white">2. Services</strong><br />
                MotoFix provides motorcycle service booking, parts ordering, and AI appearance preview services. All bookings are subject to shop availability and confirmation.</p>
              <p><strong className="text-white">3. Down Payments</strong><br />
                A 15% down payment is required to confirm bookings and parts orders. This is non-refundable if cancelled within 24 hours of the appointment.</p>
              <p><strong className="text-white">4. User Responsibilities</strong><br />
                You are responsible for providing accurate information. Misuse of the platform may result in account suspension.</p>
              <p><strong className="text-white">5. Limitation of Liability</strong><br />
                MotoFix is not liable for delays, damages, or losses arising from service appointments beyond our reasonable control.</p>
              <p><strong className="text-white">6. Changes to Terms</strong><br />
                We reserve the right to update these terms at any time. Continued use of the platform constitutes acceptance.</p>
            </div>
            <button
              onClick={() => setShowTerms(false)}
              className="mt-5 w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 rounded-lg transition text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* DPA Modal */}
      {showDPA && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowDPA(false)}
        >
          <div
            className="bg-dark-800 border border-gray-700 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Data Privacy Consent</h2>
              <button onClick={() => setShowDPA(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="text-sm text-gray-400 space-y-3 leading-relaxed">
              <p><strong className="text-white">Data Controller</strong><br />
                MotoFix collects and processes your personal data as the data controller under RA 10173 (Data Privacy Act of 2012).</p>
              <p><strong className="text-white">Data Collected</strong><br />
                We collect your name, email address, phone number, and motorcycle details for the purpose of service booking, parts ordering, and account management.</p>
              <p><strong className="text-white">Purpose of Processing</strong><br />
                Your data is used to manage your bookings, process orders, send service reminders, and improve our services.</p>
              <p><strong className="text-white">Data Sharing</strong><br />
                Your information may be shared with assigned mechanics solely for service fulfillment. We do not sell your data to third parties.</p>
              <p><strong className="text-white">Retention</strong><br />
                Personal data is retained for the duration of your account and up to 3 years after account closure for legal compliance.</p>
              <p><strong className="text-white">Your Rights</strong><br />
                Under RA 10173, you have the right to access, correct, and request deletion of your personal data. Contact us to exercise these rights.</p>
            </div>
            <button
              onClick={() => setShowDPA(false)}
              className="mt-5 w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 rounded-lg transition text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}