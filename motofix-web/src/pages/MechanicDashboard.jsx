import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';

// ─── Status config (mirrors mobile statusColor + badge logic) ─────────────────
const STATUS_CONFIG = {
  pending:     { label: 'Pending',     bg: 'bg-yellow-500/15', text: 'text-yellow-400',  border: 'border-yellow-500/30',  dot: 'bg-yellow-400'  },
  confirmed:   { label: 'Confirmed',   bg: 'bg-green-500/15',  text: 'text-green-400',   border: 'border-green-500/30',   dot: 'bg-green-400'   },
  in_progress: { label: 'In Progress', bg: 'bg-blue-500/15',   text: 'text-blue-400',    border: 'border-blue-500/30',    dot: 'bg-blue-400'    },
  completed:   { label: 'Completed',   bg: 'bg-gray-500/15',   text: 'text-gray-400',    border: 'border-gray-500/30',    dot: 'bg-gray-400'    },
  cancelled:   { label: 'Cancelled',   bg: 'bg-red-500/15',    text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-400'     },
};

const STATUS_FLOW = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

// ─── Status badge (pill) ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold capitalize whitespace-nowrap border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Stat / filter chip (mirrors mobile statChip) ────────────────────────────
function StatChip({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center px-4 py-2.5 rounded-xl border text-center transition-all whitespace-nowrap min-w-[72px] ${
        active
          ? 'bg-primary-600 border-primary-600 text-white shadow-md'
          : 'bg-dark-800 border-gray-700/60 text-gray-400 hover:border-gray-500 hover:text-white'
      }`}
    >
      <span className={`text-lg font-bold leading-none ${active ? 'text-white' : 'text-white'}`}>{count}</span>
      <span className={`text-[11px] mt-1 leading-none ${active ? 'text-white/80' : 'text-gray-500'}`}>{label}</span>
    </button>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function MechanicDashboard() {
  const { user, profile } = useAuth();
  const [bookings,     setBookings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId,   setUpdatingId]   = useState(null);

  useEffect(() => { fetchBookings(); }, [user]);

  async function fetchBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(name, base_price, labor_cost, estimated_duration_minutes), profiles!bookings_customer_id_fkey(first_name, last_name, phone)')
      .eq('mechanic_id', user.id)
      .order('booking_date', { ascending: true });

    if (!error) setBookings(data || []);
    setLoading(false);
  }

  async function updateStatus(bookingId, status) {
    setUpdatingId(bookingId);
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .eq('mechanic_id', user.id);

    if (!error) {
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status } : b));
    }
    setUpdatingId(null);
  }

  const counts = {
    all:         bookings.length,
    pending:     bookings.filter((b) => b.status === 'pending').length,
    confirmed:   bookings.filter((b) => b.status === 'confirmed').length,
    in_progress: bookings.filter((b) => b.status === 'in_progress').length,
    completed:   bookings.filter((b) => b.status === 'completed').length,
    cancelled:   bookings.filter((b) => b.status === 'cancelled').length,
  };

  const filtered = bookings.filter((b) => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const customerName  = `${b.profiles?.first_name || ''} ${b.profiles?.last_name || ''}`.toLowerCase();
    const serviceName   = (b.services?.name || '').toLowerCase();
    const query         = search.trim().toLowerCase();
    const matchesSearch = query === '' || customerName.includes(query) || serviceName.includes(query);
    return matchesStatus && matchesSearch;
  });

  const initials = (profile?.first_name?.[0] || '') + (profile?.last_name?.[0] || '');

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white">
      <div className="max-w-4xl mx-auto px-5 py-8">

        {/* ── Profile header ────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-7 border-b border-gray-800">

          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt="Profile"
                className="w-14 h-14 rounded-full object-cover border-2 border-primary-200 dark:border-primary-500/30 flex-shrink-0 shadow-md"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary-600 flex items-center justify-center text-xl font-bold text-white flex-shrink-0 shadow-md">
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white leading-tight">
                {profile?.first_name} {profile?.last_name}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Mechanic Dashboard</p>
              {profile?.specialization && (
                <span className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium text-primary-400 bg-primary-500/10 border border-primary-500/20 px-2.5 py-1 rounded-full">
                  🔧 {profile.specialization}
                </span>
              )}
            </div>
          </div>

          {/* Rating card */}
          <div className="flex items-center gap-5 bg-dark-800 border border-gray-700/50 rounded-2xl px-5 py-3.5 self-start sm:self-auto">
            <div className="text-center">
              <div className="flex items-center gap-1.5">
                <span className="text-yellow-400 text-lg leading-none">★</span>
                <span className="text-xl font-extrabold text-white leading-none">
                  {profile?.rating_avg ? profile.rating_avg.toFixed(1) : '—'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{profile?.rating_count || 0} reviews</p>
            </div>
            <div className="w-px h-8 bg-gray-700" />
            <div className="flex flex-col gap-1.5">
              <Link to="/mechanic-ratings" className="text-xs text-primary-400 hover:text-primary-300 transition">
                View reviews →
              </Link>
              <Link to="/profile" className="text-xs text-primary-400 hover:text-primary-300 transition">
                Edit profile →
              </Link>
            </div>
          </div>
        </div>

        {/* ── Status filter chips (horizontal scroll on narrow, wrap on wide) ── */}
        <div className="flex gap-2.5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { key: 'all',         label: 'All'         },
            { key: 'pending',     label: 'Pending'     },
            { key: 'confirmed',   label: 'Confirmed'   },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'completed',   label: 'Completed'   },
            { key: 'cancelled',   label: 'Cancelled'   },
          ].map((f) => (
            <StatChip
              key={f.key}
              label={f.label}
              count={counts[f.key] ?? 0}
              active={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
            />
          ))}
        </div>

        {/* ── Search ────────────────────────────────────────────────────────── */}
        <div className="relative mb-6">
          <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-gray-500 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer or service name..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-dark-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/40 placeholder-gray-500 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-white transition text-xs"
            >✕</button>
          )}
        </div>

        {/* ── Booking cards ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center py-20 text-gray-500">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading your jobs...</p>
          </div>
        ) : bookings.length === 0 ? (
          <EmptyState icon="🔧" title="No bookings yet" sub="Bookings assigned to you will appear here." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" title="No matches found" action={() => { setSearch(''); setStatusFilter('all'); }} />
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                updatingId={updatingId}
                onUpdateStatus={updateStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Booking card (mirrors mobile job card + detail screen cost info)
// ══════════════════════════════════════════════════════════════════════════════
function BookingCard({ booking: b, updatingId, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false);
  const isUpdating = updatingId === b.id;

  const basePrice = b.services?.base_price || 0;
  const laborCost = b.services?.labor_cost  || 0;
  const total     = basePrice + laborCost;
  const duration  = b.services?.estimated_duration_minutes;

  const otherStatuses = STATUS_FLOW.filter((st) => st !== b.status);

  return (
    <div className={`bg-dark-800 rounded-2xl border border-gray-700/50 overflow-hidden transition-all ${isUpdating ? 'opacity-70' : ''}`}>

      {/* Card top — clickable to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 pt-4 pb-3 focus:outline-none group"
      >
        {/* Service name + status badge */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="font-bold text-white text-base leading-snug group-hover:text-primary-300 transition">
            {b.services?.name || 'Service'}
          </p>
          <StatusBadge status={b.status} />
        </div>

        {/* Date & time */}
        <p className="text-sm text-gray-400 mb-1.5">
          📅 <span className="text-gray-300">{b.booking_date}</span>
          {b.booking_time && <span className="text-gray-500"> · {b.booking_time}</span>}
          {duration && <span className="text-gray-500"> · {duration} mins</span>}
        </p>

        {/* Customer */}
        {b.profiles && (
          <p className="text-sm text-gray-400">
            👤 <span className="text-gray-300">{b.profiles.first_name} {b.profiles.last_name}</span>
            {b.profiles.phone && (
              <span className="text-gray-500"> · {b.profiles.phone}</span>
            )}
          </p>
        )}

        {/* Notes */}
        {b.notes && (
          <p className="text-sm text-gray-500 italic mt-1.5 line-clamp-1">"{b.notes}"</p>
        )}

        {/* Expand cue */}
        <div className="flex items-center gap-1 mt-2.5 text-[11px] text-gray-600">
          <span>{expanded ? '▲ Hide details' : '▼ Cost & status'}</span>
        </div>
      </button>

      {/* Expanded: cost breakdown + notes in full + status buttons */}
      {expanded && (
        <div className="border-t border-gray-700/50 px-5 pt-4 pb-5 space-y-4">

          {/* Cost breakdown (mirrors mobile JobDetailScreen cost card) */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Cost Breakdown</p>
            <div className="bg-dark-900 rounded-xl border border-gray-700/50 overflow-hidden">
              <CostRow label="Base Price"  value={`₱${basePrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
              <CostRow label="Labor Cost"  value={`₱${laborCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} border />
              <div className="flex justify-between items-center px-4 py-3 bg-dark-800/60 border-t border-gray-700/50">
                <span className="text-sm font-bold text-white">Total</span>
                <span className="text-base font-extrabold text-primary-400">
                  ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {b.down_payment > 0 && (
                <div className="px-4 py-2.5 bg-primary-500/10 border-t border-primary-500/20">
                  <p className="text-xs text-primary-400 font-medium">
                    Down payment of ₱{Number(b.down_payment).toFixed(2)} already collected
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Full notes */}
          {b.notes && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-sm text-gray-300 italic bg-dark-900 rounded-xl border border-gray-700/50 px-4 py-3">
                "{b.notes}"
              </p>
            </div>
          )}

          {/* Status update (mirrors mobile statusRow with colored borders) */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-2.5">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {otherStatuses.map((st) => {
                const cfg = STATUS_CONFIG[st];
                return (
                  <button
                    key={st}
                    disabled={isUpdating}
                    onClick={() => onUpdateStatus(b.id, st)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-40
                      ${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-90`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </button>
                );
              })}
              {isUpdating && (
                <span className="text-xs text-gray-500 flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                  Updating...
                </span>
              )}
            </div>
          </div>

          {/* Ref ID */}
          <p className="text-[11px] text-gray-600 font-mono pt-1">
            Ref #{b.id?.slice(0, 8).toUpperCase()}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Cost breakdown row ───────────────────────────────────────────────────────
function CostRow({ label, value, border }) {
  return (
    <div className={`flex justify-between items-center px-4 py-3 ${border ? 'border-t border-gray-700/50' : ''}`}>
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-200">{value}</span>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, sub, action }) {
  return (
    <div className="bg-dark-800 rounded-2xl border border-gray-700/50 p-12 text-center">
      <span className="text-5xl block mb-4">{icon}</span>
      <p className="text-base font-bold text-white mb-1">{title}</p>
      {sub && <p className="text-sm text-gray-500">{sub}</p>}
      {action && (
        <button
          onClick={action}
          className="mt-4 text-sm text-primary-400 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}