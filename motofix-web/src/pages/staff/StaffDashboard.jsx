import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import ReceiptModal from '../../components/ReceiptModal';

import { formatDateTime } from './staff-dashboard/StaffDashboardShared';

import BookingServiceQueue from './staff-dashboard/BookingServiceQueue';
import CreateBooking from './staff-dashboard/CreateBooking';
import WalkInServicePOS from './staff-dashboard/WalkInServicePOS';
import WalkInPOS from './staff-dashboard/WalkInPOS';
import PendingPayments from './staff-dashboard/PendingPayments';
import StaffServiceProgress from './staff-dashboard/StaffServiceProgress';
import StaffMechanicSchedule from './staff-dashboard/StaffMechanicSchedule';

const STAFF_ACTIVE_TAB_KEY = 'motofix_staff_dashboard_active_tab';
const DEFAULT_STAFF_TAB = 'service_queue';

const STAFF_TABS = [
  {
    id: 'service_queue',
    label: 'Booking Queue',
    icon: '📅',
    badgeKey: 'bookingQueue',
  },
  {
    id: 'mechanic_schedule',
    label: 'Mechanic Schedule',
    icon: '🗓️',
    badgeKey: null,
  },
  {
    id: 'create_booking',
    label: 'Create Booking',
    icon: '🗓️',
    badgeKey: null,
  },
  {
    id: 'walkin_service',
    label: 'Walk-in Service POS',
    icon: '🏍️',
    badgeKey: 'walkins',
  },
  {
    id: 'pos',
    label: 'Product Counter Sales',
    icon: '🧾',
    badgeKey: 'orders',
  },
  {
    id: 'pending',
    label: 'Payment Verification',
    icon: '💰',
    badgeKey: 'payments',
  },
  {
    id: 'progress',
    label: 'Service Progress',
    icon: '🔧',
    badgeKey: 'progress',
  },
];

const STAFF_TAB_IDS = STAFF_TABS.map((tab) => tab.id);

const LIVE_ACTIVITY_TABLES = [
  'bookings',
  'booking_services',
  'service_progress_events',
  'walkin_queue',
  'walkin_queue_payments',
  'orders',
  'order_items',
  'payments',
  'booking_payments',
  'order_payments',
  'parts',
  'services',
  'profiles',
];

const EMPTY_TAB_COUNTS = {
  bookingQueue: 0,
  walkins: 0,
  orders: 0,
  payments: 0,
  progress: 0,
};

function getSavedStaffTab() {
  try {
    if (typeof window === 'undefined') return DEFAULT_STAFF_TAB;

    const savedTab = localStorage.getItem(STAFF_ACTIVE_TAB_KEY);

    return STAFF_TAB_IDS.includes(savedTab) ? savedTab : DEFAULT_STAFF_TAB;
  } catch {
    return DEFAULT_STAFF_TAB;
  }
}

function saveStaffTab(tabId) {
  try {
    if (typeof window === 'undefined') return;

    if (STAFF_TAB_IDS.includes(tabId)) {
      localStorage.setItem(STAFF_ACTIVE_TAB_KEY, tabId);
    }
  } catch {
    // Ignore browser storage errors.
  }
}

function formatBadgeCount(count) {
  const value = Number(count) || 0;

  if (value > 99) return '99+';
  if (value > 9) return '9+';

  return value;
}

function TabBadge({ count }) {
  const value = Number(count) || 0;

  if (value <= 0) return null;

  return (
    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-[10px] font-black leading-none text-white shadow-lg shadow-yellow-500/30 ring-2 ring-white dark:ring-dark-900">
      {formatBadgeCount(value)}
    </span>
  );
}

function shouldCountAsPendingOrder(order) {
  const status = String(order?.status || '').toLowerCase();
  const paymentStatus = String(order?.payment_status || '').toLowerCase();

  if (
    ['completed', 'cancelled', 'canceled', 'refunded', 'returned', 'void'].includes(status) ||
    paymentStatus === 'paid' ||
    order?.payment_received === true
  ) {
    return false;
  }

  return (
    [
      'pending',
      'pending_payment',
      'pending_verification',
      'processing',
      'ready',
      'ready_for_pickup',
      'ready_for_delivery',
    ].includes(status) ||
    [
      'unpaid',
      'pending',
      'pending_payment',
      'checkout_created',
      'pending_verification',
      'partial',
      'partially_paid',
      'failed',
      'expired',
    ].includes(paymentStatus)
  );
}


