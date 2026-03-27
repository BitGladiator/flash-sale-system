import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';
import Spinner from '../../components/ui/Spinner';
import {
  Users, ShoppingBag, Zap,
  TrendingUp, CheckCircle, Clock, XCircle,
} from 'lucide-react';
import socket from '../../api/socket';

const StatCard = ({ label, value, icon: Icon, color, sub }) => (
  <div className="card p-6">
    <div className="flex items-start justify-between mb-4">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <p className="text-3xl font-black text-white mb-1">{value}</p>
    <p className="text-sm text-gray-400">{label}</p>
    {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = () => {
      getStats()
        .then((res) => setStats(res.data.data.stats))
        .catch(console.error)
        .finally(() => setLoading(false));
    };

    fetchStats();

    socket.on('sale:status', fetchStats);
    return () => socket.off('sale:status', fetchStats);
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">System overview</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Users"
            value={stats.total_users.toLocaleString()}
            icon={Users}
            color="bg-blue-900/50 text-blue-400"
          />
          <StatCard
            label="Total Revenue"
            value={`$${Number(stats.total_revenue).toLocaleString('en-IN')}`}
            icon={TrendingUp}
            color="bg-green-900/50 text-green-400"
            sub="Confirmed orders only"
          />
          <StatCard
            label="Active Sales"
            value={stats.sales.ACTIVE}
            icon={Zap}
            color="bg-pink-900/50 text-pink-400"
            sub={`${stats.sales.SCHEDULED} scheduled`}
          />
          <StatCard
            label="Total Orders"
            value={(
              stats.orders.PENDING +
              stats.orders.CONFIRMED +
              stats.orders.FAILED
            ).toLocaleString()}
            icon={ShoppingBag}
            color="bg-purple-900/50 text-purple-400"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="font-bold text-white mb-5">Order Breakdown</h2>
            <div className="space-y-4">
              {[
                {
                  label: 'Confirmed',
                  count: stats.orders.CONFIRMED,
                  icon: CheckCircle,
                  color: 'text-green-400',
                  bg: 'bg-green-900/30',
                },
                {
                  label: 'Pending',
                  count: stats.orders.PENDING,
                  icon: Clock,
                  color: 'text-yellow-400',
                  bg: 'bg-yellow-900/30',
                },
                {
                  label: 'Failed',
                  count: stats.orders.FAILED,
                  icon: XCircle,
                  color: 'text-red-400',
                  bg: 'bg-red-900/30',
                },
              ].map(({ label, count, icon: Icon, color, bg }) => (
                <div key={label}
                  className="flex items-center justify-between
                             p-3 rounded-xl bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${bg}`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <span className="text-sm text-gray-300">{label}</span>
                  </div>
                  <span className={`font-bold ${color}`}>
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-bold text-white mb-5">Sales Breakdown</h2>
            <div className="space-y-4">
              {[
                { label: 'Active',    count: stats.sales.ACTIVE,    color: 'text-green-400',  bg: 'bg-green-900/30' },
                { label: 'Scheduled', count: stats.sales.SCHEDULED, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
                { label: 'Ended',     count: stats.sales.ENDED,     color: 'text-gray-400',   bg: 'bg-gray-800' },
              ].map(({ label, count, color, bg }) => (
                <div key={label}
                  className="flex items-center justify-between
                             p-3 rounded-xl bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${bg}`}>
                      <Zap className={`h-4 w-4 ${color}`} />
                    </div>
                    <span className="text-sm text-gray-300">{label}</span>
                  </div>
                  <span className={`font-bold ${color}`}>{count}</span>
                </div>
              ))}
            </div>

            <Link to="/admin/sales"
              className="mt-5 block text-center text-sm text-pink-400
                         hover:text-pink-300 transition-colors">
              Manage Sales →
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;