import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const SETTINGS = {
  down_payment_percent: {
    label: 'Down Payment Percentage',
    description:
      'Required down payment shown across bookings, parts orders, and pre-assessments.',
    suffix: '%',
    min: 0,
    max: 100,
    step: 0.1,
    defaultValue: '15',
  },
  cancellation_window_hours: {
    label: 'Cancellation Window',
    description:
      'Number of hours before the appointment when customers are still allowed to cancel.',
    suffix: 'hours',
    min: 0,
    max: 720,
    step: 1,
    defaultValue: '24',
  },
  reschedule_window_hours: {
    label: 'Reschedule Window',
    description:
      'Number of hours before the appointment when customers are still allowed to reschedule.',
    suffix: 'hours',
    min: 0,
    max: 720,
    step: 1,
    defaultValue: '12',
  },
  max_reschedules: {
    label: 'Maximum Reschedules',
    description: 'Maximum number of times a customer can reschedule one booking.',
    suffix: 'times',
    min: 0,
    max: 10,
    step: 1,
    defaultValue: '1',
  },
  no_show_penalty_amount: {
    label: 'No-show Penalty',
    description:
      'Penalty amount applied when admin marks a customer booking as no-show.',
    suffix: 'PHP',
    min: 0,
    max: 100000,
    step: 1,
    defaultValue: '100',
  },
  refund_percent_before_window: {
    label: 'Refund Before Cancellation Window',
    description:
      'Refund percentage if the customer cancels before the allowed cancellation window ends.',
    suffix: '%',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: '100',
  },
  refund_percent_after_window: {
    label: 'Refund After Cancellation Window',
    description:
      'Refund percentage if the customer cancels too late or outside the allowed window.',
    suffix: '%',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: '0',
  },
};

const SETTING_KEYS = Object.keys(SETTINGS);
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
    red: 'text-red-600 dark:text-red-300',
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

function SettingInput({ settingKey, value, onChange }) {
  const config = SETTINGS[settingKey];

  return (
    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5 dark:border-dark-700 dark:bg-dark-900/60">
      <div className="mb-3">
        <label className="block text-sm font-black text-gray-950 dark:text-white">
          {config.label}
        </label>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {config.description}
        </p>
      </div>

      <div className="relative">
        <input
          type="number"
          min={config.min}
          max={config.max}
          step={config.step}
          value={value}
          onChange={(event) => onChange(settingKey, event.target.value)}
          required
          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 pr-20 text-sm font-black text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
        />

        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-black uppercase text-gray-400">
          {config.suffix}
        </span>
      </div>

      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
        Allowed range: {config.min} to {config.max}
      </p>
    </div>
  );
}

function createDefaultValues() {
  return SETTING_KEYS.reduce((values, key) => {
    values[key] = SETTINGS[key].defaultValue;
    return values;
  }, {});
}

