import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function AdminSettings() {
  const [percent, setPercent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'down_payment_percent')
      .single()
      .then(({ data }) => {
        if (data) setPercent(data.value);
        setLoading(false);
      });
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    const num = parseFloat(percent);
    if (isNaN(num) || num < 0 || num > 100) {
      setMessage('Error: Enter a valid percentage between 0 and 100.');
      return;
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase
      .from('settings')
      .update({ value: String(num), updated_at: new Date().toISOString() })
      .eq('key', 'down_payment_percent');
    setMessage(error ? 'Error: ' + error.message : '✅ Down payment percentage updated!');
    setSaving(false);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-gray-400 mb-8">Configure system-wide settings.</p>

        <div className="bg-dark-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-1">Down Payment Percentage</h2>
          <p className="text-sm text-gray-400 mb-5">
            This applies to all bookings, parts orders, and pre-assessments.
          </p>

          {message && (
            <div className={`text-sm rounded-lg p-3 mb-4 ${
              message.startsWith('Error')
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'bg-green-500/10 text-green-400 border border-green-500/30'
            }`}>
              {message}
            </div>
          )}

          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : (
            <form onSubmit={handleSave} className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-300 mb-1">Percentage (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-semibold transition"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}