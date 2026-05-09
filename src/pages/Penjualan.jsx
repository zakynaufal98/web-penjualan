import { useState, useEffect } from 'react';
import { Search, Plus, Filter, MoreVertical, Edit2, Trash2, X, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import Toast from '../components/ui/Toast';

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
    customer_name: ''
  });
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const { user } = useStore();

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

  const openAdd = () => {
    setEditingTransaction(null);
    setFormData({ product_id: '', quantity: 1, payment_method: 'Cash', customer_name: '' });
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (trx) => {
    setEditingTransaction(trx);
    setFormData({
      product_id: trx.product_id,
      quantity: trx.quantity,
      payment_method: trx.payment_method,
      customer_name: trx.customer_name || ''
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

    const selectedProduct = products.find(p => p.id === formData.product_id);
    if (!selectedProduct) return;

    const payload = {
      product_id: formData.product_id,
      quantity: formData.quantity,
      unit_price: selectedProduct.selling_price,
      total_price: selectedProduct.selling_price * formData.quantity,
      payment_method: formData.payment_method,
      customer_name: formData.customer_name || null,
    };

    const { error: dbError } = editingTransaction
      ? await supabase.from('sales').update(payload).eq('id', editingTransaction.id)
      : await supabase.from('sales').insert([{ ...payload, created_by: user?.id }]);

    if (dbError) {
      setError(dbError.message);
    } else {
      setIsModalOpen(false);
      setFormData({ product_id: '', quantity: 1, payment_method: 'Cash', customer_name: '' });
      setToast({ message: editingTransaction ? 'Transaksi berhasil diperbarui!' : 'Penjualan berhasil dicatat!', type: 'success' });
      fetchTransactions();
    }
    setFormLoading(false);
  };

  const handleDelete = async (id) => {
    if (confirm('Yakin ingin menghapus transaksi ini?')) {
      const { error: delError } = await supabase.from('sales').delete().eq('id', id);
      if (delError) {
        setToast({ message: 'Gagal menghapus transaksi.', type: 'error' });
      } else {
        setToast({ message: 'Transaksi berhasil dihapus.', type: 'success' });
        fetchTransactions();
      }
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Pilih Produk</label>
                <select 
                  required
                  value={formData.product_id}
                  onChange={(e) => setFormData({...formData, product_id: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                >
                  <option value="">-- Pilih Produk Kue --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} - Rp {p.selling_price.toLocaleString('id-ID')}</option>
                  ))}
                </select>
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
