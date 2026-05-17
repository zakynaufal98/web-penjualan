import { useMemo, useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Loader2, AlertCircle, Package, Check, ShoppingCart, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Toast from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { friendlyError } from '../lib/errorUtils';
import {
  currentTimeInputValue,
  dateTimeInputToLocalISOString,
  dateToInputValue,
  timeInputValue,
  todayInputValue,
} from '../lib/dateUtils';
import { reconcileProductStock } from '../lib/productStock';
import { addActivity } from '../lib/activityLog';

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

const CustomerNameInput = ({ value, onChange, suggestions }) => {
  const [open, setOpen] = useState(false);
  const filtered = suggestions
    .filter(name => {
      const q = value.trim().toLowerCase();
      if (!q) return true;
      return name.toLowerCase().includes(q);
    })
    .slice(0, 6);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Cth: Budi"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl shadow-black/10">
          {filtered.map(name => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const isInPeriod = (dateValue, period, startDate, endDate) => {
  if (period === 'all') return true;
  const date = new Date(dateValue);
  const now = new Date();
  const start = new Date(now);

  if (period === 'today') {
    return date.toDateString() === now.toDateString();
  }
  if (period === 'week') {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return date >= start;
  }
  if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return date >= start;
  }
  if (period === 'custom') {
    if (startDate) {
      const from = new Date(`${startDate}T00:00:00`);
      if (date < from) return false;
    }
    if (endDate) {
      const to = new Date(`${endDate}T23:59:59`);
      if (date > to) return false;
    }
    return true;
  }
  return true;
};

const getTransactionTotal = (trx) => trx.total_price ?? ((trx.unit_price || 0) * (trx.quantity || 0));
const formatRupiah = (value) => `Rp ${value.toLocaleString('id-ID')}`;

export default function Penjualan() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ period: 'all', productId: '', payment: '', customer: '', startDate: '', endDate: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
    transaction_date: todayInputValue(),
    transaction_time: currentTimeInputValue()
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
  const editStockCredit = editingTransaction && editingTransaction.product_id === formData.product_id ? editingTransaction.quantity : 0;
  const availableForForm = selectedProduct ? (selectedProduct.stock || 0) + editStockCredit : 0;
  const formStockWarning = selectedProduct && previewQty > availableForForm
    ? `Stok ${selectedProduct.name} hanya ${availableForForm} pcs. Kurangi qty sebelum menyimpan.`
    : '';
  const selectedQuickProduct = products.find(p => p.id === quickSale.product_id);
  const quickSaleQty = parseInt(quickSale.quantity) || 0;
  const quickSaleTotal = selectedQuickProduct ? selectedQuickProduct.selling_price * quickSaleQty : 0;
  const quickSaleWarning = selectedQuickProduct && quickSaleQty > (selectedQuickProduct.stock || 0)
    ? `Stok hanya ${selectedQuickProduct.stock || 0} pcs.`
    : '';
  const customerSuggestions = useMemo(() => (
    [...new Set(transactions.map(t => t.customer_name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  ), [transactions]);
  const filteredTransactions = useMemo(() => transactions.filter(t => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = !q
      || t.products?.name?.toLowerCase().includes(q)
      || t.customer_name?.toLowerCase().includes(q)
      || t.payment_method?.toLowerCase().includes(q);
    const matchesPeriod = isInPeriod(t.transaction_date, filters.period, filters.startDate, filters.endDate);
    const matchesProduct = !filters.productId || t.product_id === filters.productId;
    const matchesPayment = !filters.payment || t.payment_method === filters.payment;
    const matchesCustomer = !filters.customer || t.customer_name === filters.customer;
    return matchesSearch && matchesPeriod && matchesProduct && matchesPayment && matchesCustomer;
  }), [transactions, searchTerm, filters]);
  const filteredSummary = useMemo(() => {
    const summary = filteredTransactions.reduce((acc, trx) => {
      const total = getTransactionTotal(trx);
      const quantity = trx.quantity || 0;
      const payment = trx.payment_method || 'Lainnya';

      acc.totalRevenue += total;
      acc.totalQuantity += quantity;
      acc.paymentTotals[payment] = (acc.paymentTotals[payment] || 0) + total;
      return acc;
    }, { totalRevenue: 0, totalQuantity: 0, paymentTotals: {} });

    const topPayment = Object.entries(summary.paymentTotals)
      .sort(([, a], [, b]) => b - a)[0];

    return {
      ...summary,
      transactionCount: filteredTransactions.length,
      averageRevenue: filteredTransactions.length ? Math.round(summary.totalRevenue / filteredTransactions.length) : 0,
      topPayment: topPayment ? { method: topPayment[0], total: topPayment[1] } : null,
    };
  }, [filteredTransactions]);
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filters, pageSize]);

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
    setFormData({ product_id: '', quantity: 1, payment_method: 'Cash', customer_name: '', transaction_date: todayInputValue(), transaction_time: currentTimeInputValue() });
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (trx) => {
    const transactionDate = trx.transaction_date ? new Date(trx.transaction_date) : new Date();
    setEditingTransaction(trx);
    setFormData({
      product_id: trx.product_id,
      quantity: trx.quantity,
      payment_method: trx.payment_method,
      customer_name: trx.customer_name || '',
      transaction_date: dateToInputValue(transactionDate),
      transaction_time: timeInputValue(transactionDate)
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
      transaction_date: dateTimeInputToLocalISOString(formData.transaction_date, formData.transaction_time),
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
      addActivity({
        type: 'sales',
        title: editingTransaction ? 'Transaksi penjualan diperbarui' : 'Penjualan baru dicatat',
        description: `${freshProduct.name} ${newQty} pcs, ${formData.payment_method}${formData.customer_name ? ` untuk ${formData.customer_name}` : ''}.`,
      });
      // INSERT: trigger tr_reduce_stock otomatis mengurangi stok — tidak perlu manual
      setIsModalOpen(false);
      setFormData({ product_id: '', quantity: 1, payment_method: 'Cash', customer_name: '', transaction_date: todayInputValue(), transaction_time: currentTimeInputValue() });
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
    if (quickSaleWarning) {
      setToast({ message: quickSaleWarning, type: 'error' });
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
      transaction_date: dateTimeInputToLocalISOString(todayInputValue(), currentTimeInputValue()),
    }]);

    if (insertError) {
      setToast({ message: friendlyError(insertError), type: 'error' });
    } else {
      await reconcileProductStock(quickSale.product_id);
      addActivity({
        type: 'sales',
        title: 'Penjualan cepat dicatat',
        description: `${freshProduct.name} ${quickSaleQty} pcs, ${quickSale.payment_method}.`,
      });
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
      addActivity({
        type: 'sales',
        title: 'Transaksi penjualan dihapus',
        description: trxToDelete ? `${trxToDelete.products?.name || 'Produk'} ${trxToDelete.quantity} pcs.` : undefined,
      });
      fetchTransactions();
      fetchProducts();
    }
  };

  const handlePrintReceipt = (trx) => {
    const total = trx.total_price || (trx.unit_price || 0) * (trx.quantity || 0);
    const receipt = `
      <html>
        <head>
          <title>Struk Penjualan</title>
          <style>
            body { font-family: Arial, sans-serif; width: 280px; padding: 16px; color: #111827; }
            h1 { font-size: 16px; margin: 0 0 12px; }
            .row { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0; font-size: 13px; }
            .total { border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 10px; font-weight: 700; }
            .muted { color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Struk Penjualan</h1>
          <p class="muted">${new Date(trx.transaction_date).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          <div class="row"><span>Produk</span><strong>${trx.products?.name || 'Produk'}</strong></div>
          <div class="row"><span>Qty</span><strong>${trx.quantity} pcs</strong></div>
          <div class="row"><span>Harga</span><strong>Rp ${(trx.unit_price || 0).toLocaleString('id-ID')}</strong></div>
          <div class="row"><span>Bayar</span><strong>${trx.payment_method}</strong></div>
          <div class="row"><span>Pelanggan</span><strong>${trx.customer_name || '-'}</strong></div>
          <div class="row total"><span>Total</span><strong>Rp ${total.toLocaleString('id-ID')}</strong></div>
        </body>
      </html>
    `;
    const win = window.open('', '_blank', 'width=360,height=560');
    if (!win) {
      setToast({ message: 'Popup browser diblokir. Izinkan popup untuk mencetak struk.', type: 'error' });
      return;
    }
    win.document.write(receipt);
    win.document.close();
    win.focus();
    win.print();
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
            disabled={quickSaleLoading || Boolean(quickSaleWarning)}
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
              Sisa setelah jual: <span className={`font-semibold ${quickSaleWarning ? 'text-red-500' : ''}`}>{Math.max(0, selectedQuickProduct.stock - quickSaleQty)} pcs</span>
            </div>
          </div>
        )}
        {quickSaleWarning && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            {quickSaleWarning}
          </p>
        )}
      </form>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_9rem_12rem_10rem_12rem_auto] gap-2">
            <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Cari transaksi..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl text-sm outline-none transition-all"
            />
            </div>
            <select value={filters.period} onChange={(e) => setFilters({ ...filters, period: e.target.value })} className="px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none">
              <option value="all">Semua waktu</option>
              <option value="today">Hari ini</option>
              <option value="week">7 hari</option>
              <option value="month">Bulan ini</option>
              <option value="custom">Rentang</option>
            </select>
            <select value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })} className="px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none">
              <option value="">Semua produk</option>
              {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <select value={filters.payment} onChange={(e) => setFilters({ ...filters, payment: e.target.value })} className="px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none">
              <option value="">Semua bayar</option>
              {['Cash', 'Transfer', 'QRIS', 'Debit'].map(method => <option key={method} value={method}>{method}</option>)}
            </select>
            <select value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} className="px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none">
              <option value="">Semua pelanggan</option>
              {customerSuggestions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <button type="button" onClick={() => { setSearchTerm(''); setFilters({ period: 'all', productId: '', payment: '', customer: '', startDate: '', endDate: '' }); setPage(1); }} className="px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-primary-600 hover:bg-white dark:hover:bg-gray-900 transition-colors">
              Reset
            </button>
          </div>
          {filters.period === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
              />
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="px-4 py-3 border-r border-b lg:border-b-0 border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Omzet filter</p>
            <p className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">{formatRupiah(filteredSummary.totalRevenue)}</p>
          </div>
          <div className="px-4 py-3 border-b lg:border-r lg:border-b-0 border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Transaksi</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">{filteredSummary.transactionCount.toLocaleString('id-ID')}</p>
          </div>
          <div className="px-4 py-3 border-r border-b lg:border-b-0 border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Qty terjual</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">{filteredSummary.totalQuantity.toLocaleString('id-ID')} pcs</p>
          </div>
          <div className="px-4 py-3 border-b lg:border-r lg:border-b-0 border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Rata-rata</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">{formatRupiah(filteredSummary.averageRevenue)}</p>
          </div>
          <div className="col-span-2 lg:col-span-1 px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Bayar terbesar</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">
              {filteredSummary.topPayment ? `${filteredSummary.topPayment.method} · ${formatRupiah(filteredSummary.topPayment.total)}` : '-'}
            </p>
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
                  <td colSpan="7" className="p-10">
                    <div className="flex flex-col items-center text-center">
                      <ShoppingCart size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Belum ada transaksi</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gunakan kasir cepat di atas atau tambah transaksi lengkap.</p>
                      <button onClick={openAdd} className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                        <Plus size={15} /> Tambah Penjualan
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">Tidak ada transaksi yang cocok dengan filter.</td>
                </tr>
              ) : (
                paginatedTransactions.map((trx) => (
                  <tr key={trx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(trx.transaction_date).toLocaleString('id-ID', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-4 text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">{trx.products?.name || 'Produk Dihapus'}</td>
                    <td className="p-4 text-right text-gray-900 dark:text-gray-100">{trx.quantity}</td>
                    <td className="p-4 text-right font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{formatRupiah(getTransactionTotal(trx))}</td>
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
                        <button onClick={() => handlePrintReceipt(trx)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors" title="Cetak struk">
                          <Printer size={16} />
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
        {filteredTransactions.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>
                Menampilkan {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredTransactions.length)} dari {filteredTransactions.length} transaksi
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value))}
                className="px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none"
              >
                {[10, 25, 50].map(size => <option key={size} value={size}>{size}/hal</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-gray-900 transition-colors"
              >
                Sebelumnya
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">Hal {currentPage}/{totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-gray-900 transition-colors"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jam</label>
                  <input
                    type="time" required
                    value={formData.transaction_time}
                    onChange={(e) => setFormData({...formData, transaction_time: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
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
                {formStockWarning && (
                  <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                    {formStockWarning}
                  </p>
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
                <CustomerNameInput
                  value={formData.customer_name}
                  suggestions={customerSuggestions}
                  onChange={(customerName) => setFormData({ ...formData, customer_name: customerName })}
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" disabled={formLoading || Boolean(formStockWarning)}
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
