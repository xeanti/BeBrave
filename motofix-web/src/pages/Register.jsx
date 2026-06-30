import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  CONSENT_SOURCE_PAGES,
  CONSENT_TYPES,
  acceptMultipleCustomerConsents,
  getConsentDefinitionSafe,
} from '../lib/consents';

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

function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '', hint: '' };

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const passed = Object.values(checks).filter(Boolean).length;

  const missing = [];
  if (!checks.length) missing.push('8+ characters');
  if (!checks.uppercase) missing.push('uppercase letter');
  if (!checks.lowercase) missing.push('lowercase letter');
  if (!checks.number) missing.push('number');
  if (!checks.special) missing.push('special character');

  const hint = missing.length ? `Missing: ${missing.join(', ')}` : 'Password looks great!';

  if (passed <= 2) return { score: 1, label: 'Weak', color: 'bg-red-500', hint };
  if (passed === 3) return { score: 2, label: 'Fair', color: 'bg-yellow-500', hint };
  if (passed === 4) return { score: 3, label: 'Strong', color: 'bg-blue-500', hint };
  return { score: 4, label: 'Very Strong', color: 'bg-green-500', hint };
}

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('a special character');
  return errors;
}

function formatPHPhone(value) {
  let digits = value.replace(/\D/g, '');

  // If user types 09xxxxxxxxx, remove the first 0
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // If user types 63xxxxxxxxxx, remove 63 first
  if (digits.startsWith('63')) {
    digits = digits.slice(2);
  }

  // Keep only 10 digits after +63
  digits = digits.slice(0, 10);

  return digits ? `+63${digits}` : '';
}

function isValidPHPhone(phone) {
  return /^\+639\d{9}$/.test(phone);
}

