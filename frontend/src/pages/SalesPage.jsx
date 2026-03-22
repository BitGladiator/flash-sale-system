import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSales } from '../api/sales';
import useCountdown from '../hooks/useCountdown';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { Zap, Clock, Package } from 'lucide-react';

const SaleCountdown = ({ sale }) => {
  const isUpcoming = sale.status === 'SCHEDULED';
  const targetDate = isUpcoming ? sale.start_time : sale.end_time;
  const { hours, minutes, seconds, expired } = useCountdown(targetDate);

  if (expired) {
    return (
      <p className="text-sm text-gray-500">
        {isUpcoming ? 'Starting soon...' : 'Sale ended'}
      </p>
    );
  }

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-gray-500 shrink-0" />
      <div className="flex items-center gap-1">
        <span className={`font-mono text-sm font-bold px-2 py-0.5 rounded-lg
                          ${isUpcoming
                            ? 'bg-yellow-900/40 text-yellow-400'
                            : 'bg-red-900/40 text-red-400'}`}>
          {pad(hours)}
        </span>
        <span className="text-gray-600 font-bold">:</span>
        <span className={`font-mono text-sm font-bold px-2 py-0.5 rounded-lg
                          ${isUpcoming
                            ? 'bg-yellow-900/40 text-yellow-400'
                            : 'bg-red-900/40 text-red-400'}`}>
          {pad(minutes)}
        </span>
        <span className="text-gray-600 font-bold">:</span>
        <span className={`font-mono text-sm font-bold px-2 py-0.5 rounded-lg
                          ${isUpcoming
                            ? 'bg-yellow-900/40 text-yellow-400'
                            : 'bg-red-900/40 text-red-400'}`}>
          {pad(seconds)}
        </span>
      </div>
      <span className="text-xs text-gray-500">
        {isUpcoming ? 'until start' : 'remaining'}
      </span>
    </div>
  );
};


const SaleCard = ({ sale }) => {
  const totalItems = sale.products?.reduce((sum, p) => sum + p.total_qty, 0) || 0;
  const productCount = sale.products?.length || 0;

  return (
    <Link to={`/sales/${sale.id}`}
      className="card p-6 hover:border-gray-700 hover:bg-gray-800/50
                 transition-all duration-200 group block">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl
            ${sale.status === 'ACTIVE'
              ? 'bg-green-900/50'
              : sale.status === 'SCHEDULED'
              ? 'bg-yellow-900/50'
              : 'bg-gray-800'}`}>
            <Zap className={`h-5 w-5
              ${sale.status === 'ACTIVE'
                ? 'text-green-400'
                : sale.status === 'SCHEDULED'
                ? 'text-yellow-400'
                : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="font-bold text-white group-hover:text-brand-400
                           transition-colors text-lg leading-tight">
              {sale.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(sale.start_time).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
        </div>
        <Badge status={sale.status} />
      </div>

      
      {sale.status !== 'ENDED' && (
        <div className="mb-4">
          <SaleCountdown sale={sale} />
        </div>
      )}

     
      <div className="flex items-center gap-4 pt-4 border-t border-gray-800">
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <Package className="h-4 w-4" />
          <span>{productCount} product{productCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <span>{totalItems.toLocaleString()} total units</span>
        </div>

        {sale.status === 'ACTIVE' && (
          <span className="ml-auto text-xs font-semibold text-green-400
                           animate-pulse-fast">
            ● LIVE
          </span>
        )}
      </div>
    </Link>
  );
};


const SalesPage = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const params = filter !== 'ALL' ? { status: filter } : {};
        const res = await getSales(params);
        setSales(res.data.data.sales);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSales();
  }, [filter]);

  const filters = ['ALL', 'ACTIVE', 'SCHEDULED', 'ENDED'];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
    
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white">Flash Sales</h1>
        <p className="text-gray-400 mt-2">
          Limited time deals. Limited stock. Move fast.
        </p>
      </div>

   
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => {
              setLoading(true);
              setFilter(f);
            }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold
                        transition-all duration-150
                        ${filter === f
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {f}
          </button>
        ))}
      </div>

     
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : sales.length === 0 ? (
        <div className="text-center py-20">
          <Zap className="h-12 w-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No sales found.</p>
          <p className="text-gray-600 text-sm mt-1">
            Check back soon for upcoming deals.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sales.map((sale) => (
            <SaleCard key={sale.id} sale={sale} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SalesPage;