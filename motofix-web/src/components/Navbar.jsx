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
  
  // Clean initialization checking both class presence and local storage standard overrides
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme === 'dark';
    return document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light');
  });

  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);

  const dropdownRef = useRef(null);

  // Sync state changes with document element directly using an effect
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (user && profile) {
      fetchUnreadCount();

      const channel = supabase
        .channel('unread-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
          },
          () => fetchUnreadCount()
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    }
  }, [user, profile]);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetchAdminNotifs();

      const channel = supabase
        .channel('admin-notifs')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
          },
          fetchAdminNotifs
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
          },
          fetchAdminNotifs
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    }
  }, [user, profile]);

  async function fetchAdminNotifs() {
    const [bookings, orders] = await Promise.all([
      supabase
        .from('bookings')
        .select('id', { count: 'exact' })
        .eq('status', 'pending'),

      supabase
        .from('orders')
        .select('id', { count: 'exact' })
        .eq('status', 'pending'),
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

        if (!convs?.length) {
          setUnreadCount(0);
          return;
        }

        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact' })
          .in(
            'conversation_id',
            convs.map((c) => c.id)
          )
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
      console.error(err);
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
    { to: '/shop', label: 'Shop' },
    { to: '/customize', label: 'AI Preview' },
    { to: '/mechanics', label: 'Mechanics' },
    { to: '/chat', label: 'Chat' },
  ];

  const mechanicLinks = [
    { to: '/mechanic-dashboard', label: 'My Bookings' },
    { to: '/mechanics', label: 'Team' },
    { to: '/admin/chat', label: 'Chat' },
    { to: '/mechanic-ratings', label: 'My Ratings' },
  ];

  const staffLinks = [
    { to: '/staff', label: 'POS / Booking' },
    { to: '/admin/chat', label: '💬 Chat' },
  ];

  const adminLinks = [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/bookings', label: 'Bookings' },
    { to: '/admin/orders', label: 'Orders' },
    { to: '/admin/assessments', label: 'Assessments' },
    { to: '/admin/parts', label: 'Parts' },
    { to: '/admin/services', label: 'Services' },
    { to: '/admin/mechanics', label: 'Mechanics' },
    { to: '/admin/staff', label: 'Staff' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/settings', label: 'Settings' },
    { to: '/admin/chat', label: 'Chat' },
  ];

  const navLinks =
    profile?.role === 'admin'
      ? adminLinks
      : profile?.role === 'mechanic'
      ? mechanicLinks
      : profile?.role === 'staff'
      ? staffLinks
      : customerLinks;

  const initials = profile
    ? `${profile.first_name?.[0] || ''}${
        profile.last_name?.[0] || ''
      }`.toUpperCase()
    : '';

  const chatPath =
    profile?.role === 'customer'
      ? '/chat'
      : '/admin/chat';

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-dark-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 shadow-lg transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link
          to="/"
          className="flex-shrink-0 text-2xl font-black tracking-tight text-gray-900 dark:text-white"
        >
          Moto<span className="text-primary-500">Fix</span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden xl:flex flex-1 items-center justify-center gap-1">
          <Link
            to="/"
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              location.pathname === '/'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white'
            }`}
          >
            Home
          </Link>

          {user &&
            navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  location.pathname === link.to
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white'
                }`}
              >
                {link.label}

                {/* Chat badge */}
                {link.to === chatPath && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}

                {/* Pending bookings */}
                {link.to === '/admin/bookings' && pendingBookings > 0 && (
                  <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {pendingBookings > 9 ? '9+' : pendingBookings}
                  </span>
                )}

                {/* Pending orders */}
                {link.to === '/admin/orders' && pendingOrders > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {pendingOrders > 9 ? '9+' : pendingOrders}
                  </span>
                )}
              </Link>
            ))}
        </div>

        {/* Right Side Buttons/Menu */}
        <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
          {user && profile?.role === 'customer' && (
            <CartDrawer />
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-dark-800 dark:hover:bg-dark-700 transition text-gray-900 dark:text-white"
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {!user ? (
            <>
              <Link
                to="/login"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white font-medium px-3 py-2 transition"
              >
                Login
              </Link>

              <Link
                to="/register"
                className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-xl font-semibold transition shadow-md"
              >
                Sign Up
              </Link>
            </>
          ) : (
            <div
              className="relative"
              ref={dropdownRef}
            >
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-3 px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-800 hover:border-primary-500 transition-all text-gray-900 dark:text-white"
              >
                <div className="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold">
                  {initials || '?'}
                </div>

                <div className="text-left">
                  <div className="text-sm font-medium">
                    {profile?.first_name || 'Account'}
                  </div>

                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {profile?.role}
                  </div>
                </div>

                <svg
                  className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-800 shadow-2xl overflow-hidden z-50">
                  <Link
                    to="/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-900 dark:hover:text-white"
                  >
                    👤 My Profile
                  </Link>

                  {profile?.role === 'customer' && (
                    <>
                      <Link
                        to="/my-assessments"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-900 dark:hover:text-white"
                      >
                        📋 My Assessments
                      </Link>

                      <Link
                        to="/my-orders"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-900 dark:hover:text-white"
                      >
                        📦 My Orders
                      </Link>
                    </>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-left text-red-500 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-dark-900"
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile View Toggle and Hamburguer Wrapper */}
        <div className="xl:hidden flex items-center gap-2">
          {user && profile?.role === 'customer' && (
            <CartDrawer />
          )}

          {/* Mobile Theme Button */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-dark-800 dark:hover:bg-dark-700 transition text-gray-900 dark:text-white"
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* Hamburger Trigger Menu */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-dark-800 transition"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Panel */}
      {menuOpen && (
        <div className="xl:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-900 px-5 py-4 space-y-2 shadow-inner">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="block rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
          >
            Home
          </Link>

          {user &&
            navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
              >
                {link.label}
              </Link>
            ))}

          {user ? (
            <>
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
              >
                👤 Profile
              </Link>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                className="w-full rounded-xl px-4 py-3 text-left text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-dark-800"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
              >
                Login
              </Link>

              <Link
                to="/register"
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl bg-primary-600 text-white px-4 py-3 text-center font-semibold shadow-md"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}