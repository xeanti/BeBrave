import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import CartDrawer from './CartDrawer';

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDark, setIsDark] = useState(!document.documentElement.classList.contains('light'));
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (user && profile) {
      fetchUnreadCount();
      const channel = supabase
        .channel('unread-messages')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        }, () => fetchUnreadCount())
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [user, profile]);

  // Fix 9: fetch pending bookings + orders count for admin
  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetchAdminNotifs();
      const channel = supabase
        .channel('admin-notifs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchAdminNotifs)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchAdminNotifs)
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [user, profile]);

  async function fetchAdminNotifs() {
    const [bookings, orders] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'pending'),
    ]);
    setPendingBookings(bookings.count || 0);
    setPendingOrders(orders.count || 0);
  }

  async function fetchUnreadCount() {
    if (!user) return;
    try {
      if (profile?.role === 'customer') {
        const { data: convs } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('customer_id', user.id)
          .eq('status', 'open');

        if (!convs?.length) { setUnreadCount(0); return; }

        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact' })
          .in('conversation_id', convs.map(c => c.id))
          .neq('sender_id', user.id)
          .eq('is_read', false);

        setUnreadCount(count || 0);
      } else {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact' })
          .neq('sender_id', user.id)
          .eq('is_read', false);

        setUnreadCount(count || 0);
      }
    } catch (err) {
      console.error('fetchUnreadCount error:', err);
    }
  }

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  const customerLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/pre-assessment', label: 'Get Estimate' },
    { to: '/booking', label: 'Book Service' },
    { to: '/appointments', label: 'Appointments' },
    { to: '/shop', label: '🛒 Shop' },
    { to: '/customize', label: 'AI Preview' },
    { to: '/mechanics', label: 'Mechanics' },
    { to: '/chat', label: '💬 Chat' },
  ];

  const mechanicLinks = [
    { to: '/mechanic-dashboard', label: 'My Bookings' },
    { to: '/mechanics', label: 'Team' },
    { to: '/admin/chat', label: '💬 Chat' },
    { to: '/mechanic-ratings', label: '⭐ My Ratings' },
  ];

  const adminLinks = [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/bookings', label: 'Bookings' },
    { to: '/admin/orders', label: 'Orders' },
    { to: '/admin/assessments', label: 'Assessments' },
    { to: '/admin/parts', label: 'Parts' },
    { to: '/admin/services', label: 'Services' },
    { to: '/admin/mechanics', label: 'Mechanics' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/chat', label: '💬 Chat' },
  ];

  const navLinks = profile?.role === 'admin'
    ? adminLinks
    : profile?.role === 'mechanic'
    ? mechanicLinks
    : customerLinks;

  const initials = profile
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : '';

  const chatPath = profile?.role === 'customer' ? '/chat' : '/admin/chat';

  return (
<nav className="bg-dark-900/95 backdrop-blur border-b border-gray-800 sticky top-0 z-50 text-white px-4 py-3 flex items-center justify-between gap-2 min-w-0">
      <Link to="/" className="text-xl font-bold tracking-tight">
        Moto<span className="text-primary-500">Fix</span>
      </Link>

      {/* Desktop links */}
<div className="hidden lg:flex items-center gap-0.5 flex-1 justify-center overflow-x-auto">
        <Link
          to="/"
          className={`px-3 py-2 rounded-md text-sm font-medium transition ${
            location.pathname === '/' ? 'text-primary-500' : 'text-gray-300 hover:text-white'
          }`}
        >
          Home
        </Link>

        {/* Fix 9: updated map with pending badges on Bookings and Orders */}
        {user && navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`relative px-3 py-2 rounded-md text-sm font-medium transition ${
              location.pathname === link.to
                ? 'text-primary-500'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            {link.label}
            {/* Chat unread badge */}
            {link.to === chatPath && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            {/* Pending bookings badge */}
            {link.to === '/admin/bookings' && pendingBookings > 0 && (
              <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {pendingBookings > 9 ? '9+' : pendingBookings}
              </span>
            )}
            {/* Pending orders badge */}
            {link.to === '/admin/orders' && pendingOrders > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {pendingOrders > 9 ? '9+' : pendingOrders}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Right side */}
<div className="hidden lg:flex items-center gap-2 flex-shrink-0">
        {user && profile?.role === 'customer' && <CartDrawer />}

        <button
          onClick={() => {
            const isLight = document.documentElement.classList.toggle('light');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            setIsDark(!isLight);
          }}
          className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-dark-800 transition"
          title="Toggle dark mode"
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        {user ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 bg-dark-800 hover:bg-dark-800/70 rounded-full pl-2 pr-3 py-1.5 transition"
            >
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm font-semibold">
                {initials || '?'}
              </div>
              <span className="text-sm text-gray-300">{profile?.first_name || 'Account'}</span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-dark-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                <Link to="/profile" onClick={() => setDropdownOpen(false)}
                  className="block px-4 py-3 text-sm text-gray-300 hover:bg-dark-900 transition">
                  👤 My Profile
                </Link>
                {profile?.role === 'customer' && (
                  <>
                    <Link to="/my-assessments" onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-300 hover:bg-dark-900 transition">
                      📋 My Assessments
                    </Link>
                    <Link to="/my-orders" onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-300 hover:bg-dark-900 transition">
                      📦 My Orders
                    </Link>
                  </>
                )}
                <Link to={profile?.role === 'admin' ? '/admin' : '/dashboard'}
                  onClick={() => setDropdownOpen(false)}
                  className="block px-4 py-3 text-sm text-gray-300 hover:bg-dark-900 transition">
                  📊 Dashboard
                </Link>
                <button onClick={handleLogout}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-dark-900 transition border-t border-gray-700">
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link to="/login" className="px-3 py-2 text-sm font-medium text-gray-300 hover:text-white transition">
              Login
            </Link>
            <Link to="/register"
              className="bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-md text-sm font-semibold transition">
              Sign Up
            </Link>
          </>
        )}
      </div>

{/* Mobile: cart + hamburger */}
<div className="lg:hidden flex items-center gap-1 flex-shrink-0">
  {user && profile?.role === 'customer' && <CartDrawer />}
  <button className="p-2 text-gray-300" onClick={() => setMenuOpen((o) => !o)}>
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {menuOpen ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  </button>
</div>


      {/* Mobile menu */}
      {menuOpen && (
  <div className="absolute top-full left-0 right-0 bg-dark-800 border-t border-gray-700 lg:hidden flex flex-col p-4 gap-1 z-50">
          <Link to="/" onClick={() => setMenuOpen(false)}
            className="px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-dark-900">
            Home
          </Link>
          {user ? (
            <>
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to} onClick={() => setMenuOpen(false)}
                  className="relative px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-dark-900 flex items-center gap-2">
                  {link.label}
                  {link.to === chatPath && unreadCount > 0 && (
                    <span className="bg-primary-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                  {link.to === '/admin/bookings' && pendingBookings > 0 && (
                    <span className="bg-yellow-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {pendingBookings > 9 ? '9+' : pendingBookings}
                    </span>
                  )}
                  {link.to === '/admin/orders' && pendingOrders > 0 && (
                    <span className="bg-orange-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {pendingOrders > 9 ? '9+' : pendingOrders}
                    </span>
                  )}
                </Link>
              ))}
              <Link to="/profile" onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-dark-900">
                👤 My Profile
              </Link>
              {profile?.role === 'customer' && (
                <>
                  <Link to="/my-assessments" onClick={() => setMenuOpen(false)}
                    className="px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-dark-900">
                    📋 My Assessments
                  </Link>
                  <Link to="/my-orders" onClick={() => setMenuOpen(false)}
                    className="px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-dark-900">
                    📦 My Orders
                  </Link>
                </>
              )}
              <button
                onClick={() => { setMenuOpen(false); handleLogout(); }}
                className="text-left px-3 py-2 rounded-md text-sm text-red-400 hover:bg-dark-900">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-dark-900">
                Login
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-md text-sm bg-primary-600 text-center font-semibold">
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}