import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
  });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchStaff(); }, []);

  async function fetchStaff() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'staff');
    if (data) setStaff(data);
    setLoading(false);
  }

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setMessage('');

    if (form.password !== form.confirmPassword) {
      setMessage('Error: Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setMessage('Error: Password must be at least 6 characters.');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-account', {
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: 'staff',
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setMessage(`✅ Staff account created! ${form.firstName} ${form.lastName} can log in with ${form.email}`);
      setForm({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
      fetchStaff();
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function demoteStaff(id) {
    if (!confirm('Remove staff access for this account?')) return;
    await supabase.from('profiles').update({ role: 'customer' }).eq('id', id);
    fetchStaff();
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Manage Staff</h1>
        <p className="text-gray-400 mb-8">Create and manage staff/cashier accounts.</p>

        <div className="bg-dark-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Staff Accounts ({staff.length})</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : staff.length === 0 ? (
            <p className="text-gray-400 text-sm">No staff accounts yet.</p>
          ) : (
            <div className="space-y-2">
              {staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-dark-900 rounded-lg p-4">
                  <div>
                    <p className="font-medium text-sm">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-gray-400">{s.email}{s.phone ? ` · ${s.phone}` : ''}</p>
                  </div>
                  <button
                    onClick={() => demoteStaff(s.id)}
                    className="text-xs text-red-400 border border-red-500/30 px-3 py-1.5 rounded-md hover:bg-red-500/10 transition"
                  >
                    Remove Access
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-dark-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Staff</h2>
          {message && (
            <div className={`text-sm rounded-lg p-3 mb-4 ${
              message.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
            }`}>
              {message}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid md:grid-cols-2 gap-4">
            <input name="firstName" value={form.firstName} onChange={handleChange} required placeholder="First Name"
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
            <input name="lastName" value={form.lastName} onChange={handleChange} required placeholder="Last Name"
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
            <input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="Email"
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone"
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
            <input type="password" name="password" value={form.password} onChange={handleChange} required placeholder="Password (min 6 chars)"
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
            <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} required placeholder="Confirm Password"
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
            <div className="md:col-span-2">
              <button type="submit" disabled={creating}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-semibold transition">
                {creating ? 'Creating...' : '+ Create Staff Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}