export default function Register() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accountConsent, setAccountConsent] = useState(null);
  const [invoiceConsent, setInvoiceConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadConsentDefinitions() {
      try {
        const [accountDefinition, invoiceDefinition] = await Promise.all([
          getConsentDefinitionSafe(CONSENT_TYPES.ACCOUNT_REGISTRATION),
          getConsentDefinitionSafe(CONSENT_TYPES.INVOICE_RECEIPT),
        ]);

        if (!isMounted) return;

        setAccountConsent(accountDefinition);
        setInvoiceConsent(invoiceDefinition);
      } catch (err) {
        console.warn('Failed to load registration consent definitions:', err);
      } finally {
        if (isMounted) setConsentLoading(false);
      }
    }

    loadConsentDefinitions();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;

    if (name === 'phone') {
      setForm((prev) => ({
        ...prev,
        phone: formatPHPhone(value),
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  const strength = getPasswordStrength(form.password);
  const passwordsMatch = form.confirmPassword && form.password === form.confirmPassword;
  const passwordsMismatch = form.confirmPassword && form.password !== form.confirmPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const cleanEmail = form.email.trim().toLowerCase();
    const cleanPhone = form.phone.trim();

    if (cleanPhone && !isValidPHPhone(cleanPhone)) {
      setError('Please enter a valid Philippine mobile number, e.g. +639123456789.');
      return;
    }

    const pwErrors = validatePassword(form.password);
    if (pwErrors.length) {
      setError(`Password must contain ${pwErrors.join(', ')}.`);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!agreedToTerms) {
      setError('You must agree to the Terms and Conditions and Data Privacy consent before registering.');
      return;
    }

    setLoading(true);

    try {
      await signUp({
        email: cleanEmail,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: cleanPhone,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      });

      const registrationConsentTypes = [
        CONSENT_TYPES.ACCOUNT_REGISTRATION,
        CONSENT_TYPES.INVOICE_RECEIPT,
      ];

      try {
        await acceptMultipleCustomerConsents({
          consentTypes: registrationConsentTypes,
          sourcePage: CONSENT_SOURCE_PAGES.REGISTER,
          metadata: {
            email: cleanEmail,
            phone_provided: Boolean(cleanPhone),
            accepted_terms_and_conditions: true,
            accepted_data_privacy_act_notice: true,
          },
        });
      } catch (consentErr) {
        console.warn('Account created, but registration consent could not be recorded yet:', consentErr);

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            'motofix_pending_registration_consents',
            JSON.stringify({
              consentTypes: registrationConsentTypes,
              sourcePage: CONSENT_SOURCE_PAGES.REGISTER,
              metadata: {
                email: cleanEmail,
                phone_provided: Boolean(cleanPhone),
                accepted_terms_and_conditions: true,
                accepted_data_privacy_act_notice: true,
              },
              createdAt: new Date().toISOString(),
            })
          );
        }
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'Failed to create account');
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
              <div className="w-12 h-12 flex items-center justify-center shrink-0 overflow-hidden">
                <img
                  src="/favicon.png"
                  alt="MotoFix Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-accent-600 dark:text-accent-400">
                  {greeting()}, rider
                </p>
                <h1 className="text-xl font-bold leading-tight">MotoFix</h1>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">
              Create an account to book services, track your motorcycle&apos;s history, and pay your way.
            </p>

            <div className="mt-6 space-y-2.5">
              <FeatureRow
                icon="📅"
                color="bg-blue-500/10 text-blue-500 dark:text-blue-400"
                title="Book a Service"
                description="Schedule appointments in seconds"
              />
              <FeatureRow
                icon="✨"
                color="bg-primary-500/10 text-primary-500 dark:text-primary-400"
                title="AI Appearance Preview"
                description="Preview new parts before you buy"
              />
              <FeatureRow
                icon="👤"
                color="bg-purple-500/10 text-purple-500 dark:text-purple-400"
                title="One Profile"
                description="Bookings, orders & history in one place"
              />
            </div>
          </div>

          {/* Form panel */}
          <div className="flex-1 p-6 sm:p-7 pl-7 sm:pl-8">
            <h2 className="text-lg font-semibold mb-5">Create your account</h2>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-xl p-3 mb-4">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm rounded-xl p-3 mb-4">
                Account created! Redirecting to login...
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelBase}>First Name</label>
                  <div className="relative">
                    <FieldIcon>🙂</FieldIcon>
                    <input
                      name="firstName"
                      required
                      value={form.firstName}
                      onChange={handleChange}
                      className={inputBase}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelBase}>Last Name</label>
                  <div className="relative">
                    <FieldIcon>🙂</FieldIcon>
                    <input
                      name="lastName"
                      required
                      value={form.lastName}
                      onChange={handleChange}
                      className={inputBase}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelBase}>Email</label>
                <div className="relative">
                  <FieldIcon>✉️</FieldIcon>
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    className={inputBase}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label className={labelBase}>Phone</label>
                <div className="relative">
                  <FieldIcon>📱</FieldIcon>
                  <input
                    type="tel"
                    inputMode="numeric"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    className={inputBase}
                    placeholder="+639XX XXX XXXX"
                    maxLength={13}
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Example: +639123456789
                </p>
              </div>

              {/* Password */}
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
                    name="password"
                    required
                    value={form.password}
                    onChange={handleChange}
                    className={inputBase}
                  />
                </div>

                {form.password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            i <= strength.score ? strength.color : 'bg-gray-200 dark:bg-white/10'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
                        {strength.hint}
                      </p>
                      <p
                        className={`text-[11px] font-semibold shrink-0 ml-2 ${
                          strength.score === 4
                            ? 'text-green-500'
                            : strength.score === 3
                            ? 'text-blue-500'
                            : strength.score === 2
                            ? 'text-yellow-500'
                            : 'text-red-500'
                        }`}
                      >
                        {strength.label}
                      </p>
                    </div>
                  </div>
                )}

                {!form.password && (
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    8+ chars, uppercase, lowercase, number, special character
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelBase + ' mb-0'}>Confirm Password</label>
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    className="text-[11px] font-semibold text-primary-600 dark:text-primary-500 hover:underline"
                  >
                    {showConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>

                <div className="relative">
                  <FieldIcon>🔒</FieldIcon>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    name="confirmPassword"
                    required
                    value={form.confirmPassword}
                    onChange={handleChange}
                    className={`${inputBase} ${
                      passwordsMatch
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                        : passwordsMismatch
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
                        : ''
                    }`}
                  />
                </div>

                {passwordsMatch && (
                  <p className="mt-1 text-[11px] text-green-500 font-medium">✓ Passwords match</p>
                )}

                {passwordsMismatch && (
                  <p className="mt-1 text-[11px] text-red-400">Passwords do not match</p>
                )}
              </div>

              {/* Terms & DPA Consent */}
              <div className="bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-white/10 rounded-xl p-4 transition-colors">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 accent-primary-500 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    I have read and agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="text-primary-600 dark:text-primary-500 hover:underline"
                    >
                      Terms and Conditions
                    </button>{' '}
                    and consent to the collection and processing of my personal data in accordance with the{' '}
                    <button
                      type="button"
                      onClick={() => setShowDPA(true)}
                      className="text-primary-600 dark:text-primary-500 hover:underline"
                    >
                      Data Privacy Act of 2012 (RA 10173)
                    </button>
                    .
                  </span>
                </label>

                <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-500 dark:border-white/10 dark:bg-dark-800 dark:text-gray-400">
                  <p className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
                    Privacy consent records that will be saved:
                  </p>

                  {consentLoading ? (
                    <p>Loading privacy consent details...</p>
                  ) : (
                    <ul className="list-disc space-y-2 pl-4">
                      <li>
                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                          {accountConsent?.title || 'Account Registration Privacy Consent'}:
                        </span>{' '}
                        {accountConsent?.consent_text}
                      </li>
                      <li>
                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                          {invoiceConsent?.title || 'Invoice and E-Receipt Consent'}:
                        </span>{' '}
                        {invoiceConsent?.consent_text}
                      </li>
                    </ul>
                  )}
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
                {loading ? 'Creating account...' : 'Sign Up'}
              </button>
            </form>

            <p className="text-gray-500 dark:text-gray-400 text-sm text-center mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 dark:text-primary-500 hover:underline font-medium">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowTerms(false)}
        >
          <div
            className="relative bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-500 to-accent-400 rounded-l-2xl" />

            <div className="flex items-center justify-between mb-4 pl-2">
              <h2 className="text-lg font-bold">Terms and Conditions</h2>
              <button
                onClick={() => setShowTerms(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-3 leading-relaxed pl-2">
              <p>
                <strong className="text-gray-900 dark:text-white">1. Acceptance of Terms</strong>
                <br />
                By registering, you agree to be bound by these Terms and Conditions.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">2. Services</strong>
                <br />
                MotoFix provides motorcycle service booking, parts ordering, and AI appearance preview services.
                All bookings are subject to shop availability and confirmation.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">3. Down Payments</strong>
                <br />
                A 15% down payment is required to confirm bookings and parts orders. This is non-refundable if
                cancelled within 24 hours of the appointment.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">4. User Responsibilities</strong>
                <br />
                You are responsible for providing accurate information. Misuse of the platform may result in
                account suspension.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">5. Limitation of Liability</strong>
                <br />
                MotoFix is not liable for delays, damages, or losses arising from service appointments beyond our
                reasonable control.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">6. Changes to Terms</strong>
                <br />
                We reserve the right to update these terms at any time. Continued use of the platform constitutes
                acceptance.
              </p>
            </div>

            <button
              onClick={() => setShowTerms(false)}
              className="mt-5 w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2 rounded-xl shadow-md shadow-primary-500/30 transition text-sm"
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
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowDPA(false)}
        >
          <div
            className="relative bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-500 to-accent-400 rounded-l-2xl" />

            <div className="flex items-center justify-between mb-4 pl-2">
              <h2 className="text-lg font-bold">Data Privacy Consent</h2>
              <button
                onClick={() => setShowDPA(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-3 leading-relaxed pl-2">
              <p>
                <strong className="text-gray-900 dark:text-white">Data Controller</strong>
                <br />
                MotoFix collects and processes your personal data as the data controller under RA 10173
                (Data Privacy Act of 2012).
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">Data Collected</strong>
                <br />
                We collect your name, email address, phone number, and motorcycle details for the purpose of
                service booking, parts ordering, and account management.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">Purpose of Processing</strong>
                <br />
                Your data is used to manage your bookings, process orders, send service reminders, and improve our
                services.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">Data Sharing</strong>
                <br />
                Your information may be shared with assigned mechanics solely for service fulfillment. We do not
                sell your data to third parties.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">Retention</strong>
                <br />
                Personal data is retained for the duration of your account and up to 3 years after account closure
                for legal compliance.
              </p>

              <p>
                <strong className="text-gray-900 dark:text-white">Your Rights</strong>
                <br />
                Under RA 10173, you have the right to access, correct, and request deletion of your personal data.
                Contact us to exercise these rights.
              </p>
            </div>

            <button
              onClick={() => setShowDPA(false)}
              className="mt-5 w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2 rounded-xl shadow-md shadow-primary-500/30 transition text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}