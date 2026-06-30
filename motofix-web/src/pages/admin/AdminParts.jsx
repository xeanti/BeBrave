import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { adjustPartStock } from '../../lib/inventory';

const EMPTY_FORM = {
  name: '',
  category: '',
  price: '',
  stock_quantity: '',
  reorder_threshold: '5',
  compatible_models: '',
  image_url: '',
  ai_reference_url: '',
  prompt_description: '',
  install_area: '',
  color: '',
  finish: '',
  material: '',
  is_previewable: true,
};

const STOCK_FILTERS = [
  { key: 'all', label: 'All Stock Levels' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out of Stock' },
];

const STATUS_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'all', label: 'All' },
];

function formatPeso(value, decimals = 2) {
  const amount = Number(value) || 0;

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

function parseCompatibleModels(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStockState(part) {
  const stock = Number(part.stock_quantity) || 0;
  const threshold = Number(part.reorder_threshold ?? 5);

  if (stock <= 0) return 'out';
  if (stock <= threshold) return 'low';
  return 'ok';
}

function getStockLabel(state) {
  if (state === 'out') return 'Out of Stock';
  if (state === 'low') return 'Low Stock';
  return 'In Stock';
}

const STOCK_STYLES = {
  ok: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  low: 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  out: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
};

const STOCK_BAR = {
  ok: 'bg-green-500',
  low: 'bg-yellow-400',
  out: 'bg-red-500',
};

function StockBadge({ state }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${STOCK_STYLES[state]}`}>
      {getStockLabel(state)}
    </span>
  );
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
      {helper && <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{helper}</p>}
    </div>
  );
}

function PartSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div
          key={item}
          className="h-80 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function AdminParts() {
  const { user } = useAuth();

  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortBy, setSortBy] = useState('name');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [toast, setToast] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [stockEdits, setStockEdits] = useState({});
  const [updatingStockId, setUpdatingStockId] = useState(null);

  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [renamingCat, setRenamingCat] = useState(null);
  const [catSaving, setCatSaving] = useState(false);
  const [showCategoryInput, setShowCategoryInput] = useState(false);

  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchParts();

    /*
      Realtime refresh for inventory management.
      Enable Realtime in Supabase for parts.
    */
    const partsChannel = supabase
      .channel('admin-parts-inventory')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parts',
        },
        () => fetchParts(false)
      )
      .subscribe();

    const handleFocus = () => fetchParts(false);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchParts(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(partsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timeout = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function fetchParts(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('parts')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setFetchError(error.message || 'Failed to load parts.');
      setParts([]);
      setLoading(false);
      return;
    }

    setParts(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  async function insertAuditLog(action, entityId, details = {}) {
    if (!user?.id) return;

    await supabase.from('audit_logs').insert({
      action,
      entity: 'parts',
      entity_id: entityId || null,
      performed_by: user.id,
      details,
    });
  }

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function openAddPanel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowCategoryInput(false);
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
      ai_reference_url: part.ai_reference_url || '',
      prompt_description: part.prompt_description || '',
      install_area: part.install_area || '',
      color: part.color || '',
      finish: part.finish || '',
      material: part.material || '',
      is_previewable: part.is_previewable !== false,
    });
    setFormError('');
    setShowCategoryInput(false);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowCategoryInput(false);
  }

  function validateForm() {
    if (!form.name.trim()) return 'Part name is required.';

    const price = parseFloat(form.price);
    if (Number.isNaN(price) || price < 0) return 'Please enter a valid price.';

    const stock = parseInt(form.stock_quantity, 10);
    if (Number.isNaN(stock) || stock < 0) return 'Please enter a valid stock quantity.';

    const threshold = parseInt(form.reorder_threshold || '5', 10);
    if (Number.isNaN(threshold) || threshold < 0) return 'Please enter a valid reorder threshold.';

    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setFormError('');

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      setSaving(false);
      return;
    }

    const stockQuantity = parseInt(form.stock_quantity, 10);

    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      price: parseFloat(form.price),
      reorder_threshold: parseInt(form.reorder_threshold || '5', 10),
      compatible_models: parseCompatibleModels(form.compatible_models),
      image_url: form.image_url.trim() || null,
      ai_reference_url: form.ai_reference_url.trim() || null,
      prompt_description: form.prompt_description.trim() || null,
      install_area: form.install_area.trim() || null,
      color: form.color.trim() || null,
      finish: form.finish.trim() || null,
      material: form.material.trim() || null,
      is_previewable: form.is_previewable !== false,
    };

    try {
      if (editingId) {
        const currentPart = parts.find((part) => part.id === editingId);
        const currentStock = Number(currentPart?.stock_quantity) || 0;

        const { error } = await supabase
          .from('parts')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;

        if (stockQuantity !== currentStock) {
          const difference = Math.abs(stockQuantity - currentStock);
          const movementType = stockQuantity > currentStock ? 'stock_in' : 'stock_out';

          await adjustPartStock({
            partId: editingId,
            movementType,
            quantity: difference,
            reason:
              stockQuantity > currentStock
                ? 'Stock increased from edit part form'
                : 'Stock decreased from edit part form',
          });
        }

        await insertAuditLog('UPDATE_PART', editingId, {
          ...payload,
          previous_stock_quantity: currentStock,
          new_stock_quantity: stockQuantity,
        });

        setToast(`✓ ${payload.name} updated`);
      } else {
        const { data, error } = await supabase
          .from('parts')
          .insert({
            ...payload,
            stock_quantity: 0,
            is_active: true,
          })
          .select('id')
          .single();

        if (error) throw error;

        if (stockQuantity > 0) {
          await adjustPartStock({
            partId: data.id,
            movementType: 'stock_in',
            quantity: stockQuantity,
            reason: 'Initial stock when part was created',
          });
        }

        await insertAuditLog('CREATE_PART', data.id, {
          name: payload.name,
          price: payload.price,
          stock_quantity: stockQuantity,
        });

        setToast(`✓ ${payload.name} added to inventory`);
      }

      closePanel();
      await fetchParts(false);
    } catch (err) {
      setFormError(err.message || 'Failed to save part.');
    } finally {
      setSaving(false);
    }
  }

  async function setPartActive(part, active) {
    setTogglingId(part.id);

    try {
      const { error } = await supabase
        .from('parts')
        .update({ is_active: active })
        .eq('id', part.id);

      if (error) throw error;

      await insertAuditLog(active ? 'REACTIVATE_PART' : 'DEACTIVATE_PART', part.id, {
        name: part.name,
      });

      setToast(active ? `✓ ${part.name} reactivated` : `${part.name} deactivated`);
      await fetchParts(false);
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to update part.'}`);
    } finally {
      setTogglingId(null);
      setDeactivateConfirm(null);
    }
  }

  async function updateStock(id, qty, reason = 'Manual stock adjustment') {
    if (Number.isNaN(qty) || qty < 0) return;

    const currentPart = parts.find((part) => part.id === id);
    if (!currentPart) return;

    const currentStock = Number(currentPart.stock_quantity) || 0;
    if (qty === currentStock) return;

    const quantity = Math.abs(qty - currentStock);
    const movementType = qty > currentStock ? 'stock_in' : 'stock_out';

    setUpdatingStockId(id);
    const previous = parts;

    setParts((current) =>
      current.map((part) => (part.id === id ? { ...part, stock_quantity: qty } : part))
    );

    try {
      await adjustPartStock({
        partId: id,
        movementType,
        quantity,
        reason,
      });

      setToast(`✓ Stock updated: ${currentStock} → ${qty}`);
      await fetchParts(false);
    } catch (err) {
      setParts(previous);
      setToast(`❌ ${err.message || 'Failed to update stock.'}`);
    } finally {
      setUpdatingStockId(null);
    }
  }

  function adjustStock(part, delta) {
    const currentStock = Number(part.stock_quantity) || 0;
    const next = Math.max(0, currentStock + delta);

    updateStock(
      part.id,
      next,
      delta > 0
        ? 'Stock increased with quick add button'
        : 'Stock decreased with quick subtract button'
    );
  }

  function commitStockInput(part) {
    const raw = stockEdits[part.id];

    if (raw === undefined) return;

    const qty = parseInt(raw, 10);

    if (!Number.isNaN(qty) && qty >= 0 && qty !== part.stock_quantity) {
      updateStock(part.id, qty, 'Stock adjusted from manual stock input');
    }

    setStockEdits((previous) => {
      const next = { ...previous };
      delete next[part.id];
      return next;
    });
  }

  const derivedCategories = useMemo(
    () => [...new Set(parts.map((part) => part.category).filter(Boolean))].sort(),
    [parts]
  );

  const allCategories = useMemo(
    () => [...new Set([...derivedCategories, ...customCategories])].sort(),
    [derivedCategories, customCategories]
  );

  const categories = useMemo(() => ['all', ...allCategories], [allCategories]);

  function addCustomCategory() {
    const name = newCatName.trim();

    if (!name) return;

    if (allCategories.map((category) => category.toLowerCase()).includes(name.toLowerCase())) {
      setToast(`Category "${name}" already exists`);
      return;
    }

    setCustomCategories((previous) => [...previous, name]);
    setNewCatName('');
    setToast(`✓ Category "${name}" added`);
  }

  async function renameCategory(oldName, newName) {
    const trimmed = newName.trim();

    if (!trimmed || trimmed === oldName) {
      setRenamingCat(null);
      return;
    }

    setCatSaving(true);

    try {
      const { error } = await supabase
        .from('parts')
        .update({ category: trimmed })
        .eq('category', oldName);

      if (error) throw error;

      await insertAuditLog('RENAME_CATEGORY', null, {
        old_category: oldName,
        new_category: trimmed,
      });

      setCustomCategories((previous) =>
        previous.map((category) => (category === oldName ? trimmed : category))
      );

      if (categoryFilter === oldName) setCategoryFilter(trimmed);

      setToast(`✓ Renamed "${oldName}" → "${trimmed}"`);
      await fetchParts(false);
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to rename category.'}`);
    } finally {
      setRenamingCat(null);
      setCatSaving(false);
    }
  }

  async function deleteCategory(name) {
    if (!confirm(`Remove category "${name}" from all parts?`)) return;

    setCatSaving(true);

    try {
      const { error } = await supabase
        .from('parts')
        .update({ category: null })
        .eq('category', name);

      if (error) throw error;

      await insertAuditLog('DELETE_CATEGORY', null, {
        category: name,
      });

      setCustomCategories((previous) => previous.filter((category) => category !== name));

      if (categoryFilter === name) setCategoryFilter('all');

      setToast(`Removed category "${name}"`);
      await fetchParts(false);
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to remove category.'}`);
    } finally {
      setCatSaving(false);
    }
  }

  const stats = useMemo(() => {
    const activeParts = parts.filter((part) => part.is_active !== false);
    const totalValue = activeParts.reduce(
      (sum, part) => sum + (Number(part.price) || 0) * (Number(part.stock_quantity) || 0),
      0
    );
    const lowStock = activeParts.filter((part) => getStockState(part) === 'low').length;
    const outOfStock = activeParts.filter((part) => getStockState(part) === 'out').length;

    return {
      totalValue,
      lowStock,
      outOfStock,
      total: activeParts.length,
      inactive: parts.filter((part) => part.is_active === false).length,
    };
  }, [parts]);

  const filteredParts = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    let result = parts.filter((part) => {
      const stockState = getStockState(part);
      const compatibleModels = (part.compatible_models || []).join(' ').toLowerCase();
      const isActive = part.is_active !== false;

      const aiSearchText = [
        part.prompt_description,
        part.install_area,
        part.color,
        part.finish,
        part.material,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !searchTerm ||
        String(part.name || '').toLowerCase().includes(searchTerm) ||
        String(part.category || '').toLowerCase().includes(searchTerm) ||
        compatibleModels.includes(searchTerm) ||
        aiSearchText.includes(searchTerm);

      const matchesCategory =
        categoryFilter === 'all' || part.category === categoryFilter;

      const matchesStock =
        stockFilter === 'all' || stockFilter === stockState;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive);

      return matchesSearch && matchesCategory && matchesStock && matchesStatus;
    });

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'price_asc':
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        case 'price_desc':
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        case 'stock_asc':
          return (Number(a.stock_quantity) || 0) - (Number(b.stock_quantity) || 0);
        case 'stock_desc':
          return (Number(b.stock_quantity) || 0) - (Number(a.stock_quantity) || 0);
        default:
          return String(a.name || '').localeCompare(String(b.name || ''));
      }
    });

    return result;
  }, [parts, search, categoryFilter, stockFilter, statusFilter, sortBy]);

  function clearFilters() {
    setSearch('');
    setCategoryFilter('all');
    setStockFilter('all');
    setStatusFilter('all');
    setSortBy('name');
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
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
                  Manage Parts
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Add parts, update stock, manage categories, and monitor low inventory.
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
                  onClick={() => fetchParts(false)}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={() => setCatPanelOpen(true)}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  🏷 Categories
                </button>

                <button
                  type="button"
                  onClick={openAddPanel}
                  className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.99]"
                >
                  + Add Part
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
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Active Parts" value={stats.total} icon="⚙️" tone="primary" />
          <StatCard label="Low Stock" value={stats.lowStock} icon="⚠️" tone={stats.lowStock > 0 ? 'yellow' : 'default'} />
          <StatCard label="Out of Stock" value={stats.outOfStock} icon="🚫" tone={stats.outOfStock > 0 ? 'red' : 'default'} />
          <StatCard label="Inactive" value={stats.inactive} icon="🗄️" />
          <StatCard label="Inventory Value" value={formatPeso(stats.totalValue, 0)} icon="💰" tone="accent" />
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((category) => {
              const active = categoryFilter === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                    active
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                  }`}
                >
                  {category === 'all' ? 'All Categories' : category}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
            <input
              type="text"
              placeholder="Search name, category, or compatible model..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            >
              {STATUS_FILTERS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            >
              {STOCK_FILTERS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            >
              <option value="name">Sort: Name</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="stock_asc">Stock: Low to High</option>
              <option value="stock_desc">Stock: High to Low</option>
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            Showing {filteredParts.length} of {parts.length} {parts.length === 1 ? 'part' : 'parts'}
          </p>

          {(search || categoryFilter !== 'all' || stockFilter !== 'all' || statusFilter !== 'active' || sortBy !== 'name') && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-black text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Parts grid */}
        {loading ? (
          <PartSkeleton />
        ) : filteredParts.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-16 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              🔍
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No parts found
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              {parts.length === 0
                ? 'No parts in inventory yet.'
                : 'No parts match your current filters.'}
            </p>
            {parts.length === 0 ? (
              <button
                type="button"
                onClick={openAddPanel}
                className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
              >
                Add your first part →
              </button>
            ) : (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredParts.map((part) => {
              const stockState = getStockState(part);
              const inactive = part.is_active === false;
              const stock = Number(part.stock_quantity) || 0;
              const threshold = Number(part.reorder_threshold ?? 5);
              const stockPct =
                threshold > 0
                  ? Math.min(100, (stock / (threshold * 3)) * 100)
                  : stock > 0
                  ? 100
                  : 0;

              return (
                <article
                  key={part.id}
                  className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary-100 dark:border-dark-700 dark:bg-dark-800 dark:hover:border-primary-500/30 ${
                    inactive ? 'opacity-60' : ''
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                        {part.image_url ? (
                          <img
                            src={part.image_url}
                            alt={part.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-2xl text-gray-400">
                            ⚙️
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950 dark:text-white" title={part.name}>
                          {part.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {part.category || 'Uncategorized'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-end gap-2">
                      {inactive && (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-500 ring-1 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25">
                          Inactive
                        </span>
                      )}
                      <StockBadge state={stockState} />

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                          part.is_previewable === false
                            ? 'bg-gray-100 text-gray-500 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25'
                            : 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25'
                        }`}
                        title={
                          part.is_previewable === false
                            ? 'This item is for shop/inventory only and will not appear in AI Preview'
                            : 'This item can appear in AI Preview'
                        }
                      >
                        {part.is_previewable === false ? 'Shop Only' : 'Previewable'}
                      </span>

                      {part.is_previewable !== false && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                            part.ai_reference_url
                              ? 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25'
                              : 'bg-gray-100 text-gray-500 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25'
                          }`}
                          title={
                            part.ai_reference_url
                              ? 'Has clean AI reference photo'
                              : 'No AI reference photo yet'
                          }
                        >
                          {part.ai_reference_url ? 'AI Ready' : 'No AI Ref'}
                        </span>
                      )}
                    </div>
                  </div>

                  {part.compatible_models?.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {part.compatible_models.slice(0, 3).map((model, index) => (
                        <span
                          key={`${model}-${index}`}
                          className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/20"
                        >
                          {model}
                        </span>
                      ))}
                      {part.compatible_models.length > 3 && (
                        <span className="self-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                          +{part.compatible_models.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Price
                      </p>
                      <p className="mt-1 text-sm font-black text-accent-600 dark:text-accent-400">
                        {formatPeso(part.price)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-900/70 dark:ring-dark-700">
                      <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Reorder At
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-950 dark:text-white">
                        {threshold}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Stock Quantity
                      </p>
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        {stock} on hand
                      </p>
                    </div>

                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                      <div
                        className={`h-full rounded-full transition-all ${STOCK_BAR[stockState]}`}
                        style={{ width: `${stockPct}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustStock(part, -1)}
                        disabled={stock <= 0 || updatingStockId === part.id}
                        className="grid h-10 w-10 place-items-center rounded-2xl border border-gray-200 bg-gray-50 text-lg font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                      >
                        −
                      </button>

                      <input
                        type="number"
                        value={stockEdits[part.id] ?? stock}
                        onChange={(event) =>
                          setStockEdits((previous) => ({
                            ...previous,
                            [part.id]: event.target.value,
                          }))
                        }
                        onBlur={() => commitStockInput(part)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        disabled={updatingStockId === part.id}
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-center text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                      />

                      <button
                        type="button"
                        onClick={() => adjustStock(part, 1)}
                        disabled={updatingStockId === part.id}
                        className="grid h-10 w-10 place-items-center rounded-2xl border border-gray-200 bg-gray-50 text-lg font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-dark-700">
                    <button
                      type="button"
                      onClick={() => openEditPanel(part)}
                      className="rounded-2xl bg-primary-50 px-4 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-100 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25 dark:hover:bg-primary-500/20"
                    >
                      ✎ Edit
                    </button>

                    {inactive ? (
                      <button
                        type="button"
                        onClick={() => setPartActive(part, true)}
                        disabled={togglingId === part.id}
                        className="rounded-2xl bg-green-50 px-4 py-2 text-xs font-black text-green-700 ring-1 ring-green-200 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25 dark:hover:bg-green-500/20"
                      >
                        {togglingId === part.id ? 'Reactivating...' : '↺ Reactivate'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeactivateConfirm(part)}
                        disabled={togglingId === part.id}
                        className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20"
                      >
                        {togglingId === part.id ? 'Deactivating...' : '🚫 Deactivate'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[130] max-w-xs rounded-3xl border border-primary-100 bg-white px-5 py-4 text-sm font-black text-gray-950 shadow-2xl dark:border-primary-500/25 dark:bg-dark-800 dark:text-white">
          {toast}
        </div>
      )}

      {/* Deactivate Confirmation */}
      {deactivateConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeactivateConfirm(null)}
          />

          <div className="relative w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-700 dark:bg-dark-800">
            <h3 className="mb-2 text-lg font-black text-gray-950 dark:text-white">
              Deactivate Part?
            </h3>
            <p className="mb-6 text-sm leading-6 text-gray-600 dark:text-gray-400">
              <span className="font-black text-gray-950 dark:text-white">
                “{deactivateConfirm.name}”
              </span>{' '}
              will be hidden from customers but kept in your records. You can reactivate it anytime.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeactivateConfirm(null)}
                className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 dark:border-dark-700 dark:text-gray-300"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => setPartActive(deactivateConfirm, false)}
                disabled={togglingId === deactivateConfirm.id}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {togglingId === deactivateConfirm.id ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Categories */}
      {catPanelOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setCatPanelOpen(false)}
          />

          <div className="relative flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl dark:bg-dark-800 sm:max-w-md">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-dark-700 dark:bg-dark-800">
              <div>
                <h2 className="text-lg font-black text-gray-950 dark:text-white">
                  Manage Categories
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Rename, remove, or add inventory categories.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCatPanelOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-2xl text-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-6 p-6">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Add Category
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(event) => setNewCatName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') addCustomCategory();
                    }}
                    placeholder="e.g. brakes, electrical"
                    className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={addCustomCategory}
                    disabled={!newCatName.trim()}
                    className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  All Categories ({allCategories.length})
                </p>

                {allCategories.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-dark-700 dark:bg-dark-900/60">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      No categories yet. Add one above.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {allCategories.map((category) => {
                      const partCount = parts.filter((part) => part.category === category).length;
                      const isRenaming = renamingCat?.old === category;

                      return (
                        <li
                          key={category}
                          className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70"
                        >
                          {isRenaming ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={renamingCat.value}
                                onChange={(event) =>
                                  setRenamingCat({
                                    ...renamingCat,
                                    value: event.target.value,
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') renameCategory(category, renamingCat.value);
                                  if (event.key === 'Escape') setRenamingCat(null);
                                }}
                                className="flex-1 rounded-xl border border-primary-500 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none dark:bg-dark-800 dark:text-white"
                              />

                              <button
                                type="button"
                                onClick={() => renameCategory(category, renamingCat.value)}
                                disabled={catSaving}
                                className="rounded-xl bg-primary-600 px-3 py-2 text-xs font-black text-white transition hover:bg-primary-700 disabled:opacity-50"
                              >
                                {catSaving ? '…' : 'Save'}
                              </button>

                              <button
                                type="button"
                                onClick={() => setRenamingCat(null)}
                                className="rounded-xl px-2 py-2 text-xs font-black text-gray-500 transition hover:text-gray-900 dark:hover:text-white"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black capitalize text-gray-950 dark:text-white">
                                  {category}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {partCount} {partCount === 1 ? 'part' : 'parts'}
                                </p>
                              </div>

                              <div className="flex flex-shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => setRenamingCat({ old: category, value: category })}
                                  className="rounded-xl bg-primary-50 px-3 py-2 text-xs font-black text-primary-700 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:hover:bg-primary-500/20"
                                  title="Rename"
                                >
                                  ✎
                                </button>

                                <button
                                  type="button"
                                  onClick={() => deleteCategory(category)}
                                  disabled={catSaving}
                                  className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                                  title="Delete"
                                >
                                  🗑
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Part */}
      {panelOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closePanel} />

          <div className="relative h-full w-full overflow-y-auto bg-white shadow-2xl dark:bg-dark-800 sm:max-w-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-dark-700 dark:bg-dark-800">
              <h2 className="text-lg font-black text-gray-950 dark:text-white">
                {editingId ? 'Edit Part' : 'Add New Part'}
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

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Image URL
                </label>

                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                    {form.image_url ? (
                      <img
                        src={form.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-2xl text-gray-400">
                        ⚙️
                      </div>
                    )}
                  </div>

                  <input
                    name="image_url"
                    value={form.image_url}
                    onChange={handleChange}
                    placeholder="https://..."
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  />
                </div>
              </div>

              <label
                className={`flex cursor-pointer gap-4 rounded-3xl border p-4 transition ${
                  form.is_previewable !== false
                    ? 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-300'
                    : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-dark-700 dark:bg-dark-900/70 dark:text-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.is_previewable !== false}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_previewable: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 accent-primary-600"
                />

                <span>
                  <span className="block text-sm font-black">
                    Available for AI Preview
                  </span>
                  <span className="mt-1 block text-xs leading-5 opacity-80">
                    Turn this off for oils, brake fluids, coolant, grease,
                    cleaners, and other consumables that cannot be shown
                    visually. Shop-only items will still appear in inventory and
                    shop, but not in AI Preview.
                  </span>
                </span>
              </label>

              {form.is_previewable !== false && (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      AI Reference URL
                    </label>

                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                    {form.ai_reference_url ? (
                      <img
                        src={form.ai_reference_url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-xs font-black text-gray-400">
                        AI Ref
                      </div>
                    )}
                  </div>

                  <input
                    name="ai_reference_url"
                    value={form.ai_reference_url}
                    onChange={handleChange}
                    placeholder="https://... clean cropped AI reference photo"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  />
                </div>

                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Use one clean photo of the exact part only. For wheels, use one cropped side-view rim, not a full photo with two wheels or background boxes.
                </p>
              </div>

              <TextInput
                label="AI Prompt Description"
                name="prompt_description"
                value={form.prompt_description}
                onChange={handleChange}
                placeholder="e.g. gold Enkei 3-spoke mags with glossy metallic alloy finish"
                helper="Describe the exact shape, material, color, and finish. This helps the AI replace the real part instead of only recoloring it."
              />

              <TextInput
                label="Install Area"
                name="install_area"
                value={form.install_area}
                onChange={handleChange}
                placeholder="e.g. front and rear wheel/rim area only"
                helper="Tell the AI where this part should be installed on the motorcycle."
              />

              <div className="grid grid-cols-3 gap-4">
                    <TextInput
                      label="Color"
                      name="color"
                      value={form.color}
                      onChange={handleChange}
                      placeholder="Gold"
                    />

                    <TextInput
                      label="Finish"
                      name="finish"
                      value={form.finish}
                      onChange={handleChange}
                      placeholder="Gloss metallic"
                    />

                    <TextInput
                      label="Material"
                      name="material"
                      value={form.material}
                      onChange={handleChange}
                      placeholder="Alloy"
                    />
                  </div>
                </>
              )}

              <TextInput
                label="Part Name *"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="e.g. Brake Pad Set"
              />

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Category
                </label>

                {allCategories.length > 0 && !showCategoryInput ? (
                  <select
                    name="category"
                    value={allCategories.includes(form.category) ? form.category : ''}
                    onChange={(event) => {
                      if (event.target.value === '__other__') {
                        setShowCategoryInput(true);
                        setForm((current) => ({ ...current, category: '' }));
                      } else {
                        setForm((current) => ({ ...current, category: event.target.value }));
                      }
                    }}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  >
                    <option value="">— Select a category —</option>
                    {allCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value="__other__">Other (type new)…</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      name="category"
                      value={form.category}
                      onChange={handleChange}
                      placeholder="e.g. exhaust, headlight"
                      autoFocus={showCategoryInput}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                    />

                    {allCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCategoryInput(false)}
                        className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
                      >
                        List
                      </button>
                    )}
                  </div>
                )}

                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Choose an existing category or type a new one.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <TextInput
                  label="Price *"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={handleChange}
                  required
                />

                <TextInput
                  label="Stock Quantity *"
                  name="stock_quantity"
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={handleChange}
                  required
                />
              </div>

              <TextInput
                label="Reorder Threshold"
                name="reorder_threshold"
                type="number"
                min="0"
                value={form.reorder_threshold}
                onChange={handleChange}
                helper="Parts at or below this quantity are flagged as low stock."
              />

              <TextInput
                label="Compatible Models"
                name="compatible_models"
                value={form.compatible_models}
                onChange={handleChange}
                placeholder="Yamaha Aerox 155, Honda Click 125i"
                helper="Separate each motorcycle model with a comma."
              />

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
