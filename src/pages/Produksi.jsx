// Halaman ini membutuhkan tabel production_logs di Supabase:
//
// CREATE TABLE production_logs (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   product_id uuid REFERENCES products(id) ON DELETE SET NULL,
//   quantity integer NOT NULL CHECK (quantity > 0),
//   production_date timestamptz DEFAULT now(),
//   notes text,
//   created_by uuid REFERENCES auth.users(id)
// );
//
// Setelah membuat tabel, aktifkan RLS dan tambahkan policy sesuai kebutuhan.

import { useMemo, useState, useEffect } from 'react';
import { Plus, Trash2, X, Loader2, AlertCircle, ClipboardList, UtensilsCrossed, Edit2, PackageCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import Toast from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { friendlyError } from '../lib/errorUtils';
import { format, isSameDay } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  currentTimeInputValue,
  dateTimeInputToLocalISOString,
  dateToInputValue,
  timeInputValue,
  todayInputValue,
} from '../lib/dateUtils';
import { reconcileProductStock } from '../lib/productStock';
import { addActivity } from '../lib/activityLog';

export default function Produksi() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ period: 'all', productId: '', status: 'all', startDate: '', endDate: '' });
  const [salesMap, setSalesMap] = useState({});
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const [productionCheck, setProductionCheck] = useState({ status: 'idle', maxUnits: null, shortages: [] });

  const [formData, setFormData] = useState({
    product_id: '',
    quantity: 1,
    failed: 0,
    notes: '',
    production_date: todayInputValue(),
    production_time: currentTimeInputValue(),
  });
  const [editingLog, setEditingLog] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [konsumsiDialog, setKonsumsiDialog] = useState({ open: false, logId: '', productId: '', nama: '', currentKonsumsi: 0, amount: '', mode: 'add' });
  const { user } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const openConfirm = (title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  useEffect(() => {
    fetchLogs();
    fetchProducts();
  }, []);

  useEffect(() => {
    const productId = location.state?.productId;
    if (!productId || products.length === 0 || isModalOpen) return;
    setEditingLog(null);
    setFormData({
      product_id: productId,
      quantity: 1,
      failed: 0,
      notes: '',
      production_date: todayInputValue(),
      production_time: currentTimeInputValue(),
    });
    setError('');
    setIsModalOpen(true);
    navigate('/produksi', { replace: true, state: null });
  }, [location.state, products, isModalOpen, navigate]);

  useEffect(() => {
    if (!isModalOpen || !formData.product_id) {
      setProductionCheck({ status: 'idle', maxUnits: null, shortages: [] });
      return;
    }
    checkProductionReadiness(
      formData.product_id,
      (parseInt(formData.quantity) || 0) + (parseInt(formData.failed) || 0)
    );
  }, [isModalOpen, formData.product_id, formData.quantity, formData.failed]);

  const buildProductionAllocations = (productionLogs, salesRows) => {
    const allocations = {};
    const logsByProduct = {};

    (productionLogs || []).forEach(log => {
      const capacity = Math.max(0, (log.quantity || 0) - (log.konsumsi || 0));
      allocations[log.id] = { sold: 0, remaining: capacity, capacity };
      if (!logsByProduct[log.product_id]) logsByProduct[log.product_id] = [];
      logsByProduct[log.product_id].push(log);
    });

    Object.values(logsByProduct).forEach(productLogs => {
      productLogs.sort((a, b) => new Date(a.production_date) - new Date(b.production_date));
    });

    [...(salesRows || [])]
      .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date))
      .forEach(sale => {
        let qtyLeft = sale.quantity || 0;
        const saleDay = format(new Date(sale.transaction_date), 'yyyy-MM-dd');
        const candidates = (logsByProduct[sale.product_id] || [])
          .filter(log => format(new Date(log.production_date), 'yyyy-MM-dd') <= saleDay);

        for (const log of candidates) {
          if (qtyLeft <= 0) break;
          const available = allocations[log.id]?.remaining || 0;
          if (available <= 0) continue;
          const taken = Math.min(qtyLeft, available);
          allocations[log.id].sold += taken;
          allocations[log.id].remaining -= taken;
          qtyLeft -= taken;
        }
      });

    return allocations;
  };

  const fetchLogs = async () => {
    setLoading(true);
    const [{ data, error: fetchError }, { data: salesData }] = await Promise.all([
      supabase.from('production_logs').select('*, products(name)').order('production_date', { ascending: false }),
      supabase.from('sales').select('product_id, quantity, transaction_date'),
    ]);

    if (fetchError) {
      setTableExists(false);
    } else {
      const productionLogs = data || [];
      setLogs(productionLogs);
      setTableExists(true);
      // Buat map: productId → total terjual semua waktu
      setSalesMap(buildProductionAllocations(productionLogs, salesData || []));
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, stock').order('name');
    setProducts(data || []);
  };

  const convertUnit = (qty, fromUnit, toUnit) => {
    if (fromUnit === toUnit) return qty;
    if (fromUnit === 'gr' && toUnit === 'kg') return qty / 1000;
    if (fromUnit === 'kg' && toUnit === 'gr') return qty * 1000;
    if (fromUnit === 'ml' && toUnit === 'liter') return qty / 1000;
    if (fromUnit === 'liter' && toUnit === 'ml') return qty * 1000;
    return qty;
  };

  const toFiniteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const hasFiniteNumber = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
  const formatFixed = (value, digits = 2) => toFiniteNumber(value).toFixed(digits);

  const getIngredientUsage = (item, batchQty) => {
    const master = item.ingredient_masters;
    if (!master) return { stockDelta: 0, needBase: null, stockBase: null, remainingBase: null, baseUnit: null };
    const quantityPerUnit = toFiniteNumber(item.quantity_per_unit);
    const batchQuantity = toFiniteNumber(batchQty);
    const currentStock = toFiniteNumber(master.current_stock);
    const itemsPerUnit = toFiniteNumber(master.items_per_unit);
    const hasBaseUnit = itemsPerUnit > 0 && Boolean(master.base_unit);
    const totalInRecipeUnit = quantityPerUnit * batchQuantity;
    if (!hasBaseUnit || item.unit === master.unit) {
      const stockDelta = convertUnit(totalInRecipeUnit, item.unit, master.unit);
      return {
        stockDelta,
        needBase: hasBaseUnit ? stockDelta * itemsPerUnit : null,
        stockBase: hasBaseUnit ? currentStock * itemsPerUnit : null,
        remainingBase: hasBaseUnit ? (currentStock - stockDelta) * itemsPerUnit : null,
        baseUnit: hasBaseUnit ? master.base_unit : null,
      };
    }
    const totalInBaseUnit = convertUnit(totalInRecipeUnit, item.unit, master.base_unit);
    const stockDelta = totalInBaseUnit / itemsPerUnit;
    return {
      stockDelta,
      needBase: totalInBaseUnit,
      stockBase: currentStock * itemsPerUnit,
      remainingBase: (currentStock - stockDelta) * itemsPerUnit,
      baseUnit: master.base_unit,
    };
  };

  const getIngredientStockDelta = (item, batchQty) => {
    return getIngredientUsage(item, batchQty).stockDelta;
  };

  const checkProductionReadiness = async (productId, totalQty) => {
    if (!productId || totalQty <= 0) {
      setProductionCheck({ status: 'idle', maxUnits: null, shortages: [] });
      return;
    }

    const { data: recipeItems } = await supabase
      .from('recipes')
      .select('quantity_per_unit, unit, ingredient_masters(id, name, unit, current_stock, items_per_unit, base_unit)')
      .eq('product_id', productId);

    if (!recipeItems || recipeItems.length === 0) {
      setProductionCheck({ status: 'noRecipe', maxUnits: null, shortages: [] });
      return;
    }

    let maxUnits = Infinity;
    const shortages = [];
    const items = [];
    recipeItems.forEach(item => {
      const master = item.ingredient_masters;
      if (!master) return;
      const perUnitNeed = getIngredientStockDelta(item, 1);
      const usage = getIngredientUsage(item, totalQty);
      const totalNeed = usage.stockDelta;
      const currentStock = toFiniteNumber(master.current_stock);
      if (perUnitNeed > 0) maxUnits = Math.min(maxUnits, Math.floor(currentStock / perUnitNeed));
      items.push({
        name: master.name,
        need: totalNeed,
        stock: currentStock,
        remaining: currentStock - totalNeed,
        unit: master.unit,
        needBase: usage.needBase,
        stockBase: usage.stockBase,
        remainingBase: usage.remainingBase,
        baseUnit: usage.baseUnit,
      });
      if (currentStock < totalNeed) {
        shortages.push({
          name: master.name,
          need: totalNeed,
          stock: currentStock,
          unit: master.unit,
          needBase: usage.needBase,
          stockBase: usage.stockBase,
          remainingBase: usage.remainingBase,
          baseUnit: usage.baseUnit,
        });
      }
    });

    setProductionCheck({
      status: shortages.length > 0 ? 'shortage' : 'ready',
      maxUnits: Number.isFinite(maxUnits) ? Math.max(0, maxUnits) : null,
      shortages,
      items,
    });
  };

  const adjustIngredientStock = async (productId, batchQty, sign) => {
    const { data: recipeItems } = await supabase
      .from('recipes')
      .select('quantity_per_unit, unit, ingredient_master_id, ingredient_masters(id, unit, items_per_unit, base_unit)')
      .eq('product_id', productId);
    if (!recipeItems || recipeItems.length === 0) return false;
    for (const item of recipeItems) {
      const master = item.ingredient_masters;
      if (!master) continue;

      const delta = getIngredientStockDelta(item, batchQty);
      await supabase.rpc('adjust_ingredient_stock', { p_id: master.id, p_delta: delta * sign });
    }
    return true;
  };

  const deductIngredientStock  = (productId, qty) => adjustIngredientStock(productId, qty, -1);
  const restoreIngredientStock = (productId, qty) => adjustIngredientStock(productId, qty, +1);

  const updateProductStock = async (productId, delta) => {
    if (!productId || !delta) return { error: null, data: [{ skipped: true }] };
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();
    if (fetchError || !product) return { error: fetchError || new Error('Produk tidak ditemukan'), data: [] };
    return supabase
      .from('products')
      .update({ stock: Math.max(0, (product.stock || 0) + delta) })
      .eq('id', productId)
      .select();
  };

  const resetForm = () => {
    setEditingLog(null);
    setFormData({
      product_id: '',
      quantity: 1,
      failed: 0,
      notes: '',
      production_date: todayInputValue(),
      production_time: currentTimeInputValue(),
    });
    setError('');
  };

  const openEdit = (log) => {
    const productionDate = log.production_date ? new Date(log.production_date) : new Date();
    setEditingLog(log);
    setFormData({
      product_id: log.product_id,
      quantity: log.quantity,
      failed: log.failed || 0,
      notes: log.notes || '',
      production_date: dateToInputValue(productionDate),
      production_time: timeInputValue(productionDate),
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

    const newBawa   = parseInt(formData.quantity) || 0;
    const newFailed = parseInt(formData.failed)  || 0;
    const newTotal  = newBawa + newFailed;

    if (newBawa <= 0 || newFailed < 0) {
      setError('Jumlah produksi harus valid. Berhasil minimal 1 pcs dan gagal tidak boleh minus.');
      setFormLoading(false);
      return;
    }

    if (productionCheck.status === 'shortage') {
      setError('Stok bahan belum cukup untuk jumlah produksi ini.');
      setFormLoading(false);
      return;
    }

    if (editingLog) {
      // ── MODE EDIT ──
      const oldBawa   = editingLog.quantity;
      const oldFailed = editingLog.failed || 0;
      const oldTotal  = oldBawa + oldFailed;

      const { error: updateError } = await supabase.from('production_logs').update({
        product_id: formData.product_id,
        quantity: newBawa,
        failed: newFailed,
        notes: formData.notes || null,
        production_date: dateTimeInputToLocalISOString(formData.production_date, formData.production_time),
      }).eq('id', editingLog.id);

      if (updateError) {
        setError(friendlyError(updateError));
        setFormLoading(false);
        return;
      }

      const oldKonsumsi = editingLog.konsumsi || 0;
      const sameProduct = editingLog.product_id === formData.product_id;
      const productChanges = sameProduct
        ? [{ productId: formData.product_id, delta: newBawa - oldBawa }]
        : [
            { productId: editingLog.product_id, delta: -(oldBawa - oldKonsumsi) },
            { productId: formData.product_id, delta: newBawa - oldKonsumsi },
          ];

      let stockUpdated = [];
      const appliedProductChanges = [];
      for (const change of productChanges) {
        const { data, error: stockError } = await updateProductStock(change.productId, change.delta);
        if (stockError) {
          stockUpdated = [];
          break;
        }
        appliedProductChanges.push(change);
        stockUpdated = data || [];
      }
      if (!stockUpdated || stockUpdated.length === 0) {
        for (const change of appliedProductChanges.slice().reverse()) {
          await updateProductStock(change.productId, -change.delta);
        }
        await supabase.from('production_logs').update({
          product_id: editingLog.product_id,
          quantity: oldBawa,
          failed: oldFailed,
          notes: editingLog.notes || null,
          production_date: editingLog.production_date,
        }).eq('id', editingLog.id);
        setToast({ message: 'Data diperbarui tapi stok produk gagal disesuaikan. Jalankan SQL: CREATE POLICY "Allow update products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', type: 'error' });
        setIsModalOpen(false);
        resetForm();
        await fetchLogs();
        setFormLoading(false);
        return;
      }

      if (sameProduct) {
        const totalDiff = newTotal - oldTotal;
        if (totalDiff > 0) await deductIngredientStock(formData.product_id, totalDiff);
        else if (totalDiff < 0) await restoreIngredientStock(formData.product_id, Math.abs(totalDiff));
      } else {
        await restoreIngredientStock(editingLog.product_id, oldTotal);
        await deductIngredientStock(formData.product_id, newTotal);
      }

      await reconcileProductStock(editingLog.product_id, { force: true });
      await reconcileProductStock(formData.product_id, { force: true });
      setToast({ message: 'Catatan produksi berhasil diperbarui!', type: 'success' });
    } else {
      // ── MODE TAMBAH ──
      const { error: insertError } = await supabase.from('production_logs').insert([{
        product_id: formData.product_id,
        quantity: newBawa,
        failed: newFailed,
        notes: formData.notes || null,
        created_by: user?.id,
        production_date: dateTimeInputToLocalISOString(formData.production_date, formData.production_time),
      }]);

      if (insertError) {
        setError(friendlyError(insertError));
        setFormLoading(false);
        return;
      }

      const { data: stockUpdated } = await updateProductStock(formData.product_id, newBawa);

      const hasRecipe = await deductIngredientStock(formData.product_id, newTotal);
      if (!stockUpdated || stockUpdated.length === 0) {
        setToast({ message: 'Produksi tersimpan tapi stok produk gagal bertambah. Jalankan SQL: CREATE POLICY "Allow update products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', type: 'error' });
      } else if (!hasRecipe) {
        setToast({ message: 'Produksi tersimpan. Resep belum diatur — stok bahan tidak dikurangi.', type: 'info' });
      } else {
        setToast({ message: 'Produksi berhasil dicatat!', type: 'success' });
      }
    }

    await reconcileProductStock(formData.product_id, { force: true });
    addActivity({
      type: 'production',
      title: editingLog ? 'Catatan produksi diperbarui' : 'Produksi baru dicatat',
      description: `${selectedProduct?.name || 'Produk'} bawa ${newBawa} pcs${newFailed > 0 ? `, gagal ${newFailed} pcs` : ''}.`,
    });
    setIsModalOpen(false);
    resetForm();
    fetchLogs();
    fetchProducts();
    setFormLoading(false);
  };

  const handleCatatKonsumsi = async () => {
    const rawAmount = parseInt(konsumsiDialog.amount);
    if (isNaN(rawAmount) || rawAmount < 0) return;
    if (konsumsiDialog.mode === 'add' && rawAmount <= 0) return;

    const currentKonsumsi = konsumsiDialog.currentKonsumsi || 0;
    const newKonsumsi = konsumsiDialog.mode === 'edit' ? rawAmount : currentKonsumsi + rawAmount;
    const stockDiff = newKonsumsi - currentKonsumsi;

    const { data: updated, error: updateErr } = await supabase
      .from('production_logs')
      .update({ konsumsi: newKonsumsi })
      .eq('id', konsumsiDialog.logId)
      .select();

    if (updateErr || !updated || updated.length === 0) {
      setToast({ message: 'Gagal menyimpan konsumsi. Tambahkan UPDATE policy pada tabel production_logs di Supabase.', type: 'error' });
      setKonsumsiDialog(d => ({ ...d, open: false }));
      return;
    }

    if (stockDiff !== 0) {
      await updateProductStock(konsumsiDialog.productId, -stockDiff);
      await reconcileProductStock(konsumsiDialog.productId, { force: true });
    }

    setKonsumsiDialog({ open: false, logId: '', productId: '', nama: '', currentKonsumsi: 0, amount: '', mode: 'add' });
    const msg = konsumsiDialog.mode === 'edit'
      ? (newKonsumsi === 0 ? 'Konsumsi berhasil dihapus.' : `Konsumsi diperbarui menjadi ${newKonsumsi} pcs.`)
      : `${rawAmount} pcs dicatat sebagai konsumsi sendiri.`;
    setToast({ message: msg, type: 'success' });
    addActivity({
      type: 'production',
      title: konsumsiDialog.mode === 'edit' ? 'Konsumsi produk diperbarui' : 'Konsumsi produk dicatat',
      description: `${konsumsiDialog.nama}: ${newKonsumsi} pcs konsumsi tercatat.`,
    });
    await fetchLogs();
    fetchProducts();
  };

  const handleDelete = (id, productId, quantity, failed, konsumsi) => {
    openConfirm(
      'Hapus Catatan Produksi?',
      'Stok produk dan bahan baku akan dikembalikan ke jumlah semula.',
      () => executeDelete(id, productId, quantity, failed, konsumsi)
    );
  };

  const executeDelete = async (id, productId, quantity, failed) => {
    const total = quantity + (failed || 0);
    const { error: deleteError } = await supabase.from('production_logs').delete().eq('id', id);
    if (deleteError) {
      setToast({ message: 'Gagal menghapus catatan produksi.', type: 'error' });
      return;
    }
    await restoreIngredientStock(productId, total);

    await reconcileProductStock(productId, { force: true });
    setToast({ message: 'Catatan produksi dihapus dan stok dikembalikan.', type: 'success' });
    addActivity({
      type: 'production',
      title: 'Catatan produksi dihapus',
      description: `Produksi ${quantity} pcs dikembalikan dari stok.`,
    });
    fetchLogs();
    fetchProducts();
  };

  const today = new Date();
  const todayLogs = logs.filter(l => isSameDay(new Date(l.production_date), today));
  const todayTotal = todayLogs.reduce((sum, l) => sum + l.quantity, 0);
  const selectedProduct = products.find(p => p.id === formData.product_id);
  const formSuccessQty = parseInt(formData.quantity) || 0;
  const formFailedQty = parseInt(formData.failed) || 0;
  const formTotalQty = formSuccessQty + formFailedQty;
  const productStockAfter = selectedProduct ? (selectedProduct.stock || 0) + formSuccessQty : null;
  const getBatchStatus = (sisaBatch, failed = 0, konsumsi = 0) => {
    if (sisaBatch <= 0) return { label: 'Habis', className: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' };
    if (failed > 0) return { label: 'Ada gagal', className: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' };
    if (konsumsi > 0) return { label: 'Ada konsumsi', className: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' };
    if (sisaBatch <= 5) return { label: 'Hampir habis', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' };
    return { label: 'Tersedia', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' };
  };
  const filteredLogs = useMemo(() => logs.filter(log => {
    const allocation = salesMap[log.id] || {};
    const terjual = allocation.sold || 0;
    const konsumsi = log.konsumsi || 0;
    const sisaBatch = allocation.remaining ?? Math.max(0, (log.quantity || 0) - konsumsi - terjual);
    const date = new Date(log.production_date);
    const now = new Date();
    const start = new Date(now);
    let matchesPeriod = true;
    if (filters.period === 'today') matchesPeriod = date.toDateString() === now.toDateString();
    if (filters.period === 'week') {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      matchesPeriod = date >= start;
    }
    if (filters.period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      matchesPeriod = date >= start;
    }
    if (filters.period === 'custom') {
      matchesPeriod = true;
      if (filters.startDate) {
        const from = new Date(`${filters.startDate}T00:00:00`);
        if (date < from) matchesPeriod = false;
      }
      if (filters.endDate) {
        const to = new Date(`${filters.endDate}T23:59:59`);
        if (date > to) matchesPeriod = false;
      }
    }
    const matchesProduct = !filters.productId || log.product_id === filters.productId;
    const matchesStatus =
      filters.status === 'all'
      || (filters.status === 'remaining' && sisaBatch > 0)
      || (filters.status === 'empty' && sisaBatch <= 0)
      || (filters.status === 'failed' && (log.failed || 0) > 0)
      || (filters.status === 'consumed' && konsumsi > 0);
    return matchesPeriod && matchesProduct && matchesStatus;
  }), [logs, salesMap, filters]);

  if (!tableExists) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Produksi Harian</h1>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">Tabel database belum dibuat</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Buat tabel <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">production_logs</code> di Supabase terlebih dahulu.
                Lihat komentar di bagian atas file <code>src/pages/Produksi.jsx</code> untuk SQL-nya.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Produksi Harian</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Catat berapa banyak produk yang dibuat hari ini.</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-primary-600/20"
        >
          <Plus size={18} /> Catat Produksi
        </button>
      </div>

      {/* Ringkasan hari ini */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Total Produksi Hari Ini</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayTotal} <span className="text-base font-normal text-gray-400">pcs</span></p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Jenis Produk Hari Ini</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayLogs.length} <span className="text-base font-normal text-gray-400">item</span></p>
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
            <ClipboardList size={16} /> Riwayat Produksi
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[9rem_minmax(0,1fr)_11rem_auto] gap-2">
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
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none">
              <option value="all">Semua status</option>
              <option value="remaining">Masih ada sisa</option>
              <option value="empty">Batch habis</option>
              <option value="failed">Ada gagal</option>
              <option value="consumed">Ada konsumsi</option>
            </select>
            <button type="button" onClick={() => setFilters({ period: 'all', productId: '', status: 'all', startDate: '', endDate: '' })} className="px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-primary-600 hover:bg-white dark:hover:bg-gray-900 transition-colors">
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Tanggal & Waktu</th>
                <th className="p-4 font-medium">Produk</th>
                <th className="p-4 font-medium text-right">Bawa</th>
                <th className="p-4 font-medium text-right">Gagal</th>
                <th className="p-4 font-medium text-right">Terjual</th>
                <th className="p-4 font-medium text-right">Konsumsi</th>
                <th className="p-4 font-medium text-right">Sisa Batch</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Catatan</th>
                <th className="p-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {loading ? (
                <tr><td colSpan="10" className="p-8 text-center text-gray-500">Memuat data...</td></tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="10" className="p-10">
                    <div className="flex flex-col items-center text-center">
                      <ClipboardList size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Belum ada catatan produksi</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Catat produksi pertama agar stok produk dan bahan mulai tersinkron.</p>
                      <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                        <Plus size={15} /> Catat Produksi
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-gray-500">Tidak ada produksi yang cocok dengan filter.</td></tr>
              ) : (
                filteredLogs.map((log) => {
                  const allocation = salesMap[log.id] || {};
                  const terjual  = allocation.sold || 0;
                  const konsumsi = log.konsumsi || 0;
                  const sisaBatch = allocation.remaining ?? Math.max(0, (log.quantity || 0) - konsumsi - terjual);
                  const batchStatus = getBatchStatus(sisaBatch, log.failed || 0, konsumsi);
                  return (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="p-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {format(new Date(log.production_date), 'EEEE, dd MMM yyyy, HH:mm', { locale: localeId })}
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{log.products?.name || 'Produk Dihapus'}</div>
                      <div className={`text-xs mt-0.5 font-medium ${sisaBatch === 0 ? 'text-red-500' : sisaBatch <= 5 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        Sisa batch: {sisaBatch} pcs
                      </div>
                    </td>
                    <td className="p-4 text-right font-bold text-primary-600 dark:text-primary-400">
                      {log.quantity} pcs
                    </td>
                    <td className="p-4 text-right">
                      {log.failed > 0
                        ? <span className="font-semibold text-red-500">{log.failed} pcs</span>
                        : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="p-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {terjual > 0 ? `${terjual} pcs` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {konsumsi > 0
                          ? <span className="font-semibold text-orange-500 dark:text-orange-400">{konsumsi} pcs</span>
                          : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        <button
                          title="Tambah Konsumsi"
                          onClick={() => setKonsumsiDialog({ open: true, logId: log.id, productId: log.product_id, nama: log.products?.name || '', currentKonsumsi: konsumsi, amount: '', mode: 'add' })}
                          className="p-1 text-orange-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors"
                        >
                          <Plus size={13} />
                        </button>
                        {konsumsi > 0 && (
                          <button
                            title="Edit / Hapus Konsumsi"
                            onClick={() => setKonsumsiDialog({ open: true, logId: log.id, productId: log.product_id, nama: log.products?.name || '', currentKonsumsi: konsumsi, amount: String(konsumsi), mode: 'edit' })}
                            className="p-1 text-orange-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-semibold ${sisaBatch === 0 ? 'text-red-600 dark:text-red-400' : sisaBatch <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {sisaBatch} pcs
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${batchStatus.className}`}>
                        {batchStatus.label}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 dark:text-gray-400 text-sm">
                      {log.notes || '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(log)}
                          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(log.id, log.product_id, log.quantity, log.failed, log.konsumsi)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Dialog Konsumsi Sendiri */}
      {konsumsiDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <UtensilsCrossed size={18} className="text-orange-500" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {konsumsiDialog.mode === 'edit' ? 'Edit Konsumsi' : 'Tambah Konsumsi'}
                </h2>
              </div>
              <button onClick={() => setKonsumsiDialog(d => ({ ...d, open: false }))} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Produk: <span className="font-semibold text-gray-900 dark:text-white">{konsumsiDialog.nama}</span>
                {konsumsiDialog.currentKonsumsi > 0 && (
                  <span className="ml-2 text-orange-500 text-xs">(sudah tercatat {konsumsiDialog.currentKonsumsi} pcs)</span>
                )}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {konsumsiDialog.mode === 'edit' ? 'Total konsumsi baru (pcs)' : 'Jumlah ditambah (pcs)'}
                </label>
                <input
                  type="number" min="0" autoFocus
                  value={konsumsiDialog.amount}
                  onChange={(e) => setKonsumsiDialog(d => ({ ...d, amount: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleCatatKonsumsi()}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-orange-200 dark:border-orange-900/40 rounded-xl text-sm focus:border-orange-400 outline-none"
                  placeholder={konsumsiDialog.mode === 'edit' ? 'Masukkan total baru' : 'Cth: 2'}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {konsumsiDialog.mode === 'edit'
                  ? 'Nilai ini menggantikan catatan lama. Masukkan 0 untuk menghapus konsumsi.'
                  : 'Stok produk akan berkurang sesuai jumlah yang diisi.'}
              </p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setKonsumsiDialog(d => ({ ...d, open: false }))} className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Batal
                </button>
                <button
                  onClick={handleCatatKonsumsi}
                  disabled={konsumsiDialog.amount === '' || parseInt(konsumsiDialog.amount) < 0 || (konsumsiDialog.mode === 'add' && parseInt(konsumsiDialog.amount) <= 0)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50"
                >
                  {konsumsiDialog.mode === 'edit' ? 'Simpan Perubahan' : 'Catat Konsumsi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => { closeConfirm(); confirmDialog.onConfirm?.(); }}
        onCancel={closeConfirm}
      />

      {/* Modal Tambah */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-md my-8 sm:my-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingLog ? 'Edit Produksi' : 'Catat Produksi'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Produk</label>
                <select
                  required
                  value={formData.product_id}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  onInvalid={(e) => e.target.setCustomValidity('Silakan pilih produk terlebih dahulu')}
                  onInput={(e) => e.target.setCustomValidity('')}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                >
                  <option value="">-- Pilih Produk --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {productionCheck.status === 'ready' && (
                  <div className="mt-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    Bahan cukup. Dari stok saat ini bisa produksi sekitar <span className="font-semibold">{productionCheck.maxUnits} pcs</span>.
                  </div>
                )}
                {productionCheck.status === 'noRecipe' && (
                  <div className="mt-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                    Resep produk belum diatur. Produksi tetap bisa dicatat, tapi stok bahan tidak akan dikurangi.
                  </div>
                )}
                {productionCheck.status === 'shortage' && (
                  <div className="mt-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 px-3 py-2 text-xs text-red-700 dark:text-red-300 space-y-1">
                    <p className="font-semibold">Bahan belum cukup untuk produksi ini.</p>
                    {productionCheck.shortages.slice(0, 3).map(item => (
                      <p key={item.name}>
                        {item.name}: perlu {formatFixed(item.need)} {item.unit}
                        {hasFiniteNumber(item.needBase) ? ` (${formatFixed(item.needBase)} ${item.baseUnit})` : ''}, stok {formatFixed(item.stock)} {item.unit}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Produksi</label>
                  <input
                    type="date" required
                    value={formData.production_date}
                    max={todayInputValue()}
                    onChange={(e) => setFormData({ ...formData, production_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jam</label>
                  <input
                    type="time" required
                    value={formData.production_time}
                    onChange={(e) => setFormData({ ...formData, production_time: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Berhasil / Bawa (pcs)</label>
                  <input
                    type="number" min="1" required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Gagal / Rusak (pcs)</label>
                  <input
                    type="number" min="0"
                    value={formData.failed}
                    onChange={(e) => setFormData({ ...formData, failed: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-red-200 dark:border-red-900/40 rounded-xl text-sm focus:border-red-400 outline-none"
                  />
                </div>
              </div>
              {formData.failed > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                  Total dibuat: {formTotalQty} pcs. Bahan dikurangi dari {formTotalQty} pcs. Stok bertambah {formSuccessQty} pcs.
                </p>
              )}

              {selectedProduct && formTotalQty > 0 && (
                <div className="rounded-2xl border border-primary-100 dark:border-primary-900/30 bg-primary-50/70 dark:bg-primary-900/10 p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary-700 dark:text-primary-300">
                    <PackageCheck size={16} />
                    Preview Dampak Produksi
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white/80 dark:bg-gray-900/70 px-3 py-2">
                      <p className="text-gray-500 dark:text-gray-400">Stok produk</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {selectedProduct.stock || 0} -&gt; {productStockAfter} pcs
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/80 dark:bg-gray-900/70 px-3 py-2">
                      <p className="text-gray-500 dark:text-gray-400">Bahan dihitung</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{formTotalQty} pcs resep</p>
                    </div>
                  </div>
                  {productionCheck.items?.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded-xl bg-white/80 dark:bg-gray-900/70 divide-y divide-gray-100 dark:divide-gray-800">
                      {productionCheck.items.slice(0, 5).map(item => (
                        <div key={item.name} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                          <span className="min-w-0 truncate text-gray-600 dark:text-gray-300">{item.name}</span>
                          <span className={item.remaining < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}>
                            -{formatFixed(item.need)} {item.unit}
                            {hasFiniteNumber(item.needBase) ? ` (${formatFixed(item.needBase)} ${item.baseUnit})` : ''}, sisa {formatFixed(Math.max(0, toFiniteNumber(item.remaining)))} {item.unit}
                            {hasFiniteNumber(item.remainingBase) ? ` (${formatFixed(Math.max(0, toFiniteNumber(item.remainingBase)))} ${item.baseUnit})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Catatan (Opsional)</label>
                <input
                  type="text" placeholder="Cth: Brownies loyang ke-2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-primary-500 outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit" disabled={formLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : (editingLog ? 'Simpan Perubahan' : 'Simpan Produksi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
