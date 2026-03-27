import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getSales, createSale,
  addProductToSale, stopSale, cancelSale,
} from '../../api/sales';
import { getProducts } from '../../api/products';
import AdminLayout from '../../components/admin/AdminLayout';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import toast from 'react-hot-toast';
import { Plus, X, Activity, StopCircle } from 'lucide-react';
import socket from '../../api/socket';

const CreateSaleModal = ({ onSuccess, onClose }) => {
  const [form, setForm] = useState({ name: '', start_time: '', end_time: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createSale(form);
      toast.success('Sale created.');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm
                    flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">New Flash Sale</h2>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Sale Name
            </label>
            <input value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Midnight Flash Sale"
              className="input-field" required />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Start Time
            </label>
            <input type="datetime-local" value={form.start_time}
              onChange={(e) =>
                setForm((p) => ({ ...p, start_time: e.target.value }))}
              className="input-field" required />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              End Time
            </label>
            <input type="datetime-local" value={form.end_time}
              onChange={(e) =>
                setForm((p) => ({ ...p, end_time: e.target.value }))}
              className="input-field" required />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading}
              className="btn-primary flex-1">
              {loading ? 'Creating...' : 'Create Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddProductModal = ({ sale, onSuccess, onClose }) => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    product_id: '', sale_price: '', total_qty: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getProducts({ limit: 100 })
      .then((res) => setProducts(res.data.data.products))
      .catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addProductToSale(sale.id, form);
      toast.success('Product added to sale.');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm
                    flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Add Product</h2>
            <p className="text-sm text-gray-400">{sale.name}</p>
          </div>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Product</label>
            <select value={form.product_id}
              onChange={(e) =>
                setForm((p) => ({ ...p, product_id: e.target.value }))}
              className="input-field" required>
              <option value="">Select a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{Number(p.base_price).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Sale Price (₹)
            </label>
            <input type="number" value={form.sale_price}
              onChange={(e) =>
                setForm((p) => ({ ...p, sale_price: e.target.value }))}
              placeholder="Flash sale price" min="0" step="0.01"
              className="input-field" required />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Total Units
            </label>
            <input type="number" value={form.total_qty}
              onChange={(e) =>
                setForm((p) => ({ ...p, total_qty: e.target.value }))}
              placeholder="Available units" min="1"
              className="input-field" required />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading}
              className="btn-primary flex-1">
              {loading ? 'Adding...' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AdminSales = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [addingTo, setAddingTo] = useState(null);

  const fetchSales = async () => {
    try {
      const res = await getSales({ limit: 50 });
      setSales(res.data.data.sales);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchSales(); 

    const handleSaleStatus = ({ saleId, status }) => {
      setSales((prev) => 
        prev.map((s) => String(s.id) === String(saleId) ? { ...s, status } : s)
      );
    };

    socket.on('sale:status', handleSaleStatus);
    return () => socket.off('sale:status', handleSaleStatus);
  }, []);

  const handleStop = async (saleId) => {
    if (!window.confirm('Force stop this active sale?')) return;
    try {
      await stopSale(saleId);
      toast.success('Sale stopped.');
      fetchSales();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    }
  };

  const handleCancel = async (saleId) => {
    if (!window.confirm('Cancel this scheduled sale?')) return;
    try {
      await cancelSale(saleId);
      toast.success('Sale cancelled.');
      fetchSales();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Sales</h1>
            <p className="text-gray-400 mt-1">{sales.length} total sales</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Sale
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <div className="space-y-3">
            {sales.map((sale) => (
              <div key={sale.id}
                className="card p-5 flex items-center
                           justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 min-w-0">
                  <Badge status={sale.status} />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {sale.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(sale.start_time).toLocaleString('en-IN', {
                        dateStyle: 'medium', timeStyle: 'short',
                      })}
                      {' → '}
                      {new Date(sale.end_time).toLocaleString('en-IN', {
                        dateStyle: 'medium', timeStyle: 'short',
                      })}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {sale.products?.length || 0} product(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {sale.status === 'ACTIVE' && (
                    <>
                      <Link to={`/admin/sales/${sale.id}/monitor`}
                        className="flex items-center gap-1.5 px-3 py-2
                                   bg-green-900/30 text-green-400 rounded-xl
                                   text-sm hover:bg-green-900/50 transition-colors">
                        <Activity className="h-4 w-4" />
                        Monitor
                      </Link>
                      <button onClick={() => handleStop(sale.id)}
                        className="flex items-center gap-1.5 px-3 py-2
                                   bg-red-900/30 text-red-400 rounded-xl
                                   text-sm hover:bg-red-900/50 transition-colors">
                        <StopCircle className="h-4 w-4" />
                        Stop
                      </button>
                    </>
                  )}

                  {sale.status === 'SCHEDULED' && (
                    <>
                      <button onClick={() => setAddingTo(sale)}
                        className="flex items-center gap-1.5 px-3 py-2
                                   bg-gray-800 text-gray-300 rounded-xl
                                   text-sm hover:bg-gray-700 transition-colors">
                        <Plus className="h-4 w-4" />
                        Add Product
                      </button>
                      <button onClick={() => handleCancel(sale.id)}
                        className="flex items-center gap-1.5 px-3 py-2
                                   bg-red-900/30 text-red-400 rounded-xl
                                   text-sm hover:bg-red-900/50 transition-colors">
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateSaleModal
          onSuccess={fetchSales}
          onClose={() => setShowCreate(false)}
        />
      )}

      {addingTo && (
        <AddProductModal
          sale={addingTo}
          onSuccess={fetchSales}
          onClose={() => setAddingTo(null)}
        />
      )}
    </AdminLayout>
  );
};

export default AdminSales;