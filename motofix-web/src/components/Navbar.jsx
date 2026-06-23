import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import CartDrawer from './CartDrawer';

// ─── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ count, color = 'bg-red-500' }) {
  if (!count) return null;
  return (
    <span className={`${color} text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none`}>
      {count > 9 ? '9+' : count}
    </span>
  );
}

// ─── Badge resolver ─────────────────────────────────────────────────────────────
function getBadge(to, { chatPath, unreadCount, pendingBookings, pendingOrders, pendingAssessments, lowStockParts }) {
  if (to === chatPath && unreadCount > 0)  return { count: unreadCount,        color: 'bg-yellow-500' };
  if (to === '/admin/bookings')             return { count: pendingBookings,    color: 'bg-yellow-500' };
  if (to === '/admin/orders')               return { count: pendingOrders,      color: 'bg-yellow-500' };
  if (to === '/admin/assessments')          return { count: pendingAssessments, color: 'bg-yellow-500' };
  if (to === '/admin/parts')                return { count: lowStockParts,      color: 'bg-yellow-500' };
  return { count: 0 };
}

// ─── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ url, initials, size = 'sm' }) {
  const dim = size === 'lg'
    ? 'w-12 h-12 text-lg'
    : 'w-9 h-9 text-sm';
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`${dim} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${dim} rounded-full bg-primary-600 text-white flex items-center justify-center font-bold flex-shrink-0`}>
      {initials || '?'}
    </div>
  );
}

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [menuOpen,     setMenuOpen]     = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [moreOpen,     setMoreOpen]     = useState(false);

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark');
  });

  const [unreadCount,        setUnreadCount]        = useState(0);
  const [pendingOrders,      setPendingOrders]      = useState(0);
  const [pendingBookings,    setPendingBookings]     = useState(0);
  const [pendingAssessments, setPendingAssessments]  = useState(0);
  const [lowStockParts,      setLowStockParts]       = useState(0);

  const dropdownRef = useRef(null);
  const moreRef     = useRef(null);

  // ── Theme sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('dark',  isDark);
    document.documentElement.classList.toggle('light', !isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    function handle(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
      if (moreRef.current     && !moreRef.current.contains(e.target))     setMoreOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Close mobile menu on route change ──────────────────────────────────────
  useEffect(() => { setMenuOpen(false); setMoreOpen(false); }, [location.pathname]);

  // ── Realtime: unread messages ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !profile) return;
    fetchUnreadCount();
    const ch = supabase
      .channel('unread-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, fetchUnreadCount)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user, profile]);

  // ── Realtime: admin notifs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user || profile?.role !== 'admin') return;
    fetchAdminNotifs();
    const ch = supabase
      .channel('admin-notifs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings'    }, fetchAdminNotifs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders'      }, fetchAdminNotifs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assessments' }, fetchAdminNotifs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts'       }, fetchAdminNotifs)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user, profile]);

  async function fetchAdminNotifs() {
    const [bookings, orders, assessments, parts] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('pre_assessments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('parts').select('id, stock_quantity, reorder_threshold'),
    ]);
    setPendingBookings(bookings.count || 0);
    setPendingOrders(orders.count || 0);
    setPendingAssessments(assessments.count || 0);
    setLowStockParts((parts.data || []).filter(p => p.stock_quantity <= (p.reorder_threshold ?? 5)).length);
  }

  async function fetchUnreadCount() {
    if (!user) return;
    try {
      if (profile?.role === 'customer') {
        const { data: convs } = await supabase
          .from('chat_conversations').select('id')
          .eq('customer_id', user.id).eq('status', 'open');
        if (!convs?.length) { setUnreadCount(0); return; }
        const { count } = await supabase
          .from('chat_messages').select('id', { count: 'exact' })
          .in('conversation_id', convs.map(c => c.id))
          .neq('sender_id', user.id).eq('is_read', false);
        setUnreadCount(count || 0);
      } else {
        const { count } = await supabase
          .from('chat_messages').select('id', { count: 'exact' })
          .neq('sender_id', user.id).eq('is_read', false);
        setUnreadCount(count || 0);
      }
    } catch (err) { console.error(err); }
  }

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  // ─── Link definitions ───────────────────────────────────────────────────────
  const customerLinks = [
    { to: '/dashboard',      label: 'Dashboard',    icon: '🏠' },
    { to: '/pre-assessment', label: 'Get Estimate',  icon: '🔍' },
    { to: '/booking',        label: 'Book Service',  icon: '📅' },
    { to: '/appointments',   label: 'Appointments',  icon: '⏰' },
    { to: '/shop',           label: 'Shop',          icon: '🛒' },
    { to: '/customize',      label: 'AI Preview',    icon: '✨' },
    { to: '/mechanics',      label: 'Mechanics',     icon: '🔧' },
    { to: '/chat',           label: 'Messages',      icon: '💬' },
  ];

  const mechanicLinks = [
    { to: '/mechanic-dashboard', label: 'My Jobs',    icon: '🔧' },
    { to: '/mechanics',          label: 'Team',        icon: '👥' },
    { to: '/admin/chat',         label: 'Messages',    icon: '💬' },
    { to: '/mechanic-ratings',   label: 'My Ratings',  icon: '⭐' },
  ];

  const staffLinks = [
    { to: '/staff',      label: 'POS / Booking', icon: '🖥️' },
    { to: '/admin/chat', label: 'Messages',       icon: '💬' },
  ];

  const adminPrimary = [
    { to: '/admin',             label: 'Dashboard',   icon: '📊' },
    { to: '/admin/bookings',    label: 'Bookings',    icon: '📅' },
    { to: '/admin/orders',      label: 'Orders',      icon: '📦' },
    { to: '/admin/assessments', label: 'Assessments', icon: '📋' },
    { to: '/admin/parts',       label: 'Parts',       icon: '⚙️' },
    { to: '/admin/chat',        label: 'Messages',    icon: '💬' },
  ];

  const adminSecondary = [
    { to: '/admin/services',  label: 'Services',  icon: '🔨' },
    { to: '/admin/users',     label: 'Users',     icon: '👥' },
    { to: '/admin/reports',   label: 'Reports',   icon: '📈' },
    { to: '/admin/settings',  label: 'Settings',  icon: '⚙️' },
  ];

  const navLinks =
    profile?.role === 'admin'    ? adminPrimary  :
    profile?.role === 'mechanic' ? mechanicLinks :
    profile?.role === 'staff'    ? staffLinks    :
    customerLinks;

  const adminAllLinks = [...adminPrimary, ...adminSecondary];
  const mobileNavLinks =
    profile?.role === 'admin' ? adminAllLinks : navLinks;

  const chatPath = profile?.role === 'customer' ? '/chat' : '/admin/chat';
  const badgeState = { chatPath, unreadCount, pendingBookings, pendingOrders, pendingAssessments, lowStockParts };

  const initials = profile
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : '';

  const totalAdminAlerts = pendingBookings + pendingOrders + pendingAssessments + lowStockParts + unreadCount;

  // ─── Reusable NavLink ───────────────────────────────────────────────────────
  function NavLink({ to, label, icon, mobile = false, onClick }) {
    const badge  = getBadge(to, badgeState);
    const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

    if (mobile) {
      return (
        <Link
          to={to}
          onClick={onClick}
          className={`flex items-center justify-between rounded-2xl px-5 py-4 text-base font-semibold transition-all ${
            active
              ? 'bg-primary-600 text-white'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-800'
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="text-xl w-7 text-center">{icon}</span>
            {label}
          </span>
          <Badge {...badge} />
        </Link>
      );
    }

    return (
      <Link
        to={to}
        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
          active
            ? 'bg-primary-600 text-white shadow-md'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white'
        }`}
      >
        <span>{icon}</span>
        <span>{label}</span>
        {badge.count > 0 && <Badge {...badge} />}
      </Link>
    );
  }

  // ─── Dropdown row ───────────────────────────────────────────────────────────
  function DropdownLink({ to, icon, label, onClick }) {
    const badge  = getBadge(to, badgeState);
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        onClick={onClick}
        className={`flex items-center justify-between px-4 py-3 text-sm transition-colors ${
          active
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-semibold'
            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-dark-700'
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span>{icon}</span>
          {label}
        </span>
        <Badge {...badge} />
      </Link>
    );
  }

  // ─── Theme Toggle Button ────────────────────────────────────────────────────
  // Pill-style slider with animated sun/moon swap
  function ThemeToggle({ mobile = false }) {
    return (
      <button
        onClick={() => setIsDark(v => !v)}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`
          relative flex items-center gap-1 rounded-full border transition-all duration-300 flex-shrink-0
          ${mobile
            ? 'w-16 h-8 px-1'
            : 'w-14 h-7 px-1'
          }
          ${isDark
            ? 'bg-dark-800 border-gray-600'
            : 'bg-gray-100 border-gray-300'
          }
        `}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {/* Track icons */}
        <span className={`absolute left-1.5 text-[11px] transition-opacity duration-200 ${isDark ? 'opacity-40' : 'opacity-100'}`}>
          ☀️
        </span>
        <span className={`absolute right-1.5 text-[11px] transition-opacity duration-200 ${isDark ? 'opacity-100' : 'opacity-40'}`}>
          🌙
        </span>
        {/* Sliding thumb */}
        <span
          className={`
            absolute top-0.5 w-6 h-6 rounded-full shadow-md transition-all duration-300 flex items-center justify-center text-[11px]
            ${mobile ? 'w-6 h-6' : 'w-5 h-5 top-[3px]'}
            ${isDark
              ? 'translate-x-[calc(100%+4px)] bg-dark-600'
              : 'translate-x-0 bg-white'
            }
          `}
        >
          {isDark ? '🌙' : '☀️'}
        </span>
      </button>
    );
  }

  return (
    <>
      {/* ════════════════════════════════════════════════════════════════════════
          NAVBAR
      ════════════════════════════════════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 bg-white dark:bg-dark-900 border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">

          {/* Logo */}
          <Link to="/" className="flex-shrink-0 text-2xl font-black tracking-tight text-gray-900 dark:text-white mr-1">
            Moto<span className="text-primary-500">Fix</span>
          </Link>

          {/* ── Desktop links ── */}
          <div className="hidden xl:flex flex-1 items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar">
            <NavLink to="/" label="Home" icon="🏠" />
            {user && navLinks.map(link => (
              <NavLink key={link.to} {...link} />
            ))}
          </div>

          {/* ── Desktop right controls ── */}
          {/* flex-shrink-0 + explicit order keeps cart → toggle → profile always visible */}
          <div className="hidden xl:flex items-center gap-2 flex-shrink-0 ml-auto">

            {/* 1. Cart — only for customers */}
            {user && profile?.role === 'customer' && (
              <div className="flex-shrink-0">
                <CartDrawer />
              </div>
            )}

            {/* 2. Theme toggle pill */}
            <ThemeToggle />

            {/* 3. Auth: login/signup or profile dropdown */}
            {!user ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link to="/login" className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-800 transition">
                  Log In
                </Link>
                <Link to="/register" className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition shadow-md">
                  Sign Up
                </Link>
              </div>
            ) : (
              <div className="relative flex-shrink-0" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-800 hover:border-primary-500 transition-all"
                >
                  <Avatar url={profile?.profile_photo_url} initials={initials} size="sm" />
                  <div className="text-left">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                      {profile?.first_name || 'Account'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize leading-tight">
                      {profile?.role}
                    </div>
                  </div>
                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-3 w-60 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-800 shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-dark-900 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                      <Avatar url={profile?.profile_photo_url} initials={initials} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-0.5">Signed in as</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {profile?.first_name} {profile?.last_name}
                        </p>
                      </div>
                    </div>

                    <DropdownLink to="/profile" icon="👤" label="My Profile" onClick={() => setDropdownOpen(false)} />
                    {profile?.role === 'customer' && (
                      <>
                        <DropdownLink to="/my-assessments" icon="📋" label="My Assessments" onClick={() => setDropdownOpen(false)} />
                        <DropdownLink to="/my-orders"      icon="📦" label="My Orders"      onClick={() => setDropdownOpen(false)} />
                      </>
                    )}

                    {profile?.role === 'admin' && adminSecondary.length > 0 && (
                      <>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-semibold">More Pages</p>
                        </div>
                        {adminSecondary.map(link => (
                          <DropdownLink key={link.to} {...link} onClick={() => setDropdownOpen(false)} />
                        ))}
                      </>
                    )}

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-sm font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-1"
                    >
                      🚪 Log Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Mobile right controls ── */}
          <div className="xl:hidden flex items-center gap-2 ml-auto flex-shrink-0">
            {user && profile?.role === 'customer' && (
              <div className="flex-shrink-0">
                <CartDrawer />
              </div>
            )}

            <ThemeToggle mobile />

            <button
              onClick={() => setMenuOpen(v => !v)}
              className="relative w-11 h-11 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-800 transition flex-shrink-0"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
              {!menuOpen && (unreadCount > 0 || (profile?.role === 'admin' && totalAdminAlerts > 0)) && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-dark-900" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════════
          MOBILE FULL-SCREEN MENU
      ════════════════════════════════════════════════════════════════════════ */}
      {menuOpen && (
        <div className="xl:hidden fixed inset-0 top-16 z-40 bg-white dark:bg-dark-900 overflow-y-auto">
          <div className="px-4 py-5 space-y-1.5 pb-10">

            {user && (
              <div className="flex items-center gap-3 px-5 py-4 mb-4 rounded-2xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                <Avatar url={profile?.profile_photo_url} initials={initials} size="lg" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-white leading-tight">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{profile?.role}</p>
                </div>
              </div>
            )}

            <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Navigation</p>
            <NavLink to="/" label="Home" icon="🏠" mobile />
            {user && mobileNavLinks.map(link => (
              <NavLink key={link.to} {...link} mobile />
            ))}

            {user && (
              <>
                <div className="pt-3 pb-1">
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Account</p>
                </div>
                <NavLink to="/profile" label="My Profile" icon="👤" mobile />
                {profile?.role === 'customer' && (
                  <>
                    <NavLink to="/my-assessments" label="My Assessments" icon="📋" mobile />
                    <NavLink to="/my-orders"       label="My Orders"      icon="📦" mobile />
                  </>
                )}
                <button
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-3 rounded-2xl px-5 py-4 text-base font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <span className="text-xl w-7 text-center">🚪</span> Log Out
                </button>
              </>
            )}

            {!user && (
              <>
                <Link
                  to="/login"
                  className="flex items-center gap-3 rounded-2xl px-5 py-4 text-base font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-800"
                >
                  <span className="text-xl w-7 text-center">🔑</span> Log In
                </Link>
                <Link
                  to="/register"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white px-5 py-4 text-base font-semibold shadow-md"
                >
                  Sign Up — It&apos;s Free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}