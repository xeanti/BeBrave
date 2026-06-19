import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

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

  useEffect(() => {
    fetchServices();
    // Pre-fill motorcycle info from profile
    if (profile) {
      setForm((f) => ({
        ...f,
        motorcycle_make: profile.moto_make || '',
        motorcycle_model: profile.moto_model || '',
        motorcycle_year: profile.moto_year || '',
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
    const updated = { ...form, [e.target.name]: e.target.value };
    setForm(updated);

    // Auto-calculate estimate when service is selected
    if (e.target.name === 'service_id' && e.target.value) {
      const svc = services.find((s) => s.id === e.target.value);
      if (svc) {
        const laborCost = svc.labor_cost || 0;
        const baseCost = svc.base_price || 0;
        const total = baseCost + laborCost;
        const downPayment = total * 0.15;
        setEstimate({
          service: svc,
          laborCost,
          baseCost,
          total,
          downPayment,
        });
      }
    } else if (e.target.name === 'service_id' && !e.target.value) {
      setEstimate(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!estimate) {
      setError('Please select a service to generate an estimate.');
      return;
    }
    setError('');
    setSaving(true);

    try {
      const { error: insertError } = await supabase
        .from('pre_assessments')
        .insert({
          customer_id: user.id,
          motorcycle_make: form.motorcycle_make,
          motorcycle_model: form.motorcycle_model,
          motorcycle_year: form.motorcycle_year
            ? parseInt(form.motorcycle_year)
            : null,
          issue_description: form.issue_description,
          service_id: form.service_id,
          estimated_labor_cost: estimate.laborCost,
          estimated_parts_cost: 0,
          estimated_total: estimate.total,
          down_payment_required: estimate.downPayment,
          status: 'pending',
        });

      if (insertError) throw insertError;
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
        <div className="bg-dark-800 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2">Assessment Submitted!</h2>
          <p className="text-gray-400 mb-6">
            Your pre-assessment has been submitted. You can now proceed to book
            your service using the estimated cost below.
          </p>

          {estimate && (
            <div className="bg-dark-900 rounded-lg p-4 text-left mb-6 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Service</span>
                <span>{estimate.service.name}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Base Price</span>
                <span>₱{estimate.baseCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Labor Cost</span>
                <span>₱{estimate.laborCost.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold text-white">
                <span>Estimated Total</span>
                <span>₱{estimate.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-accent-400 font-medium">
                <span>Down Payment Required (15%)</span>
                <span>₱{estimate.downPayment.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/booking', {
                state: {
                  service_id: form.service_id,
                  estimated_total: estimate?.total,
                  down_payment: estimate?.downPayment,
                }
              })}
              className="flex-1 bg-primary-600 hover:bg-primary-700 py-2.5 rounded-lg font-semibold transition text-sm"
            >
              Proceed to Booking →
            </button>
            <button
              onClick={() => {
                setSaved(false);
                setEstimate(null);
                setForm({
                  motorcycle_make: profile?.moto_make || '',
                  motorcycle_model: profile?.moto_model || '',
                  motorcycle_year: profile?.moto_year || '',
                  issue_description: '',
                  service_id: '',
                });
              }}
              className="flex-1 border border-gray-700 hover:border-gray-500 py-2.5 rounded-lg text-sm transition"
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
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Motorcycle Info */}
          <div className="bg-dark-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              1. Motorcycle Details
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Make</label>
                <input
                  name="motorcycle_make"
                  value={form.motorcycle_make}
                  onChange={handleChange}
                  placeholder="e.g. Yamaha"
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Model</label>
                <input
                  name="motorcycle_model"
                  value={form.motorcycle_model}
                  onChange={handleChange}
                  placeholder="e.g. Aerox 155"
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Year</label>
                <input
                  name="motorcycle_year"
                  type="number"
                  value={form.motorcycle_year}
                  onChange={handleChange}
                  placeholder="e.g. 2023"
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Issue Description */}
          <div className="bg-dark-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              2. Describe the Issue
            </h2>
            <textarea
              name="issue_description"
              value={form.issue_description}
              onChange={handleChange}
              rows={4}
              placeholder="Describe what's wrong with your motorcycle or what service you need... (e.g. Strange noise when braking, oil leaking from engine, needs full tune-up)"
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          {/* Service Selection */}
          <div className="bg-dark-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
              3. Select Service Type
            </h2>
            <select
              name="service_id"
              value={form.service_id}
              onChange={handleChange}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
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
            <div className="bg-dark-800 rounded-xl p-5 border border-primary-500/20">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
                💡 Cost Estimate
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Service</span>
                  <span className="text-white">{estimate.service.name}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Base Price</span>
                  <span>₱{estimate.baseCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Labor Cost</span>
                  <span>₱{estimate.laborCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Estimated Duration</span>
                  <span>{estimate.service.estimated_duration_minutes} minutes</span>
                </div>
                <div className="border-t border-gray-700 pt-3 mt-1 flex justify-between font-bold text-white text-base">
                  <span>Estimated Total</span>
                  <span>₱{estimate.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-accent-400 font-medium">
                  <span>Required Down Payment (15%)</span>
                  <span>₱{estimate.downPayment.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-4">
                * This is a preliminary estimate only. Final cost may vary depending on
                actual parts used and mechanic assessment during the service.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !form.service_id}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
          >
            {saving ? 'Saving...' : 'Submit Pre-Assessment'}
          </button>
        </form>
      </div>
    </div>
  );
}