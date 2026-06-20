import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function CustomerPicker({ selected, onSelect }) {
  const [mode, setMode] = useState('search'); // 'search' | 'create'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [newCustomer, setNewCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone')
      .eq('role', 'customer')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(8);
    setResults(data || []);
    setSearching(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-account', {
        body: { ...newCustomer, role: 'customer' },
      });
      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      onSelect({
        id: data.account.id,
        first_name: data.account.first_name,
        last_name: data.account.last_name,
        email: data.account.email,
        phone: newCustomer.phone,
        _tempPassword: data.account.tempPassword,
      });
      setNewCustomer({ firstName: '', lastName: '', email: '', phone: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <div className="bg-dark-900 rounded-lg p-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'white' }}>
            {selected.first_name} {selected.last_name}
          </p>
          <p className="text-xs text-gray-400">{selected.email} {selected.phone ? `· ${selected.phone}` : ''}</p>
          {selected._tempPassword && (
            <p className="text-xs text-yellow-400 mt-1">
              Temp password: <code>{selected._tempPassword}</code> (share with customer)
            </p>
          )}
        </div>
        <button onClick={() => onSelect(null)} className="text-xs text-gray-400 hover:text-white">
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => setMode('search')}
          className={`text-xs px-3 py-1.5 rounded-full ${mode === 'search' ? 'bg-primary-600 text-white' : 'bg-dark-900 text-gray-400'}`}>
          Search Existing
        </button>
        <button type="button" onClick={() => setMode('create')}
          className={`text-xs px-3 py-1.5 rounded-full ${mode === 'create' ? 'bg-primary-600 text-white' : 'bg-dark-900 text-gray-400'}`}>
          + New Customer
        </button>
      </div>

      {mode === 'search' ? (
        <div>
          <div className="flex gap-2 mb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name, email, or phone..."
              className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500"
            />
            <button type="button" onClick={handleSearch}
              className="bg-dark-900 border border-gray-700 px-4 py-2 rounded-lg text-sm hover:border-primary-500 transition">
              {searching ? '...' : 'Search'}
            </button>
          </div>
          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((c) => (
                <button key={c.id} type="button" onClick={() => onSelect(c)}
                  className="w-full text-left bg-dark-900 hover:bg-dark-900/70 rounded-lg p-3 transition">
                  <p className="text-sm font-medium" style={{ color: 'white' }}>{c.first_name} {c.last_name}</p>
                  <p className="text-xs text-gray-400">{c.email} {c.phone ? `· ${c.phone}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleCreate} className="space-y-2">
          {error && <div className="bg-red-500/10 text-red-400 text-xs rounded-lg p-2">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            <input required placeholder="First Name" value={newCustomer.firstName}
              onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
            <input required placeholder="Last Name" value={newCustomer.lastName}
              onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
              className="px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
          </div>
          <input required type="email" placeholder="Email" value={newCustomer.email}
            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
          <input placeholder="Phone" value={newCustomer.phone}
            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500" />
          <button type="submit" disabled={creating}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition">
            {creating ? 'Creating...' : '+ Create & Select'}
          </button>
        </form>
      )}
    </div>
  );
}