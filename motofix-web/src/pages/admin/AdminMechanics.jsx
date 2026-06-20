import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function AdminMechanics() {
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
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, status, notes, profiles!bookings_customer_id_fkey(first_name, last_name), services(name)')
      .eq('mechanic_id', mechanicId)
      .order('booking_date', { ascending: true });
    if (data) setSchedules(data);
  }

  async function updateSchedule(bookingId, updates) {
    await supabase.from('bookings').update(updates).eq('id', bookingId);
    fetchMechanicSchedule(selectedMechanic.id);
  }

  async function removeFromSchedule(bookingId) {
    if (!confirm('Unassign this mechanic from the booking?')) return;
    await supabase.from('bookings').update({ mechanic_id: null }).eq('id', bookingId);
    fetchMechanicSchedule(selectedMechanic.id);
  }

  async function changeRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id);
    if (selectedMechanic?.id === id) {
      setSelectedMechanic(null);
      setSchedules([]);
    }
    fetchMechanics();
  }

  function toggleCustomer(id) {
    setExpandedCustomers(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Manage Mechanics</h1>
        <p className="text-gray-400 mb-8">View mechanic performance, manage schedules, and manage roles.</p>

        {/* Mechanics */}
        <div className="bg-dark-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Mechanics ({mechanics.length})</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : mechanics.length === 0 ? (
            <p className="text-gray-400 text-sm">No mechanics yet.</p>
          ) : (
            <div className="space-y-3">
              {mechanics.map((m) => {
                const total = m.bookings?.length || 0;
                const completed = m.bookings?.filter(b => b.status === 'completed').length || 0;
                const active = m.bookings?.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status)).length || 0;
                const isSelected = selectedMechanic?.id === m.id;

                return (
                  <div key={m.id} className="bg-dark-900 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-4 flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        {m.mechanic_photo_url ? (
                          <img 
                            src={m.mechanic_photo_url} 
                            alt={`${m.first_name} ${m.last_name}`}
                            className="w-10 h-10 rounded-full object-cover border border-primary-500/30" 
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold">
                            {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{m.first_name} {m.last_name}</p>
                          {m.specialization && (
                            <p className="text-xs text-primary-400 mt-0.5">{m.specialization}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">{m.email}</p>
                          <div className="flex gap-3 mt-1">
                            <span className="text-xs text-gray-500">Total: {total}</span>
                            <span className="text-xs text-blue-400">Active: {active}</span>
                            <span className="text-xs text-green-400">Done: {completed}</span>
                            {m.rating_avg > 0 && (
                              <span className="text-xs text-yellow-400">★ {m.rating_avg.toFixed(1)} ({m.rating_count})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (isSelected) {
                              setSelectedMechanic(null);
                              setSchedules([]);
                            } else {
                              setSelectedMechanic(m);
                              fetchMechanicSchedule(m.id);
                            }
                          }}
                          className="text-xs text-primary-400 border border-primary-500/30 px-3 py-1.5 rounded-md hover:bg-primary-500/10 transition"
                        >
                          {isSelected ? 'Hide Schedule' : '📅 Manage Schedule'}
                        </button>
                        <button
                          onClick={() => changeRole(m.id, 'customer')}
                          className="text-xs text-gray-400 border border-gray-600 px-3 py-1.5 rounded-md hover:border-gray-500 transition"
                        >
                          Demote
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="border-t border-gray-800 p-4">
                        <h3 className="text-sm font-semibold mb-3 text-gray-300">
                          📅 Schedule for {m.first_name} {m.last_name}
                        </h3>

                        {schedules.length === 0 ? (
                          <p className="text-sm text-gray-500 mb-4">No bookings assigned yet.</p>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {schedules.map((b) => (
                              <div key={b.id} className="bg-dark-800 rounded-lg p-3 flex items-start justify-between flex-wrap gap-3">
                                <div>
                                  <p className="text-sm font-medium">
                                    {b.profiles?.first_name} {b.profiles?.last_name}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">{b.services?.name}</p>
                                  {b.notes && (
                                    <p className="text-xs text-gray-500 mt-0.5">Note: {b.notes}</p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                  <div>
                                    <p className="text-xs text-gray-500 mb-0.5">Date</p>
                                    <input
                                      type="date"
                                      defaultValue={b.booking_date}
                                      onBlur={(e) => {
                                        if (e.target.value !== b.booking_date) {
                                          updateSchedule(b.id, { booking_date: e.target.value });
                                        }
                                      }}
                                      className="bg-dark-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-white"
                                    />
                                  </div>

                                  <div>
                                    <p className="text-xs text-gray-500 mb-0.5">Time</p>
                                    <select
                                      defaultValue={b.booking_time}
                                      onChange={(e) => updateSchedule(b.id, { booking_time: e.target.value })}
                                      className="bg-dark-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-white"
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
                                    <p className="text-xs text-gray-500 mb-0.5">Status</p>
                                    <select
                                      value={b.status}
                                      onChange={(e) => updateSchedule(b.id, { status: e.target.value })}
                                      className="bg-dark-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-white"
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
                                      onClick={() => removeFromSchedule(b.id)}
                                      className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-1 rounded-md transition"
                                    >
                                      Unassign
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-gray-500">
                          To assign new bookings to this mechanic, go to{' '}
                          <a href="/admin/bookings" className="text-primary-400 hover:underline">
                            Manage Bookings
                          </a>{' '}
                          and use the mechanic dropdown on each booking.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add New Mechanic Form */}
        <div className="bg-dark-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Mechanic</h2>

          {mechanicMessage && (
            <div className={`text-sm rounded-lg p-3 mb-4 ${
              mechanicMessage.startsWith('Error')
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'bg-green-500/10 text-green-400 border border-green-500/30'
            }`}>
              {mechanicMessage}
            </div>
          )}

          <form onSubmit={handleCreateMechanic} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">First Name *</label>
              <input
                name="firstName"
                value={mechanicForm.firstName}
                onChange={handleMechanicFormChange}
                required
                placeholder="Juan"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Last Name *</label>
              <input
                name="lastName"
                value={mechanicForm.lastName}
                onChange={handleMechanicFormChange}
                required
                placeholder="Dela Cruz"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Email *</label>
              <input
                type="email"
                name="email"
                value={mechanicForm.email}
                onChange={handleMechanicFormChange}
                required
                placeholder="mechanic@email.com"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Phone</label>
              <input
                name="phone"
                value={mechanicForm.phone}
                onChange={handleMechanicFormChange}
                placeholder="09XX XXX XXXX"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Password *</label>
              <input
                type="password"
                name="password"
                value={mechanicForm.password}
                onChange={handleMechanicFormChange}
                required
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Confirm Password *</label>
              <input
                type="password"
                name="confirmPassword"
                value={mechanicForm.confirmPassword}
                onChange={handleMechanicFormChange}
                required
                placeholder="Repeat password"
                className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creatingMechanic}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-semibold transition"
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