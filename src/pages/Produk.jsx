import { useState, useEffect } from 'react';
import { Search, Plus, MoreVertical, AlertTriangle, X, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Produk() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    cost_price: 0,
    selling_price: 0,
    stock: 0,
    image_url: ''
  });
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error(error);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    if (!formData.name || !formData.category || formData.cost_price < 0 || formData.selling_price < 0) {
      setError('Mohon lengkapi form dengan benar');
      setFormLoading(false);
      return;
    }

    const { data, error: insertError } = await supabase.from('products').insert([{
      name: formData.name,
      category: formData.category,
      cost_price: formData.cost_price,
      selling_price: formData.selling_price,
      stock: formData.stock,
      image_url: formData.image_url || 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&q=80',
      is_available: true
    }]);

    if (insertError) {
      setError(insertError.message);
    } else {
      setIsModalOpen(false);
      setFormData({ name: '', category: '', cost_price: 0, selling_price: 0, stock: 0, image_url: '' });
      fetchProducts(); // Refresh
    }
    setFormLoading(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Manajemen Produk</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base">Kelola menu dan stok kue Anda.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Plus size={18} />
          <span>Tambah Produk</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari nama kue..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl text-sm outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Memuat data produk...</div>
      ) : products.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Belum ada produk. Silakan tambahkan produk pertama Anda.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map((product) => (
            <div key={product.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden group hover:shadow-md transition-shadow">
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={product.image_url} 
                  alt={product.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 right-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium shadow-sm backdrop-blur-md
                    ${product.stock > 10 ? 'bg-emerald-100/90 text-emerald-700' : 
                      product.stock > 0 ? 'bg-amber-100/90 text-amber-700' : 'bg-red-100/90 text-red-700'}`}>
                    {product.stock > 10 ? 'Tersedia' : product.stock > 0 ? 'Menipis' : 'Habis'}
                  </span>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">{product.name}</h3>
                    <p className="text-xs text-gray-500">{product.category}</p>
                  </div>
                  <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                    <MoreVertical size={18} />
                  </button>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Harga Jual</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">Rp {product.selling_price.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Harga Modal</span>
                    <span className="font-medium text-gray-500">Rp {product.cost_price.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-gray-500">Stok Tersisa</span>
                    <div className="flex items-center gap-1.5">
                      {product.stock <= 5 && <AlertTriangle size={14} className={product.stock === 0 ? "text-red-500" : "text-amber-500"} />}
                      <span className={`font-medium ${product.stock === 0 ? 'text-red-600' : product.stock <= 5 ? 'text-amber-600' : 'text-gray-900 dark:text-gray-100'}`}>
                        {product.stock} pcs
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Tambah Produk */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-md my-8 sm:my-auto h-fit">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tambah Produk Kue</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAdd} className="p-4 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Kue</label>
                <input 
                  type="text" required placeholder="Cth: Brownies Lumer"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kategori</label>
                <input 
                  type="text" required placeholder="Cth: Brownies"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Harga Modal</label>
                  <input 
                    type="number" min="0" required placeholder="15000"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({...formData, cost_price: e.target.value === '' ? '' : parseInt(e.target.value)})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Harga Jual</label>
                  <input 
                    type="number" min="0" required placeholder="35000"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({...formData, selling_price: e.target.value === '' ? '' : parseInt(e.target.value)})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Stok Awal</label>
                  <input 
                    type="number" min="0" required
                    value={formData.stock}
                    onChange={(e) => setFormData({...formData, stock: e.target.value === '' ? '' : parseInt(e.target.value)})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">URL Gambar (Opsional)</label>
                  <input 
                    type="url" placeholder="https://..."
                    value={formData.image_url}
                    onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit" disabled={formLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : 'Simpan Produk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