function shouldCountAsPendingBookingPayment(booking) {
  const status = String(booking?.status || '').toLowerCase();
  const paymentStatus = String(booking?.payment_status || '').toLowerCase();

  if (
    ['completed', 'cancelled', 'canceled', 'refunded', 'void'].includes(status)
  ) {
    return false;
  }

  // A provider/customer payment is still actionable until staff verifies it.
  if (paymentStatus === 'paid' && booking?.payment_received !== true) {
    return true;
  }

  return [
    'unpaid',
    'checkout_created',
    'pending_payment',
    'pending_verification',
    'partial',
    'partially_paid',
    'failed',
    'expired',
  ].includes(paymentStatus);
}


export default function StaffDashboard() {
  const { user } = useAuth();

  /*
    Use a unique realtime channel prefix for every StaffDashboard mount.

    React Strict Mode can mount effects twice in development. If fixed channel names
    are reused while a previous instance is still subscribed, Supabase can throw:
    "cannot add postgres_changes callbacks ... after subscribe()".
  */
  const channelBaseRef = useRef(
    `staff-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const [tab, setTab] = useState(getSavedStaffTab);
  const [receipt, setReceipt] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveError, setLiveError] = useState('');
  const [tabCounts, setTabCounts] = useState(EMPTY_TAB_COUNTS);

  const activeTab = useMemo(() => {
    return STAFF_TABS.find((item) => item.id === tab) || STAFF_TABS[0];
  }, [tab]);

  const totalTabAlerts = Object.values(tabCounts).reduce(
    (sum, count) => sum + (Number(count) || 0),
    0
  );

  useEffect(() => {
    if (!STAFF_TAB_IDS.includes(tab)) {
      setTab(DEFAULT_STAFF_TAB);
      return;
    }

    saveStaffTab(tab);
  }, [tab]);

  useEffect(() => {
    let mounted = true;

    function updateStamp() {
      if (!mounted) return;
      setLastUpdated(new Date());
      setLiveError('');
      fetchTabCounts();
    }

    const channels = LIVE_ACTIVITY_TABLES.map((table) =>
      supabase
        .channel(`${channelBaseRef.current}-${table}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          updateStamp
        )
        .subscribe((status) => {
          if (!mounted) return;

          if (status === 'CHANNEL_ERROR') {
            setLiveError('Live updates temporarily disconnected. You can still use the dashboard.');
          }
        })
    );

    updateStamp();

    return () => {
      mounted = false;
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, []);

  async function fetchTabCounts() {
    try {
      const [
        bookingQueueResult,
        walkinResult,
        ordersResult,
        paymentBookingsResult,
        paymentOrdersResult,
        progressResult,
      ] = await Promise.all([
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .or('is_walkin.is.null,is_walkin.eq.false'),

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
          .select('id, status, payment_status, payment_received')
          .limit(1000),

        supabase
          .from('bookings')
          .select('id, status, payment_status, payment_received')
          .or('is_walkin.is.null,is_walkin.eq.false')
          .neq('status', 'completed')
          .neq('status', 'cancelled')
          .limit(1000),

        supabase
          .from('orders')
          .select('id, status, payment_status, payment_received')
          .not('status', 'in', '(completed,cancelled,canceled,returned,refunded)')
          .not('payment_status', 'eq', 'paid')
          .limit(1000),


        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .or('is_walkin.is.null,is_walkin.eq.false')
          .in('status', [
            'confirmed',
            'in_progress',
            'inspection',
            'repairing',
            'quality_check',
            'ready_for_pickup',
          ]),
      ]);

      const paymentBookingCount = (paymentBookingsResult.data || []).filter(
        shouldCountAsPendingBookingPayment
      ).length;

      const paymentOrderCount = (paymentOrdersResult.data || []).filter((order) => {
        const paymentStatus = String(order.payment_status || '').toLowerCase();
        const status = String(order.status || '').toLowerCase();

        if (
          ['completed', 'cancelled', 'canceled', 'refunded', 'returned', 'void'].includes(status) ||
          paymentStatus === 'paid' ||
          order.payment_received === true
        ) {
          return false;
        }

        return [
          'unpaid',
          'pending',
          'pending_payment',
          'checkout_created',
          'pending_verification',
          'partial',
          'partially_paid',
          'failed',
          'expired',
        ].includes(paymentStatus);
      }).length;

      setTabCounts({
        bookingQueue: bookingQueueResult.error ? 0 : bookingQueueResult.count || 0,
        walkins: walkinResult.error ? 0 : walkinResult.count || 0,
        orders: ordersResult.error
          ? 0
          : (ordersResult.data || []).filter(shouldCountAsPendingOrder).length,
        payments:
          (paymentBookingsResult.error ? 0 : paymentBookingCount) +
          (paymentOrdersResult.error ? 0 : paymentOrderCount),
        progress: progressResult.error ? 0 : progressResult.count || 0,
      });
    } catch (error) {
      console.error('Failed to load staff dashboard notification counts:', error);
      setTabCounts(EMPTY_TAB_COUNTS);
    }
  }

  function handleTabChange(tabId) {
    if (!STAFF_TAB_IDS.includes(tabId)) return;

    setTab(tabId);
    setLiveError('');
  }

  function renderActivePanel() {
    const staffId = user?.id || null;

    switch (tab) {
      case 'service_queue':
        return <BookingServiceQueue staffId={staffId} />;

      case 'mechanic_schedule':
        return <StaffMechanicSchedule />;

      case 'create_booking':
        return <CreateBooking staffId={staffId} />;

      case 'walkin_service':
        return <WalkInServicePOS staffId={staffId} onReceipt={setReceipt} />;

      case 'pos':
        return <WalkInPOS staffId={staffId} onReceipt={setReceipt} />;

      case 'pending':
        return <PendingPayments staffId={staffId} onReceipt={setReceipt} />;

      case 'progress':
        return <StaffServiceProgress staffId={staffId} />;

      default:
        return <BookingServiceQueue staffId={staffId} />;
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-50 px-4 py-8 text-gray-900 dark:bg-dark-900 dark:text-white sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <div className="relative p-6 sm:p-8">
            <div className="absolute -right-8 -top-14 h-36 w-36 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-accent-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-primary-600 dark:text-primary-400">
                    MotoFix Staff
                  </p>

                  {totalTabAlerts > 0 && (
                    <span className="rounded-full bg-yellow-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-yellow-500/20">
                      {formatBadgeCount(totalTabAlerts)} alert{totalTabAlerts === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl font-black tracking-tight text-gray-950 dark:text-white md:text-4xl">
                  Staff Dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  Manage scheduled bookings, create future appointments, queue walk-ins, process product sales, and collect payments.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    Current module:{' '}
                    <span className="font-black text-primary-600 dark:text-primary-400">
                      {activeTab.label}
                    </span>
                  </span>

                  {lastUpdated && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span>Live updates active · Last activity: {formatDateTime(lastUpdated)}</span>
                    </>
                  )}
                </div>

                {liveError && (
                  <p className="mt-2 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs font-semibold text-yellow-800 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-200">
                    {liveError}
                  </p>
                )}
              </div>

              <div
                className="grid grid-cols-2 gap-2 rounded-3xl bg-gray-100 p-2 dark:bg-dark-900 sm:grid-cols-3 xl:grid-cols-7"
                role="tablist"
                aria-label="Staff dashboard modules"
              >
                {STAFF_TABS.map((item) => {
                  const active = tab === item.id;
                  const badgeCount = item.badgeKey ? tabCounts[item.badgeKey] : 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => handleTabChange(item.id)}
                      className={`relative flex min-h-[76px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black transition sm:text-sm ${
                        active
                          ? 'bg-white text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-400'
                          : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                      <TabBadge count={badgeCount} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div role="tabpanel" aria-label={activeTab.label}>
          {renderActivePanel()}
        </div>
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}