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
    label: 'Staff',
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
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url);
}

function isValidCertFile(file) {
  const validType = file.type.startsWith('image/') || file.type === 'application/pdf';
  const validSize = file.size <= MAX_CERT_SIZE_MB * 1024 * 1024;

  return validType && validSize;
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
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [toast, setToast] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

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
    setUpdatingScheduleId(bookingId);

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) throw error;

      await insertAuditLog('UPDATE_MECHANIC_SCHEDULE', 'bookings', bookingId, updates);
      await fetchMechanicSchedule(selectedMechanicId, false);
      await fetchUsers(false);
    } catch (err) {
      setToast(`❌ ${err.message || 'Failed to update schedule.'}`);
    } finally {
      setUpdatingScheduleId(null);
    }
  }

  async function removeFromSchedule(bookingId) {
    if (!confirm('Unassign this mechanic from the booking?')) return;

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
      setCertError(`Please upload an image or PDF up to ${MAX_CERT_SIZE_MB}MB.`);
      return;
    }

    setCertFile(file);

    if (!certName) {
      setCertName(file.name.replace(/\.[^/.]+$/, ''));
    }
  }

  async function handleUploadCertificate(event, mechanicId) {
    event.preventDefault();

    setCertError('');

    if (!certName.trim()) {
      setCertError('Please enter a certificate name.');
      return;
    }

    if (!certFile) {
      setCertError('Please choose a file to upload.');
      return;
    }

    if (!isValidCertFile(certFile)) {
      setCertError(`Please upload an image or PDF up to ${MAX_CERT_SIZE_MB}MB.`);
      return;
    }

    setUploadingCert(true);

    try {
      const fileExt = certFile.name.split('.').pop();
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
          name: certName.trim(),
          file_url: urlData.publicUrl,
          uploaded_by: user?.id,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      await insertAuditLog('UPLOAD_MECHANIC_CERTIFICATE', 'mechanic_certificates', data?.id || mechanicId, {
        name: certName.trim(),
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
    if (!confirm(`Delete certificate "${cert.name}"?`)) return;

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
    setEditingUser(profile);
    setEditForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      role: profile.role || 'customer',
      specialization: profile.specialization || '',
      moto_make: profile.moto_make || '',
      moto_model: profile.moto_model || '',
      moto_year: profile.moto_year || '',
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
    if (!editForm.first_name?.trim()) return 'First name is required.';
    if (!editForm.last_name?.trim()) return 'Last name is required.';
    if (!editForm.role) return 'Role is required.';

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

    const payload = {
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      phone: editForm.phone?.trim() || null,
      role: editForm.role,
      specialization:
        editForm.role === 'mechanic' ? editForm.specialization?.trim() || null : null,
      moto_make: editForm.role === 'customer' ? editForm.moto_make?.trim() || null : null,
      moto_model: editForm.role === 'customer' ? editForm.moto_model?.trim() || null : null,
      moto_year:
        editForm.role === 'customer' && editForm.moto_year
          ? parseInt(editForm.moto_year, 10)
          : null,
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUser.id);

      if (error) throw error;

      await insertAuditLog('UPDATE_USER_PROFILE', 'profiles', editingUser.id, {
        role: payload.role,
        name: `${payload.first_name} ${payload.last_name}`,
      });

      setEditSuccess('Profile updated successfully!');
      await fetchUsers(false);

      setEditingUser((previous) => ({
        ...previous,
        ...payload,
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

    if (!newPassword) {
      setPasswordError('Please enter a new password.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setChangingPassword(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: {
          userId: editingUser.id,
          newPassword,
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
    if (!confirm(`Remove ${currentRole} access and set to customer?`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role: 'customer',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

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

  async function handleCreateAccount(event) {
    event.preventDefault();

    setCreateError('');
    setCreateSuccess('');

    if (!newAccount.firstName.trim() || !newAccount.lastName.trim()) {
      setCreateError('First name and last name are required.');
      return;
    }

    if (!newAccount.email.trim()) {
      setCreateError('Email is required.');
      return;
    }

    if (newAccount.password !== newAccount.confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }

    if (newAccount.password.length < 6) {
      setCreateError('Password must be at least 6 characters.');
      return;
    }

    setCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-account', {
        body: {
          firstName: newAccount.firstName.trim(),
          lastName: newAccount.lastName.trim(),
          email: newAccount.email.trim(),
          phone: newAccount.phone.trim(),
          password: newAccount.password,
          role: newAccount.role,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await insertAuditLog('CREATE_USER_ACCOUNT', 'profiles', data.account?.id, {
        role: newAccount.role,
        email: newAccount.email.trim(),
      });

      setCreateSuccess(`✅ ${newAccount.role} account created for ${newAccount.firstName} ${newAccount.lastName}!`);
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((profile) => {
      const matchRole = roleFilter === 'all' || profile.role === roleFilter;
      const fullName = getFullName(profile).toLowerCase();
      const email = String(profile.email || '').toLowerCase();
      const phone = String(profile.phone || '').toLowerCase();
      const specialization = String(profile.specialization || '').toLowerCase();
      const motorcycle = `${profile.moto_make || ''} ${profile.moto_model || ''} ${profile.moto_year || ''}`.toLowerCase();

      const matchSearch =
        !query ||
        fullName.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        specialization.includes(query) ||
        motorcycle.includes(query) ||
        String(profile.id || '').toLowerCase().includes(query);

      return matchRole && matchSearch;
    });
  }, [users, search, roleFilter]);

  const counts = useMemo(() => {
    const result = {
      all: users.length,
      customer: 0,
      mechanic: 0,
      staff: 0,
      admin: 0,
    };

    users.forEach((profile) => {
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
                  User Management
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  View accounts, update roles, manage mechanics, schedules, certificates, and staff accounts.
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
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={() => setShowPolicy(true)}
                  className="rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-3 text-sm font-black text-yellow-700 transition hover:bg-yellow-100 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300 dark:hover:bg-yellow-500/20"
                >
                  ⚠️ Access Policy
                </button>

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
              </div>
            </div>
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
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total Users" value={counts.all} icon="👥" tone="primary" />
          <StatCard label="Customers" value={counts.customer} icon="👤" tone="blue" />
          <StatCard label="Mechanics" value={counts.mechanic} icon="🔧" tone="green" />
          <StatCard label="Staff" value={counts.staff} icon="🧑‍💼" tone="purple" />
          <StatCard label="Active Jobs" value={mechanicStats.activeJobs} icon="📅" tone={mechanicStats.activeJobs > 0 ? 'yellow' : 'default'} />
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {['all', 'customer', 'mechanic', 'staff', 'admin'].map((role) => {
                const active = roleFilter === role;

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRoleFilter(role)}
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

            <div className="relative w-full lg:w-96">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, phone, specialization, motorcycle, or ID..."
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
              Try changing the role filter or search keyword.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-dark-700">
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Users <span className="text-gray-400">({filtered.length})</span>
              </h2>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-dark-700">
              {filtered.map((profile) => {
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

                        {(profile.role === 'mechanic' || profile.role === 'staff' || (profile.role === 'admin' && !isSelf)) && (
                          <button
                            type="button"
                            onClick={() => handleDemote(profile.id, profile.role)}
                            className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 dark:hover:bg-red-500/20"
                          >
                            Demote
                          </button>
                        )}

                        {profile.role === 'mechanic' && (
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
                                            if (event.target.value !== booking.booking_date) {
                                              updateSchedule(booking.id, {
                                                booking_date: event.target.value,
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
                              onChange={(event) => setCertName(event.target.value)}
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
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        first_name: event.target.value,
                      }))
                    }
                    required
                  />

                  <TextInput
                    label="Last Name"
                    value={editForm.last_name || ''}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        last_name: event.target.value,
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
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      phone: event.target.value,
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
                        role: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                  >
                    <option value="customer">Customer</option>
                    <option value="mechanic">Mechanic</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {editForm.role === 'mechanic' && (
                  <TextInput
                    label="Specialization"
                    value={editForm.specialization || ''}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        specialization: event.target.value,
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
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              moto_make: event.target.value,
                            }))
                          }
                          placeholder="Honda, Yamaha..."
                        />
                      </div>

                      <TextInput
                        label="Year"
                        value={editForm.moto_year || ''}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            moto_year: event.target.value,
                          }))
                        }
                        placeholder="2022"
                        type="number"
                      />
                    </div>

                    <TextInput
                      label="Model"
                      value={editForm.moto_model || ''}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          moto_model: event.target.value,
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
                    onChange={(event) => {
                      setNewPassword(event.target.value);
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
                    onChange={(event) => {
                      setConfirmNewPassword(event.target.value);
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />

                  <button
                    type="submit"
                    disabled={changingPassword || !newPassword}
                    className="w-full rounded-2xl bg-gray-800 px-4 py-3 text-sm font-black text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-dark-700 dark:hover:bg-dark-900"
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
                Create Staff / Mechanic Account
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
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      firstName: event.target.value,
                    }))
                  }
                  required
                />

                <TextInput
                  label="Last Name"
                  value={newAccount.lastName}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <TextInput
                label="Email Address"
                type="email"
                value={newAccount.email}
                onChange={(event) =>
                  setNewAccount((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />

              <TextInput
                label="Phone Number"
                value={newAccount.phone}
                onChange={(event) =>
                  setNewAccount((current) => ({
                    ...current,
                    phone: event.target.value,
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
                      role: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
                >
                  <option value="mechanic">Mechanic</option>
                  <option value="staff">Operational Staff</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="Password"
                  type="password"
                  value={newAccount.password}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  required
                />

                <TextInput
                  label="Confirm"
                  type="password"
                  value={newAccount.confirmPassword}
                  onChange={(event) =>
                    setNewAccount((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
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