export default function AdminSettings() {
  const { user } = useAuth();

  const [values, setValues] = useState(createDefaultValues);
  const [originalValues, setOriginalValues] = useState(createDefaultValues);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchSettings();

    const settingsChannel = supabase
      .channel('admin-settings-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settings',
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
      .select('key, value, updated_at')
      .in('key', SETTING_KEYS);

    if (error) {
      setMessage(error.message || 'Failed to load settings.');
      setMessageType('error');
      setLoading(false);
      return;
    }

    const nextValues = createDefaultValues();
    let latestUpdatedAt = null;

    (data || []).forEach((item) => {
      if (SETTING_KEYS.includes(item.key)) {
        nextValues[item.key] = String(item.value ?? SETTINGS[item.key].defaultValue);
      }

      if (item.updated_at) {
        const updatedDate = new Date(item.updated_at);

        if (!latestUpdatedAt || updatedDate > latestUpdatedAt) {
          latestUpdatedAt = updatedDate;
        }
      }
    });

    setValues(nextValues);
    setOriginalValues(nextValues);
    setLastUpdated(latestUpdatedAt || new Date());
    setLoading(false);
  }

  function handleValueChange(settingKey, value) {
    setValues((current) => ({
      ...current,
      [settingKey]: value,
    }));

    setMessage('');
    setMessageType('');
  }

  function validateSettings() {
    for (const key of SETTING_KEYS) {
      const config = SETTINGS[key];
      const number = Number(values[key]);

      if (Number.isNaN(number)) {
        return `${config.label}: enter a valid number.`;
      }

      if (number < config.min || number > config.max) {
        return `${config.label}: value must be between ${config.min} and ${config.max}.`;
      }

      if (key === 'max_reschedules' && !Number.isInteger(number)) {
        return 'Maximum Reschedules must be a whole number.';
      }
    }

    return '';
  }

  async function insertAuditLogs(changedRows) {
    if (!user?.id || changedRows.length === 0) return;

    const logs = changedRows.map((row) => ({
      action: 'UPDATE_SYSTEM_SETTING',
      entity: 'settings',
      entity_id: row.key,
      performed_by: user.id,
      details: {
        key: row.key,
        old_value: originalValues[row.key],
        new_value: row.value,
      },
    }));

    await supabase.from('audit_logs').insert(logs);
  }

  async function handleSave(event) {
    event.preventDefault();

    const validationError = validateSettings();

    if (validationError) {
      setMessage(validationError);
      setMessageType('error');
      return;
    }

    const now = new Date().toISOString();

    const rows = SETTING_KEYS.map((key) => ({
      key,
      value: String(Number(values[key])),
      updated_at: now,
    }));

    const changedRows = rows.filter(
      (row) => String(row.value) !== String(originalValues[row.key])
    );

    if (changedRows.length === 0) {
      setMessage('No changes to save.');
      setMessageType('success');
      return;
    }

    setSaving(true);
    setMessage('');
    setMessageType('');

    try {
      const { error } = await supabase.from('settings').upsert(rows, {
        onConflict: 'key',
      });

      if (error) throw error;

      await insertAuditLogs(changedRows);

      const savedValues = rows.reduce((result, row) => {
        result[row.key] = row.value;
        return result;
      }, {});

      setValues(savedValues);
      setOriginalValues(savedValues);
      setLastUpdated(new Date());
      setMessage('Settings updated successfully!');
      setMessageType('success');
    } catch (err) {
      setMessage(err.message || 'Failed to save settings.');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setValues(originalValues);
    setMessage('');
    setMessageType('');
  }

  const downPaymentPercent = Number(values.down_payment_percent);
  const validPercent =
    !Number.isNaN(downPaymentPercent) &&
    downPaymentPercent >= 0 &&
    downPaymentPercent <= 100;

  const hasChanges = SETTING_KEYS.some(
    (key) => String(values[key]) !== String(originalValues[key])
  );

  const previewRows = useMemo(() => {
    const samples = [500, 1000, 2500, 5000];

    return samples.map((amount) => ({
      amount,
      downPayment: validPercent ? amount * (downPaymentPercent / 100) : 0,
      remaining: validPercent
        ? amount - amount * (downPaymentPercent / 100)
        : amount,
    }));
  }, [downPaymentPercent, validPercent]);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
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
                  Configure system-wide business rules used by bookings, payments,
                  refunds, and service policies.
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
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Down Payment"
            value={loading ? '—' : `${values.down_payment_percent || 0}%`}
            icon="💰"
            tone="primary"
          />
          <StatCard
            label="Cancel Window"
            value={loading ? '—' : `${values.cancellation_window_hours}h`}
            icon="🚫"
            tone="yellow"
          />
          <StatCard
            label="Max Reschedules"
            value={loading ? '—' : values.max_reschedules}
            icon="📅"
            tone="accent"
          />
          <StatCard
            label="No-show Penalty"
            value={loading ? '—' : formatPeso(values.no_show_penalty_amount)}
            icon="⚠️"
            tone="red"
          />
        </div>

        {message && (
          <div
            className={`mb-6 rounded-2xl border p-4 text-sm font-semibold ${
              messageType === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                : 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'
            }`}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-64 animate-pulse rounded-3xl bg-white dark:bg-dark-800" />
            <div className="h-64 animate-pulse rounded-3xl bg-white dark:bg-dark-800" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Down Payment */}
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-gray-950 dark:text-white">
                    Down Payment Percentage
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                    This value controls the required down payment shown across
                    bookings, parts orders, and pre-assessments.
                  </p>
                </div>

                <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25">
                  System-wide
                </span>
              </div>

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
                      value={values.down_payment_percent}
                      onChange={(event) =>
                        handleValueChange('down_payment_percent', event.target.value)
                      }
                      required
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm font-black text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    />

                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-sm font-black text-gray-400">
                      %
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Accepted range: 0% to 100%. Recommended range is usually 10% to
                  30%.
                </p>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Quick Presets
                </p>

                <div className="flex flex-wrap gap-2">
                  {PRESET_PERCENTAGES.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        handleValueChange('down_payment_percent', String(preset))
                      }
                      className={`rounded-full px-4 py-2 text-xs font-black transition ${
                        Number(values.down_payment_percent) === preset
                          ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Booking Policy Settings */}
            <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-gray-950 dark:text-white">
                    Booking Policy Settings
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                    Configure cancellation, rescheduling, refund, and no-show
                    rules used by customer appointments and admin booking
                    management.
                  </p>
                </div>

                <span className="rounded-full bg-accent-50 px-3 py-1 text-xs font-black text-accent-700 ring-1 ring-accent-100 dark:bg-accent-500/10 dark:text-accent-400 dark:ring-accent-500/25">
                  Policy Rules
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SettingInput
                  settingKey="cancellation_window_hours"
                  value={values.cancellation_window_hours}
                  onChange={handleValueChange}
                />

                <SettingInput
                  settingKey="reschedule_window_hours"
                  value={values.reschedule_window_hours}
                  onChange={handleValueChange}
                />

                <SettingInput
                  settingKey="max_reschedules"
                  value={values.max_reschedules}
                  onChange={handleValueChange}
                />

                <SettingInput
                  settingKey="no_show_penalty_amount"
                  value={values.no_show_penalty_amount}
                  onChange={handleValueChange}
                />

                <SettingInput
                  settingKey="refund_percent_before_window"
                  value={values.refund_percent_before_window}
                  onChange={handleValueChange}
                />

                <SettingInput
                  settingKey="refund_percent_after_window"
                  value={values.refund_percent_after_window}
                  onChange={handleValueChange}
                />
              </div>
            </section>

            {/* Save Buttons */}
            <div className="sticky bottom-4 z-10 rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-lg backdrop-blur dark:border-dark-700 dark:bg-dark-800/90">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  {hasChanges
                    ? 'You have unsaved changes.'
                    : 'All settings are currently saved.'}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!hasChanges || saving}
                    className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
                  >
                    Reset
                  </button>

                  <button
                    type="submit"
                    disabled={saving || !hasChanges}
                    className="rounded-2xl bg-primary-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Preview */}
        {!loading && (
          <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-dark-700 dark:bg-dark-800">
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
                    <div className="px-4 py-3">
                      {validPercent ? formatPeso(row.remaining) : 'Invalid'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}