import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSaleMonitor } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import {
  ArrowLeft, TrendingUp, Package,
  CheckCircle, Clock, RefreshCw,
} from 'lucide-react';

const AdminSaleMonitor = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const res = await getSaleMonitor(id);
      setData(res.data.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [fetch]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      </AdminLayout>
    );
  }

  const { sale, products } = data;

  const totalRevenue = products.reduce(
    (sum, p) => sum + parseFloat(p.revenue), 0
  );
  const totalSold = products.reduce(
    (sum, p) => sum + parseInt(p.confirmed_orders), 0
  );

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin/sales"
            className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white">{sale.name}</h1>
              <Badge status={sale.status} />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Auto-refreshes every 10 seconds</span>
              {lastUpdated && (
                <>
                  <span>·</span>
                  <span>
                    Last updated {lastUpdated.toLocaleTimeString('en-IN')}
                  </span>
                </>
              )}
            </div>
          </div>
          <button onClick={fetch}
            className="flex items-center gap-2 btn-secondary px-4 py-2 text-sm">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <span className="text-sm text-gray-400">Total Revenue</span>
            </div>
            <p className="text-2xl font-black text-white">
              ₹{totalRevenue.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-500 mt-1">Confirmed orders only</p>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="h-5 w-5 text-pink-400" />
              <span className="text-sm text-gray-400">Units Sold</span>
            </div>
            <p className="text-2xl font-black text-white">
              {totalSold.toLocaleString()}
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-5 w-5 text-yellow-400" />
              <span className="text-sm text-gray-400">Time Remaining</span>
            </div>
            <p className="text-2xl font-black text-white">
              {sale.status === 'ACTIVE'
                ? (() => {
                    const diff = new Date(sale.end_time) - new Date();
                    if (diff <= 0) return 'Ended';
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                  })()
                : sale.status}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {products.map((product) => {
            const liveQty = product.live_inventory ?? product.total_qty;
            const soldPct = product.sold_pct;
            const isLow = liveQty <= product.total_qty * 0.2;

            return (
              <div key={product.sale_product_id} className="card p-6">
                <div className="flex items-start justify-between
                                gap-4 mb-5 flex-wrap">
                  <div>
                    <h3 className="font-bold text-white text-lg">
                      {product.product_name}
                    </h3>
                    <p className="text-sm text-gray-400 mt-0.5">
                      ${Number(product.sale_price).toLocaleString('en-IN')} each
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-white">
                      ${Number(product.revenue).toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-gray-500">revenue</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className={isLow
                      ? 'text-red-400 font-semibold'
                      : 'text-gray-300'}>
                      {liveQty} remaining
                      {isLow && ' — Low stock!'}
                    </span>
                    <span className="text-gray-500">
                      {product.total_qty} total
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500
                        ${soldPct > 80
                          ? 'bg-red-500'
                          : soldPct > 50
                          ? 'bg-yellow-500'
                          : 'bg-green-500'}`}
                      style={{ width: `${soldPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {soldPct}% sold
                  </p>
                </div>

               
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: 'Confirmed',
                      value: product.confirmed_orders,
                      color: 'text-green-400',
                      bg: 'bg-green-900/20',
                    },
                    {
                      label: 'Pending',
                      value: product.pending_orders,
                      color: 'text-yellow-400',
                      bg: 'bg-yellow-900/20',
                    },
                    {
                      label: 'Failed',
                      value: product.failed_orders,
                      color: 'text-red-400',
                      bg: 'bg-red-900/20',
                    },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label}
                      className={`${bg} rounded-xl p-3 text-center`}>
                      <p className={`text-xl font-black ${color}`}>{value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSaleMonitor;