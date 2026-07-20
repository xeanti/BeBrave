import { confirmAction } from '../../components/ConfirmModal';
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

const DEFAULT_PAGE_SIZE = 6;
const PAGE_SIZE_OPTIONS = [6, 12, 24];
const MAX_SERVICE_PRICE = 999999;
const MAX_SERVICE_DURATION_MINUTES = 1440;
const MIN_MOTORCYCLE_YEAR = 1980;
const MAX_MOTORCYCLE_YEAR = new Date().getFullYear() + 1;
const MAX_MODEL_IMAGE_SIZE_MB = 5;
const MODEL_REFERENCE_BUCKET = 'motorcycle-photos';
const ALLOWED_MODEL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_MODEL_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

function cleanInlineText(value, maxLength = 120) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanMultilineText(value, maxLength = 500) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function sanitizeServiceNameInput(value) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&#]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 80);
}

function sanitizeServiceDescriptionInput(value) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&#:\n]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart()
    .slice(0, 500);
}

function sanitizeMotorcycleTextInput(value) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 80);
}

function sanitizeYearRangeInput(value) {
  const normalized = String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[^0-9-]/g, '');

  const firstHyphen = normalized.indexOf('-');

  if (firstHyphen === -1) {
    return normalized.slice(0, 4);
  }

  const start = normalized.slice(0, firstHyphen).replace(/\D/g, '').slice(0, 4);
  const end = normalized.slice(firstHyphen + 1).replace(/\D/g, '').slice(0, 4);

  return `${start}-${end}`.slice(0, 9);
}

function validateYearRange(value) {
  const raw = sanitizeYearRangeInput(value).trim();

  if (!raw) return { value: '' };

  if (!/^\d{4}(-\d{4})?$/.test(raw)) {
    return {
      error: 'Year range must be a valid year or range, e.g. 2021 or 2021-2024.',
    };
  }

  const [startText, endText] = raw.split('-');
  const startYear = Number(startText);
  const endYear = endText ? Number(endText) : null;

  if (
    !Number.isInteger(startYear) ||
    startYear < MIN_MOTORCYCLE_YEAR ||
    startYear > MAX_MOTORCYCLE_YEAR
  ) {
    return {
      error: `Motorcycle year must be between ${MIN_MOTORCYCLE_YEAR} and ${MAX_MOTORCYCLE_YEAR}.`,
    };
  }

  if (endText) {
    if (
      !Number.isInteger(endYear) ||
      endYear < MIN_MOTORCYCLE_YEAR ||
      endYear > MAX_MOTORCYCLE_YEAR
    ) {
      return {
        error: `Motorcycle year range must end between ${MIN_MOTORCYCLE_YEAR} and ${MAX_MOTORCYCLE_YEAR}.`,
      };
    }

    if (endYear < startYear) {
      return {
        error: 'Motorcycle year range end year cannot be earlier than the start year.',
      };
    }
  }

  return {
    value: endText ? `${startYear}-${endYear}` : `${startYear}`,
  };
}

function cleanMoney(value) {
  const raw = String(value ?? '').replace(/,/g, '').trim();

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;

  const amount = Number(raw);

  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_SERVICE_PRICE) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function cleanDuration(value) {
  const raw = String(value ?? '').trim();

  if (!/^\d+$/.test(raw)) return null;

  const duration = Number.parseInt(raw, 10);

  if (
    !Number.isInteger(duration) ||
    duration <= 0 ||
    duration > MAX_SERVICE_DURATION_MINUTES
  ) {
    return null;
  }

  return duration;
}

