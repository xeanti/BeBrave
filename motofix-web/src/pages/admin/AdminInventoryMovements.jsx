import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const MOVEMENT_TYPES = [
  { key: 'all', label: 'All Movements', icon: '📦' },
  { key: 'stock_in', label: 'Stock In', icon: '➕' },
  { key: 'stock_out', label: 'Stock Out', icon: '➖' },
  { key: 'reserved', label: 'Reserved', icon: '🔒' },
  { key: 'released', label: 'Released', icon: '↩️' },
  { key: 'used_service', label: 'Used in Service', icon: '🛠️' },
  { key: 'sold_order', label: 'Sold Order', icon: '🧾' },
  { key: 'refund_return', label: 'Refund Return', icon: '↪️' },
  { key: 'manual_adjustment', label: 'Manual Adjustment', icon: '⚙️' },
];

const DATE_FILTERS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
];

const POSITIVE_TYPES = ['stock_in', 'released', 'refund_return'];
const NEGATIVE_TYPES = ['stock_out', 'reserved', 'used_service', 'sold_order', 'manual_adjustment'];

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

function formatShortDate(value) {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getMovementMeta(type) {
  return (
    MOVEMENT_TYPES.find((item) => item.key === type) || {
      key: type,
      label: String(type || 'Unknown').replaceAll('_', ' '),
      icon: '📦',
    }
  );
}

function getSignedQuantity(movement) {
  const quantity = Number(movement.quantity) || 0;

  if (POSITIVE_TYPES.includes(movement.movement_type)) return quantity;
  if (NEGATIVE_TYPES.includes(movement.movement_type)) return -quantity;

  const previousStock = Number(movement.previous_stock) || 0;
  const newStock = Number(movement.new_stock) || 0;
  return newStock - previousStock;
}

function getQuantityTone(signedQuantity) {
  if (signedQuantity > 0) return 'text-green-600 dark:text-green-300';
  if (signedQuantity < 0) return 'text-red-600 dark:text-red-300';
  return 'text-gray-600 dark:text-gray-300';
}

function getBadgeClass(type) {
  if (['stock_in', 'released', 'refund_return'].includes(type)) {
    return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/25';
  }

  if (['sold_order', 'used_service', 'stock_out'].includes(type)) {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25';
  }

  if (type === 'reserved') {
    return 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/25';
  }

  return 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25';
}

function getUserName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return name || profile?.email || 'System';
}

function getDateThreshold(filter) {
  const now = new Date();

  if (filter === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (filter === '7d') {
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    return date;
  }

  if (filter === '30d') {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return date;
  }

  return null;
}

function StatCard({ label, value, icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-950 dark:text-white',
    primary: 'text-primary-600 dark:text-primary-400',
    green: 'text-green-600 dark:text-green-300',
    red: 'text-red-600 dark:text-red-300',
    yellow: 'text-yellow-600 dark:text-yellow-300',
    accent: 'text-accent-600 dark:text-accent-400',
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-700 dark:bg-dark-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className={`text-2xl font-black ${tones[tone] || tones.default}`}>{value}</p>
    </div>
  );
}

function MovementSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-3xl bg-white ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700"
        />
      ))}
    </div>
  );
}

