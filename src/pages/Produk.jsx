import { useState, useEffect } from 'react';
import { Search, Plus, AlertTriangle, X, Loader2, AlertCircle, Edit2, Trash2, ImageIcon, Upload, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { uploadProductImage } from '../lib/uploadImage';
import Toast from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { friendlyError } from '../lib/errorUtils';

export default function Produk() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [recipeProductIds, setRecipeProductIds] = useState(new Set());
  const [productionProductIds, setProductionProductIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [formData, setFormData] = useState({
    name: '', category: '', selling_price: 0, stock: 0, image_url: ''
  });
  const [formLoading, setFormLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const navigate = useNavigate();
  const openConfirm = (title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    const [
      { data, error },
      { data: recipes },
      { data: productionLogs },
    ] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('recipes').select('product_id'),
      supabase.from('production_logs').select('product_id'),
    ]);
    
    if (error) {
      console.error(error);
    } else {
      setProducts(data || []);
      setRecipeProductIds(new Set((recipes || []).map(item => item.product_id)));
      setProductionProductIds(new Set((productionLogs || []).map(item => item.product_id)));
    }
    setLoading(false);
  };

  const openAdd = () => {
    setEditingProduct(null);
    setFormData({ name: '', category: '', selling_price: 0, stock: 0, image_url: '' });
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      selling_price: product.selling_price,
      stock: product.stock,
      image_url: product.image_url || ''
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const url = await uploadProductImage(file);
      setFormData(prev => ({ ...prev, image_url: url }));
    } catch {
      setError('Gagal upload gambar. Coba lagi.');
    }
    setImageUploading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    if (!formData.name || !formData.category || formData.selling_price < 0) {
      setError('Mohon lengkapi form dengan benar');
      setFormLoading(false);
      return;
    }

    const payload = {
      name: formData.name,
      category: formData.category,
      selling_price: formData.selling_price,
      stock: formData.stock,
      image_url: formData.image_url || 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&q=80',
      ...(!editingProduct && { cost_price: 0 }),
    };

    const { error: dbError } = editingProduct
      ? await supabase.from('products').update(payload).eq('id', editingProduct.id)
      : await supabase.from('products').insert([{ ...payload, is_available: true }]);

    if (dbError) {
      setError(friendlyError(dbError));
    } else {
      setIsModalOpen(false);
      setToast({ message: editingProduct ? 'Produk berhasil diperbarui!' : 'Produk berhasil ditambahkan!', type: 'success' });
      fetchProducts();
    }
    setFormLoading(false);
  };

  const handleDelete = (id) => {
    openConfirm('Hapus Produk?', 'Produk yang dihapus tidak bisa dikembalikan.', () => executeDelete(id));
  };

  const executeDelete = async (id) => {
    const { error: delError } = await supabase.from('products').delete().eq('id', id);
    if (delError) {
      setToast({ message: 'Gagal menghapus produk.', type: 'error' });
    } else {
      setToast({ message: 'Produk berhasil dihapus.', type: 'success' });
      fetchProducts();
    }
  };

  const getStockStatus = (product) => {
    if ((product.stock || 0) <= 0) return { id: 'empty', label: 'Habis', className: 'bg-red-100/90 text-red-700' };
    if ((product.stock || 0) <= 5) return { id: 'low', label: 'Perlu produksi', className: 'bg-amber-100/90 text-amber-700' };
    return { id: 'ready', label: 'Tersedia', className: 'bg-emerald-100/90 text-emerald-700' };
  };

  const getStockSource = (product) => {
    if (productionProductIds.has(product.id)) return 'Stok dari produksi';
    if (recipeProductIds.has(product.id)) return 'Siap dikelola produksi';
    return 'Stok manual';
  };

  const filteredProducts = products
    .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.category || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(p => {
      if (stockFilter === 'empty') return (p.stock || 0) <= 0;
      if (stockFilter === 'low') return (p.stock || 0) > 0 && (p.stock || 0) <= 5;
      if (stockFilter === 'ready') return (p.stock || 0) > 5;
      return true;
    });

  const productStats = {
    total: products.length,
    low: products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 5).length,
    empty: products.filter(p => (p.stock || 0) <= 0).length,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Manajemen Produk</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base">Kelola menu dan stok kue Anda.</p>
        </div>
        <button
          onClick={openAdd}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Plus size={18} />
          <span>Tambah Produk</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Produk', value: productStats.total, className: 'text-gray-900 dark:text-white' },
          { label: 'Menipis', value: productStats.low, className: 'text-amber-600 dark:text-amber-400' },
          { label: 'Habis', value: productStats.empty, className: 'text-red-600 dark:text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold ${stat.className}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
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
        <div className="flex gap-1 bg-white dark:bg-gray-900 rounded-xl p-1 border border-gray-100 dark:border-gray-800 shadow-sm overflow-x-auto">
          {[
            { id: 'all', label: 'Semua' },
            { id: 'ready', label: 'Tersedia' },
            { id: 'low', label: 'Menipis' },
            { id: 'empty', label: 'Habis' },
          ].map(filter => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStockFilter(filter.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${stockFilter === filter.id ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Memuat data produk...</div>
      ) : products.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Belum ada produk. Silakan tambahkan produk pertama Anda.</div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Tidak ada produk yang cocok dengan filter ini.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => {
            const stockStatus = getStockStatus(product);
            return (
            <div key={product.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden group hover:shadow-md transition-shadow">
              <div className="relative h-48 overflow-hidden bg-gray-100 dark:bg-gray-800">
                {(() => {
                  const isImgBB = product.image_url?.includes('ibb.co') || product.image_url?.includes('imgbb.com');
                  const validUrl = product.image_url && !isImgBB ? product.image_url : null;
                  return validUrl ? (
                    <img
                      src={validUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                    />
                  ) : (
                    <div className="flex w-full h-full items-center justify-center flex-col gap-2 text-gray-300 dark:text-gray-600">
                      <ImageIcon size={36} />
                      <span className="text-xs">{isImgBB ? 'Foto perlu diupload ulang' : 'Belum ada gambar'}</span>
                    </div>
                  );
                })()}
                <div className="absolute top-3 right-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium shadow-sm backdrop-blur-md ${stockStatus.className}`}>
                    {stockStatus.label}
                  </span>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">{product.name}</h3>
                    <p className="text-xs text-gray-500">{product.category}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(product)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Harga Jual</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">Rp {product.selling_price.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Harga Modal</span>
                    <span className="font-medium text-gray-500">Rp {(product.cost_price || 0).toLocaleString('id-ID')}</span>
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
                  <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-gray-500">{getStockSource(product)}</span>
                    <button
                      type="button"
                      onClick={() => navigate('/produksi', { state: { productId: product.id } })}
                      className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                    >
                      <ClipboardList size={13} /> Produksi
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <ConfirmDialog isOpen={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} onConfirm={() => { closeConfirm(); confirmDialog.onConfirm?.(); }} onCancel={closeConfirm} />

      {/* Modal Tambah Produk */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-md my-8 sm:my-auto h-fit">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingProduct ? 'Edit Produk' : 'Tambah Produk Kue'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-4 space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Harga Jual</label>
                <input
                  type="number" min="0" required placeholder="35000"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({...formData, selling_price: e.target.value === '' ? '' : parseInt(e.target.value)})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Harga Modal (HPP) diisi lewat Kalkulator HPP.</p>
              </div>

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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Foto Produk (Opsional)</label>
                <label className={`flex items-center gap-3 w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-dashed ${imageUploading ? 'border-primary-400' : 'border-gray-200 dark:border-gray-700 hover:border-primary-400'} rounded-xl cursor-pointer transition-colors`}>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={imageUploading} />
                  {imageUploading ? (
                    <><Loader2 size={18} className="animate-spin text-primary-500 shrink-0" /><span className="text-sm text-primary-500">Mengupload gambar...</span></>
                  ) : formData.image_url && !formData.image_url.includes('ibb.co') ? (
                    <div className="flex items-center gap-3 w-full">
                      <img src={formData.image_url} alt="preview" className="w-12 h-12 object-cover rounded-lg shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">Gambar terpilih</p>
                        <p className="text-xs text-gray-400 truncate">{formData.image_url}</p>
                      </div>
                      <button type="button" onClick={(e) => { e.preventDefault(); setFormData(p => ({ ...p, image_url: '' })); }} className="ml-auto text-gray-400 hover:text-red-500 shrink-0">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Upload size={18} className="text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-400">
                        {formData.image_url?.includes('ibb.co') ? 'Foto lama tidak bisa dimuat — klik untuk upload ulang' : 'Klik untuk upload foto produk'}
                      </span>
                    </div>
                  )}
                </label>
              </div>

              <div className="pt-2">
                <button 
                  type="submit" disabled={formLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : (editingProduct ? 'Simpan Perubahan' : 'Simpan Produk')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
