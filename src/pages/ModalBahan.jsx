import { useState, useEffect } from 'react';
import { Search, Plus, Filter, Edit2, Trash2, X, Loader2, AlertCircle, Camera, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadToImgBB } from '../lib/uploadImgBB';

export default function ModalBahan() {
  const [searchTerm, setSearchTerm] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Cart State
  const [cart, setCart] = useState([]);
  const [transactionInfo, setTransactionInfo] = useState({
    supplier: '',
    receipt_url: '',
    purchase_date: new Date().toISOString().split('T')[0]
  });

  // Current Item Form State
  const [currentItem, setCurrentItem] = useState({
    name: '',
    category: '',
    quantity: 1,
    unit: 'kg',
    unit_price: 0
  });

  const [formLoading, setFormLoading] = useState(false);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchIngredients();
  }, []);

  const fetchIngredients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('purchase_date', { ascending: false });
    
    if (error) {
      console.error(error);
    } else {
      setIngredients(data || []);
    }
    setLoading(false);
  };

  const handleAddToCart = (e) => {
    e.preventDefault();
    setError('');

    if (!currentItem.name || !currentItem.category || currentItem.quantity <= 0 || currentItem.unit_price < 0) {
      setError('Mohon lengkapi form bahan dengan benar');
      return;
    }

    setCart([...cart, { ...currentItem, id: Date.now() }]);
    setCurrentItem({ name: '', category: '', quantity: 1, unit: 'kg', unit_price: 0 });
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleSaveAll = async () => {
    if (cart.length === 0) {
      setError('Keranjang masih kosong, tambahkan minimal 1 bahan.');
      return;
    }
    
    setFormLoading(true);
    setError('');

    const insertData = cart.map(item => ({
      name: item.name,
      category: item.category,
      supplier: transactionInfo.supplier || null,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      receipt_url: transactionInfo.receipt_url || null,
      purchase_date: new Date(transactionInfo.purchase_date).toISOString()
    }));

    const { error: insertError } = await supabase.from('ingredients').insert(insertData);

    if (insertError) {
      setError(insertError.message);
    } else {
      setIsModalOpen(false);
      setCart([]);
      setTransactionInfo({ supplier: '', receipt_url: '', purchase_date: new Date().toISOString().split('T')[0] });
      fetchIngredients();
    }
    setFormLoading(false);
  };

  const handleDelete = async (id) => {
    if (confirm('Yakin ingin menghapus riwayat pembelian ini?')) {
      await supabase.from('ingredients').delete().eq('id', id);
      fetchIngredients();
    }
  };

  const handleCapturePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingReceipt(true);
    setError('');
    try {
      const url = await uploadToImgBB(file);
      setTransactionInfo({ ...transactionInfo, receipt_url: url });
    } catch (err) {
      console.error(err);
      setError('Gagal mengunggah foto struk.');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Modal Bahan Baku</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base">Pencatatan pembelian bahan baku kue.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Plus size={18} />
          <span>Tambah Pembelian</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="relative w-full sm:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Cari bahan baku..." 
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
                <th className="p-4 font-medium">Nama Bahan</th>
                <th className="p-4 font-medium">Kategori</th>
                <th className="p-4 font-medium">Supplier</th>
                <th className="p-4 font-medium text-right">Jumlah</th>
                <th className="p-4 font-medium text-right">Harga Satuan</th>
                <th className="p-4 font-medium text-right">Total</th>
                <th className="p-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500">Memuat data...</td>
                </tr>
              ) : ingredients.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500">Belum ada riwayat pembelian.</td>
                </tr>
              ) : (
                ingredients.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())).map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(item.purchase_date).toLocaleDateString('id-ID')}</td>
                    <td className="p-4 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{item.name}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{item.supplier || '-'}</td>
                    <td className="p-4 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{item.quantity} {item.unit}</td>
                    <td className="p-4 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">Rp {item.unit_price.toLocaleString('id-ID')}</td>
                    <td className="p-4 text-right font-medium text-red-600 dark:text-red-400 whitespace-nowrap">Rp {(item.quantity * item.unit_price).toLocaleString('id-ID')}</td>
                    <td className="p-4 flex items-center gap-2">
                      {item.receipt_url && (
                        <button onClick={() => setSelectedImage(item.receipt_url)} title="Lihat Struk" className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                          <ImageIcon size={16} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(item.id)} title="Hapus" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-2xl my-8 sm:my-auto h-fit">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tambah Pembelian Bahan Baku</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-6">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              {/* 1. Info Struk & Supplier */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                  <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                  Info Struk & Toko
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Pembelian</label>
                    <input 
                      type="date" required
                      value={transactionInfo.purchase_date}
                      onChange={(e) => setTransactionInfo({...transactionInfo, purchase_date: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Supplier / Toko</label>
                    <input 
                      type="text" placeholder="Toko Berkah"
                      value={transactionInfo.supplier}
                      onChange={(e) => setTransactionInfo({...transactionInfo, supplier: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Foto Struk (Opsional)</label>
                  {transactionInfo.receipt_url ? (
                    <div className="relative inline-block">
                      <img src={transactionInfo.receipt_url} alt="Struk" className="h-32 rounded-lg border border-gray-200 dark:border-gray-700 object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setTransactionInfo({...transactionInfo, receipt_url: ''})}
                        className="absolute -top-2 -right-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-full p-1 shadow-sm transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <label className={`flex-1 w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-all cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${isUploadingReceipt ? 'opacity-50 pointer-events-none' : ''}`}>
                        {isUploadingReceipt ? <Loader2 className="animate-spin text-primary-500" size={18} /> : <Camera className="text-gray-400" size={18} />}
                        <span>Kamera</span>
                        <input type="file" accept="image/*" capture="environment" onChange={handleCapturePhoto} className="hidden" disabled={isUploadingReceipt} />
                      </label>
                      <label className={`flex-1 w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-all cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${isUploadingReceipt ? 'opacity-50 pointer-events-none' : ''}`}>
                        {isUploadingReceipt ? <Loader2 className="animate-spin text-primary-500" size={18} /> : <ImageIcon className="text-gray-400" size={18} />}
                        <span>Galeri</span>
                        <input type="file" accept="image/*" onChange={handleCapturePhoto} className="hidden" disabled={isUploadingReceipt} />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Form Tambah Bahan */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                  <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                  Tambah Barang Belanjaan
                </h3>
                
                <form onSubmit={handleAddToCart} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nama Bahan</label>
                      <input 
                        type="text" placeholder="Cth: Tepung Terigu" required
                        value={currentItem.name}
                        onChange={(e) => {
                          setCurrentItem({...currentItem, name: e.target.value});
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      />
                      {showSuggestions && currentItem.name && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {Object.values(ingredients.reduce((acc, curr) => {
                            if (!acc[curr.name.toLowerCase()]) acc[curr.name.toLowerCase()] = curr;
                            return acc;
                          }, {}))
                            .filter(ing => ing.name.toLowerCase().includes(currentItem.name.toLowerCase()))
                            .map(ing => (
                              <div 
                                key={ing.id} 
                                className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm border-b border-gray-50 dark:border-gray-800/50 last:border-0"
                                onClick={() => {
                                  setCurrentItem({
                                    ...currentItem, 
                                    name: ing.name, 
                                    category: ing.category,
                                    unit: ing.unit,
                                    unit_price: ing.unit_price
                                  });
                                  setShowSuggestions(false);
                                }}
                              >
                                <div className="font-medium text-gray-900 dark:text-gray-100">{ing.name}</div>
                                <div className="text-xs text-gray-500">{ing.category} • Rp {ing.unit_price.toLocaleString('id-ID')} / {ing.unit}</div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kategori</label>
                      <input 
                        type="text" placeholder="Cth: Tepung" required
                        value={currentItem.category}
                        onChange={(e) => setCurrentItem({...currentItem, category: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jumlah</label>
                      <div className="flex">
                        <input 
                          type="number" min="0.1" step="0.1" required
                          value={currentItem.quantity}
                          onChange={(e) => setCurrentItem({...currentItem, quantity: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                          className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm focus:border-primary-500 outline-none"
                        />
                        <select
                          value={currentItem.unit}
                          onChange={(e) => setCurrentItem({...currentItem, unit: e.target.value})}
                          className="px-2 bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-sm outline-none"
                        >
                          <option value="kg">kg</option>
                          <option value="gr">gr</option>
                          <option value="liter">liter</option>
                          <option value="ml">ml</option>
                          <option value="pcs">pcs</option>
                          <option value="bungkus">bungkus</option>
                          <option value="botol">botol</option>
                          <option value="kaleng">kaleng</option>
                          <option value="pack">pack</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Harga Satuan</label>
                      <input 
                        type="text" required placeholder="12.000"
                        value={currentItem.unit_price ? currentItem.unit_price.toLocaleString('id-ID') : ''}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/\./g, '');
                          if (rawValue === '') {
                            setCurrentItem({...currentItem, unit_price: ''});
                          } else if (/^\d+$/.test(rawValue)) {
                            setCurrentItem({...currentItem, unit_price: parseInt(rawValue)});
                          }
                        }}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-primary-500 outline-none"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-200 dark:border-gray-700"
                  >
                    <Plus size={16} />
                    Tambah ke Daftar
                  </button>
                </form>
              </div>

              {/* 3. Keranjang / Daftar Barang */}
              {cart.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Daftar Barang ({cart.length})</h3>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="p-3 font-medium text-gray-600 dark:text-gray-300">Bahan</th>
                          <th className="p-3 font-medium text-gray-600 dark:text-gray-300 text-right">Jumlah</th>
                          <th className="p-3 font-medium text-gray-600 dark:text-gray-300 text-right">Total</th>
                          <th className="p-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {cart.map((item) => (
                          <tr key={item.id} className="bg-white dark:bg-gray-900">
                            <td className="p-3">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                              <div className="text-xs text-gray-500">Rp {item.unit_price.toLocaleString('id-ID')} / {item.unit}</div>
                            </td>
                            <td className="p-3 text-right text-gray-700 dark:text-gray-300">{item.quantity} {item.unit}</td>
                            <td className="p-3 text-right font-medium text-gray-900 dark:text-gray-100">Rp {(item.quantity * item.unit_price).toLocaleString('id-ID')}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-md">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <button 
                  onClick={handleSaveAll}
                  disabled={formLoading || cart.length === 0}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : `Simpan Semua (${cart.length} Barang)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lihat Struk */}
      {selectedImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2"
            >
              <X size={24} />
            </button>
            <img 
              src={selectedImage} 
              alt="Foto Struk" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
