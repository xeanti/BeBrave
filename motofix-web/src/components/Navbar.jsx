import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

function formatBadgeCount(count) {
  const value = Number(count) || 0;

  if (value > 99) return '99+';
  if (value > 9) return '9+';

  return value;
}

function Badge({ count, color = 'bg-primary-600', textColor = 'text-white' }) {
  const value = Number(count) || 0;

  if (value <= 0) return null;

  return (
    <span
      className={`${color} ${textColor} inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none shadow-sm shadow-primary-600/30 ring-1 ring-white/20`}
    >
      {formatBadgeCount(value)}
    </span>
  );
}

function Avatar({ url, initials, size = 'sm' }) {
  const dim = size === 'lg' ? 'h-12 w-12 text-lg' : 'h-9 w-9 text-sm';

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`${dim} flex-shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-dark-700`}
      />
    );
  }

  return (
    <div
      className={`${dim} flex flex-shrink-0 items-center justify-center rounded-full bg-primary-600 font-black text-white ring-1 ring-primary-400`}
    >
      {initials || '?'}
    </div>
  );
}

function formatRoleLabel(role) {
  if (!role) return 'Account';

  return String(role)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const ACTIVE_ORDER_STATUS_FILTER =
  'pending,pending_payment,pending_verification,confirmed,processing,ready,ready_for_pickup,ready_for_delivery,for_pickup,for_delivery';

const ACTIVE_ORDER_PAYMENT_STATUS_FILTER =
  'unpaid,pending,pending_payment,checkout_created,pending_verification,partial,partially_paid,failed,expired';

function getBadge(to, state) {
  const {
    chatPath,
    unreadCount,
    notificationCount,
    pendingBookings,
    pendingWalkIns,
    pendingOrders,
    pendingPayments,
    pendingAssessments,
    lowStockParts,
    operationAlerts,
    totalAlerts,
  } = state;

  if (to === chatPath && unreadCount > 0) {
    return { count: unreadCount, color: 'bg-primary-600' };
  }

  if (to === '/notifications' && notificationCount > 0) {
    return { count: notificationCount, color: 'bg-primary-600' };
  }

  if (to === '/admin/bookings') {
    return { count: pendingBookings + pendingPayments, color: 'bg-primary-600' };
  }

  if (to === '/admin/walk-in-queue') {
    return { count: pendingWalkIns, color: 'bg-primary-600' };
  }

  if (to === '/admin/orders') {
    return { count: pendingOrders, color: 'bg-primary-600' };
  }

  if (to === '/admin/assessments') {
    return { count: pendingAssessments, color: 'bg-primary-600' };
  }

  if (to === '/admin/parts') {
    return { count: lowStockParts, color: 'bg-primary-600' };
  }

  return { count: 0 };
}

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /*
    Use a unique realtime channel prefix.

    In React Strict Mode, components can mount twice in development. If the same
    Supabase channel name is reused while the previous one is still subscribed,
    Supabase may throw: "cannot add postgres_changes callbacks after subscribe()".
  */
  const channelBaseRef = useRef(
    `navbar-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      return localStorage.getItem('sidebarExpanded') !== 'false';
    } catch {
      return true;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark');
    } catch {
      return false;
    }
  });

  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [pendingWalkIns, setPendingWalkIns] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [pendingAssessments, setPendingAssessments] = useState(0);
  const [lowStockParts, setLowStockParts] = useState(0);

  const role = profile?.role;
  const isCustomerRole = role === 'customer' || role === 'user';
  const isAdminRole = role === 'admin' || role === 'super_admin';
  const isSuperAdmin = role === 'super_admin';
  const canSeeOperationAlerts = role === 'staff' || role === 'admin';

  const initials = profile
    ? `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()
    : '';

  const chatPath = isCustomerRole ? '/chat' : '/admin/chat';

  // Operation alerts are shown only to staff/admin because they can directly act on
  // bookings, walk-ins, orders, payments, assessments, and product stock.
  // Super admin sees real notification rows only to avoid confusing dashboard badges.
  const operationAlerts = canSeeOperationAlerts
    ? pendingBookings +
      pendingWalkIns +
      pendingOrders +
      pendingPayments +
      pendingAssessments +
      lowStockParts
    : 0;

  const totalAlerts = notificationCount + operationAlerts;

  const badgeState = {
    chatPath,
    unreadCount,
    notificationCount,
    pendingBookings,
    pendingWalkIns,
    pendingOrders,
    pendingPayments,
    pendingAssessments,
    lowStockParts,
    operationAlerts,
    totalAlerts,
  };

  const shouldShowAppSidebar = Boolean(user && role !== 'mechanic');
  const desktopSidebarWidth = sidebarExpanded ? 288 : 88;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);

    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      // Ignore browser storage errors.
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem('sidebarExpanded', sidebarExpanded ? 'true' : 'false');
    } catch {
      // Ignore browser storage errors.
    }
  }, [sidebarExpanded]);

  useEffect(() => {
    function applyDesktopSidebarOffset() {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      document.body.style.paddingLeft = isDesktop && shouldShowAppSidebar
        ? sidebarExpanded
          ? '288px'
          : '88px'
        : '';
      document.body.style.transition = 'padding-left 260ms cubic-bezier(0.4, 0, 0.2, 1)';
    }

    applyDesktopSidebarOffset();
    window.addEventListener('resize', applyDesktopSidebarOffset);

    return () => {
      window.removeEventListener('resize', applyDesktopSidebarOffset);
      document.body.style.paddingLeft = '';
      document.body.style.transition = '';
    };
  }, [sidebarExpanded, shouldShowAppSidebar]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleEsc(event) {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    }

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (shouldShowAppSidebar && (mobileSidebarOpen || sidebarExpanded) && user && canSeeOperationAlerts) {
      fetchOperationNotifs();
    }
  }, [shouldShowAppSidebar, mobileSidebarOpen, sidebarExpanded, user?.id, canSeeOperationAlerts]);

  useEffect(() => {
    if (!user || !profile) {
      setUnreadCount(0);
      return;
    }

    fetchUnreadCount();

    const channel = supabase
      .channel(`${channelBaseRef.current}-unread-messages`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        fetchUnreadCount
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
        },
        fetchUnreadCount
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id, profile?.role]);

  useEffect(() => {
    if (!user?.id) {
      setNotificationCount(0);
      return;
    }

    fetchNotificationCount();

    const channel = supabase
      .channel(`${channelBaseRef.current}-notifications`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        fetchNotificationCount
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !canSeeOperationAlerts) {
      setPendingBookings(0);
      setPendingWalkIns(0);
      setPendingOrders(0);
      setPendingPayments(0);
      setPendingAssessments(0);
      setLowStockParts(0);
      return;
    }

    fetchOperationNotifs();

    function handleFocus() {
      fetchOperationNotifs();
    }

    window.addEventListener('focus', handleFocus);

    const refreshTimer = window.setInterval(fetchOperationNotifs, 15000);

    const tables = [
      'bookings',
      'booking_payments',
      'walkin_queue',
      'walkin_queue_payments',
      'orders',
      'order_payments',
      'payments',
      'pre_assessments',
      'parts',
    ];

    const channel = supabase.channel(`${channelBaseRef.current}-operation-notifs`);

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        fetchOperationNotifs
      );
    });

    channel.subscribe();

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, canSeeOperationAlerts]);

  async function fetchNotificationCount() {
    if (!user?.id) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotificationCount(count || 0);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setNotificationCount(0);
    }
  }

  async function fetchUnreadCount() {
    if (!user?.id) return;

    try {
      if (role === 'customer' || role === 'user') {
        const { data: convs, error: convError } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('customer_id', user.id)
          .eq('status', 'open');

        if (convError) throw convError;

        if (!convs?.length) {
          setUnreadCount(0);
          return;
        }

        const { count, error: unreadError } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .in(
            'conversation_id',
            convs.map((conversation) => conversation.id)
          )
          .neq('sender_id', user.id)
          .eq('is_read', false);

        if (unreadError) throw unreadError;

        setUnreadCount(count || 0);
        return;
      }

      const { count, error: unreadError } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .neq('sender_id', user.id)
        .eq('is_read', false);

      if (unreadError) throw unreadError;

      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Failed to fetch unread messages:', error);
    }
  }

  // Admin/staff/super-admin operation badges are refreshed by realtime, focus, sidebar open, and polling.
  async function fetchOperationNotifs() {
    try {
      const [
        bookings,
        bookingPayments,
        walkins,
        orders,
        assessments,
        parts,
      ] = await Promise.all([
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .or('is_walkin.is.null,is_walkin.eq.false'),

        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .or('is_walkin.is.null,is_walkin.eq.false')
          .in('payment_status', [
            'unpaid',
            'checkout_created',
            'pending_payment',
            'pending_verification',
            'partial',
            'partially_paid',
            'failed',
            'expired',
          ]),

        supabase
          .from('walkin_queue')
          .select('id', { count: 'exact', head: true })
          .in('status', [
            'queued',
            'in_progress',
            'inspection',
            'repairing',
            'quality_check',
            'ready_for_payment',
          ]),

        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .or(
            `status.in.(${ACTIVE_ORDER_STATUS_FILTER}),payment_status.in.(${ACTIVE_ORDER_PAYMENT_STATUS_FILTER})`
          ),

        supabase
          .from('pre_assessments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),

        supabase
          .from('parts')
          .select('id, stock_quantity, reorder_threshold')
          .limit(1000),
      ]);

      if (bookings.error) throw bookings.error;
      if (bookingPayments.error) throw bookingPayments.error;
      if (walkins.error) throw walkins.error;
      if (orders.error) throw orders.error;
      if (assessments.error) throw assessments.error;
      if (parts.error) throw parts.error;

      setPendingBookings(bookings.count || 0);
      setPendingPayments(bookingPayments.count || 0);
      setPendingWalkIns(walkins.count || 0);
      setPendingOrders(orders.count || 0);
      setPendingAssessments(assessments.count || 0);
      setLowStockParts(
        (parts.data || []).filter(
          (part) => Number(part.stock_quantity) <= Number(part.reorder_threshold ?? 5)
        ).length
      );
    } catch (error) {
      console.error('Failed to fetch operation notifications:', error);
    }
  }

  async function handleLogout() {
    await signOut();
    setMobileSidebarOpen(false);
    navigate('/login');
  }

  const publicLinks = [
    { to: '/', label: 'Home', icon: '🏠' },
    { to: '/login', label: 'Log In', icon: '🔐' },
    { to: '/register', label: 'Sign Up', icon: '📝' },
  ];

  const customerLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { to: '/appointments', label: 'Appointments', icon: '⏰' },
    { to: '/chat', label: 'Messages', icon: '💬' },
    { to: '/pre-assessment', label: 'Get Estimate', icon: '🔍' },
    { to: '/my-assessments', label: 'My Assessments', icon: '📋' },
    { to: '/my-orders', label: 'My Orders', icon: '📦' },
    { to: '/notifications', label: 'Notifications', icon: '🔔' },
    { to: '/profile', label: 'My Profile', icon: '👤' },
  ];

  const staffLinks = [
    { to: '/staff', label: 'Staff Dashboard', icon: '🖥️' },
    { to: '/admin/receipts', label: 'Receipts', icon: '🧾' },
    { to: '/admin/chat', label: 'Messages', icon: '💬' },
    { to: '/notifications', label: 'Notifications', icon: '🔔' },
    { to: '/profile', label: 'My Profile', icon: '👤' },
  ];

  const adminLinks = [
  { to: '/staff', label: 'Operations / POS', icon: '🧰' },
  { to: '/admin/users', label: 'Users (View Only)', icon: '👥' },
{ to: '/admin', label: 'Dashboard', icon: '📊' },
    { to: '/admin/bookings', label: 'Bookings', icon: '📅' },
    { to: '/admin/walk-in-queue', label: 'Walk-ins', icon: '🎫' },
    { to: '/admin/orders', label: 'Orders', icon: '📦' },
    { to: '/admin/receipts', label: 'Receipts', icon: '🧾' },
    { to: '/admin/assessments', label: 'Assessments', icon: '📋' },
    { to: '/admin/parts', label: 'Products', icon: '🛍️' },
    { to: '/admin/chat', label: 'Messages', icon: '💬' },
    { to: '/admin/chatbot-templates', label: 'Chatbot Templates', icon: '🤖' },
    { to: '/notifications', label: 'Notifications', icon: '🔔' },
    { to: '/profile', label: 'My Profile', icon: '👤' },
  ];

  const superAdminLinks = [
    { to: '/admin', label: 'Super Admin Dashboard', icon: '📊' },
    { to: '/admin/users', label: 'Users', icon: '👥' },
    { to: '/admin/inventory-movements', label: 'Stock History', icon: '📜' },
    { to: '/admin/reports', label: 'Reports', icon: '📈' },
    { to: '/admin/receipts', label: 'Receipts', icon: '🧾' },
    { to: '/admin/services', label: 'Services', icon: '🛠️' },
    { to: '/admin/settings', label: 'Settings', icon: '⚙️' },
    { to: '/notifications', label: 'Notifications', icon: '🔔' },
    { to: '/profile', label: 'My Profile', icon: '👤' },
  ];

  const navLinks = useMemo(() => {
    if (!user) return publicLinks;
    if (isSuperAdmin) return superAdminLinks;
    if (role === 'admin') return adminLinks;
    if (role === 'staff') return staffLinks;

    // Mechanics are mobile-only. They should not have web navigation links.
    if (role === 'mechanic') return [];

    return customerLinks;
  }, [user, role, isSuperAdmin]);

  function getHomePath() {
    if (!user) return '/';
    if (isAdminRole) return '/admin';
    if (role === 'staff') return '/staff';
    if (role === 'mechanic') return '/login';
    return '/dashboard';
  }

  function isActive(to) {
    if (to === '/') return location.pathname === '/';
    if (to === '/admin') return location.pathname === '/admin';
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  function SidebarLink({ to, label, icon, compact = false }) {
    const active = isActive(to);
    const badge = getBadge(to, badgeState);

    return (
      <Link
        to={to}
        title={compact ? label : undefined}
        className={`group flex items-center rounded-2xl text-sm font-black transition-all duration-200 ease-out hover:translate-x-1 active:scale-[0.98] ${
          compact ? 'justify-center px-2 py-3' : 'justify-between gap-3 px-4 py-3'
        } ${
          active
            ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white'
        }`}
      >
        <span className={`flex min-w-0 items-center ${compact ? 'justify-center' : 'gap-3'}`}>
          <span
            className={`relative grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl text-lg transition-transform duration-200 ease-out group-hover:scale-110 ${
              active ? 'bg-white/20' : 'bg-gray-100 dark:bg-dark-800'
            }`}
          >
            {icon}
            {compact && (
              <span className="absolute -right-1 -top-1">
                <Badge {...badge} />
              </span>
            )}
          </span>

          {!compact && <span className="truncate">{label}</span>}
        </span>

        {!compact && <Badge {...badge} />}
      </Link>
    );
  }

  function ThemeToggle() {
    return (
      <button
        type="button"
        onClick={() => setIsDark((value) => !value)}
        className="grid h-10 w-10 place-items-center rounded-2xl border border-gray-200 bg-white text-lg shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-105 hover:border-primary-400 active:scale-95 dark:border-dark-700 dark:bg-dark-800"
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? '🌙' : '☀️'}
      </button>
    );
  }

  function AlertButton() {
    if (!user || totalAlerts <= 0) return null;

    return (
      <button
        type="button"
        onClick={() => {
          setSidebarExpanded(true);
          setMobileSidebarOpen(true);
        }}
        className="hidden items-center gap-2 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-black text-yellow-700 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-yellow-100 active:scale-95 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300 sm:flex"
        title="Open alerts"
      >
        <span>🔔</span>
        <span>Alerts</span>
        <Badge count={totalAlerts} color="bg-primary-600" />
      </button>
    );
  }

  function PublicTopLinks() {
    if (user) return null;

    return (
      <div className="hidden items-center gap-2 sm:flex">
        <Link
          to="/"
          className="rounded-2xl px-4 py-2 text-sm font-black text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-dark-800 dark:hover:text-white"
        >
          Home
        </Link>

        <Link
          to="/login"
          className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-300"
        >
          Log In
        </Link>

        <Link
          to="/register"
          className="rounded-2xl bg-primary-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 active:scale-[0.98]"
        >
          Sign Up
        </Link>
      </div>
    );
  }

  function SidebarBrand({ compact = false, mobile = false }) {
    if (compact) {
      return (
        <Link
          to={getHomePath()}
          className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow ring-1 ring-primary-200 dark:bg-dark-800 dark:ring-primary-500/30"
          title="MotoFix"
        >
          <img
            src="/favicon.png"
            alt="MotoFix logo"
            className="h-full w-full object-contain"
          />
        </Link>
      );
    }

    return (
      <Link
        to={getHomePath()}
        className="flex min-w-0 items-center gap-2 text-xl font-black text-gray-950 dark:text-white"
      >
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow ring-1 ring-primary-200 dark:bg-dark-800 dark:ring-primary-500/30">
          <img
            src="/favicon.png"
            alt="MotoFix logo"
            className="h-full w-full object-contain"
          />
        </span>
        <span className="truncate">
          Moto<span className="text-primary-500">Fix</span>
        </span>
        {mobile && (
          <span className="ml-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
            Menu
          </span>
        )}
      </Link>
    );
  }

  function SidebarUserCard({ compact = false }) {
    if (!user) return null;

    if (compact) {
      return (
        <div className="flex justify-center border-b border-gray-100 px-4 py-4 dark:border-dark-700">
          <Avatar url={profile?.profile_photo_url} initials={initials} size="lg" />
        </div>
      );
    }

    return (
      <div className="border-b border-gray-100 p-4 dark:border-dark-700">
        <div className="rounded-3xl bg-gray-50 p-4 ring-1 ring-gray-100 dark:bg-dark-800 dark:ring-dark-700">
          <div className="flex items-center gap-3">
            <Avatar url={profile?.profile_photo_url} initials={initials} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-gray-950 dark:text-white">
                {profile?.first_name || 'Account'} {profile?.last_name || ''}
              </p>
              <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                {formatRoleLabel(role)}
              </p>
            </div>
          </div>

          {role === 'mechanic' && (
            <div className="mt-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-black text-yellow-800 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-200">
              Mechanics must use the MotoFix mobile application.
            </div>
          )}

          {totalAlerts > 0 && (
            <div className="mt-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-black text-yellow-800 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-200">
              🔔 {formatBadgeCount(totalAlerts)} active alert{totalAlerts === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>
    );
  }

  function SidebarNav({ compact = false }) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {navLinks.map((link) => (
            <SidebarLink key={link.to} {...link} compact={compact} />
          ))}
        </div>

        {user && role === 'mechanic' && !compact && (
          <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold text-yellow-800 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-200">
            This web portal is not available for mechanic accounts. Please log out and use the mobile app.
          </div>
        )}
      </div>
    );
  }

  function SidebarFooter({ compact = false }) {
    return (
      <div className="border-t border-gray-100 p-4 dark:border-dark-700">
        {user ? (
          <button
            type="button"
            onClick={handleLogout}
            title="Log Out"
            className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 ring-1 ring-red-200 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-red-100 active:scale-95 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25 ${
              compact ? 'px-2' : ''
            }`}
          >
            <span>🚪</span>
            {!compact && <span>Log Out</span>}
          </button>
        ) : compact ? (
          <div className="grid gap-2">
            <Link
              to="/login"
              title="Log In"
              className="grid h-11 place-items-center rounded-2xl border border-gray-200 text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
            >
              🔐
            </Link>
            <Link
              to="/register"
              title="Sign Up"
              className="grid h-11 place-items-center rounded-2xl bg-primary-600 text-sm font-black text-white transition hover:bg-primary-700"
            >
              📝
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/login"
              className="rounded-2xl border border-gray-200 px-4 py-3 text-center text-sm font-black text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-dark-700 dark:text-gray-300"
            >
              Log In
            </Link>
            <Link
              to="/register"
              className="rounded-2xl bg-primary-600 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-primary-700"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    );
  }

  function DesktopSidebar() {
    if (!shouldShowAppSidebar) return null;

    const compact = !sidebarExpanded;

    return (
      <aside
        className="fixed inset-y-0 left-0 z-[60] hidden flex-col border-r border-gray-200 bg-white shadow-xl transition-[width,box-shadow,transform] duration-300 ease-out dark:border-dark-700 dark:bg-dark-900 lg:flex"
        style={{ width: desktopSidebarWidth }}
      >
        <div className="relative border-b border-gray-100 p-4 dark:border-dark-700">
          <div className={`flex items-center ${compact ? 'justify-center' : 'justify-between'} gap-3`}>
            <SidebarBrand compact={compact} />

            {!compact && (
              <button
                type="button"
                onClick={() => setSidebarExpanded(false)}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-lg font-black text-gray-700 transition-all duration-200 ease-out hover:-translate-x-0.5 hover:scale-105 hover:bg-primary-50 hover:text-primary-700 active:scale-95 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-primary-500/10 dark:hover:text-primary-300"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                ‹
              </button>
            )}
          </div>

          {compact && (
            <button
              type="button"
              onClick={() => setSidebarExpanded(true)}
              className="absolute -right-4 top-5 grid h-9 w-9 animate-pulse place-items-center rounded-full border border-gray-200 bg-white text-lg font-black text-gray-700 shadow-lg transition-all duration-200 ease-out hover:scale-110 hover:border-primary-400 hover:text-primary-700 active:scale-95 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-primary-500 dark:hover:text-primary-300"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              ›
            </button>
          )}
        </div>

        <SidebarUserCard compact={compact} />
        <SidebarNav compact={compact} />
        <SidebarFooter compact={compact} />
      </aside>
    );
  }

  function MobileSidebar() {
    if (!shouldShowAppSidebar) return null;

    return (
      <div
        className={`fixed inset-0 z-[70] lg:hidden ${
          mobileSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        aria-hidden={!mobileSidebarOpen}
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileSidebarOpen(false)}
          className={`absolute inset-0 bg-gray-950/45 backdrop-blur-sm transition-opacity duration-300 ease-out ${
            mobileSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <aside
          className={`absolute left-0 top-0 flex h-full w-[310px] max-w-[88vw] flex-col border-r border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-dark-700 dark:bg-dark-900 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="border-b border-gray-100 p-4 dark:border-dark-700">
            <div className="flex items-center justify-between gap-3">
              <SidebarBrand mobile />

              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-lg font-black text-gray-700 transition-all duration-200 ease-out hover:rotate-90 hover:scale-105 hover:bg-red-50 hover:text-red-600 active:scale-95 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                aria-label="Close sidebar"
              >
                ✕
              </button>
            </div>
          </div>

          <SidebarUserCard />
          <SidebarNav />
          <SidebarFooter />
        </aside>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          @keyframes slideInLeft {
            from {
              opacity: 0;
              transform: translateX(-16px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}
      </style>

      <DesktopSidebar />

      <nav className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/90 shadow-sm backdrop-blur-xl dark:border-gray-800/80 dark:bg-dark-900/90">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-3 px-4 sm:px-6">
          {shouldShowAppSidebar && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="relative grid h-11 w-11 place-items-center rounded-2xl border border-gray-200 bg-white text-lg shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-105 hover:border-primary-400 hover:text-primary-600 active:scale-95 dark:border-dark-700 dark:bg-dark-800 dark:text-white lg:hidden"
              aria-label="Open sidebar"
              title="Open sidebar"
            >
              ▣
              <span className="absolute -right-1 -top-1">
                <Badge count={totalAlerts} color="bg-primary-600" />
              </span>
            </button>
          )}

          <Link
            to={getHomePath()}
            className={`group flex min-w-0 flex-1 items-center gap-2 rounded-2xl text-2xl font-black tracking-tight text-gray-900 transition-transform duration-200 ease-out hover:scale-[1.01] dark:text-white ${
              shouldShowAppSidebar ? 'lg:hidden' : ''
            }`}
          >
            <span
              className={`grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-lg shadow-primary-600/20 ring-1 ring-primary-200 transition-transform duration-300 ease-out group-hover:rotate-3 group-hover:scale-105 dark:bg-dark-800 dark:ring-primary-500/30 ${
                shouldShowAppSidebar ? 'lg:hidden' : ''
              }`}
            >
              <img
                src="/favicon.png"
                alt="MotoFix logo"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="truncate">
              Moto<span className="text-primary-500">Fix</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <PublicTopLinks />
            <AlertButton />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <MobileSidebar />
    </>
  );
}