export default function AdminInventoryMovements() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    fetchMovements();

    const channel = supabase
      .channel('admin-inventory-movements')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_movements',
        },
        () => fetchMovements(false)
      )
      .subscribe();

    const handleFocus = () => fetchMovements(false);
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchMovements(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function fetchMovements(showLoader = true) {
    if (showLoader) setLoading(true);

    setFetchError('');

    const { data, error } = await supabase
      .from('inventory_movements')
      .select(`
        id,
        part_id,
        movement_type,
        quantity,
        previous_stock,
        new_stock,
        reason,
        related_order_id,
        related_booking_id,
        performed_by,
        created_at,
        parts!inventory_movements_part_id_fkey(
          id,
          name,
          category,
          image_url
        ),
        profiles!inventory_movements_performed_by_fkey(
          id,
          first_name,
          last_name,
          email,
          role,
          profile_photo_url
        ),
        orders!inventory_movements_related_order_id_fkey(
          id,
          created_at,
          status
        ),
        bookings!inventory_movements_related_booking_id_fkey(
          id,
          booking_date,
          booking_time,
          status
        )
      `)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      setFetchError(error.message || 'Failed to load inventory movement history.');
      setMovements([]);
      setLoading(false);
      return;
    }

    setMovements(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  const filteredMovements = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const threshold = getDateThreshold(dateFilter);

    let result = movements.filter((movement) => {
      const part = movement.parts;
      const profile = movement.profiles;
      const createdAt = movement.created_at ? new Date(movement.created_at) : null;

      const searchText = [
        part?.name,
        part?.category,
        movement.movement_type,
        movement.reason,
        profile?.first_name,
        profile?.last_name,
        profile?.email,
        profile?.role,
        movement.related_order_id,
        movement.related_booking_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !searchTerm || searchText.includes(searchTerm);
      const matchesType = typeFilter === 'all' || movement.movement_type === typeFilter;
      const matchesDate = !threshold || (createdAt && createdAt >= threshold);

      return matchesSearch && matchesType && matchesDate;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }

      if (sortBy === 'qty_high') {
        return Math.abs(getSignedQuantity(b)) - Math.abs(getSignedQuantity(a));
      }

      if (sortBy === 'qty_low') {
        return Math.abs(getSignedQuantity(a)) - Math.abs(getSignedQuantity(b));
      }

      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return result;
  }, [movements, search, typeFilter, dateFilter, sortBy]);

  const stats = useMemo(() => {
    const totalMovements = filteredMovements.length;
    const stockIn = filteredMovements
      .filter((movement) => getSignedQuantity(movement) > 0)
      .reduce((sum, movement) => sum + getSignedQuantity(movement), 0);

    const stockOut = filteredMovements
      .filter((movement) => getSignedQuantity(movement) < 0)
      .reduce((sum, movement) => sum + Math.abs(getSignedQuantity(movement)), 0);

    const sold = filteredMovements
      .filter((movement) => movement.movement_type === 'sold_order')
      .reduce((sum, movement) => sum + (Number(movement.quantity) || 0), 0);

    const serviceUsed = filteredMovements
      .filter((movement) => movement.movement_type === 'used_service')
      .reduce((sum, movement) => sum + (Number(movement.quantity) || 0), 0);

    return {
      totalMovements,
      stockIn,
      stockOut,
      netChange: stockIn - stockOut,
      sold,
      serviceUsed,
    };
  }, [filteredMovements]);

  function clearFilters() {
    setSearch('');
    setTypeFilter('all');
    setDateFilter('all');
    setSortBy('newest');
  }

  const hasFilters = search || typeFilter !== 'all' || dateFilter !== 'all' || sortBy !== 'newest';

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
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
                  Inventory History
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Track every stock increase, deduction, order sale, service usage, refund return, and manual adjustment.
                </p>
                {lastUpdated && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Last updated: {formatDateTime(lastUpdated)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchMovements(false)}
                className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {fetchError}
          </div>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label="Movements" value={stats.totalMovements} icon="📜" tone="primary" />
          <StatCard label="Stock In" value={`+${stats.stockIn}`} icon="➕" tone="green" />
          <StatCard label="Stock Out" value={`-${stats.stockOut}`} icon="➖" tone="red" />
          <StatCard
            label="Net Change"
            value={stats.netChange > 0 ? `+${stats.netChange}` : String(stats.netChange)}
            icon="📊"
            tone={stats.netChange >= 0 ? 'green' : 'red'}
          />
          <StatCard label="Sold" value={stats.sold} icon="🧾" tone="accent" />
          <StatCard label="Service Used" value={stats.serviceUsed} icon="🛠️" tone="yellow" />
        </div>

        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="mb-4 flex flex-wrap gap-2">
            {MOVEMENT_TYPES.map((item) => {
              const active = typeFilter === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTypeFilter(item.key)}
                  className={`rounded-full px-4 py-2 text-xs font-black transition ${
                    active
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:bg-dark-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              placeholder="Search part, reason, user, order ID, or booking ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-gray-500"
            />

            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-white"
            >
              {DATE_FILTERS.map((item) => (
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
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="qty_high">Quantity: High to Low</option>
              <option value="qty_low">Quantity: Low to High</option>
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            Showing {filteredMovements.length} of {movements.length} movement records
          </p>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-black text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <MovementSkeleton />
        ) : filteredMovements.length === 0 ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-16 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-50 text-4xl ring-1 ring-primary-100 dark:bg-primary-500/10 dark:ring-primary-500/20">
              📜
            </div>
            <h2 className="mb-2 text-xl font-black text-gray-950 dark:text-white">
              No inventory movement found
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              {movements.length === 0
                ? 'No stock history has been recorded yet. Try adding stock, selling parts, or using parts in service.'
                : 'No movement records match your current filters.'}
            </p>
            {hasFilters && (
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
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="hidden border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-500 dark:border-dark-700 dark:bg-dark-900/60 dark:text-gray-400 lg:grid lg:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_1fr] lg:gap-4">
              <div>Part</div>
              <div>Movement</div>
              <div>Quantity</div>
              <div>Stock</div>
              <div>Performed By</div>
              <div>Date / Link</div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-dark-700">
              {filteredMovements.map((movement) => {
                const meta = getMovementMeta(movement.movement_type);
                const signedQuantity = getSignedQuantity(movement);
                const quantityLabel = signedQuantity > 0 ? `+${signedQuantity}` : String(signedQuantity);
                const part = movement.parts;
                const performer = movement.profiles;

                return (
                  <article
                    key={movement.id}
                    className="grid gap-4 px-5 py-5 transition hover:bg-gray-50 dark:hover:bg-dark-900/50 lg:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_1fr] lg:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-gray-100 dark:bg-dark-900 dark:ring-dark-700">
                        {part?.image_url ? (
                          <img src={part.image_url} alt={part.name || 'Part'} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-2xl text-gray-400">⚙️</div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                          {part?.name || 'Deleted / Unknown Part'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {part?.category || 'Uncategorized'}
                        </p>
                        {movement.reason && (
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                            {movement.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ring-1 ${getBadgeClass(movement.movement_type)}`}>
                        <span>{meta.icon}</span>
                        {meta.label}
                      </span>
                    </div>

                    <div>
                      <p className={`text-lg font-black ${getQuantityTone(signedQuantity)}`}>
                        {quantityLabel}
                      </p>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {Number(movement.quantity) || 0} pcs
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-black text-gray-950 dark:text-white">
                        {movement.previous_stock} → {movement.new_stock}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">previous → new</p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                        {getUserName(performer)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-gray-500 dark:text-gray-400">
                        {performer?.role || 'system'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-black text-gray-950 dark:text-white">
                        {formatShortDate(movement.created_at)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(movement.created_at)}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {movement.related_order_id && (
                          <span className="rounded-full bg-accent-50 px-2.5 py-1 text-[10px] font-black text-accent-700 ring-1 ring-accent-100 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/25">
                            Order {movement.related_order_id.slice(0, 8).toUpperCase()}
                          </span>
                        )}

                        {movement.related_booking_id && (
                          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-black text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                            Booking {movement.related_booking_id.slice(0, 8).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