function cleanUrl(value) {
  const raw = cleanInlineText(value, 500);

  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (!['http:', 'https:'].includes(url.protocol)) return null;

    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeFileStem(name) {
  return String(name || 'motorcycle-model')
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'motorcycle-model';
}

function getSafeImageExtension(file) {
  const ext = String(file?.name || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return ALLOWED_MODEL_IMAGE_EXTENSIONS.includes(ext) ? ext : '';
}

function cleanUploadedModelImageUrl(value) {
  const raw = cleanInlineText(value, 500);

  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (!['http:', 'https:'].includes(url.protocol)) return null;

    const expectedPath = `/storage/v1/object/public/${MODEL_REFERENCE_BUCKET}/motorcycle-models/`;

    if (!url.pathname.includes(expectedPath)) return null;

    return url.toString();
  } catch {
    return null;
  }
}

async function uploadMotorcycleModelImageFile({
  file,
  bucket = MODEL_REFERENCE_BUCKET,
  folder = 'motorcycle-models',
}) {
  if (!file) return '';

  if (!ALLOWED_MODEL_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Please upload JPG, PNG, WEBP, or GIF only.');
  }

  const fileExt = getSafeImageExtension(file);

  if (!fileExt) {
    throw new Error('Invalid image file extension. Upload JPG, PNG, WEBP, or GIF only.');
  }

  const maxBytes = MAX_MODEL_IMAGE_SIZE_MB * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new Error(`Image is too large. Maximum size is ${MAX_MODEL_IMAGE_SIZE_MB}MB.`);
  }

  const safeStem = sanitizeFileStem(file.name);
  const filePath = `${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${safeStem}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error('Image uploaded, but public URL could not be generated.');
  }

  return data.publicUrl;
}

function limitMoneyInput(value) {
  const cleaned = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^0-9.]/g, '');

  const parts = cleaned.split('.');
  const pesos = (parts[0] || '').slice(0, 6);
  const cents = parts.length > 1 ? `.${parts.slice(1).join('').slice(0, 2)}` : '';

  return `${pesos}${cents}`;
}

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

function PaginationControls({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}) {
  if (totalItems <= DEFAULT_PAGE_SIZE && totalPages <= 1) return null;

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) =>
      page === 1 ||
      page === totalPages ||
      Math.abs(page - currentPage) <= 1
  );

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-black text-gray-950 dark:text-white">
          Page {currentPage} of {totalPages}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {totalItems} record{totalItems === 1 ? '' : 's'} found
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
          >
            Prev
          </button>

          {pageNumbers.map((page, index) => {
            const previousPage = pageNumbers[index - 1];
            const showGap = previousPage && page - previousPage > 1;

            return (
              <span key={page} className="flex items-center gap-2">
                {showGap && (
                  <span className="px-1 text-xs font-black text-gray-400">...</span>
                )}
                <button
                  type="button"
                  onClick={() => onPageChange(page)}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                    page === currentPage
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : 'border border-gray-200 text-gray-700 hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400'
                  }`}
                >
                  {page}
                </button>
              </span>
            );
          })}

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminServices() {
  // Motorcycle model reference photo now uses sanitized file upload.
  // Strong input sanitation is applied before every save.
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('services');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

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
  const [uploadingModelImage, setUploadingModelImage] = useState(false);

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
    setCurrentPage(1);
    closePanel();
  }

  function openAddPanel() {
    setEditingId(null);
    setFormError('');
    setUploadingModelImage(false);

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
    setUploadingModelImage(false);

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
    setUploadingModelImage(false);
    setServiceForm(EMPTY_SERVICE_FORM);
    setModelForm(EMPTY_MODEL_FORM);
  }

  function handleServiceChange(event) {
    const { name, value } = event.target;
    let nextValue = value;

    if (name === 'base_price' || name === 'labor_cost') {
      nextValue = limitMoneyInput(value);
    } else if (name === 'estimated_duration_minutes') {
      nextValue = String(value ?? '').replace(/[^0-9]/g, '').slice(0, 4);
    } else if (name === 'name') {
      nextValue = sanitizeServiceNameInput(value);
    } else if (name === 'description') {
      nextValue = sanitizeServiceDescriptionInput(value);
    }

    setServiceForm({
      ...serviceForm,
      [name]: nextValue,
    });
  }

  function handleModelChange(event) {
    const { name, value } = event.target;
    let nextValue = value;

    if (name === 'make' || name === 'model') {
      nextValue = sanitizeMotorcycleTextInput(value);
    } else if (name === 'year_range') {
      nextValue = sanitizeYearRangeInput(value);
    }

    setModelForm({
      ...modelForm,
      [name]: nextValue,
    });
  }

  async function handleModelReferenceUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploadingModelImage(true);
    setFormError('');

    try {
      const publicUrl = await uploadMotorcycleModelImageFile({
        file,
        bucket: MODEL_REFERENCE_BUCKET,
        folder: 'motorcycle-models',
      });

      setModelForm((current) => ({
        ...current,
        reference_photo_url: publicUrl,
      }));

      setToast('✓ Motorcycle reference image uploaded');
    } catch (err) {
      setFormError(err.message || 'Failed to upload motorcycle reference image.');
    } finally {
      setUploadingModelImage(false);
      event.target.value = '';
    }
  }

  async function removeModelReferencePhoto() {
    const confirmed = await confirmAction('Remove the uploaded motorcycle reference photo?');

    if (!confirmed) return;

    setModelForm((current) => ({
      ...current,
      reference_photo_url: '',
    }));
  }

  function getCleanServicePayload() {
    const name = sanitizeServiceNameInput(serviceForm.name).trim();
    const description = sanitizeServiceDescriptionInput(serviceForm.description).trim();
    const basePrice = cleanMoney(serviceForm.base_price);
    const laborCost = cleanMoney(serviceForm.labor_cost || '0');
    const duration = cleanDuration(serviceForm.estimated_duration_minutes || '60');

    if (!name) return { error: 'Service name is required.' };
    if (basePrice === null) return { error: 'Please enter a valid base price from 0 to 999999.' };
    if (laborCost === null) return { error: 'Please enter a valid labor cost from 0 to 999999.' };
    if (duration === null) {
      return { error: 'Duration must be 1 to 1440 minutes only.' };
    }

    return {
      payload: {
        name,
        description: description || null,
        base_price: basePrice,
        labor_cost: laborCost,
        estimated_duration_minutes: duration,
      },
    };
  }

  function getCleanModelPayload() {
    const make = sanitizeMotorcycleTextInput(modelForm.make).trim();
    const model = sanitizeMotorcycleTextInput(modelForm.model).trim();
    const { value: yearRange, error: yearError } = validateYearRange(modelForm.year_range);
    const referencePhotoUrl = cleanUploadedModelImageUrl(modelForm.reference_photo_url);

    if (!make) return { error: 'Motorcycle make is required.' };
    if (!model) return { error: 'Motorcycle model is required.' };
    if (yearError) return { error: yearError };

    if (modelForm.reference_photo_url && !referencePhotoUrl) {
      return {
        error: 'Invalid motorcycle reference image. Please upload the image again.',
      };
    }

    return {
      payload: {
        make,
        model,
        year_range: yearRange || null,
        reference_photo_url: referencePhotoUrl,
      },
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setFormError('');

    try {
      if (activeTab === 'services') {
        const { payload, error: validationError } = getCleanServicePayload();

        if (validationError) {
          setFormError(validationError);
          setSaving(false);
          return;
        }

        const confirmed = await confirmAction(
          editingId
            ? `Save changes to service "${payload.name}"?`
            : `Add new service "${payload.name}"?`
        );

        if (!confirmed) {
          setSaving(false);
          return;
        }

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
        const { payload, error: validationError } = getCleanModelPayload();

        if (validationError) {
          setFormError(validationError);
          setSaving(false);
          return;
        }

        const confirmed = await confirmAction(
          editingId
            ? `Save changes to motorcycle model "${payload.make} ${payload.model}"?`
            : `Add new motorcycle model "${payload.make} ${payload.model}"?`
        );

        if (!confirmed) {
          setSaving(false);
          return;
        }

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
  const serviceName = cleanInlineText(service.name, 80) || 'this service';
  const nextActive = !service.is_active;
  const actionText = nextActive ? 'activate' : 'set inactive';

  const confirmed = await confirmAction(
    `Are you sure you want to ${actionText} "${serviceName}"?`
  );

  if (!confirmed) return;

  setTogglingId(service.id);

  try {
    const { error } = await supabase
      .from('services')
      .update({ is_active: nextActive })
      .eq('id', service.id);

    if (error) throw error;

    await insertAuditLog('TOGGLE_SERVICE_ACTIVE', 'services', service.id, {
      is_active: nextActive,
    });

    setToast(nextActive ? `✓ ${serviceName} activated` : `${serviceName} set inactive`);
    await fetchServices(false);
  } catch (err) {
    setFetchError(err.message || 'Failed to update service status.');
  } finally {
    setTogglingId(null);
  }
  }

  async function deleteService(service) {
    const serviceName = cleanInlineText(service.name, 80) || 'this service';
    const confirmed = await confirmAction(
      `Delete "${serviceName}"?

This action cannot be undone. If this service is already used by bookings, the database may block the delete.`
    );

    if (!confirmed) return;

    setDeletingId(service.id);

    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', service.id);

      if (error) throw error;

      await insertAuditLog('DELETE_SERVICE', 'services', service.id, {
        name: serviceName,
      });

      setToast(`Deleted ${serviceName}`);
      await fetchServices(false);
    } catch (err) {
      setFetchError(err.message || 'Failed to delete service.');
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteModel(model) {
    const modelName = cleanInlineText(`${model.make || ''} ${model.model || ''}`, 160) || 'this model';
    const confirmed = await confirmAction(
      `Delete "${modelName}"?

This action cannot be undone. If this model is already used by records, the database may block the delete.`
    );

    if (!confirmed) return;

    setDeletingId(model.id);

    try {
      const { error } = await supabase
        .from('motorcycle_models')
        .delete()
        .eq('id', model.id);

      if (error) throw error;

      await insertAuditLog('DELETE_MOTORCYCLE_MODEL', 'motorcycle_models', model.id, {
        make: cleanInlineText(model.make, 80),
        model: cleanInlineText(model.model, 80),
      });

      setToast(`Deleted ${modelName}`);
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
  const totalPages = Math.max(1, Math.ceil(currentCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, currentCount);
  const paginatedServices = filteredServices.slice(startIndex, endIndex);
  const paginatedModels = filteredModels.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder={`Search ${activeTab === 'services' ? 'services' : 'models'}...`}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-sm font-black text-gray-400 transition hover:text-gray-900 dark:hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mb-4 text-sm font-semibold text-gray-500 dark:text-gray-400">
          Showing {currentCount === 0 ? '0' : `${startIndex + 1}-${endIndex}`} of {currentCount}{' '}
          {activeTab === 'services' ? 'services' : 'models'}
          {currentCount !== totalCount ? ` (${totalCount} total)` : ''}
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
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                {paginatedServices.map((service) => {
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

                <PaginationControls
                  currentPage={safeCurrentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={currentCount}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </>
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
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedModels.map((model) => (
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

                <PaginationControls
                  currentPage={safeCurrentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={currentCount}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </>
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
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving && !uploadingModelImage) {
              closePanel();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-service-modal-title"
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-dark-700 dark:bg-dark-800"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-dark-700 dark:bg-dark-800 sm:px-8">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">
                  {activeTab === 'services' ? 'Service Management' : 'Motorcycle Catalog'}
                </p>
                <h2
                  id="admin-service-modal-title"
                  className="mt-1 text-xl font-black text-gray-950 dark:text-white"
                >
                  {editingId
                    ? `Edit ${activeTab === 'services' ? 'Service' : 'Motorcycle Model'}`
                    : `Add New ${activeTab === 'services' ? 'Service' : 'Motorcycle Model'}`}
                </h2>
              </div>

              <button
                type="button"
                onClick={closePanel}
                className="grid h-10 w-10 place-items-center rounded-2xl text-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-8">
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
                    maxLength={80}
                    placeholder="e.g. Oil Change"
                    helper="Letters, numbers, spaces, and basic symbols only."
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <TextInput
                      label="Base Price *"
                      name="base_price"
                      type="text"
                      inputMode="decimal"
                      value={serviceForm.base_price}
                      onChange={handleServiceChange}
                      required
                      helper="Numbers only, up to 2 decimal places."
                    />

                    <TextInput
                      label="Labor Cost"
                      name="labor_cost"
                      type="text"
                      inputMode="decimal"
                      value={serviceForm.labor_cost}
                      onChange={handleServiceChange}
                      helper="Numbers only, up to 2 decimal places."
                    />
                  </div>

                  <TextInput
                    label="Duration"
                    name="estimated_duration_minutes"
                    type="text"
                    inputMode="numeric"
                    value={serviceForm.estimated_duration_minutes}
                    onChange={handleServiceChange}
                    helper="Estimated duration in minutes. Numbers only, 1-1440."
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
                      maxLength={500}
                      placeholder="Briefly describe what this service includes..."
                      className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Reference Photo Upload
                    </label>

                    <div className="flex items-start gap-3">
                      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                        {modelForm.reference_photo_url ? (
                          <img
                            src={modelForm.reference_photo_url}
                            alt="Motorcycle reference"
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-3xl text-gray-400">
                            🏍️
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleModelReferenceUpload}
                          disabled={uploadingModelImage}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-primary-600 file:px-4 file:py-2 file:text-xs file:font-black file:text-white hover:file:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                        />

                        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                          Upload a motorcycle reference image instead of pasting a URL. JPG, PNG, WEBP, or GIF up to {MAX_MODEL_IMAGE_SIZE_MB}MB.
                        </p>

                        {uploadingModelImage && (
                          <p className="mt-2 text-xs font-black text-primary-600 dark:text-primary-400">
                            Uploading image...
                          </p>
                        )}

                        {modelForm.reference_photo_url && (
                          <button
                            type="button"
                            onClick={removeModelReferencePhoto}
                            className="mt-3 rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20"
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <TextInput
                      label="Make *"
                      name="make"
                      value={modelForm.make}
                      onChange={handleModelChange}
                      required
                      maxLength={80}
                      placeholder="e.g. Yamaha"
                      helper="Letters, numbers, spaces, and basic symbols only."
                    />

                    <TextInput
                      label="Model *"
                      name="model"
                      value={modelForm.model}
                      onChange={handleModelChange}
                      required
                      maxLength={80}
                      placeholder="e.g. Aerox 155"
                      helper="Letters, numbers, spaces, and basic symbols only."
                    />
                  </div>

                  <TextInput
                    label="Year Range"
                    name="year_range"
                    value={modelForm.year_range}
                    onChange={handleModelChange}
                    maxLength={9}
                    placeholder="e.g. 2021 or 2021-2024"
                    helper={`Use a 4-digit year or range only. Allowed years: ${MIN_MOTORCYCLE_YEAR}-${MAX_MOTORCYCLE_YEAR}.`}
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
          </section>
        </div>
      )}
    </div>
  );
}
