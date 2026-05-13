import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Loader2, AlertCircle, Package, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Toast from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { friendlyError } from '../lib/errorUtils';
import { dateInputToLocalISOString, todayInputValue } from '../lib/dateUtils';
import { reconcileProductStock } from '../lib/productStock';

const ProductPicker = ({ products, value, onChange }) => {
  const selected = products.find(p => p.id === value);
  const [query, setQuery] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected?.name || '');
  }, [selected?.id, selected?.name]);

  const filtered = products
    .filter(p => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [p.name, p.category].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    })
    .slice(0, 8);

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border rounded-xl transition-colors ${open ? 'border-primary-500 ring-2 ring-primary-500/10' : 'border-gray-200 dark:border-gray-700'}`}>
        <Search size={16} className="ml-3 text-gray-400 shrink-0" />
        <input
          required
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Cari produk kue..."
          className="w-full min-w-0 bg-transparent py-2.5 pr-1 text-sm outline-none text-gray-900 dark:text-gray-100"
        />
        {selected && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setQuery('');
              setOpen(true);
            }}
            className="mr-2 p-1 text-gray-400 hover:text-red-500 rounded-md"
            aria-label="Kosongkan produk"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl shadow-black/10">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Produk tidak ditemukan.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto py-1">
              {filtered.map(product => {
                const outOfStock = product.stock <= 0;
                const isSelected = product.id === value;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={outOfStock && !isSelected}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(product.id);
                      setQuery(product.name);
                      setOpen(false);
                    }}
                    className="w-full px-3 py-2.5 text-left hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 p-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400">
                        <Package size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{product.name}</span>
                          {isSelected && <Check size={14} className="text-primary-600 shrink-0" />}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>Rp {product.selling_price.toLocaleString('id-ID')}</span>
                          <span className={outOfStock ? 'text-red-500' : product.stock <= 5 ? 'text-amber-500' : 'text-emerald-600'}>Stok {product.stock} pcs</span>
                          {product.category && <span>{product.category}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function Penjualan() {
  const [searchTerm, setSearchTerm] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: 1,
    payment_method: 'Cash',
    customer_name: '',
    transaction_date: todayInputValue()
  });
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [quickSale, setQuickSale] = useState({ product_id: '', quantity: 1, payment_method: 'Cash' });
  const [quickSaleLoading, setQuickSaleLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const openConfirm = (title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));
  const selectedProduct = products.find(p => p.id === formData.product_id);
  const previewQty = parseInt(formData.quantity) || 0;
  const previewTotal = selectedProduct ? selectedProduct.selling_price * previewQty : 0;
  const selectedQuickProduct = products.find(p => p.id === quickSale.product_id);
  const quickSaleQty = parseInt(quickSale.quantity) || 0;
  const quickSaleTotal = selectedQuickProduct ? selectedQuickProduct.selling_price * quickSaleQty : 0;

  useEffect(() => {
    fetchTransactions();
    fetchProducts();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*, products(name)')
      .order('transaction_date', { ascending: false });
    
    if (error) {
      console.error(error);
    } else {
      setTransactions(data || []);
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_available', true);
    setProducts(data || []);
  };

  const updateProductStock = async (productId, delta) => {
    if (!delta) return { error: null };
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();
    if (fetchError || !product) return { error: fetchError || new Error('Produk tidak ditemukan') };
    return supabase
      .from('products')
      .update({ stock: Math.max(0, (product.stock || 0) + delta) })
      .eq('id', productId);
  };

  const openAdd = () => {
    setEditingTransaction(null);
    setFormData({ product_id: '', quantity: 1, payment_method: 'Cash', customer_name: '', transaction_date: todayInputValue() });
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (trx) => {
    setEditingTransaction(trx);
    setFormData({
      product_id: trx.product_id,
      quantity: trx.quantity,
      payment_method: trx.payment_method,
      customer_name: trx.customer_name || '',
      transaction_date: trx.transaction_date ? trx.transaction_date.split('T')[0] : todayInputValue()
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    if (!formData.product_id) {
      setError('Silakan pilih produk');
      setFormLoading(false);
      return;
    }

    // Selalu fetch stok terbaru dari DB — hindari stale local state
    const { data: freshProduct } = await supabase
      .from('products').select('*').eq('id', formData.product_id).single();
    if (!freshProduct) {
      setError('Produk tidak ditemukan.');
      setFormLoading(false);
      return;
    }

    const newQty = parseInt(formData.quantity) || 1;
    const isSameProduct = editingTransaction && editingTransaction.product_id === formData.product_id;
    const oldQty = isSameProduct ? editingTransaction.quantity : 0;
    const stockNeeded = newQty - oldQty;

    if (stockNeeded > 0 && freshProduct.stock < stockNeeded) {
      setError(`Stok ${freshProduct.name} tidak mencukupi. Tersedia: ${freshProduct.stock} pcs`);
      setFormLoading(false);
      return;
    }

    const payload = {
      product_id: formData.product_id,
      quantity: newQty,
      unit_price: freshProduct.selling_price,
      payment_method: formData.payment_method,
      customer_name: formData.customer_name || null,
      transaction_date: dateInputToLocalISOString(formData.transaction_date),
    };

    let dbError;

    if (editingTransaction) {
      const stockChanges = isSameProduct
        ? [{ productId: formData.product_id, delta: -stockNeeded }]
        : [
            { productId: editingTransaction.product_id, delta: editingTransaction.quantity },
            { productId: formData.product_id, delta: -newQty },
          ];

      for (const change of stockChanges) {
        const { error: stockError } = await updateProductStock(change.productId, change.delta);
        if (stockError) {
          setError('Gagal menyesuaikan stok produk. Transaksi belum diubah.');
          setFormLoading(false);
          return;
        }
      }

      const { error: updateError } = await supabase
        .from('sales')
        .update(payload)
        .eq('id', editingTransaction.id);
      dbError = updateError;

      if (dbError) {
        for (const change of stockChanges.slice().reverse()) {
          await updateProductStock(change.productId, -change.delta);
        }
      }
    } else {
      const { error: insertError } = await supabase.from('sales').insert([payload]);
      dbError = insertError;
    }

    if (dbError) {
      setError(friendlyError(dbError));
    } else {
      if (editingTransaction) {
        await reconcileProductStock(editingTransaction.product_id);
      }
      await reconcileProductStock(formData.product_id);
      // INSERT: trigger tr_reduce_stock otomatis mengurangi stok — tidak perlu manual
      setIsModalOpen(false);
      setFormData({ product_id: '', quantity: 1, payment_method: 'Cash', customer_name: '', transaction_date: todayInputValue() });
      setToast({ message: editingTransaction ? 'Transaksi berhasil diperbarui!' : 'Penjualan berhasil dicatat!', type: 'success' });
      fetchTransactions();
      fetchProducts();
    }
    setFormLoading(false);
  };

  const handleQuickSale = async (e) => {
    e.preventDefault();
    setError('');
    if (!quickSale.product_id || quickSaleQty <= 0) {
      setToast({ message: 'Pilih produk dan isi jumlah penjualan.', type: 'error' });
      return;
    }

    setQuickSaleLoading(true);
    const { data: freshProduct } = await supabase
      .from('products')
      .select('*')
      .eq('id', quickSale.product_id)
      .single();

    if (!freshProduct) {
      setToast({ message: 'Produk tidak ditemukan.', type: 'error' });
      setQuickSaleLoading(false);
      return;
    }

    if ((freshProduct.stock || 0) < quickSaleQty) {
      setToast({ message: `Stok ${freshProduct.name} tidak cukup. Tersedia ${freshProduct.stock || 0} pcs.`, type: 'error' });
      setQuickSaleLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from('sales').insert([{
      product_id: quickSale.product_id,
      quantity: quickSaleQty,
      unit_price: freshProduct.selling_price,
      payment_method: quickSale.payment_method,
      customer_name: null,
      transaction_date: dateInputToLocalISOString(todayInputValue()),
    }]);

    if (insertError) {
      setToast({ message: friendlyError(insertError), type: 'error' });
    } else {
      await reconcileProductStock(quickSale.product_id);
      setQuickSale({ product_id: '', quantity: 1, payment_method: quickSale.payment_method });
      setToast({ message: 'Penjualan cepat berhasil dicatat.', type: 'success' });
      fetchTransactions();
      fetchProducts();
    }
    setQuickSaleLoading(false);
  };

  const handleDelete = (id) => {
    openConfirm('Hapus Transaksi?', 'Data transaksi yang dihapus tidak bisa dikembalikan.', () => executeDelete(id));
  };

  const executeDelete = async (id) => {
    const trxToDelete = transactions.find(t => t.id === id);
    const { error: delError } = await supabase.from('sales').delete().eq('id', id);
    if (delError) {
      setToast({ message: 'Gagal menghapus transaksi.', type: 'error' });
    } else {
      if (trxToDelete) {
        const { reconciled } = await reconcileProductStock(trxToDelete.product_id);
        if (!reconciled) {
          await updateProductStock(trxToDelete.product_id, trxToDelete.quantity);
        }
      }
      setToast({ message: 'Transaksi berhasil dihapus.', type: 'success' });
      fetchTransactions();
      fetchProducts();
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Data Penjualan</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base">Catat dan kelola transaksi penjualan kue.</p>
        </div>
        <button
          onClick={openAdd}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Plus size={18} />
          <span>Tambah Penjualan</span>
        </button>
      </div>

      <form onSubmit={handleQuickSale} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Kasir Cepat</label>
            <ProductPicker
              products={products}
              value={quickSale.product_id}
              onChange={(productId) => setQuickSale({ ...quickSale, product_id: productId })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Qty</label>
            <input
              type="number"
              min="1"
              required
              value={quickSale.quantity}
              onChange={(e) => setQuickSale({ ...quickSale, quantity: e.target.value === '' ? '' : parseInt(e.target.value) })}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Bayar</label>
            <select
              value={quickSale.payment_method}
              onChange={(e) => setQuickSale({ ...quickSale, payment_method: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
            >
              <option value="Cash">Cash</option>
              <option value="Transfer">Transfer</option>
              <option value="QRIS">QRIS</option>
              <option value="Debit">Debit</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={quickSaleLoading}
            className="w-full lg:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-70"
          >
            {quickSaleLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Simpan Cepat
          </button>
        </div>
        {selectedQuickProduct && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-500">
              Stok: <span className={`font-semibold ${selectedQuickProduct.stock <= 0 ? 'text-red-500' : selectedQuickProduct.stock <= 5 ? 'text-amber-500' : 'text-emerald-600'}`}>{selectedQuickProduct.stock} pcs</span>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-emerald-700 dark:text-emerald-300">
              Total: <span className="font-semibold">Rp {quickSaleTotal.toLocaleString('id-ID')}</span>
            </div>
            <div className="hidden sm:block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-500">
              Sisa setelah jual: <span className="font-semibold">{Math.max(0, selectedQuickProduct.stock - quickSaleQty)} pcs</span>
            </div>
          </div>
        )}
      </form>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="relative w-full sm:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Cari transaksi..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl text-sm outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Tanggal</th>
                <th className="p-4 font-medium">Produk</th>
                <th className="p-4 font-medium text-right">Qty</th>
                <th className="p-4 font-medium text-right">Total</th>
                <th className="p-4 font-medium">Pembayaran</th>
                <th className="p-4 font-medium">Pelanggan</th>
                <th className="p-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">Memuat data...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">Belum ada transaksi. Silakan tambahkan.</td>
                </tr>
              ) : (
                transactions.filter(t => t.products?.name?.toLowerCase().includes(searchTerm.toLowerCase())).map((trx) => (
                  <tr key={trx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="p-4 text-gray-500 dark:text-gray-400">{new Date(trx.transaction_date).toLocaleDateString('id-ID', { hour: '2-digit', minute:'2-digit'})}</td>
                    <td className="p-4 text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">{trx.products?.name || 'Produk Dihapus'}</td>
                    <td className="p-4 text-right text-gray-900 dark:text-gray-100">{trx.quantity}</td>
                    <td className="p-4 text-right font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Rp {trx.total_price?.toLocaleString('id-ID')}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {trx.payment_method}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400">{trx.customer_name || '-'}</td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(trx)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(trx.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      <ConfirmDialog isOpen={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} onConfirm={() => { closeConfirm(); confirmDialog.onConfirm?.(); }} onCancel={closeConfirm} />

      {/* Modal Tambah */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-md my-8 sm:my-auto h-fit">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingTransaction ? 'Edit Transaksi' : 'Tambah Penjualan'}</h2>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Transaksi</label>
                <input
                  type="date" required
                  value={formData.transaction_date}
                  max={todayInputValue()}
                  onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Pilih Produk</label>
                <ProductPicker products={products} value={formData.product_id} onChange={(productId) => setFormData({...formData, product_id: productId})} />
                {selectedProduct && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-500">
                      Stok: <span className={`font-semibold ${selectedProduct.stock <= 0 ? 'text-red-500' : selectedProduct.stock <= 5 ? 'text-amber-500' : 'text-emerald-600'}`}>{selectedProduct.stock} pcs</span>
                    </div>
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-emerald-700 dark:text-emerald-300">
                      Total: <span className="font-semibold">Rp {previewTotal.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jumlah</label>
                  <input 
                    type="number" min="1" required
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value === '' ? '' : parseInt(e.target.value)})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Metode Bayar</label>
                  <select 
                    value={formData.payment_method}
                    onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Transfer">Transfer</option>
                    <option value="QRIS">QRIS</option>
                    <option value="Debit">Debit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Pelanggan (Opsional)</label>
                <input 
                  type="text" placeholder="Cth: Budi"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" disabled={formLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : (editingTransaction ? 'Simpan Perubahan' : 'Simpan Transaksi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
