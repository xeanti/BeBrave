import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const EMPTY_SERVICE_FORM = {
  name: '', description: '', base_price: '',
  labor_cost: '', estimated_duration_minutes: '60',
};

const EMPTY_MODEL_FORM = {
  make: '', model: '', year_range: '', reference_photo_url: '',
};

export default function AdminServices() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('services');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Services state ──
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

  // ── Motorcycle models state ──
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);

  // ── Slide-over panel state (shared shape, different payloads) ──
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE_FORM);
  const [modelForm, setModelForm] = useState(EMPTY_MODEL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');

  // ── Fetch Methods ──
  const fetchServices = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('services').select('*').order('name');
      if (error) throw error;
      if (data) setServices(data);
    } catch (err) {
      console.error("Error fetching services:", err.message);
    } finally {
      setLoadingServices(false);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('motorcycle_models').select('*').order('make', { ascending: true });
      if (error) throw error;
      if (data) setModels(data);
    } catch (err) {
      console.error("Error fetching models:", err.message);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    fetchModels();
  }, [fetchServices, fetchModels]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchQuery('');
  };

  // ── Computed Filtered UI States ──
  const filteredServices = services.filter((s) => {
    const query = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(query) ||
      (s.description && s.description.toLowerCase().includes(query))
    );
  });

  const filteredModels = models.filter((m) => {
    const query = searchQuery.toLowerCase();
    return (
      m.make.toLowerCase().includes(query) ||
      m.model.toLowerCase().includes(query) ||
      (m.year_range && m.year_range.toLowerCase().includes(query))
    );
  });

  // ── Panel open/close ──
  function openAddPanel() {
    setEditingId(null);
    setFormError('');
    if (activeTab === 'services') setServiceForm(EMPTY_SERVICE_FORM);
    else setModelForm(EMPTY_MODEL_FORM);
    setPanelOpen(true);
  }

  function openEditPanel(item) {
    setEditingId(item.id);
    setFormError('');
    if (activeTab === 'services') {
      setServiceForm({
        name: item.name || '',
        description: item.description || '',
        base_price: String(item.base_price ?? ''),
        labor_cost: String(item.labor_cost ?? '0'),
        estimated_duration_minutes: String(item.estimated_duration_minutes ?? '60'),
      });
    } else {
      setModelForm({
        make: item.make || '',
        model: item.model || '',
        year_range: item.year_range || '',
        reference_photo_url: item.reference_photo_url || '',
      });
    }
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingId(null);
    setFormError('');
    setServiceForm(EMPTY_SERVICE_FORM);
    setModelForm(EMPTY_MODEL_FORM);
  }

  function handleServiceChange(e) {
    setServiceForm({ ...serviceForm, [e.target.name]: e.target.value });
  }

  function handleModelChange(e) {
    setModelForm({ ...modelForm, [e.target.name]: e.target.value });
  }

  // ── Submit (handles both add + edit, branches on activeTab) ──
  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    if (activeTab === 'services') {
      const payload = {
        name: serviceForm.name.trim(),
        description: serviceForm.description.trim() || null,
        base_price: parseFloat(serviceForm.base_price) || 0,
        labor_cost: parseFloat(serviceForm.labor_cost || 0),
        estimated_duration_minutes: parseInt(serviceForm.estimated_duration_minutes) || 60,
      };

      if (editingId) {
        const { error } = await supabase.from('services').update(payload).eq('id', editingId);
        if (error) {
          setFormError(error.message);
        } else {
          await supabase.from('audit_logs').insert({
            action: 'UPDATE_SERVICE', entity: 'services', entity_id: editingId,
            performed_by: user?.id, details: payload,
          });
          setToast(`✓ ${payload.name} updated`);
          closePanel();
          fetchServices();
        }
      } else {
        const { data, error } = await supabase.from('services')
          .insert({ ...payload, is_active: true }).select().single();
        if (error) {
          setFormError(error.message);
        } else {
          await supabase.from('audit_logs').insert({
            action: 'CREATE_SERVICE', entity: 'services', entity_id: data.id,
            performed_by: user?.id, details: { name: payload.name, base_price: payload.base_price },
          });
          setToast(`✓ ${payload.name} added`);
          closePanel();
          fetchServices();
        }
      }
    } else {
      const payload = {
        make: modelForm.make.trim(),
        model: modelForm.model.trim(),
        year_range: modelForm.year_range.trim() || null,
        reference_photo_url: modelForm.reference_photo_url.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from('motorcycle_models').update(payload).eq('id', editingId);
        if (error) {
          setFormError(error.code === '23505' ? 'This make + model already exists.' : error.message);
        } else {
          await supabase.from('audit_logs').insert({
            action: 'UPDATE_MOTORCYCLE_MODEL', entity: 'motorcycle_models', entity_id: editingId,
            performed_by: user?.id, details: { make: payload.make, model: payload.model },
          });
          setToast(`✓ ${payload.make} ${payload.model} updated`);
          closePanel();
          fetchModels();
        }
      } else {
        const { data, error } = await supabase.from('motorcycle_models').insert(payload).select().single();
        if (error) {
          setFormError(error.code === '23505' ? 'This make + model already exists.' : error.message);
        } else {
          await supabase.from('audit_logs').insert({
            action: 'CREATE_MOTORCYCLE_MODEL', entity: 'motorcycle_models', entity_id: data.id,
            performed_by: user?.id, details: { make: payload.make, model: payload.model },
          });
          setToast(`✓ ${payload.make} ${payload.model} added`);
          closePanel();
          fetchModels();
        }
      }
    }
    setSaving(false);
  }

  // ── Services: toggle/delete ──
  async function toggleActive(id, current) {
    const { error } = await supabase.from('services').update({ is_active: !current }).eq('id', id);
    if (error) { alert('Error updating status: ' + error.message); return; }
    await supabase.from('audit_logs').insert({
      action: 'TOGGLE_SERVICE_ACTIVE', entity: 'services', entity_id: id,
      performed_by: user?.id, details: { is_active: !current },
    });
    fetchServices();
  }

  async function deleteService(id) {
    if (!confirm('Delete this service?')) return;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) { alert('Error deleting service: ' + error.message); return; }
    await supabase.from('audit_logs').insert({
      action: 'DELETE_SERVICE', entity: 'services', entity_id: id, performed_by: user?.id, details: {},
    });
    setToast('Deleted');
    fetchServices();
  }

  // ── Models: delete ──
  async function deleteModel(id) {
    if (!confirm('Delete this motorcycle model?')) return;
    const { error } = await supabase.from('motorcycle_models').delete().eq('id', id);
    if (error) { alert('Error deleting model: ' + error.message); return; }
    await supabase.from('audit_logs').insert({
      action: 'DELETE_MOTORCYCLE_MODEL', entity: 'motorcycle_models', entity_id: id,
      performed_by: user?.id, details: {},
    });
    setToast('Deleted');
    fetchModels();
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">Catalog Management</h1>
            <p className="text-gray-400">Manage services and motorcycle models offered by your shop.</p>
          </div>
          <button
            onClick={openAddPanel}
            className="bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-lg font-medium transition text-sm flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> {activeTab === 'services' ? 'Add Service' : 'Add Model'}
          </button>
        </div>

        {/* Navigation & Search Actions Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleTabChange('services')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                activeTab === 'services' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              🛠️ Services <span className="opacity-60">({services.length})</span>
            </button>
            <button
              onClick={() => handleTabChange('motorcycles')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                activeTab === 'motorcycles' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              🏍️ Motorcycle Models <span className="opacity-60">({models.length})</span>
            </button>
          </div>

          <div className="w-full md:w-72 relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 text-sm">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 placeholder-gray-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ───────────── SERVICES TAB ───────────── */}
        {activeTab === 'services' && (
          <>
            {loadingServices ? (
              <SkeletonStack />
            ) : filteredServices.length === 0 ? (
              <div className="bg-dark-800 rounded-xl p-10 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-gray-400 mb-2">
                  {searchQuery ? `No records found matching "${searchQuery}"` : "No services yet."}
                </p>
                {!searchQuery && (
                  <button onClick={openAddPanel} className="text-primary-400 text-sm hover:underline">
                    Add your first service →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredServices.map((s) => (
                  <div key={s.id} className="bg-dark-800 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <p className="font-semibold text-lg">{s.name}</p>
                        {s.description && (
                          <p className="text-sm text-gray-400 mt-0.5 line-clamp-2 max-w-xl">{s.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleActive(s.id, s.is_active)}
                        className={`text-xs px-3 py-1 rounded-full capitalize font-medium transition ${
                          s.is_active ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                        }`}
                      >
                        {s.is_active ? '✓ Active' : 'Inactive'}
                      </button>
                    </div>

                    <div className="bg-dark-900 rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Base Price</p>
                        <p className="font-medium text-white">₱{s.base_price}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Labor Cost</p>
                        <p className="font-medium text-white">₱{s.labor_cost || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Duration</p>
                        <p className="font-medium text-accent-400">{s.estimated_duration_minutes} mins</p>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap items-center">
                      <p className="text-xs text-gray-500 mr-1">Manage:</p>
                      <button
                        onClick={() => openEditPanel(s)}
                        className="text-xs px-3 py-1.5 rounded-md transition bg-primary-500/20 text-primary-400 hover:bg-primary-500/30"
                      >
                        ✎ Edit
                      </button>
                      <button
                        onClick={() => deleteService(s.id)}
                        className="text-xs px-3 py-1.5 rounded-md transition bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ───────────── MOTORCYCLES TAB ───────────── */}
        {activeTab === 'motorcycles' && (
          <>
            {loadingModels ? (
              <SkeletonStack />
            ) : filteredModels.length === 0 ? (
              <div className="bg-dark-800 rounded-xl p-10 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-gray-400 mb-2">
                  {searchQuery ? `No records found matching "${searchQuery}"` : "No motorcycle models yet."}
                </p>
                {!searchQuery && (
                  <button onClick={openAddPanel} className="text-primary-400 text-sm hover:underline">
                    Add your first model →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredModels.map((m) => (
                  <div key={m.id} className="bg-dark-800 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-lg bg-dark-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {m.reference_photo_url ? (
                            <img src={m.reference_photo_url} alt={`${m.make} ${m.model}`} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-2xl">🏍️</span>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-lg">{m.make} {m.model}</p>
                          <p className="text-sm text-gray-400 mt-0.5">{m.year_range || 'Year range not specified'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap items-center">
                      <p className="text-xs text-gray-500 mr-1">Manage:</p>
                      <button
                        onClick={() => openEditPanel(m)}
                        className="text-xs px-3 py-1.5 rounded-md transition bg-primary-500/20 text-primary-400 hover:bg-primary-500/30"
                      >
                        ✎ Edit
                      </button>
                      <button
                        onClick={() => deleteModel(m.id)}
                        className="text-xs px-3 py-1.5 rounded-md transition bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
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
              <h2 className="text-lg font-semibold">
                {editingId
                  ? `Edit ${activeTab === 'services' ? 'Service' : 'Motorcycle Model'}`
                  : `Add New ${activeTab === 'services' ? 'Service' : 'Motorcycle Model'}`}
              </h2>
              <button onClick={closePanel} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">
                  {formError}
                </div>
              )}

              {activeTab === 'services' ? (
                <>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Service Name *</label>
                    <input name="name" value={serviceForm.name} onChange={handleServiceChange} required
                      placeholder="e.g. Oil Change"
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Base Price (₱) *</label>
                      <input name="base_price" type="number" step="0.01" min="0" value={serviceForm.base_price} onChange={handleServiceChange} required
                        className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Labor Cost (₱)</label>
                      <input name="labor_cost" type="number" step="0.01" min="0" value={serviceForm.labor_cost} onChange={handleServiceChange}
                        className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Duration (minutes)</label>
                    <input name="estimated_duration_minutes" type="number" min="0" value={serviceForm.estimated_duration_minutes} onChange={handleServiceChange}
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Description</label>
                    <textarea name="description" value={serviceForm.description} onChange={handleServiceChange} rows={3}
                      placeholder="Briefly describe what this service includes..."
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 resize-none" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Reference Photo URL</label>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-16 h-16 rounded-lg bg-dark-900 border border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {modelForm.reference_photo_url ? (
                          <img src={modelForm.reference_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <span className="text-xl opacity-40">🏍️</span>
                        )}
                      </div>
                      <input
                        name="reference_photo_url"
                        value={modelForm.reference_photo_url}
                        onChange={handleModelChange}
                        placeholder="https://..."
                        className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Make *</label>
                      <input name="make" value={modelForm.make} onChange={handleModelChange} required
                        placeholder="e.g. Yamaha"
                        className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Model *</label>
                      <input name="model" value={modelForm.model} onChange={handleModelChange} required
                        placeholder="e.g. Aerox 155"
                        className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Year Range</label>
                    <input name="year_range" value={modelForm.year_range} onChange={handleModelChange}
                      placeholder="e.g. 2021–2024"
                      className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                  </div>
                </>
              )}

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
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : `+ Add ${activeTab === 'services' ? 'Service' : 'Model'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonStack() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 bg-dark-800 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}