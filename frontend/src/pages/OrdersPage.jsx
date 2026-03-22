import { useState, useEffect } from 'react';
import { getOrders } from '../api/orders';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { ShoppingBag, Package } from 'lucide-react';

const OrderCard = ({ order }) => (
  <div className="card p-6">
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <p className="text-xs text-gray-500 font-mono mb-1">
          #{order.id.split('-')[0].toUpperCase()}
        </p>
        <h3 className="font-bold text-white">{order.sale_name}</h3>
        <p className="text-sm text-gray-400 mt-0.5">
          {new Date(order.created_at).toLocaleString('en-IN', {
            dateStyle: 'medium', timeStyle: 'short',
          })}
        </p>
      </div>
      <Badge status={order.status} />
    </div>
    <div className="space-y-3 mb-4">
      {order.items?.map((item, i) => (
        <div key={i}
          className="flex items-center justify-between
                     bg-gray-800/50 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Package className="h-4 w-4 text-gray-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-200">
                {item.product_name}
              </p>
              <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
            </div>
          </div>
          <p className="text-sm font-semibold text-white">
            ${Number(item.unit_price).toLocaleString('en-IN')}
          </p>
        </div>
      ))}
    </div>

    <div className="flex items-center justify-between
                    pt-4 border-t border-gray-800">
      <span className="text-sm text-gray-400">Total</span>
      <span className="text-lg font-black text-white">
        ₹{Number(order.total_amount).toLocaleString('en-IN')}
      </span>
    </div>

    {order.status === 'PENDING' && (
      <p className="text-xs text-yellow-500 mt-3 text-center">
        Payment is being processed...
      </p>
    )}
    {order.status === 'FAILED' && (
      <p className="text-xs text-red-400 mt-3 text-center">
        Payment failed. Your inventory has been released.
      </p>
    )}
  </div>
);

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await getOrders({ page, limit: 10 });
        setOrders(res.data.data.orders);
        setPagination(res.data.data.pagination);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [page]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <ShoppingBag className="h-8 w-8 text-brand-500" />
          My Orders
        </h1>
        <p className="text-gray-400 mt-2">Your flash sale purchase history</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingBag className="h-12 w-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No orders yet.</p>
          <p className="text-gray-600 text-sm mt-1">
            Place your first order during a flash sale.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-gray-400 text-sm">
                Page {page} of {pagination.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={page === pagination.total_pages}
                className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OrdersPage;