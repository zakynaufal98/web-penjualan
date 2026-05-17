import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, Loader2, ChevronLeft, ChevronRight, Copy, Check, BarChart2, FileSpreadsheet, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import {
  getMonth, parseISO, startOfYear, endOfYear,
  startOfWeek, addDays, subDays, format, subWeeks, addWeeks,
} from 'date-fns';
import { dateToInputValue, localDayRangeISO, localWeekRangeISO } from '../lib/dateUtils';

const DAY_NAMES = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const MONTHS    = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const isMeasuredUnit = (unit) => ['kg', 'gr', 'liter', 'ml'].includes(unit);
const getExpenseTotal = (expense) =>
  expense.total_price || (isMeasuredUnit(expense.unit) ? (expense.unit_price || 0) : (expense.unit_price || 0) * (expense.quantity || 0));

export default function Laporan() {
  const { bankInfo } = useStore();
  const [activeTab, setActiveTab] = useState('bulanan');
  const [products, setProducts] = useState([]);
  const [productFilter, setProductFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  // ── Monthly ──
  const [loading, setLoading]         = useState(true);
  const [year, setYear]               = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState([]);
  const [stats, setStats]             = useState({
    profitThisMonth: 0, profitLastMonth: 0, totalSalesYear: 0, averageMargin: 0,
  });

  // ── Weekly ──
  const [weekStart, setWeekStart]     = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weekReport, setWeekReport]   = useState([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [copied, setCopied]           = useState(false);

  // ── Daily ──
  const [selectedDay, setSelectedDay]   = useState(() => new Date());
  const [dayReport, setDayReport]       = useState([]);
  const [dayLoading, setDayLoading]     = useState(false);
  const [dayCopied, setDayCopied]       = useState(false);

  // Rentang custom
  const [rangeStart, setRangeStart] = useState(() => dateToInputValue(startOfWeek(new Date(), { weekStartsOn: 1 })));
  const [rangeEnd, setRangeEnd] = useState(() => dateToInputValue(new Date()));
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeReport, setRangeReport] = useState({
    sales: 0,
    cogs: 0,
    expenses: 0,
    profit: 0,
    cashGap: 0,
    produced: 0,
    failed: 0,
    consumed: 0,
    unitsSold: 0,
    topProducts: [],
  });

  useEffect(() => { fetchProducts(); }, []);
  useEffect(() => { if (activeTab === 'bulanan') fetchReportData(); }, [year, activeTab]);
  useEffect(() => { if (activeTab === 'rekap')   fetchWeeklyReport(); }, [weekStart, activeTab, productFilter, paymentFilter]);
  useEffect(() => { if (activeTab === 'harian')  fetchDailyReport(); }, [selectedDay, activeTab, productFilter, paymentFilter]);
  useEffect(() => { if (activeTab === 'rentang') fetchRangeReport(); }, [rangeStart, rangeEnd, activeTab, productFilter, paymentFilter]);

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('id, name').order('name');
    setProducts(data || []);
  };

  const fetchReportData = async () => {
    setLoading(true);
    const s = startOfYear(new Date(year, 0, 1)).toISOString();
    const e = endOfYear(new Date(year, 11, 31)).toISOString();

    const [{ data: salesData }, { data: expData }] = await Promise.all([
      supabase.from('sales').select('*, products(cost_price)').gte('transaction_date', s).lte('transaction_date', e),
      supabase.from('ingredients').select('*').gte('purchase_date', s).lte('purchase_date', e),
    ]);

    const byMonth = MONTHS.map(m => ({ name: m, sales: 0, cogs: 0, expenses: 0, profit: 0, cashGap: 0, margin: 0 }));
    let totalSalesYear = 0;

    (salesData || []).forEach(sale => {
      const m = getMonth(parseISO(sale.transaction_date));
      const amt = sale.total_price || sale.unit_price * sale.quantity;
      byMonth[m].sales += amt;
      byMonth[m].cogs += (sale.products?.cost_price || 0) * (sale.quantity || 0);
      totalSalesYear += amt;
    });
    (expData || []).forEach(exp => {
      const m = getMonth(parseISO(exp.purchase_date));
      byMonth[m].expenses += getExpenseTotal(exp);
    });

    let marginSum = 0, activeMonths = 0;
    byMonth.forEach(m => {
      m.profit = m.sales - m.cogs;
      m.cashGap = m.sales - m.expenses;
      if (m.sales > 0) { m.margin = (m.profit / m.sales) * 100; marginSum += m.margin; activeMonths++; }
    });

    setMonthlyData(byMonth);
    const cur = getMonth(new Date());
    setStats({
      profitThisMonth: byMonth[cur].profit,
      profitLastMonth: cur > 0 ? byMonth[cur - 1].profit : 0,
      totalSalesYear,
      averageMargin: activeMonths > 0 ? marginSum / activeMonths : 0,
    });
    setLoading(false);
  };

  const fetchWeeklyReport = async () => {
    setWeekLoading(true);
    const { startISO, endISO } = localWeekRangeISO(weekStart);

    const [{ data: prodData }, { data: salesData }] = await Promise.all([
      supabase.from('production_logs').select('*, products(name, selling_price)').gte('production_date', startISO).lte('production_date', endISO),
      supabase.from('sales').select('*, products(name, selling_price)').gte('transaction_date', startISO).lte('transaction_date', endISO),
    ]);

    const report = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const key = format(day, 'yyyy-MM-dd');

      const dayProd  = (prodData  || []).filter(p => format(parseISO(p.production_date),  'yyyy-MM-dd') === key && (!productFilter || p.product_id === productFilter));
      const daySales = (salesData || []).filter(s => format(parseISO(s.transaction_date), 'yyyy-MM-dd') === key && (!productFilter || s.product_id === productFilter) && (!paymentFilter || s.payment_method === paymentFilter));

      const map = {};
      dayProd.forEach(p => {
        const name = p.products?.name || 'Produk';
        if (!map[name]) map[name] = { name, bawa: 0, gagal: 0, terjual: 0, total: 0, hasProd: false };
        map[name].bawa  += p.quantity;
        map[name].gagal += p.failed || 0;
        map[name].hasProd = true;
      });
      daySales.forEach(s => {
        const name = s.products?.name || 'Produk';
        if (!map[name]) map[name] = { name, bawa: 0, gagal: 0, terjual: 0, total: 0, hasProd: false };
        map[name].terjual += s.quantity;
        map[name].total   += s.total_price || s.unit_price * s.quantity;
      });

      const items    = Object.values(map).map(it => ({ ...it, sisa: it.hasProd ? Math.max(0, it.bawa - it.terjual) : null }));
      const dayTotal = items.reduce((s, it) => s + it.total, 0);
      return { day, dayName: DAY_NAMES[day.getDay()], key, items, dayTotal, hasData: items.length > 0 };
    });

    setWeekReport(report);
    setWeekLoading(false);
  };

  const weekTotal = weekReport.reduce((s, d) => s + d.dayTotal, 0);

  const generateText = () => {
    let text = '';
    weekReport.filter(d => d.hasData).forEach(d => {
      text += `${d.dayName}\n`;
      d.items.forEach(it => {
        text += it.hasProd
          ? `${it.name} bawa ${it.bawa}${it.gagal > 0 ? ` gagal ${it.gagal}` : ''} sisa ${it.sisa} = ${it.total.toLocaleString('id-ID')}\n`
          : `${it.name} terjual ${it.terjual} = ${it.total.toLocaleString('id-ID')}\n`;
      });
      text += `total ${d.dayTotal.toLocaleString('id-ID')}\n\n`;
    });
    if (weekTotal > 0) text += `total keseluruhan ${weekTotal.toLocaleString('id-ID')}\n\n`;
    if (bankInfo?.number) text += `Nama bank, pemilik & Nomor rekening :${bankInfo.number} ${bankInfo.bank} a/n ${bankInfo.owner}`;
    return text;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generateText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const fetchDailyReport = async () => {
    setDayLoading(true);
    const key     = format(selectedDay, 'yyyy-MM-dd');
    const { startISO, endISO } = localDayRangeISO(key);

    const [{ data: prodData }, { data: salesData }] = await Promise.all([
      supabase.from('production_logs').select('*, products(name, selling_price)').gte('production_date', startISO).lte('production_date', endISO),
      supabase.from('sales').select('*, products(name, selling_price)').gte('transaction_date', startISO).lte('transaction_date', endISO),
    ]);

    const map = {};
    (prodData || []).filter(p => !productFilter || p.product_id === productFilter).forEach(p => {
      const name = p.products?.name || 'Produk';
      if (!map[name]) map[name] = { name, bawa: 0, gagal: 0, terjual: 0, total: 0, hasProd: false };
      map[name].bawa  += p.quantity;
      map[name].gagal += p.failed || 0;
      map[name].hasProd = true;
    });
    (salesData || []).filter(s => (!productFilter || s.product_id === productFilter) && (!paymentFilter || s.payment_method === paymentFilter)).forEach(s => {
      const name = s.products?.name || 'Produk';
      if (!map[name]) map[name] = { name, bawa: 0, terjual: 0, total: 0, hasProd: false };
      map[name].terjual += s.quantity;
      map[name].total   += s.total_price || s.unit_price * s.quantity;
    });

    const items = Object.values(map).map(it => ({
      ...it, sisa: it.hasProd ? Math.max(0, it.bawa - it.terjual) : null,
    }));
    setDayReport(items);
    setDayLoading(false);
  };

  const dayTotal = dayReport.reduce((s, it) => s + it.total, 0);

  const fetchRangeReport = async () => {
    if (!rangeStart || !rangeEnd) return;
    setRangeLoading(true);
    const startISO = new Date(`${rangeStart}T00:00:00`).toISOString();
    const endISO = new Date(`${rangeEnd}T23:59:59`).toISOString();

    const [{ data: salesData }, { data: expData }, { data: prodData }] = await Promise.all([
      supabase.from('sales').select('*, products(name, cost_price)').gte('transaction_date', startISO).lte('transaction_date', endISO),
      supabase.from('ingredients').select('*').gte('purchase_date', startISO).lte('purchase_date', endISO),
      supabase.from('production_logs').select('quantity, failed, konsumsi, product_id, products(name)').gte('production_date', startISO).lte('production_date', endISO),
    ]);

    const productMap = {};
    let sales = 0;
    let cogs = 0;
    let unitsSold = 0;
    (salesData || [])
      .filter(row => (!productFilter || row.product_id === productFilter) && (!paymentFilter || row.payment_method === paymentFilter))
      .forEach(row => {
        const total = row.total_price || (row.unit_price || 0) * (row.quantity || 0);
        const cost = (row.products?.cost_price || 0) * (row.quantity || 0);
        const name = row.products?.name || 'Produk';
        sales += total;
        cogs += cost;
        unitsSold += row.quantity || 0;
        if (!productMap[name]) productMap[name] = { name, qty: 0, sales: 0, cogs: 0, profit: 0 };
        productMap[name].qty += row.quantity || 0;
        productMap[name].sales += total;
        productMap[name].cogs += cost;
        productMap[name].profit += total - cost;
      });

    const expenses = (expData || []).reduce((sum, row) => sum + getExpenseTotal(row), 0);
    const productionRows = (prodData || []).filter(row => !productFilter || row.product_id === productFilter);
    const produced = productionRows.reduce((sum, row) => sum + (row.quantity || 0), 0);
    const failed = productionRows.reduce((sum, row) => sum + (row.failed || 0), 0);
    const consumed = productionRows.reduce((sum, row) => sum + (row.konsumsi || 0), 0);

    setRangeReport({
      sales,
      cogs,
      expenses,
      profit: sales - cogs,
      cashGap: sales - expenses,
      produced,
      failed,
      consumed,
      unitsSold,
      topProducts: Object.values(productMap).sort((a, b) => b.sales - a.sales).slice(0, 6),
    });
    setRangeLoading(false);
  };

  const generateDayText = () => {
    const dayName = DAY_NAMES[selectedDay.getDay()];
    let text = `${dayName}\n`;
    dayReport.forEach(it => {
      text += it.hasProd
        ? `${it.name} bawa ${it.bawa} sisa ${it.sisa} = ${it.total.toLocaleString('id-ID')}\n`
        : `${it.name} terjual ${it.terjual} = ${it.total.toLocaleString('id-ID')}\n`;
    });
    text += `total ${dayTotal.toLocaleString('id-ID')}`;
    if (bankInfo?.number) text += `\n\nNama bank, pemilik & Nomor rekening :${bankInfo.number} ${bankInfo.bank} a/n ${bankInfo.owner}`;
    return text;
  };

  const handleDayCopy = async () => {
    await navigator.clipboard.writeText(generateDayText());
    setDayCopied(true);
    setTimeout(() => setDayCopied(false), 2500);
  };

  const getProfitChange = () => {
    if (stats.profitLastMonth === 0) return 0;
    return ((stats.profitThisMonth - stats.profitLastMonth) / stats.profitLastMonth) * 100;
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = activeTab === 'bulanan'
      ? monthlyData.map(row => ({ Bulan: row.name, Omzet: row.sales, HPP_Terjual: row.cogs, Laba_Produk: row.profit, Belanja_Bahan: row.expenses, Selisih_Kas_Bahan: row.cashGap, Margin: row.margin }))
      : activeTab === 'rentang'
        ? [
            { Metrik: 'Omzet', Nilai: rangeReport.sales },
            { Metrik: 'HPP terjual', Nilai: rangeReport.cogs },
            { Metrik: 'Laba produk', Nilai: rangeReport.profit },
            { Metrik: 'Belanja bahan', Nilai: rangeReport.expenses },
            { Metrik: 'Selisih kas bahan', Nilai: rangeReport.cashGap },
            { Metrik: 'Terjual', Nilai: rangeReport.unitsSold },
            { Metrik: 'Produksi', Nilai: rangeReport.produced },
            { Metrik: 'Gagal', Nilai: rangeReport.failed },
            { Metrik: 'Konsumsi', Nilai: rangeReport.consumed },
            ...rangeReport.topProducts.map(row => ({ Metrik: `Produk - ${row.name}`, Nilai: row.sales, Qty: row.qty, HPP: row.cogs, Laba_Produk: row.profit })),
          ]
        : activeTab === 'harian'
          ? dayReport.map(row => ({ Produk: row.name, Bawa: row.bawa, Gagal: row.gagal || 0, Terjual: row.terjual, Sisa: row.sisa ?? '', Total: row.total }))
          : weekReport.flatMap(day => day.items.map(row => ({ Tanggal: format(day.day, 'yyyy-MM-dd'), Hari: day.dayName, Produk: row.name, Bawa: row.bawa, Gagal: row.gagal || 0, Terjual: row.terjual, Sisa: row.sisa ?? '', Total: row.total })));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
    XLSX.writeFile(wb, `laporan-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleExportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const title = `Laporan ${activeTab} - ${format(new Date(), 'yyyy-MM-dd')}`;
    const text = activeTab === 'harian'
      ? generateDayText()
      : activeTab === 'rekap'
        ? generateText()
        : activeTab === 'rentang'
          ? [
              `Periode ${rangeStart} sampai ${rangeEnd}`,
              `Omzet Rp ${rangeReport.sales.toLocaleString('id-ID')}`,
              `HPP terjual Rp ${rangeReport.cogs.toLocaleString('id-ID')}`,
              `Laba produk Rp ${rangeReport.profit.toLocaleString('id-ID')}`,
              `Belanja bahan Rp ${rangeReport.expenses.toLocaleString('id-ID')}`,
              `Selisih kas bahan Rp ${rangeReport.cashGap.toLocaleString('id-ID')}`,
              `Terjual ${rangeReport.unitsSold} pcs, produksi ${rangeReport.produced} pcs, gagal ${rangeReport.failed} pcs, konsumsi ${rangeReport.consumed} pcs`,
              '',
              ...rangeReport.topProducts.map(row => `${row.name}: ${row.qty} pcs, omzet Rp ${row.sales.toLocaleString('id-ID')}`),
            ].join('\n')
          : monthlyData.map(row => `${row.name}: omzet Rp ${row.sales.toLocaleString('id-ID')}, HPP terjual Rp ${row.cogs.toLocaleString('id-ID')}, laba produk Rp ${row.profit.toLocaleString('id-ID')}, belanja bahan Rp ${row.expenses.toLocaleString('id-ID')}`).join('\n');

    doc.setFontSize(14);
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text || 'Tidak ada data.', 180);
    let y = 28;
    lines.forEach(line => {
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
      doc.text(line, 14, y);
      y += 6;
    });
    doc.save(`laporan-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(addDays(weekStart, 6), 'd MMM yyyy')}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Laporan Keuangan</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Analisis performa bisnis dan rekap penjualan.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-full sm:w-fit">
        {[
          { id: 'bulanan', label: 'Bulanan',         icon: BarChart2 },
          { id: 'rentang', label: 'Rentang',         icon: Calendar  },
          { id: 'harian',  label: 'Rekap Harian',    icon: Calendar  },
          { id: 'rekap',   label: 'Rekap Mingguan',  icon: Calendar  },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>


      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        {activeTab !== 'bulanan' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full sm:w-72 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-primary-500"
            >
              <option value="">Semua produk</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-primary-500"
            >
              <option value="">Semua bayar</option>
              {['Cash', 'Transfer', 'QRIS', 'Debit'].map(method => <option key={method} value={method}>{method}</option>)}
            </select>
          </div>
        ) : <span />}
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            disabled={activeTab === 'bulanan' ? monthlyData.length === 0 : activeTab === 'rentang' ? rangeReport.sales === 0 && rangeReport.expenses === 0 && rangeReport.produced === 0 : activeTab === 'harian' ? dayReport.length === 0 : weekReport.every(d => !d.hasData)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={activeTab === 'bulanan' ? monthlyData.length === 0 : activeTab === 'rentang' ? rangeReport.sales === 0 && rangeReport.expenses === 0 && rangeReport.produced === 0 : activeTab === 'harian' ? dayReport.length === 0 : weekReport.every(d => !d.hasData)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      {/* -- TAB BULANAN -- */}
      {activeTab === 'bulanan' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Laba Produk Bulan Ini',   value: `Rp ${stats.profitThisMonth.toLocaleString('id-ID')}`,  sub: `${getProfitChange() >= 0 ? '+' : ''}${getProfitChange().toFixed(1)}% dari bulan lalu`, color: getProfitChange() >= 0 ? 'text-emerald-500' : 'text-red-500' },
              { label: 'Margin Rata-rata',         value: `${stats.averageMargin.toFixed(1)}%`,                   sub: stats.averageMargin >= 40 ? 'Sangat Sehat' : stats.averageMargin >= 20 ? 'Cukup Sehat' : 'Perlu Evaluasi Harga', color: stats.averageMargin >= 40 ? 'text-emerald-500' : stats.averageMargin >= 20 ? 'text-amber-500' : 'text-red-500' },
              { label: `Total Omzet ${year}`,      value: `Rp ${stats.totalSalesYear.toLocaleString('id-ID')}`,   sub: `1 Jan – 31 Des ${year}`, color: 'text-gray-400' },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm mb-1">{card.label}</h3>
                {loading ? <Loader2 className="animate-spin text-gray-400 my-2" /> : (
                  <>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{card.value}</p>
                    <p className={`text-sm font-medium mt-2 ${card.color}`}>{card.sub}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Grafik Laba Produk Bulanan</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><ChevronLeft size={18} /></button>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-12 text-center">{year}</span>
                <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="h-80 w-full">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center"><Loader2 size={32} className="animate-spin text-primary-500" /></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={v => `Rp ${v / 1000000}M`} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={v => [`Rp ${v.toLocaleString('id-ID')}`, undefined]} />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="profit" name="Laba Produk" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB REKAP HARIAN ── */}
      {activeTab === 'rentang' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Dari tanggal</label>
                <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Sampai tanggal</label>
                <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-primary-500" />
              </div>
              <button type="button" onClick={() => { setRangeStart(dateToInputValue(startOfWeek(new Date(), { weekStartsOn: 1 }))); setRangeEnd(dateToInputValue(new Date())); }} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-primary-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Minggu ini
              </button>
            </div>
          </div>

          {rangeLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" size={32} /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                {[
                  { label: 'Omzet', value: `Rp ${rangeReport.sales.toLocaleString('id-ID')}`, sub: `${rangeReport.unitsSold} pcs terjual`, color: 'text-gray-900 dark:text-white' },
                  { label: 'HPP Terjual', value: `Rp ${rangeReport.cogs.toLocaleString('id-ID')}`, sub: 'Modal produk terjual', color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Laba Produk', value: `Rp ${rangeReport.profit.toLocaleString('id-ID')}`, sub: 'Omzet - HPP terjual', color: rangeReport.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
                  { label: 'Belanja Bahan', value: `Rp ${rangeReport.expenses.toLocaleString('id-ID')}`, sub: 'Pembelian stok bahan', color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Selisih Kas Bahan', value: `Rp ${rangeReport.cashGap.toLocaleString('id-ID')}`, sub: 'Omzet - belanja bahan', color: rangeReport.cashGap >= 0 ? 'text-violet-600 dark:text-violet-400' : 'text-orange-600 dark:text-orange-400' },
                ].map(card => (
                  <div key={card.label} className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                    <p className={`mt-2 text-xl font-bold ${card.color}`}>{card.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Produksi & Kehilangan</h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Produksi</span><span className="font-semibold">{rangeReport.produced} pcs</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Gagal</span><span className="font-semibold text-red-500">{rangeReport.failed} pcs</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Konsumsi sendiri</span><span className="font-semibold text-orange-500">{rangeReport.consumed} pcs</span></div>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Produk Teratas di Rentang Ini</h2>
                  {rangeReport.topProducts.length === 0 ? (
                    <p className="text-sm text-gray-500">Belum ada penjualan pada rentang ini.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {rangeReport.topProducts.map(row => (
                        <div key={row.name} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white truncate">{row.name}</p>
                            <p className="text-xs text-gray-500">{row.qty} pcs, HPP Rp {row.cogs.toLocaleString('id-ID')}, laba Rp {row.profit.toLocaleString('id-ID')}</p>
                          </div>
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Rp {row.sales.toLocaleString('id-ID')}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'harian' && (
        <div className="space-y-4">
          {/* Navigator hari */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => setSelectedDay(d => subDays(d, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[160px] text-center">
                {DAY_NAMES[selectedDay.getDay()]}, {format(selectedDay, 'd MMM yyyy')}
              </span>
              <button onClick={() => setSelectedDay(d => addDays(d, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setSelectedDay(new Date())}
                className="ml-1 text-xs text-primary-600 dark:text-primary-400 font-semibold hover:underline"
              >
                Hari ini
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={format(selectedDay, 'yyyy-MM-dd')}
                onChange={(e) => e.target.value && setSelectedDay(new Date(e.target.value + 'T12:00:00'))}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-primary-500"
              />
              <button
                onClick={handleDayCopy}
                disabled={dayTotal === 0}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                {dayCopied ? <><Check size={16} /> Tersalin!</> : <><Copy size={16} /> Salin</>}
              </button>
            </div>
          </div>

          {dayTotal > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preview teks salin</p>
              <pre className="whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300 leading-relaxed max-h-36 overflow-y-auto">{generateDayText()}</pre>
            </div>
          )}

          {dayLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" size={32} /></div>
          ) : dayReport.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center">
              <Calendar size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Tidak ada data penjualan hari ini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <span className="font-bold text-gray-900 dark:text-white text-sm">
                    {DAY_NAMES[selectedDay.getDay()]}, {format(selectedDay, 'd MMMM yyyy')}
                  </span>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                  {dayReport.map((it) => (
                    <div key={it.name} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{it.name}</span>
                        <span className="text-gray-400 ml-2 text-xs">
                          {it.hasProd ? `bawa ${it.bawa}${it.gagal > 0 ? ` · gagal ${it.gagal}` : ''} · sisa ${it.sisa}` : `terjual ${it.terjual}`}
                        </span>
                      </div>
                      <span className={`font-semibold shrink-0 ${it.total > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300'}`}>
                        {it.total > 0 ? `Rp ${it.total.toLocaleString('id-ID')}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-primary-50 dark:bg-primary-900/20 border-t border-primary-100 dark:border-primary-900/30 flex justify-between">
                  <span className="text-sm font-bold text-primary-700 dark:text-primary-300">Total</span>
                  <span className="text-sm font-bold text-primary-700 dark:text-primary-300">Rp {dayTotal.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {bankInfo?.number && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-200">Nama bank, pemilik &amp; Nomor rekening :</span>
                  <span className="ml-1">{bankInfo.number} {bankInfo.bank} a/n {bankInfo.owner}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB REKAP MINGGUAN ── */}
      {activeTab === 'rekap' && (
        <div className="space-y-4">
          {/* Navigator */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-white min-w-[170px] text-center">{weekLabel}</span>
              <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="ml-1 text-xs text-primary-600 dark:text-primary-400 font-semibold hover:underline"
              >
                Minggu ini
              </button>
            </div>
            <button
              onClick={handleCopy}
              disabled={weekTotal === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              {copied ? <><Check size={16} /> Tersalin!</> : <><Copy size={16} /> Salin Laporan</>}
            </button>
          </div>

          {weekTotal > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preview teks salin</p>
              <pre className="whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300 leading-relaxed max-h-40 overflow-y-auto">{generateText()}</pre>
            </div>
          )}

          {weekLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" size={32} /></div>
          ) : weekReport.every(d => !d.hasData) ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center">
              <Calendar size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Tidak ada data penjualan minggu ini.</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Pastikan data produksi dan penjualan sudah dicatat.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weekReport.filter(d => d.hasData).map((d) => (
                <div key={d.key} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{d.dayName}</span>
                    <span className="text-xs text-gray-400">{format(d.day, 'd MMM yyyy')}</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {d.items.map((it) => (
                      <div key={it.name} className="px-5 py-2.5 flex items-center justify-between text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{it.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">
                            {it.hasProd ? `bawa ${it.bawa}${it.gagal > 0 ? ` · gagal ${it.gagal}` : ''} · sisa ${it.sisa}` : `terjual ${it.terjual}`}
                          </span>
                        </div>
                        <span className={`font-semibold shrink-0 ${it.total > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300'}`}>
                          {it.total > 0 ? `Rp ${it.total.toLocaleString('id-ID')}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total {d.dayName}</span>
                    <span className="font-bold text-gray-900 dark:text-white text-sm">Rp {d.dayTotal.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}

              {/* Total minggu */}
              <div className="bg-primary-600 rounded-2xl p-5 flex justify-between items-center">
                <span className="font-bold text-white">Total Keseluruhan</span>
                <span className="text-2xl font-extrabold text-white">Rp {weekTotal.toLocaleString('id-ID')}</span>
              </div>

              {/* Info rekening */}
              {bankInfo?.number ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-gray-200">Nama bank, pemilik &amp; Nomor rekening :</span>
                  <span className="ml-1">{bankInfo.number} {bankInfo.bank} a/n {bankInfo.owner}</span>
                </div>
              ) : (
                <p className="text-xs text-center text-gray-400">
                  Belum ada info rekening. Isi di <span className="text-primary-500 font-medium">Pengaturan</span> agar muncul di laporan.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
