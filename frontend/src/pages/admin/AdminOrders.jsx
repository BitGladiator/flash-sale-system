import { useState, useEffect } from 'react';
import { getAdminOrders } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import { ShoppingBag } from 'lucide-react';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const params = { page, limit: 20 };
        if (filter !== 'ALL') params.status = filter;
        const res = await getAdminOrders(params);
        setOrders(res.data.data.orders);
        setPagination(res.data.data.pagination);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [filter, page]);

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">All Orders</h1>
          <p className="text-gray-400 mt-1">
            {pagination?.total?.toLocaleString() || 0} total orders
          </p>
        </div>
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {['ALL', 'CONFIRMED', 'PENDING', 'FAILED'].map((f) => (
            <button key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold
                          transition-all
                          ${filter === f
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="h-12 w-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">No orders found.</p>
          </div>
        ) : (
          <>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Order', 'Customer', 'Sale', 'Items', 'Amount', 'Status', 'Date']
                      .map((h) => (
                        <th key={h}
                          className="text-left text-xs font-semibold text-gray-500
                                     uppercase tracking-wider px-5 py-4">
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {orders.map((order) => (
                    <tr key={order.id}
                      className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-gray-400">
                          #{order.id.split('-')[0].toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-white font-medium">
                          {order.user_name}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {order.user_email}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-gray-300">{order.sale_name}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          {order.items?.map((item, i) => (
                            <p key={i} className="text-gray-400 text-xs">
                              {item.product_name} × {item.quantity}
                            </p>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-white">
                          ₹{Number(order.total_amount).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge status={order.status} />
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-gray-500 text-xs">
                          {new Date(order.created_at).toLocaleString('en-IN', {
                            dateStyle: 'medium', timeStyle: 'short',
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.total_pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary px-4 py-2 text-sm disabled:opacity-40">
                  Previous
                </button>
                <span className="text-gray-400 text-sm">
                  Page {page} of {pagination.total_pages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  disabled={page === pagination.total_pages}
                  className="btn-secondary px-4 py-2 text-sm disabled:opacity-40">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminOrders;