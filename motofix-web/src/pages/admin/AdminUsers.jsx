import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const ROLE_CONFIG = {
  customer: {
    label: 'Customer',
    icon: '👤',
    classes:
      'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
  },
  mechanic: {
    label: 'Mechanic',
    icon: '🔧',
    classes:
      'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25',
  },
  staff: {
    label: 'Staff / Cashier',
    icon: '🧑‍💼',
    classes:
      'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/25',
  },
  admin: {
    label: 'Admin',
    icon: '🛡️',
    classes:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  },
  super_admin: {
    label: 'Super Admin',
    icon: '👑',
    classes:
      'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25',
  },
};

const EMPTY_NEW_ACCOUNT = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  role: 'mechanic',
};

const SHOP_OPEN = 8;
const SHOP_CLOSE = 17;
const MAX_CERT_SIZE_MB = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const ALLOWED_ROLES = ['customer', 'mechanic', 'staff', 'admin', 'super_admin'];
const ALLOWED_CREATE_ROLES = ['mechanic', 'staff', 'admin', 'super_admin'];
const ALLOWED_ROLE_FILTERS = ['all', ...ALLOWED_ROLES];
const ALLOWED_STATUS_FILTERS = ['active', 'inactive', 'all'];
const ALLOWED_SORT_OPTIONS = ['newest', 'oldest', 'name_asc', 'name_desc', 'role_asc'];
const ALLOWED_BOOKING_STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const ALLOWED_CERT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
const MAX_PASSWORD_LENGTH = 72;

const STATUS_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'all', label: 'All Status' },
];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'name_asc', label: 'Name A-Z' },
  { key: 'name_desc', label: 'Name Z-A' },
  { key: 'role_asc', label: 'Role A-Z' },
];


function generateTimeSlots() {
  const slots = [];

  for (let hour = SHOP_OPEN; hour < SHOP_CLOSE; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }

  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function normalizeBookingTime(time) {
  if (!time) return '';

  const value = String(time);

  if (value.includes('T')) {
    return value.split('T')[1]?.slice(0, 5) || '';
  }

  return value.slice(0, 5);
}

function formatScheduleTime(time) {
  const normalized = normalizeBookingTime(time);
  if (!normalized) return 'No time';

  const [h, m = '00'] = normalized.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  return `${display}:${m} ${ampm}`;
}

function formatScheduleDate(date) {
  if (!date) return 'No date';

  const [year, month, day] = String(date).split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

function collapseSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trimStart();
}

function sanitizeSearch(value) {
  return collapseSpaces(value)
    .replace(/[^a-zA-Z0-9ñÑ @._+\-]/g, '')
    .slice(0, 80);
}

function sanitizeName(value) {
  return collapseSpaces(value)
    .replace(/[^a-zA-ZñÑ .'-]/g, '')
    .slice(0, 50);
}

function sanitizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._+\-]/g, '')
    .slice(0, 120);
}

function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function sanitizeSpecialization(value) {
  return collapseSpaces(value)
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&#]/g, '')
    .slice(0, 80);
}

function sanitizeMotorcycleText(value) {
  return collapseSpaces(value)
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&]/g, '')
    .slice(0, 60);
}

function sanitizeYear(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function sanitizeCertName(value) {
  return collapseSpaces(value)
    .replace(/[^a-zA-Z0-9ñÑ .,'’()\-/+&#]/g, '')
    .slice(0, 80);
}

function sanitizePasswordInput(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, MAX_PASSWORD_LENGTH);
}

function sanitizeSelect(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function sanitizeRole(value) {
  return sanitizeSelect(value, ALLOWED_ROLES, 'customer');
}

function sanitizeCreateRole(value) {
  return sanitizeSelect(value, ALLOWED_CREATE_ROLES, 'mechanic');
}

function sanitizeRoleFilter(value) {
  return sanitizeSelect(value, ALLOWED_ROLE_FILTERS, 'all');
}

function sanitizeStatusFilter(value) {
  return sanitizeSelect(value, ALLOWED_STATUS_FILTERS, 'active');
}

function sanitizeSortOption(value) {
  return sanitizeSelect(value, ALLOWED_SORT_OPTIONS, 'newest');
}

function sanitizeBookingStatus(value) {
  return sanitizeSelect(value, ALLOWED_BOOKING_STATUSES, 'pending');
}

function sanitizePageSize(value) {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : 10;
}

function sanitizeDate(value) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function sanitizeBookingTime(value) {
  const time = normalizeBookingTime(value);
  return TIME_SLOTS.includes(time) ? time : '';
}

function sanitizeCertExtension(value) {
  const ext = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_CERT_EXTENSIONS.includes(ext) ? ext : '';
}

function getCertExtension(file) {
  return sanitizeCertExtension(file?.name?.split('.').pop());
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizeEmail(value));
}

function isValidPhilippineMobile(value) {
  if (!value) return true;
  return /^09\d{9}$/.test(value);
}

function isPrivilegedRole(role) {
  return ['admin', 'super_admin'].includes(role);
}

function canManagePrivilegedAccount({ currentIsSuperAdmin, targetRole }) {
  if (!isPrivilegedRole(targetRole)) return true;
  return currentIsSuperAdmin === true;
}

function getStatusFilterLabel(value) {
  const match = STATUS_FILTERS.find((item) => item.key === value);
  return match?.label || 'Active';
}

function getSortLabel(value) {
  const match = SORT_OPTIONS.find((item) => item.key === value);
  return match?.label || 'Newest First';
}

function getFullName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return name || 'Unnamed User';
}

function getInitials(profile) {
  const first = profile?.first_name?.[0] || '';
  const last = profile?.last_name?.[0] || '';

  return `${first}${last}`.toUpperCase() || '?';
}

function isImageFile(url = '') {
  return /\.(png|jpe?g|webp)(\?.*)?$/i.test(url);
}

function isValidCertFile(file) {
  if (!file) return false;

  const validType = file.type.startsWith('image/') || file.type === 'application/pdf';
  const validExt = Boolean(getCertExtension(file));
  const validSize = file.size <= MAX_CERT_SIZE_MB * 1024 * 1024;

  return validType && validExt && validSize;
}

function RoleBadge({ role }) {
  const config = ROLE_CONFIG[role] || {
    label: role || 'User',
    icon: '👤',
    classes:
      'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${config.classes}`}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

function Avatar({ profile, size = 'md' }) {
  const sizes = {
    sm: 'h-10 w-10 text-sm',
    md: 'h-12 w-12 text-base',
    lg: 'h-16 w-16 text-lg',
  };

  if (profile?.profile_photo_url) {
    return (
      <img
        src={profile.profile_photo_url}
        alt={getFullName(profile)}
        className={`${sizes[size]} flex-shrink-0 rounded-2xl object-cover ring-1 ring-gray-200 dark:ring-dark-700`}
      />
    );
  }

  return (
    <div className={`${sizes[size]} grid flex-shrink-0 place-items-center rounded-2xl bg-primary-600 font-black text-white shadow-sm shadow-primary-600/20`}>
      {getInitials(profile)}
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

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    green: 'text-green-600 dark:text-green-300',
    blue: 'text-blue-600 dark:text-blue-300',
    purple: 'text-purple-600 dark:text-purple-300',
    red: 'text-red-600 dark:text-red-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
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

function PaginationControls({
  currentPage,
  totalPages,
  pageSize,
  onPageSizeChange,
  onFirst,
  onPrevious,
  onNext,
  onLast,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-b-3xl border-t border-gray-100 bg-gray-50 px-5 py-4 dark:border-dark-700 dark:bg-dark-900/60 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Per page
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(sanitizePageSize(event.target.value))}
          className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-black text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onFirst}
          disabled={currentPage <= 1}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
        >
          First
        </button>

        <button
          type="button"
          onClick={onPrevious}
          disabled={currentPage <= 1}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
        >
          Prev
        </button>

        <span className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-gray-700 ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-700">
          {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
        >
          Next
        </button>

        <button
          type="button"
          onClick={onLast}
          disabled={currentPage >= totalPages}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300"
        >
          Last
        </button>
      </div>
    </div>
  );
}

function UserSkeleton() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="flex gap-3 border-b border-gray-100 p-5 last:border-b-0 dark:border-dark-700">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-900" />
          <div className="flex-1">
            <div className="mb-2 h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
            <div className="h-3 w-64 animate-pulse rounded bg-gray-100 dark:bg-dark-900" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminUsers() {
  const { user, profile: authProfile } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [toast, setToast] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_NEW_ACCOUNT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [showPolicy, setShowPolicy] = useState(false);

  const [selectedMechanicId, setSelectedMechanicId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [updatingScheduleId, setUpdatingScheduleId] = useState(null);

  const [certificates, setCertificates] = useState({});
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);
  const [loadingCerts, setLoadingCerts] = useState(false);

  useEffect(() => {
    fetchUsers();

    /*
      Realtime refresh for users page.
      Enable Realtime in Supabase for profiles, bookings, and mechanic_certificates.
    */
    const profilesChannel = supabase
      .channel('admin-users-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => fetchUsers(false)
      )
      .subscribe();

    const bookingsChannel = supabase
      .channel('admin-users-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => {
          fetchUsers(false);
          if (selectedMechanicId) fetchMechanicSchedule(selectedMechanicId, false);
        }
      )
      .subscribe();

    const certsChannel = supabase
      .channel('admin-users-certificates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mechanic_certificates',
        },
        () => {
          if (selectedMechanicId) fetchCertificates(selectedMechanicId, false);
        }
      )
      .subscribe();

    const handleFocus = () => {
      fetchUsers(false);
      if (selectedMechanicId) {
        fetchMechanicSchedule(selectedMechanicId, false);
        fetchCertificates(selectedMechanicId, false);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchUsers(false);
        if (selectedMechanicId) {
          fetchMechanicSchedule(selectedMechanicId, false);
          fetchCertificates(selectedMechanicId, false);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(certsChannel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedMechanicId]);

  useEffect(() => {
    if (!toast) return;

    const timeout = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, statusFilter, sortBy, pageSize]);

  async function fetchUsers(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('profiles')
      .select('*, bookings!bookings_mechanic_id_fkey(id, status)')
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError(error.message || 'Failed to load users.');
      setUsers([]);
      setLoading(false);
      return;
    }

    setUsers(data || []);
    setLastUpdated(new Date());
    setLoading(false);
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

  async function fetchMechanicSchedule(mechanicId, showLoader = true) {
    if (showLoader) setLoadingSchedule(true);

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        booking_time,
        status,
        notes,
        profiles!bookings_customer_id_fkey(first_name, last_name),
        services(name, estimated_duration_minutes)
      `)
      .eq('mechanic_id', mechanicId)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (!error) setSchedules(data || []);
    setLoadingSchedule(false);
  }

  async function updateSchedule(bookingId, updates) {
    const cleanUpdates = {};

    if (Object.prototype.hasOwnProperty.call(updates, 'booking_date')) {
      const cleanDate = sanitizeDate(updates.booking_date);
      if (!cleanDate) {
        setToast('❌ Invalid booking date.');
        return;
      }
      cleanUpdates.booking_date = cleanDate;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'booking_time')) {
      const cleanTime = sanitizeBookingTime(updates.booking_time);
      if (!cleanTime) {
        setToast('❌ Invalid booking time.');
        return;
      }
      cleanUpdates.booking_time = cleanTime;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      cleanUpdates.status = sanitizeBookingStatus(updates.status);
    }

    if (Object.keys(cleanUpdates).length === 0) return;

    const changeText = Object.entries(cleanUpdates)
      .map(([key, value]) => `${key.replace('_', ' ')}: ${value}`)
      .join(', ');

    if (!window.confirm(`Update this mechanic schedule? ${changeText}`)) {
      return;
    }

    setUpdatingScheduleId(bookingId);

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          ...cleanUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) throw error;

      await insertAuditLog('UPDATE_MECHANIC_SCHEDULE', 'bookings', bookingId, cleanUpdates);
      await fetchMechanicSchedule(selectedMechanicId, false);
      await fetchUsers(false);
      setToast('Schedule updated.');
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to update schedule.'}`);
    } finally {
      setUpdatingScheduleId(null);
    }
  }

  async function removeFromSchedule(bookingId) {
    if (!window.confirm('Unassign this mechanic from the booking?')) return;

    setUpdatingScheduleId(bookingId);

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          mechanic_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) throw error;

      await insertAuditLog('UNASSIGN_MECHANIC_FROM_BOOKING', 'bookings', bookingId, {
        mechanic_id: selectedMechanicId,
      });

      await fetchMechanicSchedule(selectedMechanicId, false);
      await fetchUsers(false);
      setToast('Mechanic unassigned from booking.');
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to unassign mechanic.'}`);
    } finally {
      setUpdatingScheduleId(null);
    }
  }

  async function fetchCertificates(mechanicId, showLoader = true) {
    if (showLoader) setLoadingCerts(true);

    const { data, error } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });

    if (!error) {
      setCertificates((previous) => ({
        ...previous,
        [mechanicId]: data || [],
      }));
    }

    setLoadingCerts(false);
  }

  function handleCertFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setCertError('');

    if (!isValidCertFile(file)) {
      setCertError(`Please upload JPG, PNG, WEBP, or PDF up to ${MAX_CERT_SIZE_MB}MB.`);
      return;
    }

    setCertFile(file);

    if (!certName) {
      setCertName(sanitizeCertName(file.name.replace(/\.[^/.]+$/, '')));
    }
  }

  async function handleUploadCertificate(event, mechanicId) {
    event.preventDefault();

    setCertError('');

    const cleanCertificateName = sanitizeCertName(certName).trim();

    if (!cleanCertificateName) {
      setCertError('Please enter a certificate name.');
      return;
    }

    if (!certFile) {
      setCertError('Please choose a file to upload.');
      return;
    }

    if (!isValidCertFile(certFile)) {
      setCertError(`Please upload JPG, PNG, WEBP, or PDF up to ${MAX_CERT_SIZE_MB}MB.`);
      return;
    }

    if (!window.confirm(`Upload certificate "${cleanCertificateName}" for this mechanic?`)) {
      return;
    }

    setUploadingCert(true);

    try {
      const fileExt = getCertExtension(certFile);

      if (!fileExt) {
        throw new Error('Invalid certificate file type. Upload JPG, PNG, WEBP, or PDF only.');
      }

      const filePath = `${mechanicId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('mechanic-certificates')
        .upload(filePath, certFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('mechanic-certificates')
        .getPublicUrl(filePath);

      const { data, error: insertError } = await supabase
        .from('mechanic_certificates')
        .insert({
          mechanic_id: mechanicId,
          name: cleanCertificateName,
          file_url: urlData.publicUrl,
          uploaded_by: user?.id,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      await insertAuditLog('UPLOAD_MECHANIC_CERTIFICATE', 'mechanic_certificates', data?.id || mechanicId, {
        name: cleanCertificateName,
        mechanic_id: mechanicId,
      });

      setCertName('');
      setCertFile(null);
      await fetchCertificates(mechanicId, false);
      setToast('Certificate uploaded.');
    } catch (err) {
      setCertError(err.message || 'Failed to upload certificate.');
    } finally {
      setUploadingCert(false);
    }
  }

  async function deleteCertificate(cert) {
    if (!window.confirm(`Delete certificate "${cert.name}"?`)) return;

    setDeletingCertId(cert.id);

    try {
      const { error } = await supabase
        .from('mechanic_certificates')
        .delete()
        .eq('id', cert.id);

      if (error) throw error;

      await insertAuditLog('DELETE_MECHANIC_CERTIFICATE', 'mechanic_certificates', cert.id, {
        name: cert.name,
        mechanic_id: cert.mechanic_id,
      });

      await fetchCertificates(cert.mechanic_id, false);
      setToast('Certificate deleted.');
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to delete certificate.'}`);
    } finally {
      setDeletingCertId(null);
    }
  }

  function openEdit(profile) {
    if (
      !canManagePrivilegedAccount({
        currentIsSuperAdmin: isCurrentUserSuperAdmin,
        targetRole: profile.role,
      })
    ) {
      setToast('❌ Only super admins can edit admin and super admin accounts.');
      return;
    }

    setEditingUser(profile);
    setEditForm({
      first_name: sanitizeName(profile.first_name || ''),
      last_name: sanitizeName(profile.last_name || ''),
      phone: sanitizePhone(profile.phone || ''),
      role: sanitizeRole(profile.role || 'customer'),
      specialization: sanitizeSpecialization(profile.specialization || ''),
      moto_make: sanitizeMotorcycleText(profile.moto_make || ''),
      moto_model: sanitizeMotorcycleText(profile.moto_model || ''),
      moto_year: sanitizeYear(profile.moto_year || ''),
    });

    setEditError('');
    setEditSuccess('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setSelectedMechanicId(null);
    setSchedules([]);
  }

  function closeEdit() {
    setEditingUser(null);
    setEditForm({});
    setEditError('');
    setEditSuccess('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setSelectedMechanicId(null);
    setSchedules([]);
  }

  function validateEditForm() {
    const cleanRole = sanitizeRole(editForm.role);
    const cleanPhone = sanitizePhone(editForm.phone);

    if (!sanitizeName(editForm.first_name).trim()) return 'First name is required.';
    if (!sanitizeName(editForm.last_name).trim()) return 'Last name is required.';
    if (!ALLOWED_ROLES.includes(cleanRole)) return 'Role is required.';

    if (cleanPhone && !isValidPhilippineMobile(cleanPhone)) {
      return 'Phone number must be 11 digits and start with 09.';
    }

    if (editForm.moto_year) {
      const year = Number(sanitizeYear(editForm.moto_year));
      const nextYear = new Date().getFullYear() + 1;

      if (!/^\d{4}$/.test(sanitizeYear(editForm.moto_year)) || year < 1980 || year > nextYear) {
        return `Motorcycle year must be between 1980 and ${nextYear}.`;
      }
    }

    return '';
  }

  async function handleSaveEdit(event) {
    event.preventDefault();

    setSaving(true);
    setEditError('');
    setEditSuccess('');

    const validationError = validateEditForm();

    if (validationError) {
      setEditError(validationError);
      setSaving(false);
      return;
    }

    if (
      !canManagePrivilegedAccount({
        currentIsSuperAdmin: isCurrentUserSuperAdmin,
        targetRole: editingUser.role,
      })
    ) {
      setEditError('Only super admins can edit admin and super admin accounts.');
      setSaving(false);
      return;
    }

    const cleanRole = sanitizeRole(editForm.role);
    const roleChanged = cleanRole !== editingUser.role;

    if (isPrivilegedRole(cleanRole) && !isCurrentUserSuperAdmin) {
      setEditError('Only super admins can assign admin or super admin roles.');
      setSaving(false);
      return;
    }

    if (
      roleChanged &&
      editingUser.role === 'super_admin' &&
      cleanRole !== 'super_admin' &&
      activeSuperAdminCount <= 1
    ) {
      setEditError('At least one active super admin account must remain.');
      setSaving(false);
      return;
    }

    if (roleChanged && !isCurrentUserSuperAdmin) {
      setEditError('Only super admins can change user roles.');
      setSaving(false);
      return;
    }

    if (roleChanged && editingUser.id === user?.id) {
      setEditError('You cannot change your own role.');
      setSaving(false);
      return;
    }

    if (
      roleChanged &&
      !window.confirm(`Change ${getFullName(editingUser)} from ${editingUser.role} to ${cleanRole}?`)
    ) {
      setSaving(false);
      return;
    }

    if (!roleChanged) {
      const confirmed = window.confirm(
        `Save profile changes for ${getFullName(editingUser)}?`
      );

      if (!confirmed) {
        setSaving(false);
        return;
      }
    }

    const payload = {
      first_name: sanitizeName(editForm.first_name).trim(),
      last_name: sanitizeName(editForm.last_name).trim(),
      phone: sanitizePhone(editForm.phone) || null,
      specialization:
        cleanRole === 'mechanic' ? sanitizeSpecialization(editForm.specialization).trim() || null : null,
      moto_make: cleanRole === 'customer' ? sanitizeMotorcycleText(editForm.moto_make).trim() || null : null,
      moto_model: cleanRole === 'customer' ? sanitizeMotorcycleText(editForm.moto_model).trim() || null : null,
      moto_year:
        cleanRole === 'customer' && editForm.moto_year
          ? parseInt(sanitizeYear(editForm.moto_year), 10)
          : null,
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUser.id);

      if (error) throw error;

      if (roleChanged) {
        const { error: roleError } = await supabase.rpc('change_user_role', {
          target_user_id: editingUser.id,
          new_role: cleanRole,
        });

        if (roleError) throw roleError;
      }

      await insertAuditLog('UPDATE_USER_PROFILE', 'profiles', editingUser.id, {
        role: roleChanged ? cleanRole : editingUser.role,
        name: `${payload.first_name} ${payload.last_name}`,
        role_changed: roleChanged,
        old_role: editingUser.role,
        new_role: cleanRole,
      });

      setEditSuccess('Profile updated successfully!');
      await fetchUsers(false);

      setEditingUser((previous) => ({
        ...previous,
        ...payload,
        role: roleChanged ? cleanRole : previous.role,
      }));
    } catch (err) {
      setEditError(err.message || 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();

    setPasswordError('');
    setPasswordSuccess('');

    if (!isCurrentUserSuperAdmin) {
      setPasswordError('Only super admins can change user passwords from this page.');
      return;
    }

    if (editingUser?.id === user?.id) {
      setPasswordError('Use your own Profile page to change your password.');
      return;
    }

    const cleanPassword = sanitizePasswordInput(newPassword);
    const cleanConfirmPassword = sanitizePasswordInput(confirmNewPassword);

    if (!cleanPassword) {
      setPasswordError('Please enter a new password.');
      return;
    }

    if (cleanPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }

    if (cleanPassword.length > MAX_PASSWORD_LENGTH) {
      setPasswordError(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (cleanPassword !== cleanConfirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    if (!window.confirm(`Change password for ${getFullName(editingUser)}?`)) {
      return;
    }

    setChangingPassword(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: {
          userId: editingUser.id,
          newPassword: cleanPassword,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await insertAuditLog('ADMIN_CHANGE_PASSWORD', 'profiles', editingUser.id, {
        email: editingUser.email,
      });

      setPasswordSuccess('Password changed successfully!');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleDemote(userId, currentRole) {
    if (!isCurrentUserSuperAdmin) {
      setToast('❌ Only super admins can change user roles.');
      return;
    }

    if (userId === user?.id) {
      setToast('❌ You cannot change your own role.');
      return;
    }

    if (currentRole === 'super_admin' && activeSuperAdminCount <= 1) {
      setToast('❌ At least one active super admin account must remain.');
      return;
    }

    if (currentRole === 'super_admin') {
      setToast('❌ Use Edit to carefully change another super admin role.');
      return;
    }

    if (!window.confirm(`Remove ${currentRole} access and set to customer?`)) return;

    try {
      const { error } = await supabase.rpc('change_user_role', {
        target_user_id: userId,
        new_role: 'customer',
      });

      if (error) throw error;

      await insertAuditLog('DEMOTE_USER', 'profiles', userId, {
        from_role: currentRole,
        to_role: 'customer',
      });

      await fetchUsers(false);
      setToast('User demoted to customer.');

      if (editingUser?.id === userId) {
        setEditForm((current) => ({
          ...current,
          role: 'customer',
        }));
        setEditingUser((previous) => ({
          ...previous,
          role: 'customer',
        }));
      }
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to demote user.'}`);
    }
  }



  async function handleDeactivateUser(profile) {
    if (!isCurrentUserSuperAdmin) {
      setToast('❌ Only super admins can deactivate user accounts.');
      return;
    }

    if (profile.id === user?.id) {
      setToast('❌ You cannot deactivate your own account.');
      return;
    }

    if (profile.role === 'super_admin') {
      setToast('❌ Super admin accounts cannot be deactivated from this page.');
      return;
    }

    if (profile.is_active === false) {
      setToast('This user is already inactive.');
      return;
    }

    if (
      !window.confirm(
        `Deactivate ${getFullName(profile)}? This user will no longer be allowed to access MotoFix, but their records will be kept.`
      )
    ) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('deactivate-account', {
        body: {
          target_user_id: profile.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await fetchUsers(false);
      setToast('User account deactivated.');

      if (editingUser?.id === profile.id) {
        closeEdit();
      }
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to deactivate user.'}`);
    }
  }


  async function handleReactivateUser(profile) {
    if (!isCurrentUserSuperAdmin) {
      setToast('❌ Only super admins can reactivate user accounts.');
      return;
    }

    if (profile.is_active !== false) {
      setToast('This user is already active.');
      return;
    }

    if (
      !window.confirm(
        `Reactivate ${getFullName(profile)}? This user will be allowed to access MotoFix again.`
      )
    ) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('reactivate-account', {
        body: {
          target_user_id: profile.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await fetchUsers(false);
      setToast('User account reactivated.');
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to reactivate user.'}`);
    }
  }

  async function handleCreateAccount(event) {
    event.preventDefault();

    setCreateError('');
    setCreateSuccess('');

    if (!isCurrentUserSuperAdmin) {
      setCreateError('Only super admins can create personnel accounts from this page.');
      return;
    }

    const cleanFirstName = sanitizeName(newAccount.firstName).trim();
    const cleanLastName = sanitizeName(newAccount.lastName).trim();
    const cleanEmail = sanitizeEmail(newAccount.email);
    const cleanPhone = sanitizePhone(newAccount.phone);
    const cleanRole = sanitizeCreateRole(newAccount.role);
    const cleanPassword = sanitizePasswordInput(newAccount.password);
    const cleanConfirmPassword = sanitizePasswordInput(newAccount.confirmPassword);

    if (!cleanFirstName || !cleanLastName) {
      setCreateError('First name and last name are required.');
      return;
    }

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setCreateError('Please enter a valid email address.');
      return;
    }

    if (cleanPhone && !isValidPhilippineMobile(cleanPhone)) {
      setCreateError('Phone number must be 11 digits and start with 09.');
      return;
    }

    if (cleanPassword !== cleanConfirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }

    if (cleanPassword.length < 6) {
      setCreateError('Password must be at least 6 characters.');
      return;
    }

    if (cleanPassword.length > MAX_PASSWORD_LENGTH) {
      setCreateError(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (
      !window.confirm(`Create ${cleanRole} account for ${cleanFirstName} ${cleanLastName}?`)
    ) {
      return;
    }

    setCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-account', {
        body: {
          firstName: cleanFirstName,
          lastName: cleanLastName,
          email: cleanEmail,
          phone: cleanPhone,
          password: cleanPassword,
          role: cleanRole,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await insertAuditLog('CREATE_USER_ACCOUNT', 'profiles', data.account?.id, {
        role: cleanRole,
        email: cleanEmail,
      });

      setCreateSuccess(`✅ ${cleanRole} account created for ${cleanFirstName} ${cleanLastName}!`);
      setNewAccount(EMPTY_NEW_ACCOUNT);
      await fetchUsers(false);
    } catch (err) {
      setCreateError(err.message || 'Failed to create account.');
    } finally {
      setCreating(false);
    }
  }

  function toggleMechanicPanel(profile) {
    if (selectedMechanicId === profile.id) {
      setSelectedMechanicId(null);
      setSchedules([]);
      setCertificates({});
      setCertName('');
      setCertFile(null);
      setCertError('');
      return;
    }

    setSelectedMechanicId(profile.id);
    fetchMechanicSchedule(profile.id);
    fetchCertificates(profile.id);
    setCertName('');
    setCertFile(null);
    setCertError('');
  }

  const currentUserProfile = useMemo(
    () => users.find((profile) => profile.id === user?.id),
    [users, user?.id]
  );

  const isCurrentUserSuperAdmin = authProfile?.role === 'super_admin' || currentUserProfile?.role === 'super_admin';

  const activeSuperAdminCount = useMemo(
    () =>
      users.filter(
        (profile) => profile.role === 'super_admin' && profile.is_active !== false
      ).length,
    [users]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const searched = users.filter((profile) => {
      const matchRole = roleFilter === 'all' || profile.role === roleFilter;

      const isActive = profile.is_active !== false;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive);

      const fullName = getFullName(profile).toLowerCase();
      const email = String(profile.email || '').toLowerCase();
      const phone = String(profile.phone || '').toLowerCase();
      const specialization = String(profile.specialization || '').toLowerCase();
      const motorcycle = `${profile.moto_make || ''} ${profile.moto_model || ''} ${profile.moto_year || ''}`.toLowerCase();
      const role = String(profile.role || '').toLowerCase();

      const matchSearch =
        !query ||
        fullName.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        specialization.includes(query) ||
        motorcycle.includes(query) ||
        role.includes(query) ||
        String(profile.id || '').toLowerCase().includes(query);

      return matchRole && matchStatus && matchSearch;
    });

    return [...searched].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case 'name_asc':
          return getFullName(a).localeCompare(getFullName(b));
        case 'name_desc':
          return getFullName(b).localeCompare(getFullName(a));
        case 'role_asc':
          return String(a.role || '').localeCompare(String(b.role || ''));
        case 'newest':
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });
  }, [users, search, roleFilter, statusFilter, sortBy]);

  const counts = useMemo(() => {
    const result = {
      all: users.length,
      active: 0,
      inactive: 0,
      customer: 0,
      mechanic: 0,
      staff: 0,
      admin: 0,
      super_admin: 0,
    };

    users.forEach((profile) => {
      if (profile.is_active === false) {
        result.inactive += 1;
      } else {
        result.active += 1;
      }

      if (result[profile.role] !== undefined) {
        result[profile.role] += 1;
      }
    });

    return result;
  }, [users]);

  const mechanicStats = useMemo(() => {
    const mechanics = users.filter((profile) => profile.role === 'mechanic');
    const activeJobs = mechanics.reduce((sum, mechanic) => {
      const jobs = mechanic.bookings || [];
      return sum + jobs.filter((booking) => ['pending', 'confirmed', 'in_progress'].includes(booking.status)).length;
    }, 0);

    return {
      mechanics: mechanics.length,
      activeJobs,
    };
  }, [users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = filtered.slice(startIndex, endIndex);

  const hasFilters =
    search.trim() ||
    roleFilter !== 'all' ||
    statusFilter !== 'active' ||
    sortBy !== 'newest';

  function clearFilters() {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('active');
    setSortBy('newest');
    setCurrentPage(1);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
              MotoFix Admin
            </p>
            <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white">
              Users
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              Manage customers, mechanics, staff, admins, and super admins.
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
              onClick={() => fetchUsers(false)}
              className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setShowPolicy(true)}
              className="rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-3 text-sm font-black text-yellow-700 transition hover:bg-yellow-100 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300 dark:hover:bg-yellow-500/20"
            >
              Access Policy
            </button>

            {isCurrentUserSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowCreate(true);
                  setCreateError('');
                  setCreateSuccess('');
                }}
                className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.99]"
              >
                + Create Account
              </button>
            )}
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        {/* Policy banner */}
        <div className="mb-6 rounded-3xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm dark:border-yellow-500/25 dark:bg-yellow-500/10">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg">🔒</span>
            <p className="text-sm leading-6 text-yellow-800 dark:text-yellow-200">
              <strong>Administrator Access Policy:</strong> View and edit user details for operational purposes only. Logging into or impersonating user accounts is prohibited. Admin actions are audit-logged.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <StatCard label="Total Users" value={counts.all} icon="👥" tone="primary" />
          <StatCard label="Active" value={counts.active} icon="✅" tone="green" />
          <StatCard label="Inactive" value={counts.inactive} icon="🚫" tone={counts.inactive > 0 ? 'red' : 'default'} />
          <StatCard label="Customers" value={counts.customer} icon="👤" tone="blue" />
          <StatCard label="Mechanics" value={counts.mechanic} icon="🔧" tone="green" />
          <StatCard label="Staff/Admins" value={counts.staff + counts.admin} icon="🧑‍💼" tone="purple" />
          <StatCard label="Super Admins" value={counts.super_admin} icon="👑" tone="yellow" />
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {['all', 'customer', 'mechanic', 'staff', 'admin', 'super_admin'].map((role) => {
                const active = roleFilter === role;

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRoleFilter(sanitizeRoleFilter(role))}
                    className={`rounded-full px-4 py-2 text-xs font-black capitalize transition ${
                      active
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                    }`}
                  >
                    {role}
                    <span className={active ? 'ml-1 opacity-80' : 'ml-1 opacity-60'}>
                      ({counts[role] || 0})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
                  🔍
                </span>
                <input
                  type="text"
                  value={search}
                  maxLength={80}
                  onChange={(event) => setSearch(sanitizeSearch(event.target.value))}
                  placeholder="Search name, email, phone, role, specialization, motorcycle, or ID..."
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-sm font-black text-gray-400 transition hover:text-gray-900 dark:hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(sanitizeStatusFilter(event.target.value))}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              >
                {STATUS_FILTERS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(sanitizeSortOption(event.target.value))}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
              >
                {SORT_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasFilters}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-700 dark:text-gray-300"
              >
                Clear
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-dark-900">
                Role: {roleFilter === 'all' ? 'All roles' : ROLE_CONFIG[roleFilter]?.label || roleFilter}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-dark-900">
                Status: {getStatusFilterLabel(statusFilter)}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-dark-900">
                Sort: {getSortLabel(sortBy)}
              </span>
              <span className="rounded-full bg-primary-50 px-3 py-1 font-black text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                {filtered.length} result(s)
              </span>
            </div>
          </div>
        </div>

        {/* Users list */}
        {loading ? (
          <UserSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              👤
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No users found
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Try changing the filters, search keyword, or status filter.
            </p>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Users <span className="text-gray-400">({filtered.length})</span>
                </h2>
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Showing {filtered.length === 0 ? 0 : startIndex + 1}–{Math.min(endIndex, filtered.length)} of {filtered.length}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25">
                  {counts.active} active
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600 ring-1 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25">
                  {counts.inactive} inactive
                </span>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-dark-700">
              {paginatedUsers.map((profile) => {
                const mechanicBookings = profile.bookings || [];
                const total = mechanicBookings.length;
                const completed = mechanicBookings.filter((booking) => booking.status === 'completed').length;
                const activeJobs = mechanicBookings.filter((booking) => ['pending', 'confirmed', 'in_progress'].includes(booking.status)).length;
                const isSelf = profile.id === user?.id;
                const expanded = selectedMechanicId === profile.id;

                return (
                  <div key={profile.id} className="p-5 transition hover:bg-gray-50 dark:hover:bg-dark-900/40">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <Avatar profile={profile} />

                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-gray-950 dark:text-white">
                              {getFullName(profile)}
                              {isSelf && (
                                <span className="ml-1 text-xs font-semibold text-gray-400">
                                  (you)
                                </span>
                              )}
                            </p>
                            <RoleBadge role={profile.role} />
                            {profile.is_active === false && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600 ring-1 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25">
                                🚫 Inactive
                              </span>
                            )}
                          </div>

                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {profile.email || 'No email'}
                            {profile.phone ? ` · ${profile.phone}` : ''}
                          </p>

                          {profile.role === 'mechanic' && (
                            <div className="mt-2 flex flex-wrap gap-3">
                              {profile.specialization && (
                                <span className="text-xs font-black text-primary-600 dark:text-primary-400">
                                  {profile.specialization}
                                </span>
                              )}
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                {total} jobs · {activeJobs} active · {completed} done
                              </span>
                              {Number(profile.rating_avg) > 0 && (
                                <span className="text-xs font-black text-yellow-500">
                                  ★ {Number(profile.rating_avg).toFixed(1)} ({profile.rating_count || 0})
                                </span>
                              )}
                            </div>
                          )}

                          {profile.role === 'customer' && profile.moto_make && (
                            <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                              🏍️ {profile.moto_make} {profile.moto_model}
                              {profile.moto_year ? ` (${profile.moto_year})` : ''}
                            </p>
                          )}

                          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                            Joined {formatDate(profile.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(profile)}
                          className="rounded-2xl bg-primary-50 px-4 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-100 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25 dark:hover:bg-primary-500/20"
                        >
                          ✎ Edit
                        </button>

                        {isCurrentUserSuperAdmin &&
                          !isSelf &&
                          profile.is_active !== false &&
                          ['mechanic', 'staff', 'admin'].includes(profile.role) && (
                            <button
                              type="button"
                              onClick={() => handleDemote(profile.id, profile.role)}
                              className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20"
                            >
                              {profile.role === 'super_admin' ? 'Change Role' : 'Demote'}
                            </button>
                          )}

                        {isCurrentUserSuperAdmin &&
                          !isSelf &&
                          profile.role !== 'super_admin' &&
                          profile.is_active !== false && (
                            <button
                              type="button"
                              onClick={() => handleDeactivateUser(profile)}
                              className="rounded-2xl bg-gray-100 px-4 py-2 text-xs font-black text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:ring-gray-500/25 dark:hover:bg-gray-500/20"
                            >
                              Deactivate
                            </button>
                          )}

                        {isCurrentUserSuperAdmin &&
                          !isSelf &&
                          profile.is_active === false && (
                            <button
                              type="button"
                              onClick={() => handleReactivateUser(profile)}
                              className="rounded-2xl bg-green-50 px-4 py-2 text-xs font-black text-green-700 ring-1 ring-green-200 transition hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25 dark:hover:bg-green-500/20"
                            >
                              Reactivate
                            </button>
                          )}


                        {profile.role === 'mechanic' && profile.is_active !== false && (
                          <button
                            type="button"
                            onClick={() => toggleMechanicPanel(profile)}
                            className={`rounded-2xl px-4 py-2 text-xs font-black ring-1 transition ${
                              expanded
                                ? 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25'
                                : 'bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700 dark:hover:bg-dark-700'
                            }`}
                          >
                            {expanded ? '▲ Hide' : '📅 Schedule'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Mechanic Schedule and Certificates */}
                    {expanded && (
                      <div className="mt-5 border-t border-gray-100 pt-5 dark:border-dark-700">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-black text-gray-950 dark:text-white">
                              📅 Schedule — {getFullName(profile)}
                            </h3>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Edit assigned booking date, time, status, or unassign mechanic.
                            </p>
                          </div>

                          <a
                            href="/admin/bookings"
                            className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-black text-primary-600 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-primary-400"
                          >
                            Manage Bookings →
                          </a>
                        </div>

                        {loadingSchedule ? (
                          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                            Loading schedule...
                          </p>
                        ) : schedules.length === 0 ? (
                          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-dark-700 dark:bg-dark-900/60">
                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                              No bookings assigned yet.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {schedules.map((booking) => {
                              const bookingTime = normalizeBookingTime(booking.booking_time);
                              const timeOptions = TIME_SLOTS.includes(bookingTime)
                                ? TIME_SLOTS
                                : [bookingTime, ...TIME_SLOTS].filter(Boolean);

                              return (
                                <div
                                  key={booking.id}
                                  className="rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60"
                                >
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                      <p className="text-sm font-black text-gray-950 dark:text-white">
                                        {booking.profiles?.first_name} {booking.profiles?.last_name}
                                      </p>
                                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        {booking.services?.name || 'No service'}
                                      </p>
                                      <p className="mt-1 text-xs font-black text-primary-600 dark:text-primary-400">
                                        {formatScheduleDate(booking.booking_date)} · {formatScheduleTime(booking.booking_time)}
                                        {booking.services?.estimated_duration_minutes
                                          ? ` · ${booking.services.estimated_duration_minutes} mins`
                                          : ''}
                                      </p>
                                      {booking.notes && (
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                          Note: {booking.notes}
                                        </p>
                                      )}
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-3 lg:w-[440px]">
                                      <div>
                                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                          Date
                                        </label>
                                        <input
                                          type="date"
                                          defaultValue={booking.booking_date}
                                          onBlur={(event) => {
                                            const cleanDate = sanitizeDate(event.target.value);
                                            if (cleanDate && cleanDate !== booking.booking_date) {
                                              updateSchedule(booking.id, {
                                                booking_date: cleanDate,
                                              });
                                            }
                                          }}
                                          disabled={updatingScheduleId === booking.id}
                                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-primary-500 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                                        />
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                          Time
                                        </label>
                                        <select
                                          value={bookingTime}
                                          onChange={(event) =>
                                            updateSchedule(booking.id, {
                                              booking_time: event.target.value,
                                            })
                                          }
                                          disabled={updatingScheduleId === booking.id}
                                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-primary-500 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                                        >
                                          {timeOptions.map((slot) => (
                                            <option key={slot} value={slot}>
                                              {formatScheduleTime(slot)}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                          Status
                                        </label>
                                        <select
                                          value={booking.status}
                                          onChange={(event) =>
                                            updateSchedule(booking.id, {
                                              status: event.target.value,
                                            })
                                          }
                                          disabled={updatingScheduleId === booking.id}
                                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:border-primary-500 dark:border-dark-700 dark:bg-dark-800 dark:text-white"
                                        >
                                          <option value="pending">Pending</option>
                                          <option value="confirmed">Confirmed</option>
                                          <option value="in_progress">In Progress</option>
                                          <option value="completed">Completed</option>
                                          <option value="cancelled">Cancelled</option>
                                        </select>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => removeFromSchedule(booking.id)}
                                        disabled={updatingScheduleId === booking.id}
                                        className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20 sm:col-span-3"
                                      >
                                        Unassign Mechanic
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Certificates */}
                        <div className="mt-6 border-t border-gray-100 pt-5 dark:border-dark-700">
                          <h3 className="mb-3 text-sm font-black text-gray-950 dark:text-white">
                            🎓 Certificates — {getFullName(profile)}
                          </h3>

                          {loadingCerts ? (
                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                              Loading certificates...
                            </p>
                          ) : (certificates[profile.id] || []).length === 0 ? (
                            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                              No certificates uploaded yet.
                            </p>
                          ) : (
                            <div className="mb-4 grid gap-3 md:grid-cols-2">
                              {(certificates[profile.id] || []).map((certificate) => (
                                <div
                                  key={certificate.id}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/60"
                                >
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-2xl bg-white text-xl ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                                      {isImageFile(certificate.file_url) ? (
                                        <img
                                          src={certificate.file_url}
                                          alt={certificate.name}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        '📄'
                                      )}
                                    </div>

                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                                        {certificate.name}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Uploaded {formatDate(certificate.created_at)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-shrink-0 gap-2">
                                    <a
                                      href={certificate.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-xl bg-primary-50 px-3 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-100 transition hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/25"
                                    >
                                      View
                                    </a>

                                    <button
                                      type="button"
                                      onClick={() => deleteCertificate(certificate)}
                                      disabled={deletingCertId === certificate.id}
                                      className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25"
                                    >
                                      {deletingCertId === certificate.id ? '...' : 'Delete'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {certError && (
                            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                              {certError}
                            </div>
                          )}

                          <form
                            onSubmit={(event) => handleUploadCertificate(event, profile.id)}
                            className="grid gap-3 rounded-3xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/60 md:grid-cols-[1fr_1fr_auto] md:items-end"
                          >
                            <TextInput
                              label="Certificate Name"
                              type="text"
                              value={certName}
                              maxLength={80}
                              onChange={(event) => setCertName(sanitizeCertName(event.target.value))}
                              placeholder="e.g. TESDA NC II"
                            />

                            <div>
                              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                                File
                              </label>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleCertFileChange}
                                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-primary-700 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400"
                              />
                              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Image or PDF. Max {MAX_CERT_SIZE_MB}MB.
                              </p>
                            </div>

                            <button
                              type="submit"
                              disabled={uploadingCert}
                              className="rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {uploadingCert ? 'Uploading...' : '+ Upload'}
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <PaginationControls
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              onFirst={() => setCurrentPage(1)}
              onPrevious={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              onNext={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              onLast={() => setCurrentPage(totalPages)}
            />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[130] max-w-xs rounded-3xl border border-primary-100 bg-white px-5 py-4 text-sm font-black text-gray-950 shadow-2xl dark:border-primary-500/25 dark:bg-dark-800 dark:text-white">
          {toast}
        </div>
      )}

      {/* Edit slide-over */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeEdit} />

          <div className="relative h-full w-full overflow-y-auto bg-white shadow-2xl dark:bg-dark-800 sm:max-w-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-dark-700 dark:bg-dark-800">
              <div>
                <h2 className="text-lg font-black text-gray-950 dark:text-white">
                  Edit User
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {editingUser.email}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                className="grid h-10 w-10 place-items-center rounded-2xl text-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6 p-6">
              <form onSubmit={handleSaveEdit} className="space-y-4">
                {editError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {editError}
                  </div>
                )}

                {editSuccess && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                    {editSuccess}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <TextInput
                    label="First Name"
                    value={editForm.first_name || ''}
                    maxLength={50}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        first_name: sanitizeName(event.target.value),
                      }))
                    }
                    required
                  />

                  <TextInput
                    label="Last Name"
                    value={editForm.last_name || ''}
                    maxLength={50}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        last_name: sanitizeName(event.target.value),
                      }))
                    }
                    required
                  />
                </div>

                <TextInput
                  label="Email"
                  value={editingUser.email || ''}
                  disabled
                  helper="Email cannot be changed here."
                />

                <TextInput
                  label="Phone"
                  value={editForm.phone || ''}
                  inputMode="numeric"
                  maxLength={11}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      phone: sanitizePhone(event.target.value),
                    }))
                  }
                  placeholder="09XX XXX XXXX"
                />

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Role
                  </label>
                  <select
                    value={editForm.role || 'customer'}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        role: sanitizeRole(event.target.value),
                      }))
                    }
                    disabled={!isCurrentUserSuperAdmin || editingUser.id === user?.id}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  >
                    <option value="customer">Customer</option>
                    <option value="mechanic">Mechanic</option>
                    <option value="staff">Staff / Cashier</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  {(!isCurrentUserSuperAdmin || editingUser.id === user?.id) && (
                    <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      Role changes are restricted to super admins, and users cannot change their own role.
                    </p>
                  )}
                </div>

                {editForm.role === 'mechanic' && (
                  <TextInput
                    label="Specialization"
                    value={editForm.specialization || ''}
                    maxLength={80}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        specialization: sanitizeSpecialization(event.target.value),
                      }))
                    }
                    placeholder="e.g. Engine Repair, Electrical"
                  />
                )}

                {editForm.role === 'customer' && (
                  <div className="space-y-3 border-t border-gray-100 pt-4 dark:border-dark-700">
                    <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Motorcycle Info
                    </p>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <TextInput
                          label="Make"
                          value={editForm.moto_make || ''}
                          maxLength={60}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              moto_make: sanitizeMotorcycleText(event.target.value),
                            }))
                          }
                          placeholder="Honda, Yamaha..."
                        />
                      </div>

                      <TextInput
                        label="Year"
                        value={editForm.moto_year || ''}
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            moto_year: sanitizeYear(event.target.value),
                          }))
                        }
                        placeholder="2022"
                        type="text"
                      />
                    </div>

                    <TextInput
                      label="Model"
                      value={editForm.moto_model || ''}
                      maxLength={60}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          moto_model: sanitizeMotorcycleText(event.target.value),
                        }))
                      }
                      placeholder="Click 125i, NMAX..."
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>

                  <button
                    type="button"
                    onClick={closeEdit}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 transition hover:border-gray-300 dark:border-dark-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>

              {/* Change Password */}
              <div className="border-t border-gray-100 pt-5 dark:border-dark-700">
                <div className="mb-3 flex items-center gap-2">
                  <span>🔑</span>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Change Password
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-3">
                  {passwordError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      {passwordError}
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                      {passwordSuccess}
                    </div>
                  )}

                  <TextInput
                    label="New Password"
                    type="password"
                    value={newPassword}
                    maxLength={MAX_PASSWORD_LENGTH}
                    onChange={(event) => {
                      setNewPassword(sanitizePasswordInput(event.target.value));
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                  />

                  <TextInput
                    label="Confirm New Password"
                    type="password"
                    value={confirmNewPassword}
                    maxLength={MAX_PASSWORD_LENGTH}
                    onChange={(event) => {
                      setConfirmNewPassword(sanitizePasswordInput(event.target.value));
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />

                  <button
                    type="submit"
                    disabled={changingPassword || !newPassword}
                    className="w-full rounded-2xl bg-yellow-500 px-4 py-3 text-sm font-black text-gray-950 shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-yellow-400 dark:text-gray-950 dark:hover:bg-yellow-300"
                  >
                    {changingPassword ? 'Updating Password...' : 'Update Password'}
                  </button>
                </form>

                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  This action is audit-logged. The user will need to use the new password on their next login.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create account modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          />

          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-dark-700 dark:bg-dark-800">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-dark-700">
              <h2 className="text-lg font-black text-gray-950 dark:text-white">
                Create Personnel Account
              </h2>

              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="grid h-10 w-10 place-items-center rounded-2xl text-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4 p-6">
              {createError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {createError}
                </div>
              )}

              {createSuccess && (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">
                  {createSuccess}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="First Name"
                  value={newAccount.firstName}
                  maxLength={50}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      firstName: sanitizeName(event.target.value),
                    }))
                  }
                  required
                />

                <TextInput
                  label="Last Name"
                  value={newAccount.lastName}
                  maxLength={50}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      lastName: sanitizeName(event.target.value),
                    }))
                  }
                  required
                />
              </div>

              <TextInput
                label="Email Address"
                type="email"
                value={newAccount.email}
                maxLength={120}
                onChange={(event) =>
                  setNewAccount((current) => ({
                    ...current,
                    email: sanitizeEmail(event.target.value),
                  }))
                }
                required
              />

              <TextInput
                label="Phone Number"
                value={newAccount.phone}
                inputMode="numeric"
                maxLength={11}
                onChange={(event) =>
                  setNewAccount((current) => ({
                    ...current,
                    phone: sanitizePhone(event.target.value),
                  }))
                }
                placeholder="09XXXXXXXXX"
              />

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Role Type
                </label>
                <select
                  value={newAccount.role}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      role: sanitizeCreateRole(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                >
                  <option value="mechanic">Mechanic</option>
                  <option value="staff">Staff / Cashier</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="Password"
                  type="password"
                  value={newAccount.password}
                  maxLength={MAX_PASSWORD_LENGTH}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      password: sanitizePasswordInput(event.target.value),
                    }))
                  }
                  required
                />

                <TextInput
                  label="Confirm"
                  type="password"
                  value={newAccount.confirmPassword}
                  maxLength={MAX_PASSWORD_LENGTH}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      confirmPassword: sanitizePasswordInput(event.target.value),
                    }))
                  }
                  required
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-2xl bg-primary-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Policy modal */}
      {showPolicy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowPolicy(false)}
          />

          <div className="relative w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-700 dark:bg-dark-800">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-black text-yellow-700 dark:text-yellow-300">
                ⚠️ Republic Act No. 10173 Compliance Policy
              </h2>

              <button
                type="button"
                onClick={() => setShowPolicy(false)}
                className="grid h-10 w-10 place-items-center rounded-2xl text-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
              In accordance with the Data Privacy Act of 2012, administrators and supervisors should only access or update user data for legitimate operational purposes. Impersonating users or requesting credentials over support channels is prohibited.
            </p>

            <div className="my-4 space-y-2 rounded-3xl border border-gray-200 bg-gray-50 p-4 text-xs leading-5 text-gray-600 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-400">
              <p>
                • <strong className="text-gray-900 dark:text-white">Strict Auditing:</strong> Every administrative change is logged with your admin profile ID.
              </p>
              <p>
                • <strong className="text-gray-900 dark:text-white">Credential Rules:</strong> Password changes must only be done when authorized and necessary.
              </p>
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowPolicy(false)}
                className="rounded-2xl bg-gray-100 px-5 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-200 dark:hover:bg-dark-900"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
