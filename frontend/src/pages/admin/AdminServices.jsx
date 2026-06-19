import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

export default function AdminServices() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('services');

  // ── Services state ──
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceForm, setServiceForm] = useState({
    name: '', description: '', base_price: '',
    labor_cost: '', estimated_duration_minutes: '60',
  });
  const [savingService, setSavingService] = useState(false);
  const [serviceMessage, setServiceMessage] = useState('');

  // ── Motorcycle models state ──
    const [models, setModels] = useState([]);
    const [loadingModels, setLoadingModels] = useState(true);
    const [modelForm, setModelForm] = useState({
      make: '', model: '', year_range: '', reference_photo_url: '',
    });
    const [savingModel, setSavingModel] = useState(false);
    const [modelMessage, setModelMessage] = useState('');
    const [editingModelId, setEditingModelId] = useState(null);
    const [editForm, setEditForm] = useState({
      make: '', model: '', year_range: '', reference_photo_url: '',
    });
    const [savingEdit, setSavingEdit] = useState(false);
    const [editMessage, setEditMessage] = useState('');

  useEffect(() => {
    fetchServices();
    fetchModels();
  }, []);

  // ── Services logic ──
  async function fetchServices() {
    const { data } = await supabase.from('services').select('*').order('name');
    if (data) setServices(data);
    setLoadingServices(false);
  }

  function handleServiceChange(e) {
    setServiceForm({ ...serviceForm, [e.target.name]: e.target.value });
  }

  async function handleServiceSubmit(e) {
    e.preventDefault();
    setSavingService(true);
    setServiceMessage('');
    const { data, error } = await supabase.from('services').insert({
      name: serviceForm.name,
      description: serviceForm.description,
      base_price: parseFloat(serviceForm.base_price),
      labor_cost: parseFloat(serviceForm.labor_cost || 0),
      estimated_duration_minutes: parseInt(serviceForm.estimated_duration_minutes),
      is_active: true,
    }).select().single();

    if (error) {
      setServiceMessage('Error: ' + error.message);
    } else {
      await supabase.from('audit_logs').insert({
        action: 'CREATE_SERVICE',
        entity: 'services',
        entity_id: data.id,
        performed_by: user.id,
        details: { name: serviceForm.name, base_price: parseFloat(serviceForm.base_price) },
      });
      setServiceMessage('Service added!');
      setServiceForm({ name: '', description: '', base_price: '', labor_cost: '', estimated_duration_minutes: '60' });
      fetchServices();
    }
    setSavingService(false);
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

  // ── Motorcycle models logic ──
  async function fetchModels() {
    const { data } = await supabase
      .from('motorcycle_models')
      .select('*')
      .order('make', { ascending: true });
    if (data) setModels(data);
    setLoadingModels(false);
  }

  function handleModelChange(e) {
    setModelForm({ ...modelForm, [e.target.name]: e.target.value });
  }

  async function handleModelSubmit(e) {
    e.preventDefault();
    setSavingModel(true);
    setModelMessage('');

    const { data, error } = await supabase.from('motorcycle_models').insert({
      make: modelForm.make.trim(),
      model: modelForm.model.trim(),
      year_range: modelForm.year_range.trim() || null,
      reference_photo_url: modelForm.reference_photo_url.trim(),
    }).select().single();

    if (error) {
      setModelMessage(
        error.code === '23505'
          ? 'Error: This make + model already exists.'
          : 'Error: ' + error.message
      );
    } else {
      await supabase.from('audit_logs').insert({
        action: 'CREATE_MOTORCYCLE_MODEL',
        entity: 'motorcycle_models',
        entity_id: data.id,
        performed_by: user.id,
        details: { make: modelForm.make, model: modelForm.model },
      });
      setModelMessage('Motorcycle model added!');
      setModelForm({ make: '', model: '', year_range: '', reference_photo_url: '' });
      fetchModels();
    }
    setSavingModel(false);
  }

function startEditModel(m) {
    setEditingModelId(m.id);
    setEditForm({
      make: m.make,
      model: m.model,
      year_range: m.year_range || '',
      reference_photo_url: m.reference_photo_url || '',
    });
    setEditMessage('');
  }

  function cancelEditModel() {
    setEditingModelId(null);
    setEditMessage('');
  }

  function handleEditChange(e) {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  }

  async function saveEditModel(id) {
    setSavingEdit(true);
    setEditMessage('');

    const { error } = await supabase
      .from('motorcycle_models')
      .update({
        make: editForm.make.trim(),
        model: editForm.model.trim(),
        year_range: editForm.year_range.trim() || null,
        reference_photo_url: editForm.reference_photo_url.trim(),
      })
      .eq('id', id);

    if (error) {
      setEditMessage(
        error.code === '23505'
          ? 'Error: This make + model already exists.'
          : 'Error: ' + error.message
      );
    } else {
      await supabase.from('audit_logs').insert({
        action: 'UPDATE_MOTORCYCLE_MODEL',
        entity: 'motorcycle_models',
        entity_id: id,
        performed_by: user.id,
        details: { make: editForm.make, model: editForm.model },
      });
      setEditingModelId(null);
      fetchModels();
    }
    setSavingEdit(false);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Catalog Management</h1>
          <p className="text-gray-400">Manage services and motorcycle models offered by your shop.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('services')}
            className={`px-5 py-3 text-sm font-medium transition relative ${
              activeTab === 'services' ? 'text-primary-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            🛠️ Services
            {activeTab === 'services' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('motorcycles')}
            className={`px-5 py-3 text-sm font-medium transition relative ${
              activeTab === 'motorcycles' ? 'text-primary-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            🏍️ Motorcycle Models
            {activeTab === 'motorcycles' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />
            )}
          </button>
        </div>

        {/* ───────────── SERVICES TAB ───────────── */}
        {activeTab === 'services' && (
          <>
            <div className="bg-dark-800 rounded-2xl p-6 mb-8 border border-gray-800">
              <h2 className="text-lg font-semibold mb-1">Add New Service</h2>
              <p className="text-sm text-gray-500 mb-5">Define a service customers can book, with pricing and duration.</p>

              {serviceMessage && (
                <div className={`text-sm rounded-lg p-3 mb-4 ${
                  serviceMessage.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
                }`}>
                  {serviceMessage}
                </div>
              )}

              <form onSubmit={handleServiceSubmit} className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Service Name *</label>
                  <input name="name" value={serviceForm.name} onChange={handleServiceChange} required
                    placeholder="e.g. Oil Change"
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Duration (minutes)</label>
                  <input name="estimated_duration_minutes" type="number" value={serviceForm.estimated_duration_minutes} onChange={handleServiceChange}
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Base Price (₱) *</label>
                  <input name="base_price" type="number" value={serviceForm.base_price} onChange={handleServiceChange} required
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Labor Cost (₱)</label>
                  <input name="labor_cost" type="number" value={serviceForm.labor_cost} onChange={handleServiceChange}
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-300 mb-1">Description</label>
                  <textarea name="description" value={serviceForm.description} onChange={handleServiceChange} rows={2}
                    placeholder="Briefly describe what this service includes..."
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 resize-none" />
                </div>
                <div>
                  <button type="submit" disabled={savingService}
                    className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2.5 rounded-lg font-medium text-sm transition">
                    {savingService ? 'Adding...' : '+ Add Service'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-dark-800 rounded-2xl p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">All Services</h2>
                <span className="text-xs bg-dark-900 text-gray-400 px-2.5 py-1 rounded-full">{services.length} total</span>
              </div>

              {loadingServices ? (
                <SkeletonList />
              ) : services.length === 0 ? (
                <EmptyState icon="🛠️" text="No services yet. Add your first one above." />
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {services.map((s) => (
                    <div key={s.id} className="bg-dark-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-semibold text-sm">{s.name}</p>
                        <button
                          onClick={() => toggleActive(s.id, s.is_active)}
                          className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition ${
                            s.is_active
                              ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                              : 'border-gray-600 text-gray-500 hover:bg-gray-800'
                          }`}
                        >
                          {s.is_active ? '✓ Active' : 'Inactive'}
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                        <span>₱{s.base_price} base</span>
                        <span>·</span>
                        <span>₱{s.labor_cost || 0} labor</span>
                        <span>·</span>
                        <span>{s.estimated_duration_minutes} mins</span>
                      </div>
                      {s.description && (
                        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{s.description}</p>
                      )}
                      <button
                        onClick={() => deleteService(s.id)}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-md transition"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ───────────── MOTORCYCLE MODELS TAB ───────────── */}
        {activeTab === 'motorcycles' && (
          <>
            <div className="bg-dark-800 rounded-2xl p-6 mb-8 border border-gray-800">
              <h2 className="text-lg font-semibold mb-1">Add New Motorcycle Model</h2>
              <p className="text-sm text-gray-500 mb-5">
                Models added here become selectable in the AI Appearance Preview and parts compatibility filters.
              </p>

              {modelMessage && (
                <div className={`text-sm rounded-lg p-3 mb-4 ${
                  modelMessage.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
                }`}>
                  {modelMessage}
                </div>
              )}

              <form onSubmit={handleModelSubmit} className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Make *</label>
                  <input name="make" value={modelForm.make} onChange={handleModelChange} required
                    placeholder="e.g. Yamaha"
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Model *</label>
                  <input name="model" value={modelForm.model} onChange={handleModelChange} required
                    placeholder="e.g. Aerox 155"
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Year Range</label>
                  <input name="year_range" value={modelForm.year_range} onChange={handleModelChange}
                    placeholder="e.g. 2021–2024"
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Reference Photo URL *</label>
                  <input name="reference_photo_url" value={modelForm.reference_photo_url} onChange={handleModelChange} required
                    placeholder="https://..."
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                </div>

                {modelForm.reference_photo_url && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-2">Preview:</p>
                    <img
                      src={modelForm.reference_photo_url}
                      alt="Preview"
                      className="h-32 rounded-lg object-cover border border-gray-700"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                )}

                <div>
                  <button type="submit" disabled={savingModel}
                    className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2.5 rounded-lg font-medium text-sm transition">
                    {savingModel ? 'Adding...' : '+ Add Motorcycle Model'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-dark-800 rounded-2xl p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">All Motorcycle Models</h2>
                <span className="text-xs bg-dark-900 text-gray-400 px-2.5 py-1 rounded-full">{models.length} total</span>
              </div>

{loadingModels ? (
                <SkeletonGrid />
              ) : models.length === 0 ? (
                <EmptyState icon="🏍️" text="No motorcycle models yet. Add your first one above." />
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {models.map((m) => {
                    const isEditing = editingModelId === m.id;

                    if (isEditing) {
                      return (
                        <div key={m.id} className="bg-dark-900 rounded-xl overflow-hidden border border-primary-500/40 sm:col-span-2 md:col-span-3 p-4">
                          {editMessage && (
                            <div className="text-xs rounded-lg p-2.5 mb-3 bg-red-500/10 text-red-400 border border-red-500/20">
                              {editMessage}
                            </div>
                          )}
                          <div className="grid md:grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Make</label>
                              <input name="make" value={editForm.make} onChange={handleEditChange}
                                className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Model</label>
                              <input name="model" value={editForm.model} onChange={handleEditChange}
                                className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Year Range</label>
                              <input name="year_range" value={editForm.year_range} onChange={handleEditChange}
                                placeholder="e.g. 2021–2024"
                                className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Reference Photo URL</label>
                              <input name="reference_photo_url" value={editForm.reference_photo_url} onChange={handleEditChange}
                                className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
                            </div>
                          </div>

                          {editForm.reference_photo_url && (
                            <div className="mb-3">
                              <img
                                src={editForm.reference_photo_url}
                                alt="Preview"
                                className="h-24 rounded-lg object-cover border border-gray-700"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEditModel(m.id)}
                              disabled={savingEdit}
                              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition"
                            >
                              {savingEdit ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={cancelEditModel}
                              disabled={savingEdit}
                              className="border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg text-sm transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className="bg-dark-900 rounded-xl overflow-hidden border border-gray-800 hover:border-gray-700 transition">
                        <div className="h-32 bg-dark-800 flex items-center justify-center overflow-hidden">
                          {m.reference_photo_url ? (
                            <img src={m.reference_photo_url} alt={`${m.make} ${m.model}`} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-3xl">🏍️</span>
                          )}
                        </div>
                        <div className="p-4">
                          <p className="font-semibold text-sm">{m.make} {m.model}</p>
                          <p className="text-xs text-gray-500 mb-3">{m.year_range || 'Year range not specified'}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditModel(m)}
                              className="text-xs text-primary-400 hover:text-primary-300 border border-primary-500/30 px-3 py-1.5 rounded-md transition flex-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteModel(m.id)}
                              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-md transition flex-1"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="text-center py-12">
      <p className="text-3xl mb-3">{icon}</p>
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-24 bg-dark-900 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-56 bg-dark-900 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}