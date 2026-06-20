import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const EMPTY_FORM = {
  name: '', category: '', price: '', stock_quantity: '',
  reorder_threshold: '5', compatible_models: '', image_url: '',
};

const STOCK_BADGE_STYLES = {
  ok: 'bg-green-500/20 text-green-400',
  low: 'bg-yellow-500/20 text-yellow-400',
  out: 'bg-red-500/20 text-red-400',
};

export default function AdminParts() {
  const { user } = useAuth();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // all | low | out
  const [sortBy, setSortBy] = useState('name'); // name | price_asc | price_desc | stock_asc | stock_desc

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [stockEdits, setStockEdits] = useState({}); // id -> pending qty string

  useEffect(() => { fetchParts(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function fetchParts() {
    const { data } = await supabase.from('parts').select('*').order('name');
    if (data) setParts(data);
    setLoading(false);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function openAddPanel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setPanelOpen(true);
  }

  function openEditPanel(part) {
    setEditingId(part.id);
    setForm({
      name: part.name || '',
      category: part.category || '',
      price: String(part.price ?? ''),
      stock_quantity: String(part.stock_quantity ?? ''),
      reorder_threshold: String(part.reorder_threshold ?? '5'),
      compatible_models: (part.compatible_models || []).join(', '),
      image_url: part.image_url || '',
    });
    setFormError('');
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const compatibleArray = form.compatible_models
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      name: form.name,
      category: form.category,
      price: parseFloat(form.price),
      stock_quantity: parseInt(form.stock_quantity, 10),
      reorder_threshold: parseInt(form.reorder_threshold || '5', 10),
      compatible_models: compatibleArray,
      image_url: form.image_url || null,
    };

    if (editingId) {
      const { error } = await supabase.from('parts').update(payload).eq('id', editingId);
      if (error) {
        setFormError(error.message);
      } else {
        await supabase.from('audit_logs').insert({
          action: 'UPDATE_PART',
          entity: 'parts',
          entity_id: editingId,
          performed_by: user.id,
          details: payload,
        });
        setToast(`✓ ${form.name} updated`);
        closePanel();
        fetchParts();
      }
    } else {
      const { data, error } = await supabase.from('parts').insert(payload).select().single();
      if (error) {
        setFormError(error.message);
      } else {
        await supabase.from('audit_logs').insert({
          action: 'CREATE_PART',
          entity: 'parts',
          entity_id: data.id,
          performed_by: user.id,
          details: { name: form.name, price: payload.price, stock_quantity: payload.stock_quantity },
        });
        setToast(`✓ ${form.name} added to inventory`);
        closePanel();
        fetchParts();
      }
    }
    setSaving(false);
  }

  async function deletePart(part) {
    if (!confirm(`Delete "${part.name}"? This cannot be undone.`)) return;
    setDeletingId(part.id);
    await supabase.from('parts').delete().eq('id', part.id);
    await supabase.from('audit_logs').insert({
      action: 'DELETE_PART',
      entity: 'parts',
      entity_id: part.id,
      performed_by: user.id,
      details: { name: part.name },
    });
    setDeletingId(null);
    setToast(`Deleted ${part.name}`);
    fetchParts();
  }

  async function updateStock(id, qty) {
    if (Number.isNaN(qty) || qty < 0) return;
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, stock_quantity: qty } : p)));
    await supabase.from('parts').update({ stock_quantity: qty }).eq('id', id);
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_PART_STOCK',
      entity: 'parts',
      entity_id: id,
      performed_by: user.id,
      details: { new_stock_quantity: qty },
    });
  }

  function adjustStock(part, delta) {
    const next = Math.max(0, (part.stock_quantity || 0) + delta);
    updateStock(part.id, next);
  }

  function commitStockInput(part) {
    const raw = stockEdits[part.id];
    if (raw === undefined) return;
    const qty = parseInt(raw, 10);
    if (!Number.isNaN(qty) && qty >= 0 && qty !== part.stock_quantity) {
      updateStock(part.id, qty);
    }
    setStockEdits((prev) => {
      const next = { ...prev };
      delete next[part.id];
      return next;
    });
  }

  const categories = useMemo(
    () => ['all', ...new Set(parts.map((p) => p.category).filter(Boolean))],
    [parts]
  );

  const stats = useMemo(() => {
    const totalValue = parts.reduce((sum, p) => sum + (p.price || 0) * (p.stock_quantity || 0), 0);
    const lowStock = parts.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.reorder_threshold).length;
    const outOfStock = parts.filter((p) => p.stock_quantity <= 0).length;
    return { totalValue, lowStock, outOfStock, total: parts.length };
  }, [parts]);

  const filteredParts = useMemo(() => {
    let result = parts.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const matchStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && p.stock_quantity > 0 && p.stock_quantity <= p.reorder_threshold) ||
        (stockFilter === 'out' && p.stock_quantity <= 0);
      return matchSearch && matchCategory && matchStock;
    });

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'price_asc': return a.price - b.price;
        case 'price_desc': return b.price - a.price;
        case 'stock_asc': return a.stock_quantity - b.stock_quantity;
        case 'stock_desc': return b.stock_quantity - a.stock_quantity;
        default: return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [parts, search, categoryFilter, stockFilter, sortBy]);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Manage Parts</h1>
            <p className="text-gray-400">Add, edit, and track inventory levels.</p>
          </div>
          <button
            onClick={openAddPanel}
            className="bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-lg font-medium transition text-sm flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Add Part
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Parts" value={stats.total} icon="⚙️" />
          <StatCard label="Low Stock" value={stats.lowStock} icon="⚠️" color="text-yellow-400" />
          <StatCard label="Out of Stock" value={stats.outOfStock} icon="🚫" color="text-red-400" />
          <StatCard
            label="Inventory Value"
            value={`₱${stats.totalValue.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            icon="💰"
            color="text-accent-400"
          />
        </div>

        {/* Filter pills (category) — mirrors AdminOrders status tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
                categoryFilter === c ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {c === 'all' ? 'All Categories' : c}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-dark-800 rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="Search parts by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
          />
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Stock Levels</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="name">Sort: Name (A-Z)</option>
            <option value="price_asc">Sort: Price (Low-High)</option>
            <option value="price_desc">Sort: Price (High-Low)</option>
            <option value="stock_asc">Sort: Stock (Low-High)</option>
            <option value="stock_desc">Sort: Stock (High-Low)</option>
          </select>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {filteredParts.length} of {parts.length} {parts.length === 1 ? 'part' : 'parts'} shown
        </p>

        {/* Parts grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-dark-800 rounded-xl h-56 animate-pulse" />
            ))}
          </div>
        ) : filteredParts.length === 0 ? (
          <div className="bg-dark-800 rounded-xl p-16 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-400 mb-2">
              {parts.length === 0 ? 'No parts in inventory yet.' : 'No parts match your filters.'}
            </p>
            {parts.length === 0 ? (
              <button onClick={openAddPanel} className="text-primary-400 text-sm hover:underline">
                Add your first part →
              </button>
            ) : (
              <button
                onClick={() => { setSearch(''); setCategoryFilter('all'); setStockFilter('all'); }}
                className="text-primary-400 text-sm hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredParts.map((p) => {
              const isOut = p.stock_quantity <= 0;
              const isLow = !isOut && p.stock_quantity <= p.reorder_threshold;
              const stockState = isOut ? 'out' : isLow ? 'low' : 'ok';
              const stockPct = p.reorder_threshold > 0
                ? Math.min(100, (p.stock_quantity / (p.reorder_threshold * 3)) * 100)
                : p.stock_quantity > 0 ? 100 : 0;
              const barColor = isOut ? 'bg-red-500' : isLow ? 'bg-yellow-400' : 'bg-green-500';

              return (
                <div
                  key={p.id}
                  className="bg-dark-800 rounded-xl p-5 flex flex-col gap-4 hover:bg-dark-800/70 transition"
                >
                  {/* Top row — image + name/price + stock badge, echoes AdminOrders' top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-dark-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl opacity-50">⚙️</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate" title={p.name}>{p.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {p.category ? <span className="capitalize">{p.category}</span> : 'Uncategorized'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium whitespace-nowrap ${STOCK_BADGE_STYLES[stockState]}`}>
                      {stockState === 'ok' ? 'In Stock' : stockState === 'low' ? 'Low Stock' : 'Out of Stock'}
                    </span>
                  </div>

                  {/* Compatible models */}
                  {p.compatible_models?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.compatible_models.slice(0, 3).map((m, i) => (
                        <span key={i} className="text-xs bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded-full">
                          {m}
                        </span>
                      ))}
                      {p.compatible_models.length > 3 && (
                        <span className="text-xs text-gray-500 self-center">+{p.compatible_models.length - 3} more</span>
                      )}
                    </div>
                  )}

                  {/* Cost / stock summary grid — mirrors AdminOrders' cost summary grid */}
                  <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Price</p>
                      <p className="font-medium text-accent-400">₱{Number(p.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Reorder At</p>
                      <p className="font-medium">{p.reorder_threshold}</p>
                    </div>
                  </div>

                  {/* Stock control */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-gray-500">Stock Quantity</p>
                      <p className="text-xs text-gray-500">{p.stock_quantity} on hand</p>
                    </div>
                    <div className="w-full bg-dark-700 rounded-full h-1.5 mb-2.5">
                      <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${stockPct}%` }} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => adjustStock(p, -1)}
                        disabled={p.stock_quantity <= 0}
                        className="w-8 h-8 rounded-md bg-dark-900 border border-gray-700 hover:border-primary-500 disabled:opacity-40 flex items-center justify-center text-sm transition"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={stockEdits[p.id] ?? p.stock_quantity}
                        onChange={(e) => setStockEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={() => commitStockInput(p)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } }}
                        className="w-full px-2 py-1.5 rounded-md bg-dark-900 border border-gray-700 text-sm text-center focus:outline-none focus:border-primary-500"
                      />
                      <button
                        onClick={() => adjustStock(p, 1)}
                        className="w-8 h-8 rounded-md bg-dark-900 border border-gray-700 hover:border-primary-500 flex items-center justify-center text-sm transition"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Actions — styled like AdminOrders' status action buttons */}
                  <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-800">
                    <button
                      onClick={() => openEditPanel(p)}
                      className="text-xs px-3 py-1.5 rounded-md transition capitalize bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 mt-3"
                    >
                      ✎ Edit
                    </button>
                    <button
                      onClick={() => deletePart(p)}
                      disabled={deletingId === p.id}
                      className="text-xs px-3 py-1.5 rounded-md transition capitalize bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 mt-3"
                    >
                      {deletingId === p.id ? 'Deleting...' : '🗑 Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] bg-dark-800 border border-primary-500/30 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Add/Edit slide-over panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={closePanel} />
          <div className="relative w-full sm:max-w-md h-full bg-dark-800 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-dark-800 z-10">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Part' : 'Add New Part'}</h2>
              <button onClick={closePanel} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">
                  {formError}
                </div>
              )}

              {/* Image preview */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Image URL</label>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-16 h-16 rounded-lg bg-dark-900 border border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {form.image_url ? (
                      <img src={form.image_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className="text-xl opacity-40">⚙️</span>
                    )}
                  </div>
                  <input
                    name="image_url"
                    value={form.image_url}
                    onChange={handleChange}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Part Name *</label>
                <input name="name" value={form.name} onChange={handleChange} required
                  className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Category</label>
                <input name="category" value={form.category} onChange={handleChange} placeholder="e.g. exhaust, headlight"
                  className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Price (₱) *</label>
                  <input name="price" type="number" step="0.01" min="0" value={form.price} onChange={handleChange} required
                    className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Stock Quantity *</label>
                  <input name="stock_quantity" type="number" min="0" value={form.stock_quantity} onChange={handleChange} required
                    className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Reorder Threshold</label>
                <input name="reorder_threshold" type="number" min="0" value={form.reorder_threshold} onChange={handleChange}
                  className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                <p className="text-xs text-gray-500 mt-1">Parts at or below this stock level are flagged as low stock.</p>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Compatible Models <span className="text-gray-500">(comma-separated)</span>
                </label>
                <input name="compatible_models" value={form.compatible_models} onChange={handleChange}
                  placeholder="Yamaha Aerox 155, Honda Click 125i"
                  className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
              </div>

              <div className="flex gap-3 pt-2 sticky bottom-0 bg-dark-800 pb-2">
                <button
                  type="button"
                  onClick={closePanel}
                  className="flex-1 border border-gray-700 hover:border-gray-500 py-2.5 rounded-lg text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 py-2.5 rounded-lg font-medium transition text-sm"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : '+ Add Part'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color = 'text-white' }) {
  return (
    <div className="bg-dark-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">{icon}</span>
        <span className={`text-xl font-bold ${color}`}>{value}</span>
      </div>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}