import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalBookings: 0,
    pendingBookings: 0,
    pendingAssessments: 0,
    pendingOrders: 0,
    totalCustomers: 0,
    totalMechanics: 0,
    totalParts: 0,
    totalServices: 0,
    totalRevenue: 0,
    orderRevenue: 0,
    bookingRevenue: 0,
  });
  const [recentBookings, setRecentBookings] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchRecentBookings();
    fetchRecentOrders();
  }, []);

  async function fetchStats() {
    const [bookings, assessments, orders, customers, mechanics, parts, services] =
      await Promise.all([
        supabase.from('bookings').select('id, status, down_payment, services(base_price, labor_cost)'),
        supabase.from('pre_assessments').select('id, status'),
        supabase.from('orders').select('id, status, total_amount'),
        supabase.from('profiles').select('id').eq('role', 'customer'),
        supabase.from('profiles').select('id').eq('role', 'mechanic'),
        supabase.from('parts').select('id'),
        supabase.from('services').select('id'),
      ]);

    const orderRevenue = orders.data
      ?.filter((o) => o.status === 'completed')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

      const bookingRevenue = bookings.data
        ?.filter((b) => b.status === 'completed')
        .reduce((sum, b) => {
          const serviceTotal = (b.services?.base_price || 0) + (b.services?.labor_cost || 0);
          return sum + serviceTotal;
        }, 0) || 0;

    const totalRevenue = orderRevenue + bookingRevenue;

    setStats({
      totalBookings: bookings.data?.length || 0,
      pendingBookings: bookings.data?.filter((b) => b.status === 'pending').length || 0,
      pendingAssessments: assessments.data?.filter((a) => a.status === 'pending').length || 0,
      pendingOrders: orders.data?.filter((o) => o.status === 'pending').length || 0,
      totalCustomers: customers.data?.length || 0,
      totalMechanics: mechanics.data?.length || 0,
      totalParts: parts.data?.length || 0,
      totalServices: services.data?.length || 0,
      totalRevenue,
      orderRevenue,
      bookingRevenue,
    });

    setLoading(false);
  }

  async function fetchRecentBookings() {
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name), profiles!bookings_customer_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setRecentBookings(data);
  }

  async function fetchRecentOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles!orders_customer_id_fkey(first_name, last_name), order_items(id)')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setRecentOrders(data);
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-dark-900 text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">Admin Dashboard</h1>
        <p className="text-gray-400 mb-8">Overview of MotoFix operations.</p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label="Total Bookings" value={stats.totalBookings} icon="📅" color="text-blue-400" />
          <StatCard label="Pending Bookings" value={stats.pendingBookings} icon="⏳" color="text-yellow-400" />
          <StatCard label="Pending Assessments" value={stats.pendingAssessments} icon="📋" color="text-accent-400" />
          <StatCard label="Pending Orders" value={stats.pendingOrders} icon="📦" color="text-orange-400" />
          <StatCard label="Customers" value={stats.totalCustomers} icon="👥" color="text-green-400" />
          <StatCard label="Mechanics" value={stats.totalMechanics} icon="🔧" color="text-primary-400" />
          <StatCard label="Parts in Catalog" value={stats.totalParts} icon="⚙️" color="text-purple-400" />
          <StatCard label="Services" value={stats.totalServices} icon="🛠️" color="text-accent-400" />
        </div>

        {/* Revenue card */}
        <div className="bg-gradient-to-r from-primary-600/20 to-accent-500/20 border border-primary-500/20 rounded-xl p-5 mb-10">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-400 mb-1">Total Combined Revenue</p>
              <p className="text-3xl font-bold text-white">
                ₱{stats.totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">From Completed Orders</p>
                <p className="text-lg font-semibold text-accent-400">
                  ₱{stats.orderRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">From Completed Bookings</p>
                <p className="text-lg font-semibold text-primary-400">
                  ₱{stats.bookingRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="text-4xl">💰</div>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <QuickLink to="/admin/bookings" label="Manage Bookings" icon="📋" />
          <QuickLink to="/admin/orders" label="Manage Orders" icon="📦" />
          <QuickLink to="/admin/parts" label="Manage Parts" icon="⚙️" />
          <QuickLink to="/admin/services" label="Manage Services" icon="🛠️" />
          <QuickLink to="/admin/mechanics" label="Manage Mechanics" icon="🔧" />
          <QuickLink to="/admin/assessments" label="Assessments" icon="📋" />
          <QuickLink to="/admin/chat" label="Customer Chats" icon="💬" />
        </div>

        {/* Recent activity — two columns */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Recent bookings */}
          <div className="bg-dark-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Bookings</h2>
              <Link to="/admin/bookings" className="text-xs text-primary-500 hover:underline">
                View all →
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-14 bg-dark-900 rounded-lg animate-pulse" />)}
              </div>
            ) : recentBookings.length === 0 ? (
              <p className="text-gray-400 text-sm">No bookings yet.</p>
            ) : (
              <div className="space-y-3">
                {recentBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between bg-dark-900 rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {b.profiles?.first_name} {b.profiles?.last_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {b.services?.name} — {b.booking_date} at {b.booking_time}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent orders */}
          <div className="bg-dark-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Orders</h2>
              <Link to="/admin/orders" className="text-xs text-primary-500 hover:underline">
                View all →
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-14 bg-dark-900 rounded-lg animate-pulse" />)}
              </div>
            ) : recentOrders.length === 0 ? (
              <p className="text-gray-400 text-sm">No orders yet.</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between bg-dark-900 rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {o.profiles?.first_name} {o.profiles?.last_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {o.order_items?.length} item{o.order_items?.length !== 1 ? 's' : ''} · ₱{o.total_amount}
                      </p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="bg-dark-800 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

function QuickLink({ to, label, icon }) {
  return (
    <Link
      to={to}
      className="bg-dark-800 hover:bg-dark-800/70 rounded-xl p-4 flex items-center gap-3 transition"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function StatusBadge({ status }) {
  const styles = {
    confirmed: 'bg-green-500/20 text-green-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-gray-500/20 text-gray-400',
    cancelled: 'bg-red-500/20 text-red-400',
    preparing: 'bg-purple-500/20 text-purple-400',
    ready: 'bg-cyan-500/20 text-cyan-400',
  };
  return (
    <span className={`text-xs px-3 py-1 rounded-full capitalize whitespace-nowrap ${styles[status] || styles.pending}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}