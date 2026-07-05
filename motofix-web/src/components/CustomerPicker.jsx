import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9ñÑ @._+\-']/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

function getCustomerName(customer) {
  const name = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();

  return name || 'Unnamed Customer';
}

function getCustomerMeta(customer) {
  return [customer?.phone, customer?.email].filter(Boolean).join(' · ') || 'No contact saved';
}

function normalizeCustomer(row) {
  return {
    ...row,
    first_name: row?.first_name || '',
    last_name: row?.last_name || '',
    phone: row?.phone || '',
    email: row?.email || '',
  };
}

export default function CustomerPicker({ selected, onSelect }) {
  const wrapperRef = useRef(null);

  /*
    IMPORTANT:
    Do not reuse the exact same Supabase realtime channel name here.

    CustomerPicker can appear more than once in the staff dashboard, and React Strict Mode
    mounts effects twice during development. Reusing "customer-picker-profiles" may return
    an already-subscribed channel, then Supabase throws:

    cannot add `postgres_changes` callbacks ... after `subscribe()`.

    This unique channel name prevents that crash.
  */
  const channelNameRef = useRef(
    `customer-picker-profiles-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    fetchCustomers(true, active);

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => fetchCustomers(false, active)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!wrapperRef.current) return;

      if (!wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchCustomers(showLoader = true, active = true) {
    if (showLoader) setLoading(true);

    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone, role, profile_photo_url, is_active')
      .eq('role', 'customer')
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true })
      .limit(500);

    if (!active) return;

    if (fetchError) {
      setError(fetchError.message || 'Failed to load customers.');
      setCustomers([]);
    } else {
      setError('');
      setCustomers((data || []).map(normalizeCustomer));
    }

    setLoading(false);
  }

  const filteredCustomers = useMemo(() => {
    const search = sanitizeSearch(query).toLowerCase();

    if (!search) return customers.slice(0, 15);

    return customers
      .filter((customer) => {
        const haystack = [
          customer.id,
          customer.first_name,
          customer.last_name,
          customer.email,
          customer.phone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      })
      .slice(0, 15);
  }, [customers, query]);

  function handleSelect(customer) {
    onSelect?.(customer);
    setQuery('');
    setOpen(false);
    setError('');
  }

  function clearSelected() {
    onSelect?.(null);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={wrapperRef}>
      {selected ? (
        <div className="rounded-3xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-500/25 dark:bg-primary-500/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-primary-800 dark:text-primary-200">
                {getCustomerName(selected)}
              </p>
              <p className="mt-1 text-xs font-semibold text-primary-700/80 dark:text-primary-200/80">
                {getCustomerMeta(selected)}
              </p>
            </div>

            <button
              type="button"
              onClick={clearSelected}
              className="rounded-xl bg-white px-3 py-2 text-xs font-black text-primary-700 ring-1 ring-primary-200 transition hover:bg-primary-100 dark:bg-dark-800 dark:text-primary-300 dark:ring-primary-500/25"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-sm text-gray-400">
              🔍
            </span>

            <input
              type="text"
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(sanitizeSearch(event.target.value));
                setOpen(true);
              }}
              placeholder="Search existing customer by name, phone, or email..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
            />

            {open && (
              <div className="absolute z-40 mt-2 max-h-80 w-full overflow-y-auto rounded-3xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-dark-700 dark:bg-dark-800">
                {loading ? (
                  <div className="p-4 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">
                    Loading customers...
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm font-black text-gray-950 dark:text-white">
                      No existing customer found
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      For walk-ins, use Guest Customer in the POS. For registered accounts,
                      create the user from Admin/Super Admin Users first.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => handleSelect(customer)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-primary-50 dark:hover:bg-primary-500/10"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                            {getCustomerName(customer)}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                            {getCustomerMeta(customer)}
                          </p>
                        </div>

                        <span className="rounded-full bg-primary-600 px-3 py-1 text-[10px] font-black text-white">
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <p className="mt-3 rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-semibold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-200 dark:ring-yellow-500/25">
            Existing customers only. New registered accounts should be created from Admin/Super Admin Users.
          </p>
        </>
      )}
    </div>
  );
}
