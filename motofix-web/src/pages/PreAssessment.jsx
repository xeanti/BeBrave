import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDownPaymentPercent } from '../lib/settings';
import { supabase } from '../lib/supabaseClient';


function sanitizeMotorcycleText(value, max = 60) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9\s.'’\-\/()]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function sanitizeYear(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function sanitizeLongText(value, max = 500) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function isValidMotorcycleYear(value) {
  if (!value) return true;

  const year = Number(value);
  const maxYear = new Date().getFullYear() + 1;

  return Number.isInteger(year) && year >= 1950 && year <= maxYear;
}

function sanitizePreAssessmentForm(form) {
  return {
    motorcycle_make: sanitizeMotorcycleText(form.motorcycle_make).trim(),
    motorcycle_model: sanitizeMotorcycleText(form.motorcycle_model).trim(),
    motorcycle_year: sanitizeYear(form.motorcycle_year),
    issue_description: sanitizeLongText(form.issue_description, 700).trim(),
    service_id: String(form.service_id || '').trim(),
  };
}

function StepHeader({ number, title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-primary-600/15 border border-primary-500/30 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
        {number}
      </div>
      <h2 className="text-sm font-semibold text-gray-200 tracking-wide">{title}</h2>
    </div>
  );
}

export default function PreAssessment() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [form, setForm] = useState({
    motorcycle_make: '',
    motorcycle_model: '',
    motorcycle_year: '',
    issue_description: '',
    service_id: '',
  });
  const [estimate, setEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [downPaymentRate, setDownPaymentRate] = useState(0.15);

  useEffect(() => {
    fetchServices();

    getDownPaymentPercent()
      .then(setDownPaymentRate)
      .catch(() => setDownPaymentRate(0.15));

    if (profile) {
      setForm((f) => ({
        ...f,
        motorcycle_make: sanitizeMotorcycleText(profile.moto_make || ''),
        motorcycle_model: sanitizeMotorcycleText(profile.moto_model || ''),
        motorcycle_year: sanitizeYear(profile.moto_year || ''),
      }));
    }
  }, [profile]);

  async function fetchServices() {
    const { data } = await supabase
      .from('services')
      .select('id, name, base_price, labor_cost, estimated_duration_minutes')
      .eq('is_active', true);
    if (data) setServices(data);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    let safeValue = value;

    if (name === 'motorcycle_make' || name === 'motorcycle_model') {
      safeValue = sanitizeMotorcycleText(value);
    } else if (name === 'motorcycle_year') {
      safeValue = sanitizeYear(value);
    } else if (name === 'issue_description') {
      safeValue = sanitizeLongText(value, 700);
    }

    const updated = { ...form, [name]: safeValue };
    setForm(updated);

    if (name === 'service_id' && safeValue) {
      const svc = services.find((s) => s.id === safeValue);
      if (svc) {
        const laborCost = Number(svc.labor_cost) || 0;
        const baseCost = Number(svc.base_price) || 0;
        const total = baseCost + laborCost;

        setEstimate({
          service: svc,
          laborCost,
          baseCost,
          total,
        });
      }
    } else if (name === 'service_id' && !safeValue) {
      setEstimate(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const safeForm = sanitizePreAssessmentForm(form);

    if (!estimate) {
      setError('Please select a service to generate an estimate.');
      return;
    }

    if (!isValidMotorcycleYear(safeForm.motorcycle_year)) {
      setError(`Motorcycle year must be between 1950 and ${new Date().getFullYear() + 1}.`);
      return;
    }

    setError('');
    setSaving(true);

    try {
      const { error: insertError } = await supabase
        .from('pre_assessments')
        .insert({
          customer_id: user.id,
          motorcycle_make: safeForm.motorcycle_make || null,
          motorcycle_model: safeForm.motorcycle_model || null,
          motorcycle_year: safeForm.motorcycle_year
            ? parseInt(safeForm.motorcycle_year, 10)
            : null,
          issue_description: safeForm.issue_description || null,
          service_id: safeForm.service_id,
          estimated_labor_cost: estimate.laborCost,
          estimated_parts_cost: 0,
          estimated_total: estimate.total,
          down_payment_required: estimate.total * downPaymentRate,
          status: 'pending',
        });

      if (insertError) throw insertError;

      setForm(safeForm);
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Failed to save assessment.');
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white flex items-center justify-center px-6">
        <div className="bg-dark-800 border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Assessment Submitted!</h2>
          <p className="text-gray-400 mb-6 text-sm leading-relaxed">
            Your pre-assessment has been submitted. You can now proceed to book
            your service using the estimated cost below.
          </p>

          {estimate && (
            <div className="bg-dark-900 border border-gray-800 rounded-xl p-4 text-left mb-6 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Service</span>
                <span className="text-gray-300">{estimate.service.name}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Base Price</span>
                <span className="text-gray-300">₱{estimate.baseCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Labor Cost</span>
                <span className="text-gray-300">₱{estimate.laborCost.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-700 pt-2.5 flex justify-between font-semibold text-white">
                <span>Estimated Total</span>
                <span>₱{estimate.total.toFixed(2)}</span>
              </div>
<div className="flex justify-between text-accent-400 font-medium">
  <span>
    Down Payment Required ({Math.round(downPaymentRate * 100)}%)
  </span>
  <span>
    ₱{(estimate.total * downPaymentRate).toFixed(2)}
  </span>
</div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/booking', {
                state: {
                  service_id: form.service_id,
                  estimated_total: estimate?.total,
                  down_payment: estimate ? estimate.total * downPaymentRate : 0,
                }
              })}
              className="flex-1 bg-primary-600 hover:bg-primary-700 py-2.5 rounded-lg font-semibold transition text-sm shadow-lg shadow-primary-600/10"
            >
              Proceed to Booking →
            </button>
            <button
              onClick={() => {
                setSaved(false);
                setEstimate(null);
                setForm({
                  motorcycle_make: sanitizeMotorcycleText(profile?.moto_make || ''),
                  motorcycle_model: sanitizeMotorcycleText(profile?.moto_model || ''),
                  motorcycle_year: sanitizeYear(profile?.moto_year || ''),
                  issue_description: '',
                  service_id: '',
                });
              }}
              className="flex-1 border border-gray-700 hover:border-gray-500 py-2.5 rounded-lg text-sm transition text-gray-300"
            >
              New Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Pre-Assessment</h1>
          <p className="text-gray-400">
            Get an estimated cost for your service before booking your appointment.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-4 mb-6">
            <span className="flex-shrink-0">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Motorcycle Info */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <StepHeader number={1} title="Motorcycle Details" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Make</label>
                <input
                  name="motorcycle_make"
                  value={form.motorcycle_make}
                  onChange={handleChange}
                  placeholder="e.g. Yamaha"
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition placeholder:text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Model</label>
                <input
                  name="motorcycle_model"
                  value={form.motorcycle_model}
                  onChange={handleChange}
                  placeholder="e.g. Aerox 155"
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition placeholder:text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Year</label>
                <input
                  name="motorcycle_year"
                  type="number"
                  value={form.motorcycle_year}
                  onChange={handleChange}
                  placeholder="e.g. 2023"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition placeholder:text-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Issue Description */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <StepHeader number={2} title="Describe the Issue" />
            <textarea
              name="issue_description"
              value={form.issue_description}
              onChange={handleChange}
              rows={4}
              maxLength={700}
              placeholder="Describe what's wrong with your motorcycle or what service you need... (e.g. Strange noise when braking, oil leaking from engine, needs full tune-up)"
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition resize-none placeholder:text-gray-600"
            />
          </div>

          {/* Service Selection */}
          <div className="bg-dark-800 border border-gray-800 rounded-xl p-5 transition-colors hover:border-gray-700">
            <StepHeader number={3} title="Select Service Type" />
            <select
              name="service_id"
              value={form.service_id}
              onChange={handleChange}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition"
            >
              <option value="">Choose a service...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — ₱{s.base_price}
                </option>
              ))}
            </select>
          </div>

          {/* Live Estimate */}
          {estimate && (
            <div className="bg-dark-800 rounded-xl p-5 border border-primary-500/25 ring-1 ring-primary-500/10">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-base">💡</span>
                <h2 className="text-sm font-semibold text-gray-200 tracking-wide">Cost Estimate</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Service</span>
                  <span className="text-white">{estimate.service.name}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Base Price</span>
                  <span className="text-gray-300">₱{estimate.baseCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Labor Cost</span>
                  <span className="text-gray-300">₱{estimate.laborCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Duration</span>
                  <span className="text-gray-300">{estimate.service.estimated_duration_minutes} minutes</span>
                </div>
                <div className="border-t border-gray-700 pt-3 mt-1 flex justify-between font-bold text-white text-base">
                  <span>Estimated Total</span>
                  <span>₱{estimate.total.toFixed(2)}</span>
                </div>
<div className="flex justify-between text-accent-400 font-semibold">
  <span>
    Required Down Payment ({Math.round(downPaymentRate * 100)}%)
  </span>
  <span>
    ₱{(estimate.total * downPaymentRate).toFixed(2)}
  </span>
</div>
              </div>

              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                * This is a preliminary estimate only. Final cost may vary depending on
                actual parts used and mechanic assessment during the service.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !form.service_id}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg transition-all shadow-lg shadow-primary-600/10 hover:shadow-primary-600/20"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              'Submit Pre-Assessment'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}