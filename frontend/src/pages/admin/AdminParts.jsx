import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

export default function AdminParts() {
  const { user } = useAuth();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '', category: '', price: '', stock_quantity: '',
    reorder_threshold: '5', compatible_models: '', image_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchParts(); }, []);

  async function fetchParts() {
    const { data } = await supabase.from('parts').select('*').order('name');
    if (data) setParts(data);
    setLoading(false);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const compatibleArray = form.compatible_models
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const { data, error } = await supabase.from('parts').insert({
      name: form.name,
      category: form.category,
      price: parseFloat(form.price),
      stock_quantity: parseInt(form.stock_quantity),
      reorder_threshold: parseInt(form.reorder_threshold),
      compatible_models: compatibleArray,
      image_url: form.image_url || null,
    }).select().single();

    if (error) {
      setMessage('Error: ' + error.message);
    } else {
      await supabase.from('audit_logs').insert({
        action: 'CREATE_PART',
        entity: 'parts',
        entity_id: data.id,
        performed_by: user.id,
        details: { name: form.name, price: parseFloat(form.price), stock_quantity: parseInt(form.stock_quantity) },
      });
      setMessage('Part added successfully!');
      setForm({ name: '', category: '', price: '', stock_quantity: '', reorder_threshold: '5', compatible_models: '', image_url: '' });
      fetchParts();
    }
    setSaving(false);
  }

  async function deletePart(id) {
    if (!confirm('Delete this part?')) return;
    await supabase.from('parts').delete().eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'DELETE_PART',
      entity: 'parts',
      entity_id: id,
      performed_by: user.id,
      details: {},
    });
    fetchParts();
  }

  async function updateStock(id, qty) {
    await supabase.from('parts').update({ stock_quantity: qty }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_PART_STOCK',
      entity: 'parts',
      entity_id: id,
      performed_by: user.id,
      details: { new_stock_quantity: qty },
    });
    fetchParts();
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Manage Parts</h1>
        <p className="text-gray-400 mb-8">Add, edit, and manage inventory.</p>

        {/* Add part form */}
        <div className="bg-dark-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Add New Part</h2>
          {message && (
            <div className={`text-sm rounded-lg p-3 mb-4 ${message.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
              {message}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Part Name *</label>
              <input name="name" value={form.name} onChange={handleChange} required
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Category</label>
              <input name="category" value={form.category} onChange={handleChange} placeholder="e.g. exhaust, headlight"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Price (₱) *</label>
              <input name="price" type="number" value={form.price} onChange={handleChange} required
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Stock Quantity *</label>
              <input name="stock_quantity" type="number" value={form.stock_quantity} onChange={handleChange} required
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Reorder Threshold</label>
              <input name="reorder_threshold" type="number" value={form.reorder_threshold} onChange={handleChange}
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Image URL</label>
              <input name="image_url" value={form.image_url} onChange={handleChange} placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-1">
                Compatible Models <span className="text-gray-500">(comma-separated, e.g. Yamaha Aerox 155, Honda Click 125i)</span>
              </label>
              <input name="compatible_models" value={form.compatible_models} onChange={handleChange}
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2 rounded-lg font-medium transition">
                {saving ? 'Adding...' : '+ Add Part'}
              </button>
            </div>
          </form>
        </div>

        {/* Parts list */}
        <div className="bg-dark-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Parts Inventory ({parts.length})</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : (
            <div className="space-y-2">
              {parts.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-dark-900 rounded-lg p-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    {p.image_url && (
                      <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{p.category} · ₱{p.price}</p>
                      {p.stock_quantity <= p.reorder_threshold && (
                        <p className="text-xs text-red-400 mt-0.5">⚠ Low stock</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Stock:</span>
                      <input
                        type="number"
                        value={p.stock_quantity}
                        onChange={(e) => updateStock(p.id, parseInt(e.target.value))}
                        className="w-16 px-2 py-1 rounded bg-dark-800 border border-gray-700 text-sm text-center"
                      />
                    </div>
                    <button
                      onClick={() => deletePart(p.id)}
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