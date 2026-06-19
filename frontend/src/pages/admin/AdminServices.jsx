import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

export default function AdminServices() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '', description: '', base_price: '',
    labor_cost: '', estimated_duration_minutes: '60',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchServices(); }, []);

  async function fetchServices() {
    const { data } = await supabase.from('services').select('*').order('name');
    if (data) setServices(data);
    setLoading(false);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.from('services').insert({
      name: form.name,
      description: form.description,
      base_price: parseFloat(form.base_price),
      labor_cost: parseFloat(form.labor_cost || 0),
      estimated_duration_minutes: parseInt(form.estimated_duration_minutes),
      is_active: true,
    }).select().single();

    if (error) {
      setMessage('Error: ' + error.message);
    } else {
      await supabase.from('audit_logs').insert({
        action: 'CREATE_SERVICE',
        entity: 'services',
        entity_id: data.id,
        performed_by: user.id,
        details: { name: form.name, base_price: parseFloat(form.base_price) },
      });
      setMessage('Service added!');
      setForm({ name: '', description: '', base_price: '', labor_cost: '', estimated_duration_minutes: '60' });
      fetchServices();
    }
    setSaving(false);
  }

  async function toggleActive(id, current) {
    await supabase.from('services').update({ is_active: !current }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'TOGGLE_SERVICE_ACTIVE',
      entity: 'services',
      entity_id: id,
      performed_by: user.id,
      details: { is_active: !current },
    });
    fetchServices();
  }

  async function deleteService(id) {
    if (!confirm('Delete this service?')) return;
    await supabase.from('services').delete().eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'DELETE_SERVICE',
      entity: 'services',
      entity_id: id,
      performed_by: user.id,
      details: {},
    });
    fetchServices();
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Manage Services</h1>
        <p className="text-gray-400 mb-8">Add and manage the services offered by your shop.</p>

        {/* Add service form */}
        <div className="bg-dark-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Add New Service</h2>
          {message && (
            <div className={`text-sm rounded-lg p-3 mb-4 ${message.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
              {message}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Service Name *</label>
              <input name="name" value={form.name} onChange={handleChange} required
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Duration (minutes)</label>
              <input name="estimated_duration_minutes" type="number" value={form.estimated_duration_minutes} onChange={handleChange}
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Base Price (₱) *</label>
              <input name="base_price" type="number" value={form.base_price} onChange={handleChange} required
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Labor Cost (₱)</label>
              <input name="labor_cost" type="number" value={form.labor_cost} onChange={handleChange}
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-1">Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500 resize-none" />
            </div>
            <div>
              <button type="submit" disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2 rounded-lg font-medium transition">
                {saving ? 'Adding...' : '+ Add Service'}
              </button>
            </div>
          </form>
        </div>

        {/* Services list */}
        <div className="bg-dark-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">All Services ({services.length})</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : (
            <div className="space-y-2">
              {services.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-dark-900 rounded-lg p-4 flex-wrap gap-3">
                  <div>
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ₱{s.base_price} base · ₱{s.labor_cost || 0} labor · {s.estimated_duration_minutes} mins
                    </p>
                    {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(s.id, s.is_active)}
                      className={`text-xs px-3 py-1.5 rounded-md border transition ${
                        s.is_active
                          ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                          : 'border-gray-600 text-gray-500 hover:bg-gray-800'
                      }`}
                    >
                      {s.is_active ? '✓ Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => deleteService(s.id)}
                      className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-md transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}