import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const SETTING_KEY = 'down_payment_percent';
const PRESET_PERCENTAGES = [10, 15, 20, 25, 30];

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
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>
        {value}
      </p>
    </div>
  );
}

export default function AdminSettings() {
  const { user } = useAuth();

  const [percent, setPercent] = useState('');
  const [originalPercent, setOriginalPercent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchSettings();

    /*
      Realtime refresh for admin settings.
      Enable Realtime in Supabase for the settings table.
    */
    const settingsChannel = supabase
      .channel('admin-settings-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settings',
          filter: `key=eq.${SETTING_KEY}`,
        },
        () => fetchSettings(false)
      )
      .subscribe();

    const handleFocus = () => fetchSettings(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchSettings(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(settingsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function fetchSettings(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('settings')
      .select('value, updated_at')
      .eq('key', SETTING_KEY)
      .maybeSingle();

    if (error) {
      setMessage(error.message || 'Failed to load settings.');
      setMessageType('error');
      setLoading(false);
      return;
    }

    const value = data?.value ?? '15';

    setPercent(String(value));
    setOriginalPercent(String(value));
    setLastUpdated(data?.updated_at ? new Date(data.updated_at) : new Date());
    setLoading(false);
  }

  async function insertAuditLog(newValue) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action: 'UPDATE_SYSTEM_SETTING',
      entity: 'settings',
      entity_id: SETTING_KEY,
      performed_by: user.id,
      details: {
        key: SETTING_KEY,
        old_value: originalPercent,
        new_value: String(newValue),
      },
    });
  }

  function validatePercent(value) {
    const number = parseFloat(value);

    if (Number.isNaN(number)) {
      return 'Enter a valid number.';
    }

    if (number < 0 || number > 100) {
      return 'Enter a valid percentage between 0 and 100.';
    }

    return '';
  }

  async function handleSave(event) {
    event.preventDefault();

    const validationError = validatePercent(percent);

    if (validationError) {
      setMessage(validationError);
      setMessageType('error');
      return;
    }

    const number = parseFloat(percent);
    const normalized = Number(number.toFixed(2));

    setSaving(true);
    setMessage('');
    setMessageType('');

    try {
      const { error } = await supabase
        .from('settings')
        .upsert(
          {
            key: SETTING_KEY,
            value: String(normalized),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'key',
          }
        );

      if (error) throw error;

      await insertAuditLog(normalized);

      setPercent(String(normalized));
      setOriginalPercent(String(normalized));
      setLastUpdated(new Date());
      setMessage('Down payment percentage updated successfully!');
      setMessageType('success');
    } catch (err) {
      setMessage(err.message || 'Failed to save setting.');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setPercent(originalPercent);
    setMessage('');
    setMessageType('');
  }

  const percentNumber = parseFloat(percent);
  const validPercent = !Number.isNaN(percentNumber) && percentNumber >= 0 && percentNumber <= 100;
  const hasChanges = String(percent) !== String(originalPercent);

  const previewRows = useMemo(() => {
    const samples = [500, 1000, 2500, 5000];

    return samples.map((amount) => ({
      amount,
      downPayment: validPercent ? amount * (percentNumber / 100) : 0,
      remaining: validPercent ? amount - amount * (percentNumber / 100) : amount,
    }));
  }, [percentNumber, validPercent]);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                  MotoFix Admin
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Settings
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Configure system-wide business rules used by bookings, parts orders, and pre-assessments.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchSettings(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Current Down Payment"
            value={loading ? '—' : `${originalPercent || 0}%`}
            icon="💰"
            tone="primary"
          />
          <StatCard
            label="Pending Value"
            value={validPercent ? `${percentNumber}%` : 'Invalid'}
            icon="🧾"
            tone={validPercent ? 'accent' : 'yellow'}
          />
          <StatCard
            label="Setting Key"
            value="down_payment_percent"
            icon="⚙️"
          />
        </div>

        {/* Main Settings Card */}
        <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-950 dark:text-white">
                Down Payment Percentage
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                This value controls the required down payment shown across bookings, parts orders, and pre-assessments.
              </p>
            </div>

            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25">
              System-wide
            </span>
          </div>

          {message && (
            <div
              className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${
                messageType === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                  : 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
              }`}
            >
              {message}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              <div className="h-12 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
              <div className="h-10 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Percentage (%)
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={percent}
                      onChange={(event) => {
                        setPercent(event.target.value);
                        setMessage('');
                        setMessageType('');
                      }}
                      required
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm font-black text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-sm font-black text-gray-400">
                      %
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving || !validPercent || !hasChanges}
                      className="rounded-2xl bg-primary-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>

                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={!hasChanges || saving}
                      className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Accepted range: 0% to 100%. Recommended range for your system is usually 10% to 30%.
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Quick Presets
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PERCENTAGES.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setPercent(String(preset));
                        setMessage('');
                        setMessageType('');
                      }}
                      className={`rounded-full px-4 py-2 text-xs font-black transition ${
                        Number(percent) === preset
                          ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}
        </section>

        {/* Preview */}
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="mb-5">
            <h2 className="text-xl font-black text-gray-950 dark:text-white">
              Down Payment Preview
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Example amounts using the current percentage typed above.
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-gray-200 dark:border-dark-700">
            <div className="grid grid-cols-3 bg-gray-50 text-xs font-black uppercase tracking-wider text-gray-500 dark:bg-dark-900/70 dark:text-gray-400">
              <div className="px-4 py-3">Total</div>
              <div className="px-4 py-3">Down Payment</div>
              <div className="px-4 py-3">Remaining</div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-dark-700">
              {previewRows.map((row) => (
                <div
                  key={row.amount}
                  className="grid grid-cols-3 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  <div className="px-4 py-3">{formatPeso(row.amount)}</div>
                  <div className="px-4 py-3 font-black text-primary-600 dark:text-primary-400">
                    {validPercent ? formatPeso(row.downPayment) : 'Invalid'}
                  </div>
                  <div className="px-4 py-3">{validPercent ? formatPeso(row.remaining) : 'Invalid'}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
