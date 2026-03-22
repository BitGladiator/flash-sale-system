import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSale } from '../api/sales';
import { placeOrder } from '../api/orders';
import { useAuth } from '../context/AuthContext';
import useCountdown from '../hooks/useCountdown';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import toast from 'react-hot-toast';
import {
  Zap, Clock, Package, ShoppingCart,
  AlertTriangle, CheckCircle, ArrowLeft,
} from 'lucide-react';


const CountdownBanner = ({ endTime }) => {
  const { hours, minutes, seconds, expired } = useCountdown(endTime);
  const pad = (n) => String(n).padStart(2, '0');

  if (expired) return null;

  const isUrgent = hours === 0 && minutes < 10;

  return (
    <div className={`rounded-2xl p-4 mb-6 flex items-center
                     justify-between flex-wrap gap-3
                     ${isUrgent
                       ? 'bg-red-900/30 border border-red-800'
                       : 'bg-green-900/20 border border-green-800/50'}`}>
      <div className="flex items-center gap-2">
        <Clock className={`h-5 w-5
          ${isUrgent ? 'text-red-400' : 'text-green-400'}`} />
        <span className={`font-semibold text-sm
          ${isUrgent ? 'text-red-300' : 'text-green-300'}`}>
          {isUrgent ? 'Ending very soon!' : 'Sale ends in'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 font-mono">
        {[
          { value: pad(hours), label: 'HRS' },
          { value: pad(minutes), label: 'MIN' },
          { value: pad(seconds), label: 'SEC' },
        ].map(({ value, label }, i) => (
          <div key={label} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className={isUrgent ? 'text-red-600' : 'text-green-700'}>
                :
              </span>
            )}
            <div className="text-center">
              <div className={`text-2xl font-black px-3 py-1.5 rounded-xl
                ${isUrgent
                  ? 'bg-red-900/50 text-red-300'
                  : 'bg-green-900/40 text-green-300'}`}>
                {value}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


const InventoryBar = ({ available, total }) => {
  const pct = Math.max(0, Math.min(100, (available / total) * 100));
  const isLow = pct < 20;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className={isLow ? 'text-red-400 font-semibold' : 'text-gray-400'}>
          {isLow ? `Only ${available} left!` : `${available} available`}
        </span>
        <span className="text-gray-600">{total} total</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500
            ${isLow ? 'bg-red-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};


const ProductCard = ({ product, saleId, saleStatus, onOrderPlaced }) => {
  const [buying, setBuying] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const canBuy = saleStatus === 'ACTIVE'
    && !ordered
    && (product.available_qty ?? product.total_qty) > 0;

  const handleBuy = async () => {
    if (!user) {
      toast.error('Please login to purchase.');
      navigate('/login');
      return;
    }

    setBuying(true);
    try {
      await placeOrder({
        sale_id: saleId,
        sale_product_id: product.sale_product_id,
        quantity: 1,
      });

      setOrdered(true);
      toast.success('Order placed! Payment is being processed.', {
        duration: 5000
      });
      onOrderPlaced();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to place order.';
      if (err.response?.status === 409) {
    
        setOrdered(true);
        toast(msg);
      } else if (err.response?.status === 429) {
        toast.error('Too many attempts. Please slow down.');
      } else {
        toast.error(msg);
      }
    } finally {
      setBuying(false);
    }
  };

  const available = product.available_qty ?? product.total_qty;
  const isSoldOut = available <= 0;

  return (
    <div className="card p-6">
      {product.image_key ? (
        <img
          src={`http://localhost:9000/flash-sale-products/${product.image_key}`}
          alt={product.product_name}
          className="w-full h-48 object-cover rounded-xl mb-4 bg-gray-800"
        />
      ) : (
        <div className="w-full h-48 bg-gray-800 rounded-xl mb-4
                        flex items-center justify-center">
          <Package className="h-12 w-12 text-gray-700" />
        </div>
      )}

      <h3 className="font-bold text-white text-lg mb-1">
        {product.product_name}
      </h3>
      {product.description && (
        <p className="text-gray-400 text-sm mb-4 line-clamp-2">
          {product.description}
        </p>
      )}
      <div className="mb-4">
        <span className="text-3xl font-black text-white">
          ${Number(product.sale_price).toLocaleString('en-IN')}
        </span>
      </div>

      {saleStatus === 'ACTIVE' && (
        <div className="mb-5">
          <InventoryBar available={available} total={product.total_qty} />
        </div>
      )}

      {saleStatus === 'ACTIVE' && (
        <button
          onClick={handleBuy}
          disabled={buying || isSoldOut || ordered}
          className={`w-full flex items-center justify-center gap-2
                      font-bold py-3.5 rounded-xl transition-all
                      duration-150 active:scale-95
                      ${ordered
                        ? 'bg-green-900/50 text-green-400 border border-green-800 cursor-default'
                        : isSoldOut
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
        >
          {buying ? (
            <>
              <Spinner size="sm" />
              Processing...
            </>
          ) : ordered ? (
            <>
              <CheckCircle className="h-5 w-5" />
              Order Placed
            </>
          ) : isSoldOut ? (
            <>
              <AlertTriangle className="h-5 w-5" />
              Sold Out
            </>
          ) : (
            <>
              <ShoppingCart className="h-5 w-5" />
              Buy Now — ₹{Number(product.sale_price).toLocaleString('en-IN')}
            </>
          )}
        </button>
      )}

      {saleStatus === 'SCHEDULED' && (
        <div className="text-center py-3 text-gray-500 text-sm">
          Sale hasn't started yet
        </div>
      )}

      {saleStatus === 'ENDED' && (
        <div className="text-center py-3 text-gray-500 text-sm">
          This sale has ended
        </div>
      )}
    </div>
  );
};


const SaleDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSale = useCallback(async () => {
    try {
      const res = await getSale(id);
      setSale(res.data.data.sale);
    } catch (err) {
      toast.error('Sale not found.');
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSale();
    const interval = setInterval(fetchSale, 30000);
    return () => clearInterval(interval);
  }, [fetchSale]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!sale) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-gray-400 hover:text-white
                   transition-colors mb-6 group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        All Sales
      </button>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-3xl font-bold text-white">{sale.name}</h1>
          <Badge status={sale.status} />
        </div>
        <p className="text-gray-400 text-sm">
          {new Date(sale.start_time).toLocaleString('en-IN', {
            dateStyle: 'long', timeStyle: 'short',
          })}
          {' → '}
          {new Date(sale.end_time).toLocaleString('en-IN', {
            dateStyle: 'long', timeStyle: 'short',
          })}
        </p>
      </div>

      {sale.status === 'ACTIVE' && (
        <CountdownBanner endTime={sale.end_time} />
      )}
      {sale.status === 'SCHEDULED' && (
        <div className="bg-yellow-900/20 border border-yellow-800/50
                        rounded-2xl p-4 mb-6 flex items-center gap-3">
          <Clock className="h-5 w-5 text-yellow-400 shrink-0" />
          <div>
            <p className="text-yellow-300 font-semibold text-sm">
              Sale starts in
            </p>
            <CountdownBanner endTime={sale.start_time} />
          </div>
        </div>
      )}

      {!sale.products || sale.products.length === 0 ? (
        <div className="text-center py-20">
          <Package className="h-12 w-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500">No products in this sale yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sale.products.map((product) => (
            <ProductCard
              key={product.sale_product_id}
              product={product}
              saleId={sale.id}
              saleStatus={sale.status}
              onOrderPlaced={fetchSale}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SaleDetailPage;