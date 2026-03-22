import { useState, useEffect, useRef } from 'react';
import { getProducts, createProduct, deleteProduct } from '../../api/products';
import AdminLayout from '../../components/admin/AdminLayout';
import Spinner from '../../components/ui/Spinner';
import toast from 'react-hot-toast';
import { Plus, Trash2, Package, X, Upload } from 'lucide-react';

const ProductForm = ({ onSuccess, onClose }) => {
  const [form, setForm] = useState({
    name: '', description: '', base_price: '',
  });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('description', form.description);
      fd.append('base_price', form.base_price);
      if (image) fd.append('image', image);

      await createProduct(fd);
      toast.success('Product created.');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create product.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm
                    flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">New Product</h2>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Name</label>
            <input name="name" value={form.name} onChange={handleChange}
              placeholder="Product name" className="input-field" required />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Description
            </label>
            <textarea name="description" value={form.description}
              onChange={handleChange} rows={3}
              placeholder="Optional description"
              className="input-field resize-none" />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Base Price (₹)
            </label>
            <input name="base_price" type="number" value={form.base_price}
              onChange={handleChange} placeholder="0.00" min="0" step="0.01"
              className="input-field" required />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Product Image
            </label>
            {preview ? (
              <div className="relative">
                <img src={preview} alt="preview"
                  className="w-full h-36 object-cover rounded-xl" />
                <button type="button"
                  onClick={() => { setImage(null); setPreview(null); }}
                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1
                             text-white hover:bg-red-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current.click()}
                className="w-full h-36 border-2 border-dashed border-gray-700
                           rounded-xl flex flex-col items-center justify-center
                           gap-2 text-gray-500 hover:border-gray-500
                           hover:text-gray-400 transition-colors">
                <Upload className="h-6 w-6" />
                <span className="text-sm">Click to upload image</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*"
              onChange={handleFile} className="hidden" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchProducts = async () => {
    try {
      const res = await getProducts({ limit: 50 });
      setProducts(res.data.data.products);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this product?')) return;
    try {
      await deleteProduct(id);
      toast.success('Product deactivated.');
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed.');
    }
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Products</h1>
            <p className="text-gray-400 mt-1">{products.length} products</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary
            flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Product
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <Package className="h-12 w-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">No products yet. Create one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
                          xl:grid-cols-4 gap-4">
            {products.map((product) => (
              <div key={product.id} className="card p-4 group">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name}
                    className="w-full h-36 object-cover rounded-xl mb-3
                               bg-gray-800" />
                ) : (
                  <div className="w-full h-36 bg-gray-800 rounded-xl mb-3
                                  flex items-center justify-center">
                    <Package className="h-8 w-8 text-gray-700" />
                  </div>
                )}

                <h3 className="font-semibold text-white text-sm mb-0.5 truncate">
                  {product.name}
                </h3>
                <p className="text-pink-400 font-bold text-sm mb-3">
                  ₹{Number(product.base_price).toLocaleString('en-IN')}
                </p>

                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full
                    ${product.is_active
                      ? 'bg-green-900/40 text-green-400'
                      : 'bg-gray-800 text-gray-500'}`}>
                    {product.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={() => handleDelete(product.id)}
                    className="text-gray-600 hover:text-red-400
                               transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ProductForm
          onSuccess={fetchProducts}
          onClose={() => setShowForm(false)}
        />
      )}
    </AdminLayout>
  );
};

export default AdminProducts;