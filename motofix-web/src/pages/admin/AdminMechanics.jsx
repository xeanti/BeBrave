import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

export default function AdminMechanics() {
  const { user } = useAuth();
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMechanic, setSelectedMechanic] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [expandedCustomers, setExpandedCustomers] = useState({});

  const [mechanicForm, setMechanicForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
  });
  const [creatingMechanic, setCreatingMechanic] = useState(false);
  const [mechanicMessage, setMechanicMessage] = useState('');

  // ── Certificates state ──
  const [certificates, setCertificates] = useState([]);
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [deletingCertId, setDeletingCertId] = useState(null);

  function handleMechanicFormChange(e) {
    setMechanicForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleCreateMechanic(e) {
    e.preventDefault();
    setMechanicMessage('');

    if (mechanicForm.password !== mechanicForm.confirmPassword) {
      setMechanicMessage('Error: Passwords do not match.');
      return;
    }
    if (mechanicForm.password.length < 6) {
      setMechanicMessage('Error: Password must be at least 6 characters.');
      return;
    }

    setCreatingMechanic(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-mechanic', {
        body: {
          firstName: mechanicForm.firstName,
          lastName: mechanicForm.lastName,
          email: mechanicForm.email,
          phone: mechanicForm.phone,
          password: mechanicForm.password,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setMechanicMessage(
        `✅ Mechanic account created! ${mechanicForm.firstName} ${mechanicForm.lastName} can now log in with ${mechanicForm.email}`
      );
      setMechanicForm({
        firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
      });
      fetchMechanics();
    } catch (err) {
      setMechanicMessage('Error: ' + err.message);
    } finally {
      setCreatingMechanic(false);
    }
  }

  useEffect(() => {
    fetchMechanics();
  }, []);

  async function fetchMechanics() {
    const { data } = await supabase
      .from('profiles')
      .select('*, bookings!bookings_mechanic_id_fkey(id, status)')
      .eq('role', 'mechanic');
    if (data) setMechanics(data);
    setLoading(false);
  }

  async function fetchMechanicSchedule(mechanicId) {
    if (!mechanicId) return;
    const { data } = await supabase
      .from('bookings')
      .select('id, mechanic_id, booking_date, booking_time, status, notes, profiles!bookings_customer_id_fkey(first_name, last_name), services(name)')
      .eq('mechanic_id', mechanicId)
      .order('booking_date', { ascending: true });
    if (data) setSchedules(data);
  }

  async function fetchCertificates(mechanicId) {
    if (!mechanicId) return;
    const { data } = await supabase
      .from('mechanic_certificates')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });
    if (data) setCertificates(data);
  }

  async function updateSchedule(bookingId, updates, currentMechanicId) {
    await supabase.from('bookings').update(updates).eq('id', bookingId);
    fetchMechanicSchedule(currentMechanicId);
    fetchMechanics();
  }

  async function removeFromSchedule(bookingId, currentMechanicId) {
    if (!confirm('Unassign this mechanic from the booking?')) return;
    await supabase.from('bookings').update({ mechanic_id: null }).eq('id', bookingId);
    fetchMechanicSchedule(currentMechanicId);
    fetchMechanics();
  }

  async function changeRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id);
    if (selectedMechanic?.id === id) {
      setSelectedMechanic(null);
      setSchedules([]);
      setCertificates([]);
    }
    fetchMechanics();
  }

  function toggleCustomer(id) {
    setExpandedCustomers(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleSelectMechanic(m) {
    if (selectedMechanic?.id === m.id) {
      setSelectedMechanic(null);
      setSchedules([]);
      setCertificates([]);
    } else {
      setSelectedMechanic(m);
      fetchMechanicSchedule(m.id);
      fetchCertificates(m.id);
      setCertName('');
      setCertFile(null);
      setCertError('');
    }
  }

  function handleCertFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCertFile(file);
    if (!certName) {
      const base = file.name.replace(/\.[^/.]+$/, '');
      setCertName(base);
    }
  }

  async function handleUploadCertificate(e) {
    e.preventDefault();
    setCertError('');

    if (!selectedMechanic) {
      setCertError('No mechanic selected.');
      return;
    }
    if (!certName.trim()) {
      setCertError('Please enter a certificate name.');
      return;
    }
    if (!certFile) {
      setCertError('Please choose a file to upload.');
      return;
    }

    setUploadingCert(true);
    const mechanicId = selectedMechanic.id;
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

      const { error: insertError } = await supabase
        .from('mechanic_certificates')
        .insert({
          mechanic_id: mechanicId,
          name: certName.trim(),
          file_url: urlData.publicUrl,
          uploaded_by: user?.id,
        });
      if (insertError) throw insertError;

      await supabase.from('audit_logs').insert({
        action: 'UPLOAD_MECHANIC_CERTIFICATE',
        entity: 'mechanic_certificates',
        entity_id: mechanicId,
        performed_by: user?.id,
        details: { name: certName.trim() },
      });

      setCertName('');
      setCertFile(null);
      e.target.reset?.();
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
        action: 'DELETE_MECHANIC_CERTIFICATE',
        entity: 'mechanic_certificates',
        entity_id: cert.id,
        performed_by: user?.id,
        details: { name: cert.name, mechanic_id: cert.mechanic_id },
      });
      fetchCertificates(cert.mechanic_id);
    } finally {
      setDeletingCertId(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Manage Mechanics</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">View mechanic performance, manage schedules, certificates, and roles.</p>

        {/* Mechanics */}
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-transparent rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Mechanics ({mechanics.length})</h2>
          {loading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          ) : mechanics.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400 text-sm">No mechanics yet.</p>
          ) : (
            <div className="space-y-3">
              {mechanics.map((m) => {
                const total = m.bookings?.length || 0;
                const completed = m.bookings?.filter(b => b.status === 'completed').length || 0;
                const active = m.bookings?.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status)).length || 0;
                const isSelected = selectedMechanic?.id === m.id;

                return (
                  <div key={m.id} className="bg-gray-50 dark:bg-dark-900 rounded-lg overflow-hidden border border-gray-200 dark:border-transparent">
                    <div className="flex items-center justify-between p-4 flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        {m.mechanic_photo_url ? (
                          <img
                            src={m.mechanic_photo_url}
                            alt={`${m.first_name} ${m.last_name}`}
                            className="w-10 h-10 rounded-full object-cover border border-primary-500/30"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold text-white">
                            {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{m.first_name} {m.last_name}</p>
                          {m.specialization && (
                            <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">{m.specialization}</p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.email}</p>
                          <div className="flex gap-3 mt-1">
                            <span className="text-xs text-gray-400 dark:text-gray-500">Total: {total}</span>
                            <span className="text-xs text-blue-600 dark:text-blue-400">Active: {active}</span>
                            <span className="text-xs text-green-600 dark:text-green-400">Done: {completed}</span>
                            {m.rating_avg > 0 && (
                              <span className="text-xs text-yellow-600 dark:text-yellow-400">★ {m.rating_avg.toFixed(1)} ({m.rating_count})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSelectMechanic(m)}
                          className="text-xs text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-500/30 px-3 py-1.5 rounded-md hover:bg-primary-50 dark:hover:bg-primary-500/10 transition"
                        >
                          {isSelected ? 'Hide Details' : '📋 Manage'}
                        </button>
                        <button
                          type="button"
                          onClick={() => changeRole(m.id, 'customer')}
                          className="text-xs text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-md hover:border-gray-400 dark:hover:border-gray-500 transition"
                        >
                          Demote
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-6">

                        {/* ── Schedule ── */}
                        <div>
                          <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
                            📅 Schedule for {m.first_name} {m.last_name}
                          </h3>

                          {schedules.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">No bookings assigned yet.</p>
                          ) : (
                            <div className="space-y-2 mb-4">
                              {schedules.map((b) => (
                                <div key={b.id} className="bg-white dark:bg-dark-800 rounded-lg p-3 flex items-start justify-between flex-wrap gap-3 border border-gray-200 dark:border-transparent">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {b.profiles?.first_name} {b.profiles?.last_name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{b.services?.name}</p>
                                    {b.notes && (
                                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Note: {b.notes}</p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div>
                                      <p className="text-xs text-gray-500 dark:text-gray-500 mb-0.5">Date</p>
                                      <input
                                        type="date"
                                        defaultValue={b.booking_date}
                                        onBlur={(e) => {
                                          if (e.target.value !== b.booking_date) {
                                            updateSchedule(b.id, { booking_date: e.target.value }, m.id);
                                          }
                                        }}
                                        className="bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-900 dark:text-white"
                                      />
                                    </div>

                                    <div>
                                      <p className="text-xs text-gray-500 dark:text-gray-500 mb-0.5">Time</p>
                                      <select
                                        defaultValue={b.booking_time}
                                        onChange={(e) => updateSchedule(b.id, { booking_time: e.target.value }, m.id)}
                                        className="bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-900 dark:text-white"
                                      >
                                        {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'].map((slot) => {
                                          const [h] = slot.split(':');
                                          const hour = parseInt(h);
                                          const ampm = hour >= 12 ? 'PM' : 'AM';
                                          const display = hour > 12 ? hour - 12 : hour;
                                          return (
                                            <option key={slot} value={slot}>{display}:00 {ampm}</option>
                                          );
                                        })}
                                      </select>
                                    </div>

                                    <div>
                                      <p className="text-xs text-gray-500 dark:text-gray-500 mb-0.5">Status</p>
                                      <select
                                        value={b.status}
                                        onChange={(e) => updateSchedule(b.id, { status: e.target.value }, m.id)}
                                        className="bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-900 dark:text-white"
                                      >
                                        <option value="pending">Pending</option>
                                        <option value="confirmed">Confirmed</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                      </select>
                                    </div>

                                    <div className="flex items-end pb-0.5">
                                      <button
                                        type="button"
                                        onClick={() => removeFromSchedule(b.id, m.id)}
                                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 border border-red-300 dark:border-red-500/30 px-2 py-1 rounded-md transition"
                                      >
                                        Unassign
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            To assign new bookings to this mechanic, go to{' '}
                            <a href="/admin/bookings" className="text-primary-600 dark:text-primary-400 hover:underline">
                              Manage Bookings
                            </a>{' '}
                            and use the mechanic dropdown on each booking.
                          </p>
                        </div>

                        {/* ── Certificates ── */}
                        <div className="border-t border-gray-200 dark:border-gray-800 pt-5">
                          <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
                            🎓 Certificates for {m.first_name} {m.last_name}
                          </h3>

                          {certificates.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">No certificates uploaded yet.</p>
                          ) : (
                            <div className="space-y-2 mb-4">
                              {certificates.map((c) => (
                                <div key={c.id} className="bg-white dark:bg-dark-800 rounded-lg p-3 flex items-center justify-between gap-3 border border-gray-200 dark:border-transparent">
                                  <div className="min-w-0 flex items-center gap-2">
                                    <span className="text-base flex-shrink-0">📄</span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                                      <p className="text-xs text-gray-400 dark:text-gray-500">
                                        Uploaded {new Date(c.created_at).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <a
                                      href={c.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-500/30 px-2.5 py-1 rounded-md hover:bg-primary-50 dark:hover:bg-primary-500/10 transition"
                                    >
                                      View
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => deleteCertificate(c)}
                                      disabled={deletingCertId === c.id}
                                      className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 border border-red-300 dark:border-red-500/30 px-2.5 py-1 rounded-md transition disabled:opacity-50"
                                    >
                                      {deletingCertId === c.id ? '...' : 'Delete'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {certError && (
                            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-lg p-3 mb-3">
                              {certError}
                            </div>
                          )}

                          <form onSubmit={handleUploadCertificate} className="bg-gray-50 dark:bg-dark-900 rounded-lg p-4 flex flex-wrap items-end gap-3 border border-gray-200 dark:border-transparent">
                            <div className="flex-1 min-w-[160px]">
                              <label className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Certificate Name</label>
                              <input
                                type="text"
                                value={certName}
                                onChange={(e) => setCertName(e.target.value)}
                                placeholder="e.g. TESDA NC II - Motorcycle Servicing"
                                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-dark-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary-500"
                              />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-xs text-gray-500 dark:text-gray-500 mb-1">File</label>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleCertFileChange}
                                className="w-full text-xs text-gray-600 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary-600 file:text-white file:cursor-pointer file:hover:bg-primary-700 file:text-xs"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={uploadingCert}
                              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-1.5 rounded-md text-sm font-medium transition text-white"
                            >
                              {uploadingCert ? 'Uploading...' : '+ Upload Certificate'}
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add New Mechanic Form */}
        <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-transparent rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Mechanic</h2>

          {mechanicMessage && (
            <div className={`text-sm rounded-lg p-3 mb-4 ${
              mechanicMessage.startsWith('Error')
                ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                : 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30'
            }`}>
              {mechanicMessage}
            </div>
          )}

          <form onSubmit={handleCreateMechanic} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
              <input
                name="firstName"
                value={mechanicForm.firstName}
                onChange={handleMechanicFormChange}
                required
                placeholder="Juan"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
              <input
                name="lastName"
                value={mechanicForm.lastName}
                onChange={handleMechanicFormChange}
                required
                placeholder="Dela Cruz"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input
                type="email"
                name="email"
                value={mechanicForm.email}
                onChange={handleMechanicFormChange}
                required
                placeholder="mechanic@email.com"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <input
                name="phone"
                value={mechanicForm.phone}
                onChange={handleMechanicFormChange}
                placeholder="09XX XXX XXXX"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Password *</label>
              <input
                type="password"
                name="password"
                value={mechanicForm.password}
                onChange={handleMechanicFormChange}
                required
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Confirm Password *</label>
              <input
                type="password"
                name="confirmPassword"
                value={mechanicForm.confirmPassword}
                onChange={handleMechanicFormChange}
                required
                placeholder="Repeat password"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creatingMechanic}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-semibold transition text-white"
              >
                {creatingMechanic ? 'Creating Account...' : '+ Create Mechanic Account'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}