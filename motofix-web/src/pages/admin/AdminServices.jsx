import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const EMPTY_SERVICE_FORM = {
  name: '',
  description: '',
  base_price: '',
  labor_cost: '',
  estimated_duration_minutes: '60',
};

const EMPTY_MODEL_FORM = {
  make: '',
  model: '',
  year_range: '',
  reference_photo_url: '',
};

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

function formatDuration(minutes) {
  const total = Number(minutes) || 0;

  if (total < 60) return `${total} min${total === 1 ? '' : 's'}`;

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (!mins) return `${hours} hr${hours === 1 ? '' : 's'}`;

  return `${hours} hr${hours === 1 ? '' : 's'} ${mins} min${mins === 1 ? '' : 's'}`;
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    accent: 'text-accent-600 dark:text-accent-400',
    green: 'text-green-600 dark:text-green-300',
    blue: 'text-blue-600 dark:text-blue-300',
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

function TextInput({ label, helper, ...props }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
        {label}
      </label>
      <input
        {...props}
        className={`w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500 ${props.className || ''}`}
      />
      {helper && (
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {helper}
        </p>
      )}
    </div>
  );
}

function EmptyState({ icon, title, text, actionLabel, onAction }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
        {icon}
      </div>
      <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
        {title}
      </h2>
      <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
        {text}
      </p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function SkeletonStack() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-40 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

function ServiceStatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${
        active
          ? 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25'
          : 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25'
      }`}
    >
      {active ? '✓ Active' : 'Inactive'}
    </span>
  );
}

export default function AdminServices() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('services');
  const [searchQuery, setSearchQuery] = useState('');

  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE_FORM);
  const [modelForm, setModelForm] = useState(EMPTY_MODEL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [fetchError, setFetchError] = useState('');
  const [toast, setToast] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchServices();
    fetchModels();

    /*
      Realtime refresh for catalog management.
      Enable Realtime in Supabase for services and motorcycle_models.
    */
    const servicesChannel = supabase
      .channel('admin-services-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
        },
        () => fetchServices(false)
      )
      .subscribe();

    const modelsChannel = supabase
      .channel('admin-services-models')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motorcycle_models',
        },
        () => fetchModels(false)
      )
      .subscribe();

    const handleFocus = () => {
      fetchServices(false);
      fetchModels(false);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchServices(false);
        fetchModels(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(servicesChannel);
      supabase.removeChannel(modelsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timeout = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function fetchServices(showLoader = true) {
    if (showLoader) setLoadingServices(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setFetchError(error.message || 'Failed to load services.');
      setServices([]);
      setLoadingServices(false);
      return;
    }

    setServices(data || []);
    setLastUpdated(new Date());
    setLoadingServices(false);
  }

  async function fetchModels(showLoader = true) {
    if (showLoader) setLoadingModels(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('motorcycle_models')
      .select('*')
      .order('make', { ascending: true })
      .order('model', { ascending: true });

    if (error) {
      setFetchError(error.message || 'Failed to load motorcycle models.');
      setModels([]);
      setLoadingModels(false);
      return;
    }

    setModels(data || []);
    setLastUpdated(new Date());
    setLoadingModels(false);
  }

  async function insertAuditLog(action, entity, entityId, details = {}) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity,
      entity_id: entityId,
      performed_by: user.id,
      details,
    });
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    setSearchQuery('');
    closePanel();
  }

  function openAddPanel() {
    setEditingId(null);
    setFormError('');

    if (activeTab === 'services') {
      setServiceForm(EMPTY_SERVICE_FORM);
    } else {
      setModelForm(EMPTY_MODEL_FORM);
    }

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

  function handleServiceChange(event) {
    setServiceForm({
      ...serviceForm,
      [event.target.name]: event.target.value,
    });
  }

  function handleModelChange(event) {
    setModelForm({
      ...modelForm,
      [event.target.name]: event.target.value,
    });
  }

  function validateServiceForm() {
    if (!serviceForm.name.trim()) return 'Service name is required.';

    const basePrice = parseFloat(serviceForm.base_price);
    if (Number.isNaN(basePrice) || basePrice < 0) return 'Please enter a valid base price.';

    const laborCost = parseFloat(serviceForm.labor_cost || '0');
    if (Number.isNaN(laborCost) || laborCost < 0) return 'Please enter a valid labor cost.';

    const duration = parseInt(serviceForm.estimated_duration_minutes || '60', 10);
    if (Number.isNaN(duration) || duration <= 0) return 'Duration must be greater than 0 minutes.';

    return '';
  }

  function validateModelForm() {
    if (!modelForm.make.trim()) return 'Motorcycle make is required.';
    if (!modelForm.model.trim()) return 'Motorcycle model is required.';

    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setFormError('');

    try {
      if (activeTab === 'services') {
        const validationError = validateServiceForm();

        if (validationError) {
          setFormError(validationError);
          setSaving(false);
          return;
        }

        const payload = {
          name: serviceForm.name.trim(),
          description: serviceForm.description.trim() || null,
          base_price: parseFloat(serviceForm.base_price),
          labor_cost: parseFloat(serviceForm.labor_cost || 0),
          estimated_duration_minutes:
            parseInt(serviceForm.estimated_duration_minutes || '60', 10) || 60,
        };

        if (editingId) {
          const { error } = await supabase
            .from('services')
            .update(payload)
            .eq('id', editingId);

          if (error) throw error;

          await insertAuditLog('UPDATE_SERVICE', 'services', editingId, payload);
          setToast(`✓ ${payload.name} updated`);
        } else {
          const { data, error } = await supabase
            .from('services')
            .insert({
              ...payload,
              is_active: true,
            })
            .select('id')
            .single();

          if (error) throw error;

          await insertAuditLog('CREATE_SERVICE', 'services', data.id, {
            name: payload.name,
            base_price: payload.base_price,
          });

          setToast(`✓ ${payload.name} added`);
        }

        closePanel();
        await fetchServices(false);
      } else {
        const validationError = validateModelForm();

        if (validationError) {
          setFormError(validationError);
          setSaving(false);
          return;
        }

        const payload = {
          make: modelForm.make.trim(),
          model: modelForm.model.trim(),
          year_range: modelForm.year_range.trim() || null,
          reference_photo_url: modelForm.reference_photo_url.trim() || null,
        };

        if (editingId) {
          const { error } = await supabase
            .from('motorcycle_models')
            .update(payload)
            .eq('id', editingId);

          if (error) {
            throw new Error(error.code === '23505' ? 'This make + model already exists.' : error.message);
          }

          await insertAuditLog('UPDATE_MOTORCYCLE_MODEL', 'motorcycle_models', editingId, {
            make: payload.make,
            model: payload.model,
          });

          setToast(`✓ ${payload.make} ${payload.model} updated`);
        } else {
          const { data, error } = await supabase
            .from('motorcycle_models')
            .insert(payload)
            .select('id')
            .single();

          if (error) {
            throw new Error(error.code === '23505' ? 'This make + model already exists.' : error.message);
          }

          await insertAuditLog('CREATE_MOTORCYCLE_MODEL', 'motorcycle_models', data.id, {
            make: payload.make,
            model: payload.model,
          });

          setToast(`✓ ${payload.make} ${payload.model} added`);
        }

        closePanel();
        await fetchModels(false);
      }
    } catch (err) {
      setFormError(err.message || 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(service) {
    setTogglingId(service.id);

    try {
      const nextActive = !service.is_active;

      const { error } = await supabase
        .from('services')
        .update({ is_active: nextActive })
        .eq('id', service.id);

      if (error) throw error;

      await insertAuditLog('TOGGLE_SERVICE_ACTIVE', 'services', service.id, {
        is_active: nextActive,
      });

      setToast(nextActive ? `✓ ${service.name} activated` : `${service.name} set inactive`);
      await fetchServices(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to update service status.');
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteService(service) {
    if (!confirm(`Delete "${service.name}"?`)) return;

    setDeletingId(service.id);

    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', service.id);

      if (error) throw error;

      await insertAuditLog('DELETE_SERVICE', 'services', service.id, {
        name: service.name,
      });

      setToast(`Deleted ${service.name}`);
      await fetchServices(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to delete service.');
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteModel(model) {
    if (!confirm(`Delete "${model.make} ${model.model}"?`)) return;

    setDeletingId(model.id);

    try {
      const { error } = await supabase
        .from('motorcycle_models')
        .delete()
        .eq('id', model.id);

      if (error) throw error;

      await insertAuditLog('DELETE_MOTORCYCLE_MODEL', 'motorcycle_models', model.id, {
        make: model.make,
        model: model.model,
      });

      setToast(`Deleted ${model.make} ${model.model}`);
      await fetchModels(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to delete motorcycle model.');
    } finally {
      setDeletingId(null);
    }
  }

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return services.filter((service) => {
      const name = String(service.name || '').toLowerCase();
      const description = String(service.description || '').toLowerCase();
      const id = String(service.id || '').toLowerCase();

      return !query || name.includes(query) || description.includes(query) || id.includes(query);
    });
  }, [services, searchQuery]);

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return models.filter((model) => {
      const make = String(model.make || '').toLowerCase();
      const modelName = String(model.model || '').toLowerCase();
      const yearRange = String(model.year_range || '').toLowerCase();
      const id = String(model.id || '').toLowerCase();

      return !query || make.includes(query) || modelName.includes(query) || yearRange.includes(query) || id.includes(query);
    });
  }, [models, searchQuery]);

  const serviceStats = useMemo(() => {
    const active = services.filter((service) => service.is_active);
    const averagePrice =
      active.length > 0
        ? active.reduce((sum, service) => sum + (Number(service.base_price) || 0), 0) / active.length
        : 0;

    const averageDuration =
      active.length > 0
        ? Math.round(
            active.reduce(
              (sum, service) => sum + (Number(service.estimated_duration_minutes) || 0),
              0
            ) / active.length
          )
        : 0;

    return {
      total: services.length,
      active: active.length,
      inactive: services.filter((service) => !service.is_active).length,
      averagePrice,
      averageDuration,
    };
  }, [services]);

  const modelStats = useMemo(() => {
    const makes = [...new Set(models.map((model) => model.make).filter(Boolean))];

    return {
      total: models.length,
      makes: makes.length,
      withPhotos: models.filter((model) => model.reference_photo_url).length,
    };
  }, [models]);

  const loading = activeTab === 'services' ? loadingServices : loadingModels;
  const currentCount = activeTab === 'services' ? filteredServices.length : filteredModels.length;
  const totalCount = activeTab === 'services' ? services.length : models.length;

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
                  Catalog Management
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Manage repair services and motorcycle model references used across the system.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    fetchServices(false);
                    fetchModels(false);
                  }}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={openAddPanel}
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.99]"
                >
                  + {activeTab === 'services' ? 'Add Service' : 'Add Model'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Stats */}
        {activeTab === 'services' ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Services" value={serviceStats.total} icon="🛠️" tone="primary" />
            <StatCard label="Active" value={serviceStats.active} icon="✅" tone="green" />
            <StatCard label="Average Base Price" value={formatPeso(serviceStats.averagePrice)} icon="💰" tone="accent" />
            <StatCard label="Average Duration" value={formatDuration(serviceStats.averageDuration)} icon="⏱️" />
          </div>
        ) : (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Models" value={modelStats.total} icon="🏍️" tone="primary" />
            <StatCard label="Makes" value={modelStats.makes} icon="🏷️" tone="accent" />
            <StatCard label="With Photos" value={modelStats.withPhotos} icon="📷" tone="green" />
            <StatCard label="Missing Photos" value={modelStats.total - modelStats.withPhotos} icon="🖼️" />
          </div>
        )}

        {/* Navigation and Search */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTabChange('services')}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  activeTab === 'services'
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                }`}
              >
                🛠️ Services ({services.length})
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('motorcycles')}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${
                  activeTab === 'motorcycles'
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                }`}
              >
                🏍️ Motorcycle Models ({models.length})
              </button>
            </div>

            <div className="relative w-full lg:w-96">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={`Search ${activeTab === 'services' ? 'services' : 'models'}...`}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-sm font-black text-gray-400 transition hover:text-gray-900 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mb-4 text-sm font-semibold text-gray-500 dark:text-gray-400">
          Showing {currentCount} of {totalCount} {activeTab === 'services' ? 'services' : 'models'}
        </p>

        {/* Services Tab */}
        {activeTab === 'services' && (
          <>
            {loading ? (
              <SkeletonStack />
            ) : filteredServices.length === 0 ? (
              <EmptyState
                icon="🔍"
                title="No services found"
                text={
                  searchQuery
                    ? `No records found matching "${searchQuery}".`
                    : 'No services have been added yet.'
                }
                actionLabel={!searchQuery ? 'Add your first service →' : ''}
                onAction={openAddPanel}
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredServices.map((service) => {
                  const totalPrice =
                    (Number(service.base_price) || 0) + (Number(service.labor_cost) || 0);

                  return (
                    <article
                      key={service.id}
                      className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-100 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 ${
                        !service.is_active ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-lg font-black text-gray-950 dark:text-white">
                            {service.name}
                          </h2>
                          {service.description && (
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                              {service.description}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleActive(service)}
                          disabled={togglingId === service.id}
                          className="disabled:cursor-not-allowed disabled:opacity-50"
                          title="Toggle active status"
                        >
                          <ServiceStatusBadge active={service.is_active} />
                        </button>
                      </div>

                      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Base
                          </p>
                          <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                            {formatPeso(service.base_price)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Labor
                          </p>
                          <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                            {formatPeso(service.labor_cost)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Total
                          </p>
                          <p className="mt-1 text-sm font-black text-accent-600 dark:text-accent-400">
                            {formatPeso(totalPrice)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Duration
                          </p>
                          <p className="mt-1 text-sm font-black text-primary-600 dark:text-primary-400">
                            {formatDuration(service.estimated_duration_minutes)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-dark-700">
                        <button
                          type="button"
                          onClick={() => openEditPanel(service)}
                          className="rounded-2xl bg-primary-50 px-4 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-100 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25 dark:hover:bg-primary-500/20"
                        >
                          ✎ Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteService(service)}
                          disabled={deletingId === service.id}
                          className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20"
                        >
                          {deletingId === service.id ? 'Deleting...' : '🗑 Delete'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Motorcycle Models Tab */}
        {activeTab === 'motorcycles' && (
          <>
            {loading ? (
              <SkeletonStack />
            ) : filteredModels.length === 0 ? (
              <EmptyState
                icon="🔍"
                title="No motorcycle models found"
                text={
                  searchQuery
                    ? `No records found matching "${searchQuery}".`
                    : 'No motorcycle models have been added yet.'
                }
                actionLabel={!searchQuery ? 'Add your first model →' : ''}
                onAction={openAddPanel}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredModels.map((model) => (
                  <article
                    key={model.id}
                    className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-100 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30"
                  >
                    <div className="mb-4 flex items-center gap-4">
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-3xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                        {model.reference_photo_url ? (
                          <img
                            src={model.reference_photo_url}
                            alt={`${model.make} ${model.model}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-3xl text-gray-400">
                            🏍️
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-black text-gray-950 dark:text-white">
                          {model.make} {model.model}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {model.year_range || 'Year range not specified'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-dark-700">
                      <button
                        type="button"
                        onClick={() => openEditPanel(model)}
                        className="rounded-2xl bg-primary-50 px-4 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-100 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25 dark:hover:bg-primary-500/20"
                      >
                        ✎ Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteModel(model)}
                        disabled={deletingId === model.id}
                        className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20"
                      >
                        {deletingId === model.id ? 'Deleting...' : '🗑 Delete'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] max-w-xs rounded-3xl border border-primary-100 bg-white px-5 py-4 text-sm font-black text-gray-950 shadow-2xl dark:border-primary-500/25 dark:bg-dark-800 dark:text-white">
          {toast}
        </div>
      )}

      {/* Add/Edit Panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closePanel} />

          <div className="relative h-full w-full overflow-y-auto bg-white shadow-2xl dark:bg-dark-800 sm:max-w-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-dark-700 dark:bg-dark-800">
              <h2 className="text-lg font-black text-gray-950 dark:text-white">
                {editingId
                  ? `Edit ${activeTab === 'services' ? 'Service' : 'Motorcycle Model'}`
                  : `Add New ${activeTab === 'services' ? 'Service' : 'Motorcycle Model'}`}
              </h2>

              <button
                type="button"
                onClick={closePanel}
                className="grid h-10 w-10 place-items-center rounded-2xl text-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {formError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {formError}
                </div>
              )}

              {activeTab === 'services' ? (
                <>
                  <TextInput
                    label="Service Name *"
                    name="name"
                    value={serviceForm.name}
                    onChange={handleServiceChange}
                    required
                    placeholder="e.g. Oil Change"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <TextInput
                      label="Base Price *"
                      name="base_price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={serviceForm.base_price}
                      onChange={handleServiceChange}
                      required
                    />

                    <TextInput
                      label="Labor Cost"
                      name="labor_cost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={serviceForm.labor_cost}
                      onChange={handleServiceChange}
                    />
                  </div>

                  <TextInput
                    label="Duration"
                    name="estimated_duration_minutes"
                    type="number"
                    min="1"
                    value={serviceForm.estimated_duration_minutes}
                    onChange={handleServiceChange}
                    helper="Estimated duration in minutes."
                  />

                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={serviceForm.description}
                      onChange={handleServiceChange}
                      rows={4}
                      placeholder="Briefly describe what this service includes..."
                      className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Reference Photo URL
                    </label>

                    <div className="flex items-center gap-3">
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                        {modelForm.reference_photo_url ? (
                          <img
                            src={modelForm.reference_photo_url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-2xl text-gray-400">
                            🏍️
                          </div>
                        )}
                      </div>

                      <input
                        name="reference_photo_url"
                        value={modelForm.reference_photo_url}
                        onChange={handleModelChange}
                        placeholder="https://..."
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <TextInput
                      label="Make *"
                      name="make"
                      value={modelForm.make}
                      onChange={handleModelChange}
                      required
                      placeholder="e.g. Yamaha"
                    />

                    <TextInput
                      label="Model *"
                      name="model"
                      value={modelForm.model}
                      onChange={handleModelChange}
                      required
                      placeholder="e.g. Aerox 155"
                    />
                  </div>

                  <TextInput
                    label="Year Range"
                    name="year_range"
                    value={modelForm.year_range}
                    onChange={handleModelChange}
                    placeholder="e.g. 2021–2024"
                  />
                </>
              )}

              <div className="sticky bottom-0 flex gap-3 border-t border-gray-200 bg-white pt-5 dark:border-dark-700 dark:bg-dark-800">
                <button
                  type="button"
                  onClick={closePanel}
                  className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 dark:border-dark-700 dark:text-gray-300"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingId
                    ? 'Save Changes'
                    : `+ Add ${activeTab === 'services' ? 'Service' : 'Model'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
