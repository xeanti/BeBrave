import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

// ── Role badge config ─────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  customer: { label: 'Customer', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 ring-1 ring-blue-300/40 dark:ring-blue-500/30' },
  mechanic: { label: 'Mechanic', classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 ring-1 ring-emerald-300/40 dark:ring-emerald-500/30' },
  staff:    { label: 'Staff',    classes: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 ring-1 ring-violet-300/40 dark:ring-violet-500/30' },
  admin:    { label: 'Admin',    classes: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 ring-1 ring-rose-500/30' },
};

const EMPTY_NEW_ACCOUNT = {
  firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'mechanic',
};

// ── Reusable input style ──────────────────────────────────────────────────────
const inp = 'w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition';
const label = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1';

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Edit panel
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  // Create account panel
  const [showCreate, setShowCreate] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_NEW_ACCOUNT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Policy modal
  const [showPolicy, setShowPolicy] = useState(false);

  // Mechanic schedule
  const [selectedMechanicId, setSelectedMechanicId] = useState(null);
  const [schedules, setSchedules] = useState([]);

  // Certificates
  const [certificates, setCertificates] = useState({});
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);
  const [loadingCerts, setLoadingCerts] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('*, bookings!bookings_mechanic_id_fkey(id, status)')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
    setLoading(false);
  }

  async function fetchMechanicSchedule(mechanicId) {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, status, notes, profiles!bookings_customer_id_fkey(first_name, last_name), services(name)')
      .eq('mechanic_id', mechanicId)
      .order('booking_date', { ascending: true });
    if (data) setSchedules(data);
  }

  async function updateSchedule(bookingId, updates) {
    await supabase.from('bookings').update(updates).eq('id', bookingId);
    fetchMechanicSchedule(selectedMechanicId);
  }

  async function removeFromSchedule(bookingId) {
    if (!confirm('Unassign this mechanic from the booking?')) return;
    await supabase.from('bookings').update({ mechanic_id: null }).eq('id', bookingId);
    fetchMechanicSchedule(selectedMechanicId);
  }

  async function fetchCertificates(mechanicId) {
    setLoadingCerts(true);
    const { data } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });
    if (data) setCertificates(prev => ({ ...prev, [mechanicId]: data }));
    setLoadingCerts(false);
  }

  function handleCertFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCertFile(file);
    if (!certName) setCertName(file.name.replace(/\.[^/.]+$/, ''));
  }

  async function handleUploadCertificate(e, mechanicId) {
    e.preventDefault();
    setCertError('');
    if (!certName.trim()) { setCertError('Please enter a certificate name.'); return; }
    if (!certFile) { setCertError('Please choose a file to upload.'); return; }
    setUploadingCert(true);
    try {
      const fileExt = certFile.name.split('.').pop();
      const filePath = `${mechanicId}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('mechanic-certificates').upload(filePath, certFile);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('mechanic-certificates').getPublicUrl(filePath);
      const { error: insertError } = await supabase.from('mechanic_certificates').insert({
        mechanic_id: mechanicId, name: certName.trim(), file_url: urlData.publicUrl, uploaded_by: user?.id,
      });
      if (insertError) throw insertError;
      await supabase.from('audit_logs').insert({
        action: 'UPLOAD_MECHANIC_CERTIFICATE', entity: 'mechanic_certificates', entity_id: mechanicId,
        performed_by: user?.id, details: { name: certName.trim() },
      });
      setCertName(''); setCertFile(null);
      fetchCertificates(mechanicId);
    } catch (err) {
      setCertError(err.message);
    } finally {
      setUploadingCert(false);
    }
  }

  async function deleteCertificate(cert) {
    if (!confirm(`Delete certificate "${cert.name}"?`)) return;
    setDeletingCertId(cert.id);
    try {
      await supabase.from('mechanic_certificates').delete().eq('id', cert.id);
      await supabase.from('audit_logs').insert({
        action: 'DELETE_MECHANIC_CERTIFICATE', entity: 'mechanic_certificates', entity_id: cert.id,
        performed_by: user?.id, details: { name: cert.name, mechanic_id: cert.mechanic_id },
      });
      fetchCertificates(cert.mechanic_id);
    } finally {
      setDeletingCertId(null);
    }
  }

  function openEdit(u) {
    setEditingUser(u);
    setEditForm({
      first_name: u.first_name || '', last_name: u.last_name || '',
      phone: u.phone || '', role: u.role || 'customer',
      specialization: u.specialization || '',
      moto_make: u.moto_make || '', moto_model: u.moto_model || '', moto_year: u.moto_year || '',
    });
    setEditError(''); setEditSuccess('');
    setSelectedMechanicId(null); setSchedules([]);
  }

  function closeEdit() {
    setEditingUser(null); setEditForm({});
    setEditError(''); setEditSuccess('');
    setSelectedMechanicId(null); setSchedules([]);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setSaving(true); setEditError(''); setEditSuccess('');
    const payload = {
      first_name: editForm.first_name, last_name: editForm.last_name,
      phone: editForm.phone || null, role: editForm.role,
      specialization: editForm.role === 'mechanic' ? (editForm.specialization || null) : null,
      moto_make: editForm.role === 'customer' ? (editForm.moto_make || null) : null,
      moto_model: editForm.role === 'customer' ? (editForm.moto_model || null) : null,
      moto_year: (editForm.role === 'customer' && editForm.moto_year) ? parseInt(editForm.moto_year) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', editingUser.id);
    if (error) {
      setEditError(error.message);
    } else {
      await supabase.from('audit_logs').insert({
        action: 'UPDATE_USER_PROFILE', entity: 'profiles', entity_id: editingUser.id,
        performed_by: user.id, details: { role: payload.role, name: `${payload.first_name} ${payload.last_name}` },
      });
      setEditSuccess('Profile updated successfully!');
      fetchUsers();
      setEditingUser((prev) => ({ ...prev, ...payload }));
    }
    setSaving(false);
  }

  async function handleDemote(userId, currentRole) {
    if (!confirm(`Remove ${currentRole} access and set to customer?`)) return;
    const { error } = await supabase.from('profiles').update({ role: 'customer' }).eq('id', userId);
    if (!error) {
      await supabase.from('audit_logs').insert({
        action: 'DEMOTE_USER', entity: 'profiles', entity_id: userId,
        performed_by: user.id, details: { from_role: currentRole, to_role: 'customer' },
      });
      fetchUsers();
      if (editingUser?.id === userId) {
        setEditForm((f) => ({ ...f, role: 'customer' }));
        setEditingUser((prev) => ({ ...prev, role: 'customer' }));
      }
    }
  }

  async function handleCreateAccount(e) {
    e.preventDefault();
    setCreateError(''); setCreateSuccess('');
    if (newAccount.password !== newAccount.confirmPassword) { setCreateError('Passwords do not match.'); return; }
    if (newAccount.password.length < 6) { setCreateError('Password must be at least 6 characters.'); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-account', {
        body: { firstName: newAccount.firstName, lastName: newAccount.lastName, email: newAccount.email, phone: newAccount.phone, password: newAccount.password, role: newAccount.role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await supabase.from('audit_logs').insert({
        action: 'CREATE_USER_ACCOUNT', entity: 'profiles', entity_id: data.account?.id,
        performed_by: user.id, details: { role: newAccount.role, email: newAccount.email },
      });
      setCreateSuccess(`✅ ${newAccount.role} account created for ${newAccount.firstName} ${newAccount.lastName}!`);
      setNewAccount(EMPTY_NEW_ACCOUNT);
      fetchUsers();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').includes(q);
    return matchRole && matchSearch;
  });

  const counts = {
    all: users.length,
    customer: users.filter(u => u.role === 'customer').length,
    mechanic: users.filter(u => u.role === 'mechanic').length,
    staff: users.filter(u => u.role === 'staff').length,
    admin: users.filter(u => u.role === 'admin').length,
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white px-4 sm:px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">View and manage all accounts across every role.</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPolicy(true)}
              className="text-xs border border-amber-400/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/20 transition font-medium"
            >
              ⚠️ Access Policy
            </button>
            <button
              onClick={() => { setShowCreate(true); setCreateError(''); setCreateSuccess(''); }}
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              + Create Account
            </button>
          </div>
        </div>

        {/* ── Policy banner ── */}
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-lg flex-shrink-0 mt-0.5">🔒</span>
          <p className="text-sm text-amber-800 dark:text-amber-300/90 leading-relaxed">
            <strong className="text-amber-900 dark:text-amber-200">Administrator Access Policy:</strong>{' '}
            You may view and edit user account details for operational purposes only.
            Logging into or impersonating any user account is strictly prohibited under RA 10173.
            All admin actions are audit-logged.
          </p>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-gray-700/50 p-4 space-y-3 shadow-sm">
          {/* Role tabs */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'customer', 'mechanic', 'staff', 'admin'].map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                  roleFilter === r
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-600'
                }`}>
                {r} <span className={roleFilter === r ? 'opacity-75' : 'opacity-50'}>({counts[r]})</span>
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or phone..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-gray-50 dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">✕</button>
            )}
          </div>
        </div>

        {/* ── Users list ── */}
        {loading ? (
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-gray-700/50 p-10 text-center shadow-sm">
            <p className="text-gray-400">Loading users...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-gray-700/50 p-10 text-center shadow-sm">
            <p className="text-3xl mb-3">👤</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">No users found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm overflow-hidden">
            {/* List header */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Users <span className="text-gray-400 dark:text-gray-500 font-normal">({filtered.length})</span>
              </h2>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(u => {
                const mechanicBookings = u.bookings || [];
                const total = mechanicBookings.length;
                const completed = mechanicBookings.filter(b => b.status === 'completed').length;
                const active = mechanicBookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status)).length;
                const roleConf = ROLE_CONFIG[u.role] || { label: u.role, classes: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400' };

                return (
                  <div key={u.id} className="px-5 py-4 hover:bg-gray-50 dark:hover:bg-dark-700/30 transition-colors">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      {/* Avatar + info */}
                      <div className="flex items-center gap-3 min-w-0">
                        {u.profile_photo_url ? (
                          <img src={u.profile_photo_url} alt=""
                            className="w-10 h-10 rounded-full object-cover border-2 border-primary-200 dark:border-primary-500/30 flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-sm">
                            {(u.first_name?.[0] || '') + (u.last_name?.[0] || '')}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white">
                              {u.first_name} {u.last_name}
                            </p>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize ${roleConf.classes}`}>
                              {roleConf.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {u.email}{u.phone ? <span className="text-gray-400 dark:text-gray-500"> · {u.phone}</span> : ''}
                          </p>
                          {u.role === 'mechanic' && (
                            <div className="flex gap-3 mt-1 flex-wrap">
                              {u.specialization && (
                                <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">{u.specialization}</span>
                              )}
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {total} jobs · {active} active · {completed} done
                              </span>
                              {u.rating_avg > 0 && (
                                <span className="text-xs text-amber-500 font-medium">★ {Number(u.rating_avg).toFixed(1)} ({u.rating_count})</span>
                              )}
                            </div>
                          )}
                          {u.role === 'customer' && u.moto_make && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              🏍️ {u.moto_make} {u.moto_model}{u.moto_year ? ` (${u.moto_year})` : ''}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                            Joined {new Date(u.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-500/30 border border-primary-200 dark:border-primary-500/30 transition font-medium"
                        >
                          ✎ Edit
                        </button>
                        {(u.role === 'mechanic' || u.role === 'staff') && (
                          <button
                            onClick={() => handleDemote(u.id, u.role)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/30 border border-red-200 dark:border-red-500/30 transition font-medium"
                          >
                            Demote
                          </button>
                        )}
                        {u.role === 'mechanic' && (
                          <button
                            onClick={() => {
                              if (selectedMechanicId === u.id) {
                                setSelectedMechanicId(null); setSchedules([]);
                                setCertificates({}); setCertName(''); setCertFile(null); setCertError('');
                              } else {
                                setSelectedMechanicId(u.id);
                                fetchMechanicSchedule(u.id); fetchCertificates(u.id);
                                setCertName(''); setCertFile(null); setCertError('');
                              }
                            }}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
                              selectedMechanicId === u.id
                                ? 'bg-blue-100 dark:bg-blue-500/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500/40'
                                : 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/30 border-blue-200 dark:border-blue-500/30'
                            }`}
                          >
                            {selectedMechanicId === u.id ? '▲ Hide' : '📅 Schedule'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Mechanic Schedule ── */}
                    {selectedMechanicId === u.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          📅 Schedule — {u.first_name} {u.last_name}
                        </h3>
                        {schedules.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">No bookings assigned yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {schedules.map((b) => (
                              <div key={b.id} className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 flex items-start justify-between flex-wrap gap-3 border border-gray-100 dark:border-gray-800">
                                <div>
                                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    {b.profiles?.first_name} {b.profiles?.last_name}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{b.services?.name}</p>
                                  {b.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Note: {b.notes}</p>}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div>
                                    <p className="text-xs text-gray-500 mb-0.5">Date</p>
                                    <input type="date" defaultValue={b.booking_date}
                                      onBlur={(e) => { if (e.target.value !== b.booking_date) updateSchedule(b.id, { booking_date: e.target.value }); }}
                                      className="bg-white dark:bg-dark-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-800 dark:text-white" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-0.5">Time</p>
                                    <select defaultValue={b.booking_time}
                                      onChange={(e) => updateSchedule(b.id, { booking_time: e.target.value })}
                                      className="bg-white dark:bg-dark-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-800 dark:text-white">
                                      {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'].map((slot) => {
                                        const [h] = slot.split(':');
                                        const hour = parseInt(h);
                                        const ampm = hour >= 12 ? 'PM' : 'AM';
                                        const display = hour > 12 ? hour - 12 : hour;
                                        return <option key={slot} value={slot}>{display}:00 {ampm}</option>;
                                      })}
                                    </select>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-0.5">Status</p>
                                    <select value={b.status}
                                      onChange={(e) => updateSchedule(b.id, { status: e.target.value })}
                                      className="bg-white dark:bg-dark-800 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-800 dark:text-white">
                                      <option value="pending">Pending</option>
                                      <option value="confirmed">Confirmed</option>
                                      <option value="in_progress">In Progress</option>
                                      <option value="completed">Completed</option>
                                      <option value="cancelled">Cancelled</option>
                                    </select>
                                  </div>
                                  <button onClick={() => removeFromSchedule(b.id)}
                                    className="text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-transparent px-2 py-1 rounded-md hover:bg-red-100 dark:hover:bg-red-500/10 transition">
                                    Unassign
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                          To assign new bookings, go to{' '}
                          <a href="/admin/bookings" className="text-primary-600 dark:text-primary-400 hover:underline">Manage Bookings</a>.
                        </p>

                        {/* ── Certificates ── */}
                        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            🎓 Certificates — {u.first_name} {u.last_name}
                          </h3>
                          {loadingCerts ? (
                            <p className="text-sm text-gray-400 mb-4">Loading...</p>
                          ) : (certificates[u.id] || []).length === 0 ? (
                            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">No certificates uploaded yet.</p>
                          ) : (
                            <div className="space-y-2 mb-4">
                              {(certificates[u.id] || []).map((c) => (
                                <div key={c.id} className="bg-gray-50 dark:bg-dark-800 rounded-lg p-3 flex items-center justify-between gap-3 border border-gray-200 dark:border-gray-700">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-base flex-shrink-0">📄</span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{c.name}</p>
                                      <p className="text-xs text-gray-400 dark:text-gray-500">Uploaded {new Date(c.created_at).toLocaleDateString()}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <a href={c.file_url} target="_blank" rel="noreferrer"
                                      className="text-xs text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-transparent px-2.5 py-1 rounded-md hover:bg-primary-100 dark:hover:bg-primary-500/10 transition">
                                      View
                                    </a>
                                    <button type="button" onClick={() => deleteCertificate(c)} disabled={deletingCertId === c.id}
                                      className="text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-transparent px-2.5 py-1 rounded-md hover:bg-red-100 dark:hover:bg-red-500/10 transition disabled:opacity-50">
                                      {deletingCertId === c.id ? '...' : 'Delete'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {certError && (
                            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm rounded-lg p-3 mb-3">{certError}</div>
                          )}
                          <form onSubmit={(e) => handleUploadCertificate(e, u.id)}
                            className="bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-gray-700/50 rounded-lg p-4 flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[160px]">
                              <label className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Certificate Name</label>
                              <input type="text" value={certName} onChange={(e) => setCertName(e.target.value)}
                                placeholder="e.g. TESDA NC II" className={inp} />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-xs text-gray-500 dark:text-gray-500 mb-1">File</label>
                              <input type="file" accept="image/*,application/pdf" onChange={handleCertFileChange}
                                className="w-full text-xs text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer hover:file:bg-primary-700 file:text-xs" />
                            </div>
                            <button type="submit" disabled={uploadingCert}
                              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition text-white shadow-sm">
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

      {/* ── Edit slide-over ── */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEdit} />
          <div className="relative w-full sm:max-w-md h-full bg-white dark:bg-dark-800 shadow-2xl overflow-y-auto border-l border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-dark-800 z-10">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Edit User</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{editingUser.email}</p>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none transition">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editError && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm rounded-lg p-3">{editError}</div>
              )}
              {editSuccess && (
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400 text-sm rounded-lg p-3">{editSuccess}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>First Name</label>
                  <input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} required className={inp} />
                </div>
                <div>
                  <label className={label}>Last Name</label>
                  <input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} required className={inp} />
                </div>
              </div>

              <div>
                <label className={label}>Email</label>
                <input value={editingUser.email} disabled
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-dark-900/50 border border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed" />
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Email cannot be changed here.</p>
              </div>

              <div>
                <label className={label}>Phone</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="09XX XXX XXXX" className={inp} />
              </div>

              <div>
                <label className={label}>Role</label>
                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={inp}>
                  <option value="customer">Customer</option>
                  <option value="mechanic">Mechanic</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editForm.role === 'mechanic' && (
                <div>
                  <label className={label}>Specialization</label>
                  <input value={editForm.specialization} onChange={e => setEditForm(f => ({ ...f, specialization: e.target.value }))}
                    placeholder="e.g. Engine Repair, Electrical" className={inp} />
                </div>
              )}

              {editForm.role === 'customer' && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Motorcycle Info</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className={label}>Make</label>
                      <input value={editForm.moto_make || ''} onChange={e => setEditForm(f => ({ ...f, moto_make: e.target.value }))}
                        placeholder="Honda, Yamaha..." className={inp} />
                    </div>
                    <div>
                      <label className={label}>Year</label>
                      <input value={editForm.moto_year || ''} onChange={e => setEditForm(f => ({ ...f, moto_year: e.target.value }))}
                        placeholder="2022" type="number" className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className={label}>Model</label>
                    <input value={editForm.moto_model || ''} onChange={e => setEditForm(f => ({ ...f, moto_model: e.target.value }))}
                      placeholder="Click 125i, NMAX..." className={inp} />
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 py-2.5 rounded-lg text-sm font-semibold transition text-white shadow-sm">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={closeEdit}
                  className="px-4 py-2.5 bg-gray-100 dark:bg-dark-900 hover:bg-gray-200 dark:hover:bg-dark-700 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create account modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-dark-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Create Staff / Mechanic Account</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none transition">✕</button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm rounded-lg p-3">{createError}</div>
              )}
              {createSuccess && (
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400 text-sm rounded-lg p-3">{createSuccess}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>First Name</label>
                  <input value={newAccount.firstName} onChange={e => setNewAccount(f => ({ ...f, firstName: e.target.value }))} required className={inp} />
                </div>
                <div>
                  <label className={label}>Last Name</label>
                  <input value={newAccount.lastName} onChange={e => setNewAccount(f => ({ ...f, lastName: e.target.value }))} required className={inp} />
                </div>
              </div>
              <div>
                <label className={label}>Email Address</label>
                <input type="email" value={newAccount.email} onChange={e => setNewAccount(f => ({ ...f, email: e.target.value }))} required className={inp} />
              </div>
              <div>
                <label className={label}>Phone Number</label>
                <input value={newAccount.phone} onChange={e => setNewAccount(f => ({ ...f, phone: e.target.value }))} placeholder="09XXXXXXXXX" className={inp} />
              </div>
              <div>
                <label className={label}>Role Type</label>
                <select value={newAccount.role} onChange={e => setNewAccount(f => ({ ...f, role: e.target.value }))} className={inp}>
                  <option value="mechanic">Mechanic</option>
                  <option value="staff">Operational Staff</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Password</label>
                  <input type="password" value={newAccount.password} onChange={e => setNewAccount(f => ({ ...f, password: e.target.value }))} required className={inp} />
                </div>
                <div>
                  <label className={label}>Confirm Password</label>
                  <input type="password" value={newAccount.confirmPassword} onChange={e => setNewAccount(f => ({ ...f, confirmPassword: e.target.value }))} required className={inp} />
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={creating}
                  className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 py-2.5 rounded-lg text-sm font-semibold transition text-white shadow-sm">
                  {creating ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Policy modal ── */}
      {showPolicy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPolicy(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-dark-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-base font-bold text-amber-600 dark:text-amber-400">⚠️ Republic Act No. 10173 Compliance Policy</h2>
              <button onClick={() => setShowPolicy(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none transition ml-4">✕</button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              In accordance with the <strong className="text-gray-900 dark:text-white">Data Privacy Act of 2012 (RA 10173)</strong>, administrators and supervisors are strictly barred from accessing, altering, or logging into any accounts that contain protected personal or identifiable information unless explicitly authorized for standard operational updates.
            </p>
            <div className="bg-gray-50 dark:bg-dark-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <p>• <strong className="text-gray-700 dark:text-gray-300">Strict Auditing:</strong> Every adjustment made inside the administrative interface logs a permanent footprint attaching your session profile ID.</p>
              <p>• <strong className="text-gray-700 dark:text-gray-300">Credentials Rules:</strong> Passwords are cryptographically salted and hashed. Impersonating user workflows or requesting credentials over support channels is prohibited.</p>
            </div>
            <div className="text-right">
              <button onClick={() => setShowPolicy(false)}
                className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition">
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}